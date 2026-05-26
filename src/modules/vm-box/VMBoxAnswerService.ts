import { resp, createResponse } from "../../utils/resp";
import { vmRepository } from "../vm/VMRepository";
import {
    buildVMBoxAnswerSubmissionOutcome,
    buildVMBoxAnswerStatus,
    evaluateVMBoxFlagAnswer,
    validateVMBoxAnswerRecordRequest,
    validateVMBoxAnswerSubmission,
    validateVMBoxAnswerVMAccess
} from "./VMBoxAnswerPolicy";
import { vmBoxAnswerRecordRepository } from "./VMBoxAnswerRecordRepository";
import { vmBoxRepository } from "./VMBoxRepository";

type VMRepositoryPort = {
    findById(vmId: string): Promise<any | null>;
};

type VMBoxRepositoryPort = {
    findById(boxId: string): Promise<any | null>;
};

type VMBoxAnswerRecordRepositoryPort = {
    getOrCreateForVM(vm: any, options?: { lean?: boolean }): Promise<any>;
};

export type VMBoxAnswerServiceDeps = {
    vmRepository?: VMRepositoryPort;
    boxRepository?: VMBoxRepositoryPort;
    answerRecords?: VMBoxAnswerRecordRepositoryPort;
};

export class VMBoxAnswerService {
    private readonly vmRepository: VMRepositoryPort;
    private readonly boxRepository: VMBoxRepositoryPort;
    private readonly answerRecords: VMBoxAnswerRecordRepositoryPort;

    constructor(deps: VMBoxAnswerServiceDeps = {}) {
        this.vmRepository = deps.vmRepository ?? vmRepository;
        this.boxRepository = deps.boxRepository ?? vmBoxRepository;
        this.answerRecords = deps.answerRecords ?? vmBoxAnswerRecordRepository;
    }

    public async getMyAnswerRecord(input: {
        user: any;
        request: { vm_id?: unknown };
    }): Promise<resp<any>> {
        const answerRecordRequest = validateVMBoxAnswerRecordRequest(input.request);
        if (!answerRecordRequest.valid) {
            return createResponse(400, answerRecordRequest.message);
        }

        const vmAccessResult = await this.findAccessibleBoxVM(answerRecordRequest.vmId, input.user._id);
        if ("error" in vmAccessResult) return vmAccessResult.error;

        const answerDoc = await this.answerRecords.getOrCreateForVM(vmAccessResult.vm, { lean: true });
        const answerStatus = buildVMBoxAnswerStatus(vmAccessResult.box.flag_answers, answerDoc);

        return createResponse(200, "Answer record fetched successfully", { answer_record: answerStatus });
    }

    public async submitAnswer(input: {
        user: any;
        request: { vm_id?: unknown; flag_id?: unknown; flag_answer?: unknown };
    }): Promise<resp<any>> {
        const answerSubmission = validateVMBoxAnswerSubmission(input.request);
        if (!answerSubmission.valid) {
            return createResponse(400, answerSubmission.message);
        }

        const vmAccessResult = await this.findAccessibleBoxVM(answerSubmission.vmId, input.user._id);
        if ("error" in vmAccessResult) return vmAccessResult.error;

        const flagResult = evaluateVMBoxFlagAnswer(
            vmAccessResult.box.flag_answers,
            answerSubmission.flagId,
            answerSubmission.flagAnswer
        );
        if (!flagResult.validFlag) {
            return createResponse(400, "Invalid flag_id or this box does not have the specified flag");
        }

        const answerDoc = await this.answerRecords.getOrCreateForVM(vmAccessResult.vm);
        const outcome = buildVMBoxAnswerSubmissionOutcome(
            answerSubmission.flagId,
            answerDoc[answerSubmission.flagId],
            flagResult.correct
        );

        if (outcome.shouldPersistCorrectAnswer) {
            this.markFlagSolved(answerDoc, answerSubmission.flagId);
            await answerDoc.save();
        }

        return createResponse(200, outcome.message, outcome.response);
    }

    private async findAccessibleBoxVM(vmId: string, userId: unknown): Promise<
        { vm: any; box: any } |
        { error: resp<any> }
    > {
        const vm = await this.vmRepository.findById(vmId);
        if (!vm) return { error: createResponse(404, "VM not found") };

        const vmAccess = validateVMBoxAnswerVMAccess(vm, userId);
        if (!vmAccess.valid) {
            return { error: createResponse(vmAccess.statusCode, vmAccess.message) };
        }

        const box = await this.boxRepository.findById(vmAccess.boxId);
        if (!box) return { error: createResponse(404, "Box not found") };

        return { vm, box };
    }

    private markFlagSolved(answerDoc: any, flagId: string): void {
        if (typeof answerDoc.set === 'function') {
            answerDoc.set(flagId, true);
        } else {
            answerDoc[flagId] = true;
        }

        if (typeof answerDoc.markModified === 'function') {
            answerDoc.markModified(flagId);
        }
    }
}

export const vmBoxAnswerService = new VMBoxAnswerService();
