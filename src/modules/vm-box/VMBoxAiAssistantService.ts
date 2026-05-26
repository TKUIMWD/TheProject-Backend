import { SubmittedBoxStatus } from "../../interfaces/SubmittedBox";
import { User } from "../../interfaces/User";
import { createResponse, resp } from "../../utils/resp";
import {
    canUpdateVMBoxAiAssistantSetting,
    validateVMBoxAiAssistantSettingRequest
} from "./VMBoxAiAssistantPolicy";
import { vmBoxRepository } from "./VMBoxRepository";
import { vmBoxSubmissionRepository } from "./VMBoxSubmissionRepository";

type VMBoxAiAssistantBoxRepository = {
    findById(boxId: string): Promise<any | null>;
    findPublishedForSubmission(submission: any): Promise<any | null>;
};

type VMBoxAiAssistantSubmissionRepository = {
    findById(submissionId: string): Promise<any | null>;
    updateAiAssistantSetting(submissionId: string, allowAiAssistant: boolean, now?: Date): Promise<unknown>;
};

type VMBoxAiAssistantServiceDeps = {
    boxRepo?: VMBoxAiAssistantBoxRepository;
    submissionRepo?: VMBoxAiAssistantSubmissionRepository;
    now?: () => Date;
};

export class VMBoxAiAssistantService {
    private readonly boxRepo: VMBoxAiAssistantBoxRepository;
    private readonly submissionRepo: VMBoxAiAssistantSubmissionRepository;
    private readonly now: () => Date;

    constructor(deps: VMBoxAiAssistantServiceDeps = {}) {
        this.boxRepo = deps.boxRepo ?? vmBoxRepository;
        this.submissionRepo = deps.submissionRepo ?? vmBoxSubmissionRepository;
        this.now = deps.now ?? (() => new Date());
    }

    public async updateSetting(input: {
        user: User;
        request: { box_id?: unknown; submission_id?: unknown; allow_ai_assistant?: unknown };
    }): Promise<resp<any>> {
        const settingRequest = validateVMBoxAiAssistantSettingRequest(input.request);
        if (!settingRequest.valid) {
            return createResponse(400, settingRequest.message);
        }

        if (settingRequest.target.type === "box") {
            return this.updatePublishedBoxSetting({
                user: input.user,
                boxId: settingRequest.target.boxId,
                allowAiAssistant: settingRequest.allowAiAssistant
            });
        }

        return this.updateSubmittedBoxSetting({
            user: input.user,
            submissionId: settingRequest.target.submissionId,
            allowAiAssistant: settingRequest.allowAiAssistant
        });
    }

    private async updatePublishedBoxSetting(input: {
        user: User;
        boxId: string;
        allowAiAssistant: boolean;
    }): Promise<resp<any>> {
        const box = await this.boxRepo.findById(input.boxId);
        if (!box) return createResponse(404, "Box not found");

        if (!canUpdateVMBoxAiAssistantSetting(input.user.role, input.user._id!.toString(), box.submitter_user_id)) {
            return createResponse(403, "You do not have permission to update this box");
        }

        const now = this.now();
        box.allow_ai_assistant = input.allowAiAssistant;
        box.updated_date = now;
        await box.save();

        if (box.submitted_box_id) {
            await this.submissionRepo.updateAiAssistantSetting(box.submitted_box_id, input.allowAiAssistant, now);
        }

        return createResponse(200, "Box AI assistant setting updated", {
            box_id: box._id?.toString(),
            submission_id: box.submitted_box_id,
            allow_ai_assistant: box.allow_ai_assistant
        });
    }

    private async updateSubmittedBoxSetting(input: {
        user: User;
        submissionId: string;
        allowAiAssistant: boolean;
    }): Promise<resp<any>> {
        const submittedBox = await this.submissionRepo.findById(input.submissionId);
        if (!submittedBox) return createResponse(404, "Submitted box not found");

        if (!canUpdateVMBoxAiAssistantSetting(input.user.role, input.user._id!.toString(), submittedBox.submitter_user_id)) {
            return createResponse(403, "You do not have permission to update this submitted box");
        }

        const now = this.now();
        submittedBox.allow_ai_assistant = input.allowAiAssistant;
        submittedBox.status_updated_date = now;
        await submittedBox.save();

        let publishedBox: any | null = null;
        if (submittedBox.status === SubmittedBoxStatus.approved) {
            publishedBox = await this.boxRepo.findPublishedForSubmission(submittedBox);
            if (publishedBox) {
                publishedBox.allow_ai_assistant = input.allowAiAssistant;
                publishedBox.updated_date = now;
                if (!publishedBox.submitted_box_id) {
                    publishedBox.submitted_box_id = submittedBox._id?.toString();
                }
                await publishedBox.save();
            }
        }

        return createResponse(
            200,
            publishedBox ? "Box AI assistant setting updated" : "Submitted box AI assistant setting updated",
            {
                submission_id: submittedBox._id?.toString(),
                box_id: publishedBox?._id?.toString(),
                allow_ai_assistant: submittedBox.allow_ai_assistant
            }
        );
    }
}

export const vmBoxAiAssistantService = new VMBoxAiAssistantService();
