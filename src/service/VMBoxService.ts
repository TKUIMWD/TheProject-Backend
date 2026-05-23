import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { Request } from "express";
import { validateTokenAndGetUser, validateTokenAndGetAdminUser, validateTokenAndGetSuperAdminUser } from "../utils/auth";
import { VMBoxModel } from "../orm/schemas/VM/VMBoxSchemas";
import { VMTemplateModel } from "../orm/schemas/VM/VMTemplateSchemas";
import { SubmittedBoxModel } from "../orm/schemas/VM/SubmittedBoxSchemas";
import { SubmittedBox, SubmittedBoxStatus } from "../interfaces/SubmittedBox";
import { VM_Box, VM_Box_Info } from "../interfaces/VM/VM_Box";
import { UsersModel } from "../orm/schemas/UserSchemas";
import { logger } from "../middlewares/log";
import { Document, Types } from "mongoose";
import { sendBoxAuditResultEmail } from "../utils/MailSender/BoxAuditResultSender";
import { VMUtils } from "../utils/VMUtils";
import { PVEUtils } from "../utils/PVEUtils";
import { Reviews } from "../interfaces/Reviews";
import { ReviewsModel } from "../orm/schemas/ReviewsSchemas";
import { DEFAULT_AVATAR } from "../utils/avatarUpload";
import { VMModel } from "../orm/schemas/VM/VMSchemas";
import { AnswerRecordModel } from "../orm/schemas/VM/AnswerRecordSchemas";
import { sanitizeString } from "../utils/sanitize";
import Roles from "../enum/role";
import { BoxWriteupStatus } from "../interfaces/BoxWriteup";
import { BoxWriteupModel } from "../orm/schemas/VM/BoxWriteupSchemas";


export class VMBoxService extends Service {

    // 將可能的 Mongoose Map / 普通物件 / null 轉為普通物件
    private _normalizeFlagAnswers(raw: any): Record<string, string> {
        if (!raw) return {};
        // Mongoose Map: has get / set / entries
        if (raw instanceof Map) {
            const obj: Record<string, string> = {};
            for (const [k, v] of raw.entries()) {
                if (typeof k === 'string' && typeof v === 'string') obj[k] = v;
            }
            return obj;
        }
        // Plain object
        if (typeof raw === 'object') {
            const obj: Record<string, string> = {};
            for (const key of Object.keys(raw)) {
                const val = raw[key];
                if (typeof val === 'string') obj[key] = val;
            }
            return obj;
        }
        return {};
    }

    private async _findPublishedBoxForSubmission(submission: any): Promise<any | null> {
        const submissionId = submission?._id?.toString();
        if (!submissionId) return null;

        const linkedBox = await VMBoxModel.findOne({ submitted_box_id: submissionId }).exec();
        if (linkedBox) return linkedBox;

        return VMBoxModel.findOne({
            vmtemplate_id: submission.vmtemplate_id,
            submitter_user_id: submission.submitter_user_id,
            submitted_date: submission.submitted_date,
            is_public: true
        }).exec();
    }

    private _canModerateBox(user: any, box: any): boolean {
        if (!user || !box) return false;
        if (user.role === Roles.SuperAdmin) return true;
        return user.role === Roles.Admin && box.submitter_user_id?.toString() === user._id?.toString();
    }

    private async _toWriteupDTO(writeup: any, options: { viewer?: any; includePrivate?: boolean } = {}): Promise<any> {
        const author = await UsersModel.findById(writeup.author_user_id).exec();
        const reviewer = writeup.reviewed_by_user_id
            ? await UsersModel.findById(writeup.reviewed_by_user_id).exec()
            : null;
        const box = await VMBoxModel.findById(writeup.box_id).exec();
        const template = box ? await VMTemplateModel.findById(box.vmtemplate_id).exec() : null;
        const canReview = Boolean(options.viewer && box && this._canModerateBox(options.viewer, box));
        const canModify = Boolean(options.viewer && writeup.author_user_id?.toString() === options.viewer._id?.toString());

        return {
            _id: writeup._id?.toString(),
            box_id: writeup.box_id,
            title: writeup.title,
            content_md: writeup.content_md,
            status: writeup.status,
            is_public: writeup.is_public === true,
            submitted_date: writeup.submitted_date,
            updated_date: writeup.updated_date,
            reviewed_by_user_id: options.includePrivate ? writeup.reviewed_by_user_id : undefined,
            reviewed_date: writeup.reviewed_date,
            reject_reason: options.includePrivate || canModify ? writeup.reject_reason : undefined,
            author_info: author ? {
                username: author.username,
                email: options.includePrivate ? author.email : undefined,
                avatar_path: author.avatar_path || DEFAULT_AVATAR
            } : {
                username: "Unknown User",
                avatar_path: DEFAULT_AVATAR
            },
            reviewer_info: reviewer && options.includePrivate ? {
                username: reviewer.username,
                email: reviewer.email
            } : undefined,
            box_info: box ? {
                _id: box._id?.toString() || writeup.box_id,
                name: template?.description || box.box_setup_description,
                description: box.box_setup_description
            } : undefined,
            can_modify: canModify,
            can_review: canReview
        };
    }

    // 私有輔助方法 - 獲取模板資訊
    private async _getTemplateInfo(node: string, vmid: string): Promise<resp<any>> {
        try {
            const templateInfoResp = await VMUtils.getTemplateInfo(node, vmid);

            if (templateInfoResp.code !== 200 || !templateInfoResp.body) {
                return createResponse(templateInfoResp.code, templateInfoResp.message);
            }

            return createResponse(200, "Template info fetched successfully", templateInfoResp.body);
        } catch (error) {
            console.error(`Error in _getTemplateInfo for node ${node}, vmid ${vmid}:`, error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 提交 Box 申請 (需要 Admin 或以上權限)
     */
    public async submitBox(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser(Request);
            if (error) {
                console.error("Error validating admin token:", error);
                return error;
            }

            const {
                vmtemplate_id,
                box_setup_description,
                allow_ai_assistant = true,
                design_md = "",
                setup_md = "",
                writeup_md = ""
            } = Request.body;

            // 驗證必要欄位
            if (!vmtemplate_id || !box_setup_description) {
                return createResponse(400, "Missing required fields: vmtemplate_id, box_setup_description");
            }

            // 建立新的提交申請記錄
            const newSubmission = new SubmittedBoxModel({
                vmtemplate_id,
                box_setup_description,
                submitter_user_id: user._id,
                submitted_date: new Date(),
                status: SubmittedBoxStatus.not_approved,
                flag_answers: Request.body.flag_answers || {},
                allow_ai_assistant: allow_ai_assistant !== false,
                design_md,
                setup_md,
                writeup_md
            });

            await newSubmission.save();

            logger.info(`Box submission created by admin ${user.email}, Submission ID: ${newSubmission._id}`);
            return createResponse(200, "Box submission created successfully, waiting for approval", {
                submission_id: newSubmission._id,
                vmtemplate_id,
                submitted_date: newSubmission.submitted_date,
                submitter: user.email
            });

        } catch (error) {
            console.error("Error in submitBox:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 獲取提交的 Box 申請列表 (僅限 SuperAdmin)
     */
    public async getSubmittedBoxes(Request: Request): Promise<resp<(VM_Box_Info & { status: SubmittedBoxStatus })[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<(VM_Box_Info & { status: SubmittedBoxStatus })[]>(Request);
            if (error) {
                console.error("Error validating super admin token:", error);
                return error;
            }

            const submissions = await SubmittedBoxModel.find().sort({ submitted_date: -1 }).exec();

            if (submissions.length === 0) {
                return createResponse(200, "No submitted boxes found", []);
            }

            const boxInfoPromises = submissions.map(async (submission): Promise<VM_Box_Info & { status: SubmittedBoxStatus }> => {
                // 獲取關聯的 VM Template 資訊
                const template = await VMTemplateModel.findById(submission.vmtemplate_id).exec();

                let templateInfo = {
                    name: "Unknown Template",
                    description: submission.box_setup_description,
                    default_cpu_cores: 2,
                    default_memory_size: 2048,
                    default_disk_size: 20,
                    owner: "Unknown"
                };

                // 如果找到關聯的 template，獲取其詳細資訊
                if (template) {
                    try {
                        const configResp = await this._getTemplateInfo(template.pve_node, template.pve_vmid);
                        if (configResp.code === 200 && configResp.body) {
                            const qemuConfig = configResp.body;

                            templateInfo = {
                                name: qemuConfig.name || template.description,
                                description: template.description,
                                default_cpu_cores: PVEUtils.extractCpuCores(qemuConfig),
                                default_memory_size: PVEUtils.extractMemorySize(qemuConfig),
                                default_disk_size: PVEUtils.extractDiskSize(qemuConfig),
                                owner: template.owner
                            };
                        }
                    } catch (configError) {
                        console.warn(`Failed to get config for template ${template._id}:`, configError);
                        templateInfo.owner = template.owner;
                    }
                }

                // 初始化 Box 資訊
                const publishedBox = submission.status === SubmittedBoxStatus.approved
                    ? await this._findPublishedBoxForSubmission(submission)
                    : null;

                const boxInfo: VM_Box_Info & { status: SubmittedBoxStatus } = {
                    _id: submission._id,
                    submitted_box_id: submission._id?.toString(),
                    published_box_id: publishedBox?._id?.toString(),
                    name: templateInfo.name,
                    description: templateInfo.description,
                    submitted_date: submission.submitted_date,
                    owner: templateInfo.owner,
                    default_cpu_cores: templateInfo.default_cpu_cores,
                    default_memory_size: templateInfo.default_memory_size,
                    default_disk_size: templateInfo.default_disk_size,
                    is_public: submission.status === SubmittedBoxStatus.approved,
                    box_setup_description: submission.box_setup_description,
                    rating_score: publishedBox?.rating_score,
                    review_count: publishedBox?.review_count,
                    updated_date: publishedBox?.updated_date || submission.status_updated_date || submission.submitted_date,
                    status: submission.status,
                    reject_reason: submission.reject_reason,
                    flag_answers: submission.flag_answers,
                    allow_ai_assistant: publishedBox ? publishedBox.allow_ai_assistant !== false : submission.allow_ai_assistant !== false,
                    design_md: submission.design_md,
                    setup_md: submission.setup_md,
                    writeup_md: submission.writeup_md,
                };

                // 添加提交者資訊
                if (submission.submitter_user_id) {
                    const submitterUser = await UsersModel.findById(submission.submitter_user_id).exec();
                    if (submitterUser) {
                        boxInfo.submitter_user_info = {
                            username: submitterUser.username,
                            email: submitterUser.email
                        };
                    }
                }

                return boxInfo;
            });

            const boxInfos = await Promise.all(boxInfoPromises);
            return createResponse(200, "Submitted boxes fetched successfully", boxInfos);

        } catch (error) {
            console.error("Error in getSubmittedBoxes:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 審核 Box 申請 (僅限 SuperAdmin)
     */
    public async auditBoxSubmission(Request: Request): Promise<resp<string | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser(Request);
            if (error) {
                console.error("Error validating super admin token:", error);
                return createResponse(error.code, error.message);
            }

            const { submission_id, status, reject_reason } = Request.body;

            // 驗證必要參數
            if (!submission_id || !status) {
                return createResponse(400, "Missing required fields: box_id, status");
            }

            // 驗證狀態
            if (![SubmittedBoxStatus.approved, SubmittedBoxStatus.rejected].includes(status)) {
                return createResponse(400, "Invalid status. Must be 'approved' or 'rejected'.");
            }

            // 查找提交的 Box
            const submittedBox = await SubmittedBoxModel.findById(submission_id).exec();
            if (!submittedBox) {
                return createResponse(404, "Submitted box not found");
            }

            // 更新提交的 Box 狀態
            submittedBox.status = status;
            submittedBox.status_updated_date = new Date();
            if (status === SubmittedBoxStatus.rejected) {
                submittedBox.reject_reason = reject_reason || "No reason provided";
            } else {
                submittedBox.reject_reason = undefined; // 清除拒絕原因
            }
            await submittedBox.save();

            const template = await VMTemplateModel.findById(submittedBox.vmtemplate_id).exec();
            if (!template) {
                return createResponse(404, "Template not found for the submitted box");
            }
            const templateQemu = await VMUtils.getBasicQemuConfig(template.pve_node, template.pve_vmid);
            if (!templateQemu) {
                return createResponse(404, "QEMU config not found for the template");
            }

            // 如果 Box 被批准，創建正式的 VMBox 記錄
            if (status === SubmittedBoxStatus.approved) {
                const newBox = new VMBoxModel({
                    vmtemplate_id: submittedBox.vmtemplate_id,
                    box_setup_description: submittedBox.box_setup_description,
                    submitter_user_id: submittedBox.submitter_user_id,
                    submitted_date: submittedBox.submitted_date,
                    is_public: true,
                    rating_score: undefined,
                    review_count: undefined,
                    reviews: [],
                    walkthroughs: [],
                    updated_date: new Date(),
                    flag_answers: submittedBox.flag_answers,
                    allow_ai_assistant: submittedBox.allow_ai_assistant !== false,
                    design_md: submittedBox.design_md,
                    setup_md: submittedBox.setup_md,
                    writeup_md: submittedBox.writeup_md,
                    submitted_box_id: submittedBox._id?.toString(),
                });

                await newBox.save();

                logger.info(`Submission ${submission_id} approved and VMBox ${newBox._id} created by ${user.email}`);

                // 發送審核通過通知郵件給提交者
                const submitterUser = await UsersModel.findById(submittedBox.submitter_user_id).exec();
                if (submitterUser?.email) {
                    try {
                        await sendBoxAuditResultEmail(
                            submitterUser.email,
                            templateQemu.body?.name || "unknown",
                            "approved",
                            "Your box submission has been approved and is now public."
                        );
                        logger.info(`Approval notification sent to ${submitterUser.email}`);
                    } catch (emailError) {
                        logger.error("Failed to send approval notification email:", emailError);
                    }
                }

                console.log(`Box approved successfully: ${submittedBox._id}, VMBox created: ${newBox._id}`);
            } else if (status === SubmittedBoxStatus.rejected) {
                logger.info(`Submission ${submission_id} rejected by ${user.email}`);

                // 發送審核拒絕通知郵件給提交者
                const submitterUser = await UsersModel.findById(submittedBox.submitter_user_id).exec();
                if (submitterUser?.email) {
                    try {
                        await sendBoxAuditResultEmail(
                            submitterUser.email,
                            templateQemu.body?.name || "unknown",
                            "rejected",
                            reject_reason || "No reason provided"
                        );
                        logger.info(`Rejection notification sent to ${submitterUser.email}`);
                    } catch (emailError) {
                        logger.error("Failed to send rejection notification email:", emailError);
                    }
                }
            }

            return createResponse(200, "Box audit status updated successfully", submittedBox._id?.toString());

        } catch (error) {
            console.error("Error in auditBoxSubmission:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 對 Box 評分
     */
    public async rateBox(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }

            const { box_id, rating, comment } = Request.body;

            if (!box_id || typeof rating !== 'number') {
                return createResponse(400, "Missing required fields: box_id and rating");
            }

            if (rating < 1 || rating > 5) {
                return createResponse(400, "Rating must be between 1 and 5");
            }

            const box = await VMBoxModel.findById(box_id);
            if (!box) {
                return createResponse(404, "Box not found");
            }

            if (!box.is_public) {
                return createResponse(403, "Cannot rate unapproved box");
            }

            // 檢查用戶是否已經評分過
            const existingReview = await ReviewsModel.findOne({
                _id: { $in: box.reviews },
                reviewer_user_id: user._id
            });

            if (existingReview) {
                return createResponse(400, "You have already rated this box");
            }

            // 創建新的評論記錄
            const newReview = new ReviewsModel({
                reviewer_user_id: user._id,
                rating_score: rating,
                comment: comment || undefined,
                submitted_date: new Date()
            });

            await newReview.save();

            // 計算新的平均評分
            // 公式: 新平均分 = (當前平均分 * 當前評分次數 + 新評分) / (當前評分次數 + 1)
            const currentRatingScore = box.rating_score || 0;
            const currentReviewCount = box.review_count || 0;

            // 計算總分 = 當前平均分 * 當前評分次數
            const currentTotalScore = currentRatingScore * currentReviewCount;

            // 新的評分次數
            const newReviewCount = currentReviewCount + 1;

            // 計算新的平均分
            const newRatingScore = (currentTotalScore + rating) / newReviewCount;

            // 更新評分資料
            box.rating_score = Math.round(newRatingScore * 100) / 100; // 保留兩位小數
            box.review_count = newReviewCount;

            // 添加評論記錄到 Box
            box.reviews.push(newReview._id);

            await box.save();

            logger.info(`Box ${box_id} rated ${rating} by ${user.email}`);
            return createResponse(200, "Rating submitted successfully", {
                box_id,
                new_rating_score: box.rating_score,
                review_count: box.review_count,
                review_id: newReview._id
            });

        } catch (error) {
            console.error("Error in rateBox:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 獲取所有公開的 Box
     */
    public async getPublicBoxes(Request: Request): Promise<resp<VM_Box_Info[] | undefined>> {
        try {
            const boxes = await VMBoxModel.find({ is_public: true }).exec();

            if (boxes.length === 0) {
                return createResponse(200, "No public boxes found", []);
            }

            const boxInfoPromises = boxes.map(async (box): Promise<VM_Box_Info> => {
                // 獲取關聯的 VM Template 資訊
                const template = await VMTemplateModel.findById(box.vmtemplate_id).exec();

                let templateInfo = {
                    name: "Unknown Template",
                    description: box.box_setup_description,
                    default_cpu_cores: 2,
                    default_memory_size: 2048,
                    default_disk_size: 20
                };

                // 如果找到關聯的 template，獲取其詳細資訊
                if (template) {
                    try {
                        const configResp = await this._getTemplateInfo(template.pve_node, template.pve_vmid);
                        if (configResp.code === 200 && configResp.body) {
                            const qemuConfig = configResp.body;

                            templateInfo = {
                                name: qemuConfig.name || template.description,
                                description: template.description,
                                default_cpu_cores: PVEUtils.extractCpuCores(qemuConfig),
                                default_memory_size: PVEUtils.extractMemorySize(qemuConfig),
                                default_disk_size: PVEUtils.extractDiskSize(qemuConfig)
                            };
                        }
                    } catch (configError) {
                        console.warn(`Failed to get config for template ${template._id}:`, configError);
                    }
                }

                const publicWriteupCount = await BoxWriteupModel.countDocuments({
                    box_id: box._id?.toString(),
                    status: BoxWriteupStatus.approved,
                    is_public: true
                }).exec();

                // 初始化 Box 資訊
                const boxInfo: VM_Box_Info = {
                    _id: box._id,
                    name: templateInfo.name,
                    description: templateInfo.description,
                    submitted_date: box.submitted_date,
                    owner: template?.owner || "Unknown",
                    default_cpu_cores: templateInfo.default_cpu_cores,
                    default_memory_size: templateInfo.default_memory_size,
                    default_disk_size: templateInfo.default_disk_size,
                    is_public: box.is_public,
                    box_setup_description: box.box_setup_description,
                    rating_score: box.rating_score,
                    review_count: box.review_count,
                    updated_date: box.updated_date,
                    update_log: box.update_log,
                    flag_count: Object.keys(this._normalizeFlagAnswers(box.flag_answers)).length,
                    allow_ai_assistant: box.allow_ai_assistant !== false,
                    submitted_box_id: box.submitted_box_id,
                    public_writeup_count: publicWriteupCount,
                };

                // 添加提交者資訊
                if (box.submitter_user_id) {
                    const submitterUser = await UsersModel.findById(box.submitter_user_id).exec();
                    if (submitterUser) {
                        boxInfo.submitter_user_info = {
                            username: submitterUser.username,
                            email: submitterUser.email
                        };
                    }
                }

                return boxInfo;
            });

            const boxInfos = await Promise.all(boxInfoPromises);
            return createResponse(200, "Public boxes fetched successfully", boxInfos);

        } catch (error) {
            console.error("Error in getPublicBoxes:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 獲取待審核的 Box（僅限 SuperAdmin）
     */
    public async getPendingBoxes(Request: Request): Promise<resp<VM_Box_Info[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<VM_Box_Info[]>(Request);
            if (error) {
                console.error("Error validating super admin token:", error);
                return error as resp<VM_Box_Info[] | undefined>;
            }

            const boxes = await SubmittedBoxModel.find({ status: SubmittedBoxStatus.not_approved }).exec();

            if (boxes.length === 0) {
                return createResponse(200, "No pending boxes found", []);
            }

            const boxInfoPromises = boxes.map(async (box): Promise<VM_Box_Info> => {
                // 獲取關聯的 VM Template 資訊
                const template = await VMTemplateModel.findById(box.vmtemplate_id).exec();

                let templateInfo = {
                    name: "Unknown Template",
                    description: box.box_setup_description,
                    default_cpu_cores: 2,
                    default_memory_size: 2048,
                    default_disk_size: 20,
                    owner: "Unknown"
                };

                // 如果找到關聯的 template，獲取其詳細資訊
                if (template) {
                    try {
                        const configResp = await this._getTemplateInfo(template.pve_node, template.pve_vmid);
                        if (configResp.code === 200 && configResp.body) {
                            const qemuConfig = configResp.body;

                            templateInfo = {
                                name: qemuConfig.name || template.description,
                                description: template.description,
                                default_cpu_cores: PVEUtils.extractCpuCores(qemuConfig),
                                default_memory_size: PVEUtils.extractMemorySize(qemuConfig),
                                default_disk_size: PVEUtils.extractDiskSize(qemuConfig),
                                owner: template.owner
                            };
                        }
                    } catch (configError) {
                        console.warn(`Failed to get config for template ${template._id}:`, configError);
                        templateInfo.owner = template.owner;
                    }
                }

                // 初始化 Box 資訊
                const boxInfo: VM_Box_Info = {
                    _id: box._id,
                    name: templateInfo.name,
                    description: templateInfo.description,
                    submitted_date: box.submitted_date,
                    owner: templateInfo.owner,
                    default_cpu_cores: templateInfo.default_cpu_cores,
                    default_memory_size: templateInfo.default_memory_size,
                    default_disk_size: templateInfo.default_disk_size,
                    is_public: false, // 待審核的 Box 不應該是公開的
                    box_setup_description: box.box_setup_description,
                    rating_score: undefined, // 待審核的 Box 還沒有評分
                    review_count: undefined, // 待審核的 Box 還沒有評分次數
                    updated_date: box.status_updated_date || box.submitted_date,
                    allow_ai_assistant: box.allow_ai_assistant !== false,
                    design_md: box.design_md,
                    setup_md: box.setup_md,
                    writeup_md: box.writeup_md,
                };

                // 添加提交者資訊
                if (box.submitter_user_id) {
                    const submitterUser = await UsersModel.findById(box.submitter_user_id).exec();
                    if (submitterUser) {
                        boxInfo.submitter_user_info = {
                            username: submitterUser.username,
                            email: submitterUser.email
                        };
                    }
                }

                return boxInfo;
            });

            const boxInfos = await Promise.all(boxInfoPromises);
            return createResponse(200, "Pending boxes fetched successfully", boxInfos);

        } catch (error) {
            console.error("Error in getPendingBoxes:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * Update whether a Box or SubmittedBox allows student AI assistant questions.
     */
    public async updateBoxAiAssistantSetting(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser(Request);
            if (error) {
                console.error("Error validating admin token:", error);
                return error;
            }

            const { box_id, submission_id, allow_ai_assistant } = Request.body;
            if (typeof allow_ai_assistant !== 'boolean') {
                return createResponse(400, "allow_ai_assistant must be a boolean");
            }

            if (!box_id && !submission_id) {
                return createResponse(400, "box_id or submission_id is required");
            }

            if (box_id) {
                const box = await VMBoxModel.findById(box_id).exec();
                if (!box) return createResponse(404, "Box not found");
                if (user.role !== 'superadmin' && box.submitter_user_id !== user._id.toString()) {
                    return createResponse(403, "You do not have permission to update this box");
                }
                box.allow_ai_assistant = allow_ai_assistant;
                box.updated_date = new Date();
                await box.save();

                if (box.submitted_box_id) {
                    await SubmittedBoxModel.updateOne(
                        { _id: box.submitted_box_id },
                        { $set: { allow_ai_assistant, status_updated_date: new Date() } }
                    ).exec();
                }

                return createResponse(200, "Box AI assistant setting updated", {
                    box_id: box._id?.toString(),
                    submission_id: box.submitted_box_id,
                    allow_ai_assistant: box.allow_ai_assistant
                });
            }

            const submittedBox = await SubmittedBoxModel.findById(submission_id).exec();
            if (!submittedBox) return createResponse(404, "Submitted box not found");
            if (user.role !== 'superadmin' && submittedBox.submitter_user_id !== user._id.toString()) {
                return createResponse(403, "You do not have permission to update this submitted box");
            }
            submittedBox.allow_ai_assistant = allow_ai_assistant;
            submittedBox.status_updated_date = new Date();
            await submittedBox.save();

            let publishedBox: any | null = null;
            if (submittedBox.status === SubmittedBoxStatus.approved) {
                publishedBox = await this._findPublishedBoxForSubmission(submittedBox);
                if (publishedBox) {
                    publishedBox.allow_ai_assistant = allow_ai_assistant;
                    publishedBox.updated_date = new Date();
                    if (!publishedBox.submitted_box_id) {
                        publishedBox.submitted_box_id = submittedBox._id?.toString();
                    }
                    await publishedBox.save();
                }
            }

            return createResponse(200, publishedBox ? "Box AI assistant setting updated" : "Submitted box AI assistant setting updated", {
                submission_id: submittedBox._id?.toString(),
                box_id: publishedBox?._id?.toString(),
                allow_ai_assistant: submittedBox.allow_ai_assistant
            });
        } catch (error) {
            console.error("Error in updateBoxAiAssistantSetting:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 獲取 Box 的評論列表
     */
    public async getBoxReviews(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }

            const { box_id } = Request.query;

            if (!box_id) {
                return createResponse(400, "Missing required parameter: box_id");
            }

            // 檢查 Box 是否存在
            const box = await VMBoxModel.findById(box_id);
            if (!box) {
                return createResponse(404, "Box not found");
            }

            if (!box.is_public) {
                return createResponse(403, "Cannot view reviews for unapproved box");
            }

            // 獲取所有相關的評論，並包含用戶資訊
            const reviews = await ReviewsModel.find({
                _id: { $in: box.reviews }
            }).exec();

            // 為每個評論添加用戶資訊
            const reviewsWithUserInfo = await Promise.all(
                reviews.map(async (review) => {
                    const reviewer = await UsersModel.findById(review.reviewer_user_id).exec();
                    const canModify = review.reviewer_user_id?.toString() === user._id.toString();

                    return {
                        _id: review._id.toString(),
                        reviewer_user_id: review.reviewer_user_id,
                        rating_score: review.rating_score,
                        comment: review.comment,
                        submitted_date: review.submitted_date,
                        can_modify: canModify,
                        reviewer_info: reviewer ? {
                            username: reviewer.username,
                            avatar_path: reviewer.avatar_path || DEFAULT_AVATAR
                        } : {
                            username: "Unknown User",
                            avatar_path: DEFAULT_AVATAR
                        }
                    };
                })
            );

            // 按提交日期排序（最新的在前）
            reviewsWithUserInfo.sort((a, b) =>
                new Date(b.submitted_date).getTime() - new Date(a.submitted_date).getTime()
            );

            return createResponse(200, "Box reviews fetched successfully", {
                box_id,
                reviews: reviewsWithUserInfo,
                total_reviews: reviewsWithUserInfo.length,
                average_rating: box.rating_score
            });

        } catch (error) {
            console.error("Error in getBoxReviews:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async updateBoxReview(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }

            const { review_id } = Request.params;
            const { box_id, rating, comment } = Request.body;
            if (!review_id || !Types.ObjectId.isValid(review_id)) {
                return createResponse(400, "Invalid review_id format");
            }
            if (!box_id || !Types.ObjectId.isValid(box_id)) {
                return createResponse(400, "Invalid box_id format");
            }
            if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
                return createResponse(400, "Rating must be an integer between 1 and 5");
            }
            if (comment !== undefined && typeof comment !== 'string') {
                return createResponse(400, "comment must be a string");
            }

            const sanitizedComment = typeof comment === 'string' ? sanitizeString(comment).trim() : "";
            if (sanitizedComment.length > 1000) {
                return createResponse(400, "comment exceeds maximum length of 1000 characters");
            }

            const box = await VMBoxModel.findById(box_id);
            if (!box) {
                return createResponse(404, "Box not found");
            }
            const reviewIds = (box.reviews || []).map((id: any) => id?.toString());
            if (!reviewIds.includes(review_id)) {
                return createResponse(404, "Review not found for this box");
            }

            const review = await ReviewsModel.findById(review_id);
            if (!review) {
                return createResponse(404, "Review not found");
            }
            if (review.reviewer_user_id?.toString() !== user._id.toString()) {
                return createResponse(403, "You can only edit your own review");
            }

            review.rating_score = rating;
            review.comment = sanitizedComment || undefined;
            await review.save();

            const reviews = await ReviewsModel.find({ _id: { $in: box.reviews } }).lean();
            const totalRating = reviews.reduce((sum, item) => sum + item.rating_score, 0);
            box.rating_score = reviews.length > 0 ? Math.round((totalRating / reviews.length) * 100) / 100 : 0;
            box.review_count = reviews.length;
            await box.save();

            return createResponse(200, "Box review updated successfully", {
                review_id,
                new_rating_score: box.rating_score,
                review_count: box.review_count
            });
        } catch (error) {
            console.error("Error in updateBoxReview:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async deleteBoxReview(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }

            const { review_id } = Request.params;
            const { box_id } = Request.query;
            if (!review_id || !Types.ObjectId.isValid(review_id)) {
                return createResponse(400, "Invalid review_id format");
            }
            if (!box_id || typeof box_id !== 'string' || !Types.ObjectId.isValid(box_id)) {
                return createResponse(400, "Invalid box_id format");
            }

            const box = await VMBoxModel.findById(box_id);
            if (!box) {
                return createResponse(404, "Box not found");
            }
            const reviewIds = (box.reviews || []).map((id: any) => id?.toString());
            if (!reviewIds.includes(review_id)) {
                return createResponse(404, "Review not found for this box");
            }

            const review = await ReviewsModel.findById(review_id);
            if (!review) {
                return createResponse(404, "Review not found");
            }
            if (review.reviewer_user_id?.toString() !== user._id.toString()) {
                return createResponse(403, "You can only delete your own review");
            }

            box.reviews = reviewIds.filter((id: string) => id !== review_id) as any;
            await ReviewsModel.findByIdAndDelete(review_id);
            const reviews = await ReviewsModel.find({ _id: { $in: box.reviews } }).lean();
            const totalRating = reviews.reduce((sum, item) => sum + item.rating_score, 0);
            box.rating_score = reviews.length > 0 ? Math.round((totalRating / reviews.length) * 100) / 100 : 0;
            box.review_count = reviews.length;
            await box.save();

            return createResponse(200, "Box review deleted successfully", {
                review_id,
                new_rating_score: box.rating_score,
                review_count: box.review_count
            });
        } catch (error) {
            console.error("Error in deleteBoxReview:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async submitBoxWriteup(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }

            const { box_id, title, content_md } = Request.body;
            if (!box_id || typeof box_id !== 'string' || !Types.ObjectId.isValid(box_id)) {
                return createResponse(400, "Invalid box_id format");
            }
            if (typeof title !== 'string' || typeof content_md !== 'string') {
                return createResponse(400, "title and content_md are required");
            }

            const sanitizedTitle = sanitizeString(title).trim();
            const sanitizedContent = sanitizeString(content_md).trim();
            if (sanitizedTitle.length < 3 || sanitizedTitle.length > 120) {
                return createResponse(400, "title must be between 3 and 120 characters");
            }
            if (sanitizedContent.length < 80) {
                return createResponse(400, "content_md must be at least 80 characters");
            }
            if (sanitizedContent.length > 200000) {
                return createResponse(400, "content_md exceeds maximum length of 200000 characters");
            }

            const box = await VMBoxModel.findById(box_id).exec();
            if (!box || !box.is_public) {
                return createResponse(404, "Public box not found");
            }

            const activeExisting = await BoxWriteupModel.findOne({
                box_id,
                author_user_id: user._id.toString(),
                status: { $in: [BoxWriteupStatus.pending, BoxWriteupStatus.approved] }
            }).exec();
            if (activeExisting) {
                return createResponse(400, "You already have a pending or approved writeup for this box");
            }

            const writeup = new BoxWriteupModel({
                box_id,
                author_user_id: user._id.toString(),
                title: sanitizedTitle,
                content_md: sanitizedContent,
                status: BoxWriteupStatus.pending,
                is_public: false,
                submitted_date: new Date(),
                updated_date: new Date()
            });
            await writeup.save();

            logger.info(`Box writeup ${writeup._id} submitted for box ${box_id} by ${user.email}`);
            return createResponse(200, "Box writeup submitted for review", {
                writeup: await this._toWriteupDTO(writeup, { viewer: user, includePrivate: true })
            });
        } catch (error) {
            console.error("Error in submitBoxWriteup:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async getPublicBoxWriteups(Request: Request): Promise<resp<any>> {
        try {
            const { box_id } = Request.query;
            if (!box_id || typeof box_id !== 'string' || !Types.ObjectId.isValid(box_id)) {
                return createResponse(400, "Invalid box_id format");
            }

            const box = await VMBoxModel.findById(box_id).exec();
            if (!box || !box.is_public) {
                return createResponse(404, "Public box not found");
            }

            const writeups = await BoxWriteupModel.find({
                box_id,
                status: BoxWriteupStatus.approved,
                is_public: true
            }).sort({ reviewed_date: -1, submitted_date: -1 }).exec();

            const dto = await Promise.all(writeups.map((writeup) => this._toWriteupDTO(writeup)));
            return createResponse(200, "Public box writeups fetched successfully", {
                box_id,
                writeups: dto,
                total_writeups: dto.length
            });
        } catch (error) {
            console.error("Error in getPublicBoxWriteups:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async getMyBoxWriteups(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }

            const { box_id } = Request.query;
            const filter: any = { author_user_id: user._id.toString() };
            if (box_id !== undefined) {
                if (typeof box_id !== 'string' || !Types.ObjectId.isValid(box_id)) {
                    return createResponse(400, "Invalid box_id format");
                }
                filter.box_id = box_id;
            }

            const writeups = await BoxWriteupModel.find(filter).sort({ submitted_date: -1 }).exec();
            const dto = await Promise.all(writeups.map((writeup) => this._toWriteupDTO(writeup, { viewer: user })));
            return createResponse(200, "My box writeups fetched successfully", {
                writeups: dto,
                total_writeups: dto.length
            });
        } catch (error) {
            console.error("Error in getMyBoxWriteups:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async getBoxWriteupSubmissions(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser(Request);
            if (error) {
                console.error("Error validating admin token:", error);
                return error;
            }

            const { box_id, status } = Request.query;
            const filter: any = {};

            if (status !== undefined) {
                if (typeof status !== 'string' || !Object.values(BoxWriteupStatus).includes(status as BoxWriteupStatus)) {
                    return createResponse(400, "Invalid writeup status");
                }
                filter.status = status;
            }

            if (box_id !== undefined) {
                if (typeof box_id !== 'string' || !Types.ObjectId.isValid(box_id)) {
                    return createResponse(400, "Invalid box_id format");
                }
                const box = await VMBoxModel.findById(box_id).exec();
                if (!box) return createResponse(404, "Box not found");
                if (!this._canModerateBox(user, box)) {
                    return createResponse(403, "You do not have permission to manage writeups for this box");
                }
                filter.box_id = box_id;
            } else if (user.role !== Roles.SuperAdmin) {
                const ownedBoxes = await VMBoxModel.find({ submitter_user_id: user._id.toString() }).select('_id').lean().exec();
                filter.box_id = { $in: ownedBoxes.map((box: any) => box._id.toString()) };
            }

            const writeups = await BoxWriteupModel.find(filter).sort({ submitted_date: -1 }).exec();
            const dto = await Promise.all(writeups.map((writeup) => this._toWriteupDTO(writeup, { viewer: user, includePrivate: true })));
            return createResponse(200, "Box writeup submissions fetched successfully", {
                writeups: dto,
                total_writeups: dto.length
            });
        } catch (error) {
            console.error("Error in getBoxWriteupSubmissions:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async reviewBoxWriteup(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser(Request);
            if (error) {
                console.error("Error validating admin token:", error);
                return error;
            }

            const { writeup_id } = Request.params;
            const { status, reject_reason, is_public } = Request.body;
            if (!writeup_id || !Types.ObjectId.isValid(writeup_id)) {
                return createResponse(400, "Invalid writeup_id format");
            }
            if (![BoxWriteupStatus.approved, BoxWriteupStatus.rejected].includes(status)) {
                return createResponse(400, "status must be approved or rejected");
            }
            if (is_public !== undefined && typeof is_public !== 'boolean') {
                return createResponse(400, "is_public must be a boolean");
            }

            const writeup = await BoxWriteupModel.findById(writeup_id).exec();
            if (!writeup) return createResponse(404, "Writeup not found");

            const box = await VMBoxModel.findById(writeup.box_id).exec();
            if (!box) return createResponse(404, "Box not found");
            if (!this._canModerateBox(user, box)) {
                return createResponse(403, "You do not have permission to review this writeup");
            }

            writeup.status = status;
            writeup.reviewed_by_user_id = user._id.toString();
            writeup.reviewed_date = new Date();
            writeup.updated_date = new Date();

            if (status === BoxWriteupStatus.approved) {
                writeup.reject_reason = undefined;
                writeup.is_public = is_public === true;
            } else {
                const sanitizedReason = sanitizeString(reject_reason).trim();
                writeup.reject_reason = sanitizedReason || "No reason provided";
                writeup.is_public = false;
            }

            await writeup.save();
            logger.info(`Box writeup ${writeup_id} reviewed as ${status} by ${user.email}`);
            return createResponse(200, "Box writeup reviewed successfully", {
                writeup: await this._toWriteupDTO(writeup, { viewer: user, includePrivate: true })
            });
        } catch (error) {
            console.error("Error in reviewBoxWriteup:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async updateBoxWriteupVisibility(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser(Request);
            if (error) {
                console.error("Error validating admin token:", error);
                return error;
            }

            const { writeup_id } = Request.params;
            const { is_public } = Request.body;
            if (!writeup_id || !Types.ObjectId.isValid(writeup_id)) {
                return createResponse(400, "Invalid writeup_id format");
            }
            if (typeof is_public !== 'boolean') {
                return createResponse(400, "is_public must be a boolean");
            }

            const writeup = await BoxWriteupModel.findById(writeup_id).exec();
            if (!writeup) return createResponse(404, "Writeup not found");
            if (writeup.status !== BoxWriteupStatus.approved) {
                return createResponse(400, "Only approved writeups can be published");
            }

            const box = await VMBoxModel.findById(writeup.box_id).exec();
            if (!box) return createResponse(404, "Box not found");
            if (!this._canModerateBox(user, box)) {
                return createResponse(403, "You do not have permission to manage this writeup");
            }

            writeup.is_public = is_public;
            writeup.updated_date = new Date();
            await writeup.save();

            return createResponse(200, "Box writeup visibility updated", {
                writeup: await this._toWriteupDTO(writeup, { viewer: user, includePrivate: true })
            });
        } catch (error) {
            console.error("Error in updateBoxWriteupVisibility:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async getMyAnswerRecord(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }
            const { vm_id } = Request.query;

            if (!vm_id || typeof vm_id !== 'string') {
                return createResponse(400, "Missing or invalid required parameter: vm_id");
            }
            // 檢查 VM 是否存在且屬於該用戶
            const vm = await VMModel.findById(vm_id).exec();
            if (!vm) {
                return createResponse(404, "VM not found");
            }
            if (vm.owner !== user._id.toString()) {
                return createResponse(403, "You do not have permission to access this VM");
            }
            if (!vm.is_box_vm || !vm.box_id) {
                return createResponse(400, "This VM is not created from a box");
            }
            // 獲取 Box 的 flag_answers
            const box = await VMBoxModel.findById(vm.box_id).exec();
            if (!box) {
                return createResponse(404, "Box not found");
            }
            // print answer_record for testing
            console.log("Answer Record:", {
                box_id: box._id,
                flag_answers: box.flag_answers || {}
            });


            // 取得 / 建立 answer_records 文檔 (vm.answer_record 為其 _id)
            let answerDoc: any = null;
            if (vm.answer_record) {
                try { answerDoc = await AnswerRecordModel.findById(vm.answer_record).lean(); }
                catch (e) { console.warn(`Failed to load answer_record ${vm.answer_record}:`, e); }
            }
            if (!answerDoc) {
                const created: any = await AnswerRecordModel.create({});
                vm.answer_record = created._id.toString();
                await vm.save();
                answerDoc = created.toObject();
            }

            const flagAnswers = this._normalizeFlagAnswers(box.flag_answers);
            const answerStatus: Record<string, boolean> = {};
            for (const flag_id of Object.keys(flagAnswers)) {
                answerStatus[flag_id] = answerDoc[flag_id] === true; // 布林代表是否已答對
            }

            return createResponse(200, "Answer record fetched successfully", { answer_record: answerStatus });
        } catch (error) {
            console.error("Error in getMyAnswerRecord:", error);
            return createResponse(500, "Internal Server Error");
        }
    }
    /**
     * 提交單個 flag 並檢查答案
     */
    public async submitBoxAnswer(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }
            const { vm_id, flag_id, flag_answer } = Request.body;
            if (!vm_id || typeof vm_id !== 'string' || !flag_id || typeof flag_id !== 'string' || typeof flag_answer !== 'string') {
                return createResponse(400, "Missing or invalid required parameters: vm_id, flag_id, flag_answer");
            }
            // 檢查 VM 是否存在且屬於該用戶
            const vm = await VMModel.findById(vm_id).exec();
            if (!vm) {
                return createResponse(404, "VM not found");
            }
            if (vm.owner !== user._id.toString()) {
                return createResponse(403, "You do not have permission to access this VM");
            }
            if (!vm.is_box_vm || !vm.box_id) {
                return createResponse(400, "This VM is not created from a box");
            }
            // 獲取 Box 的 flag_answers
            const box = await VMBoxModel.findById(vm.box_id).exec();
            if (!box) {
                return createResponse(404, "Box not found");
            }
            const flagAnswers = this._normalizeFlagAnswers(box.flag_answers);
            if (!(flag_id in flagAnswers)) {
                return createResponse(400, "Invalid flag_id or this box does not have the specified flag");
            }
            // 取得 / 建立 answer_records 文檔
            let answerDoc: any = null;
            if (vm.answer_record) {
                try { answerDoc = await AnswerRecordModel.findById(vm.answer_record).exec(); }
                catch (e) { console.warn(`Failed to load answer_record ${vm.answer_record}:`, e); }
            }
            if (!answerDoc) {
                const created: any = await AnswerRecordModel.create({});
                vm.answer_record = created._id.toString();
                await vm.save();
                answerDoc = created;
            }
            // 已具備 flagAnswers 並驗證過 flag_id

            if (answerDoc[flag_id] === true) {
                return createResponse(200, "Flag already answered correctly", { flag_id, correct: true });
            }

            const isCorrect = flagAnswers[flag_id] === flag_answer;
            if (isCorrect) {
                // 以 Mongoose 正規方式設定動態欄位，確保變更被追蹤
                if (typeof answerDoc.set === 'function') {
                    answerDoc.set(flag_id, true);
                } else {
                    (answerDoc as any)[flag_id] = true;
                }
                // 標記此動態欄位已修改（對空 schema + strict:false 特別安全）
                if (typeof answerDoc.markModified === 'function') {
                    answerDoc.markModified(flag_id);
                }
                await answerDoc.save();
            }
            return createResponse(200, isCorrect ? "Correct answer!" : "Incorrect answer.", { flag_id, correct: isCorrect });
        } catch (error) {
            console.error("Error in submitBoxAnswer:", error);
            return createResponse(500, "Internal Server Error");
        }
    }
}
