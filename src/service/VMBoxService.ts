import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { Request } from "express";
import { validateTokenAndGetUser, validateTokenAndGetAdminUser, validateTokenAndGetSuperAdminUser } from "../utils/auth";
import { SubmittedBoxStatus } from "../interfaces/SubmittedBox";
import { VM_Box_Info } from "../interfaces/VM/VM_Box";
import { logger } from "../middlewares/log";
import { vmRepository } from "../modules/vm/VMRepository";
import { vmBoxReviewService } from "../modules/vm-box/VMBoxReviewService";
import { vmBoxWriteupService } from "../modules/vm-box/VMBoxWriteupService";
import { vmBoxAnswerService } from "../modules/vm-box/VMBoxAnswerService";
import { VMBoxListService } from "../modules/vm-box/VMBoxListService";
import { vmBoxAiAssistantService } from "../modules/vm-box/VMBoxAiAssistantService";
import { vmBoxSubmissionAuditService } from "../modules/vm-box/VMBoxSubmissionAuditService";
import { vmBoxSubmissionCreateService } from "../modules/vm-box/VMBoxSubmissionCreateService";
import { vmBoxTemplateInfoService } from "../modules/vm-box/VMBoxTemplateInfoService";


export class VMBoxService extends Service {
    /**
     * 提交 Box 申請 (需要 Admin 或以上權限)
     */
    public async submitBox(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser(Request);
            if (error) {
                logger.error("Error validating admin token:", error);
                return error;
            }

            return vmBoxSubmissionCreateService.submitBox({
                user,
                request: Request.body
            });

        } catch (error) {
            logger.error("Error in submitBox:", error);
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
                logger.error("Error validating super admin token:", error);
                return error;
            }

            return this._buildVMBoxListService().listSubmittedBoxes();

        } catch (error) {
            logger.error("Error in getSubmittedBoxes:", error);
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
                logger.error("Error validating super admin token:", error);
                return createResponse(error.code, error.message);
            }

            return vmBoxSubmissionAuditService.auditBoxSubmission({ user, body: Request.body });

        } catch (error) {
            logger.error("Error in auditBoxSubmission:", error);
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
                logger.error("Error validating token:", error);
                return error;
            }

            return vmBoxReviewService.createReview({
                user,
                request: Request.body
            });

        } catch (error) {
            logger.error("Error in rateBox:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 獲取所有公開的 Box
     */
    public async getPublicBoxes(Request: Request): Promise<resp<VM_Box_Info[] | undefined>> {
        try {
            return this._buildVMBoxListService().listPublicBoxes();

        } catch (error) {
            logger.error("Error in getPublicBoxes:", error);
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
                logger.error("Error validating super admin token:", error);
                return error as resp<VM_Box_Info[] | undefined>;
            }

            return this._buildVMBoxListService().listPendingBoxes();

        } catch (error) {
            logger.error("Error in getPendingBoxes:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    private _buildVMBoxListService(): VMBoxListService {
        return new VMBoxListService({
            resolveTemplateInfo: (template, fallbackDescription, options) =>
                vmBoxTemplateInfoService.buildTemplateInfo(template, fallbackDescription, options)
        });
    }

    /**
     * Update whether a Box or SubmittedBox allows student AI assistant questions.
     */
    public async updateBoxAiAssistantSetting(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser(Request);
            if (error) {
                logger.error("Error validating admin token:", error);
                return error;
            }

            return vmBoxAiAssistantService.updateSetting({
                user,
                request: Request.body
            });
        } catch (error) {
            logger.error("Error in updateBoxAiAssistantSetting:", error);
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
                logger.error("Error validating token:", error);
                return error;
            }

            return vmBoxReviewService.listReviews({
                user,
                request: Request.query
            });

        } catch (error) {
            logger.error("Error in getBoxReviews:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async updateBoxReview(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }

            return vmBoxReviewService.updateReview({
                user,
                request: {
                    ...Request.body,
                    review_id: Request.params.review_id
                }
            });
        } catch (error) {
            logger.error("Error in updateBoxReview:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async deleteBoxReview(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }

            return vmBoxReviewService.deleteReview({
                user,
                request: {
                    review_id: Request.params.review_id,
                    box_id: Request.query.box_id
                }
            });
        } catch (error) {
            logger.error("Error in deleteBoxReview:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async submitBoxWriteup(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }

            return vmBoxWriteupService.submitWriteup({
                user,
                request: Request.body
            });
        } catch (error) {
            logger.error("Error in submitBoxWriteup:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async getPublicBoxWriteups(Request: Request): Promise<resp<any>> {
        try {
            return vmBoxWriteupService.listPublicWriteups({
                request: Request.query
            });
        } catch (error) {
            logger.error("Error in getPublicBoxWriteups:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async getMyBoxWriteups(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }

            return vmBoxWriteupService.listMyWriteups({
                user,
                request: Request.query
            });
        } catch (error) {
            logger.error("Error in getMyBoxWriteups:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async getBoxWriteupSubmissions(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser(Request);
            if (error) {
                logger.error("Error validating admin token:", error);
                return error;
            }

            return vmBoxWriteupService.listSubmissionWriteups({
                user,
                request: Request.query
            });
        } catch (error) {
            logger.error("Error in getBoxWriteupSubmissions:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async reviewBoxWriteup(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser(Request);
            if (error) {
                logger.error("Error validating admin token:", error);
                return error;
            }

            return vmBoxWriteupService.reviewWriteup({
                user,
                request: {
                    ...Request.body,
                    writeup_id: Request.params.writeup_id
                }
            });
        } catch (error) {
            logger.error("Error in reviewBoxWriteup:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async updateBoxWriteupVisibility(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser(Request);
            if (error) {
                logger.error("Error validating admin token:", error);
                return error;
            }

            return vmBoxWriteupService.updateVisibility({
                user,
                request: {
                    ...Request.body,
                    writeup_id: Request.params.writeup_id
                }
            });
        } catch (error) {
            logger.error("Error in updateBoxWriteupVisibility:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async getMyAnswerRecord(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }
            return vmBoxAnswerService.getMyAnswerRecord({
                user,
                request: Request.query
            });
        } catch (error) {
            logger.error("Error in getMyAnswerRecord:", error);
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
                logger.error("Error validating token:", error);
                return error;
            }
            return vmBoxAnswerService.submitAnswer({
                user,
                request: Request.body
            });
        } catch (error) {
            logger.error("Error in submitBoxAnswer:", error);
            return createResponse(500, "Internal Server Error");
        }
    }
}
