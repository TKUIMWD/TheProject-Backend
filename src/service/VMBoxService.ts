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
import { Document } from "mongoose";
import { sendBoxAuditResultEmail } from "../utils/MailSender/BoxAuditResultSender";
import { VMUtils } from "../utils/VMUtils";
import { PVEUtils } from "../utils/PVEUtils";
import { Reviews } from "../interfaces/Reviews";
import { ReviewsModel } from "../orm/schemas/ReviewsSchemas";
import { DEFAULT_AVATAR } from "../utils/avatarUpload";


export class VMBoxService extends Service {

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
                box_setup_description
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
                flag_answers: Request.body.flag_answers || {}
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
    public async getSubmittedBoxes(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser(Request);
            if (error) {
                console.error("Error validating super admin token:", error);
                return error;
            }

            const submissions = await SubmittedBoxModel.find().exec();
            
            const submissionInfos = await Promise.all(
                submissions.map(async (submission: any) => {
                    // 獲取提交者資訊
                    const submitterUser = await UsersModel.findById(submission.submitter_user_id).exec();
                    
                    return {
                        _id: submission._id,
                        vmtemplate_id: submission.vmtemplate_id,
                        box_setup_description: submission.box_setup_description,
                        submitted_date: submission.submitted_date,
                        status: submission.status,
                        audit_message: submission.audit_message,
                        audited_by: submission.audited_by,
                        audited_date: submission.audited_date,
                        submitter_info: submitterUser ? {
                            username: submitterUser.username,
                            email: submitterUser.email
                        } : null
                    };
                })
            );

            return createResponse(200, "Submitted boxes fetched successfully", submissionInfos);

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
                });

                await newBox.save();
                
                logger.info(`Submission ${submission_id} approved and VMBox ${newBox._id} created by ${user.email}`);

                // 發送審核通過通知郵件給提交者
                const submitterUser = await UsersModel.findById(submittedBox.submitter_user_id).exec();
                if (submitterUser?.email) {
                    try {
                        await sendBoxAuditResultEmail(
                            submitterUser.email, 
                            submittedBox.box_setup_description, 
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
                            submittedBox.box_setup_description, 
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
            const { user, error } = await validateTokenAndGetUser<VM_Box_Info[]>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error as resp<VM_Box_Info[] | undefined>;
            }

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
                    update_log: box.update_log
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
                    
                    return {
                        rating_score: review.rating_score,
                        comment: review.comment,
                        submitted_date: review.submitted_date,
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
}
