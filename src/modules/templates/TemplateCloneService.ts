import { CloneTemplateResponse } from "../../interfaces/Response/VMResp";
import { User } from "../../interfaces/User";
import { VM_Task, VM_Task_Status } from "../../interfaces/VM/VM_Task";
import { logger } from "../../middlewares/log";
import { UsersModel } from "../../orm/schemas/UserSchemas";
import { VM_TaskModel } from "../../orm/schemas/VM/VM_TaskSchemas";
import { VMTemplateModel } from "../../orm/schemas/VM/VMTemplateSchemas";
import { PVEUtils } from "../../utils/PVEUtils";
import { VMUtils } from "../../utils/VMUtils";
import { createResponse, resp } from "../../utils/resp";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";

type TemplateCloneTemplateRepo = {
    findById(templateId: string): Promise<any | null>;
    create(payload: unknown): Promise<{ _id?: unknown }>;
};

type TemplateCloneUserRepo = {
    pushOwnedTemplate(userId: string, templateId: unknown): Promise<unknown>;
};

type TemplateCloneTaskRepo = {
    create(task: VM_Task): Promise<unknown>;
    updateOne(query: unknown, update: unknown): Promise<unknown>;
};

type TemplateCloneVMUtils = {
    getNextVMId(): Promise<resp<{ data?: unknown } | undefined>>;
    cloneVM(sourceNode: string, sourceVmid: string, newVmid: string, vmName: string, targetNode: string, storage: string, full: string): Promise<{ success: boolean; upid?: string; errorMessage?: string }>;
    waitForTaskCompletion(node: string, upid: string, label: string): Promise<{ success: boolean; errorMessage?: string }>;
    convertVMToTemplate(node: string, vmid: string): Promise<{ success: boolean; upid?: string; errorMessage?: string }>;
    deleteVMWithDiskCleanup(node: string, vmid: string): Promise<unknown>;
};

type TemplateCloneServiceDeps = {
    templateRepo?: TemplateCloneTemplateRepo;
    userRepo?: TemplateCloneUserRepo;
    taskRepo?: TemplateCloneTaskRepo;
    vmUtils?: TemplateCloneVMUtils;
    sanitizeVMName?: (name: string) => string | null;
    now?: () => Date;
};

const defaultTemplateRepo: TemplateCloneTemplateRepo = {
    findById: (templateId) => VMTemplateModel.findById(templateId).exec(),
    create: async (payload) => {
        const template = new VMTemplateModel(payload);
        await template.save();
        return template;
    }
};

const defaultUserRepo: TemplateCloneUserRepo = {
    pushOwnedTemplate: (userId, templateId) => UsersModel.updateOne(
        { _id: userId },
        { $push: { owned_templates: templateId } }
    ).exec()
};

const defaultTaskRepo: TemplateCloneTaskRepo = {
    create: (task) => VM_TaskModel.create(task),
    updateOne: (query, update) => VM_TaskModel.updateOne(query as any, update as any).exec()
};

export class TemplateCloneService {
    private readonly templateRepo: TemplateCloneTemplateRepo;
    private readonly userRepo: TemplateCloneUserRepo;
    private readonly taskRepo: TemplateCloneTaskRepo;
    private readonly vmUtils: TemplateCloneVMUtils;
    private readonly sanitizeVMName: (name: string) => string | null;
    private readonly now: () => Date;

    constructor(deps: TemplateCloneServiceDeps = {}) {
        this.templateRepo = deps.templateRepo ?? defaultTemplateRepo;
        this.userRepo = deps.userRepo ?? defaultUserRepo;
        this.taskRepo = deps.taskRepo ?? defaultTaskRepo;
        this.vmUtils = deps.vmUtils ?? VMUtils;
        this.sanitizeVMName = deps.sanitizeVMName ?? PVEUtils.sanitizeVMName;
        this.now = deps.now ?? (() => new Date());
    }

    public async cloneTemplate(input: {
        user: User;
        body: {
            template_id?: unknown;
            new_template_name?: unknown;
            description?: unknown;
            target_node?: unknown;
            storage?: unknown;
        };
    }): Promise<resp<CloneTemplateResponse | undefined>> {
        const { template_id, new_template_name, description, target_node = "gapveb", storage = "NFS" } = input.body;
        if (!template_id || !new_template_name || !description) {
            return createResponse(400, "Missing required fields: template_id, new_template_name, description");
        }

        const templateIdResult = validateObjectIdInput(template_id, "template_id");
        if (!templateIdResult.valid) {
            return createResponse(400, templateIdResult.message);
        }
        const normalizedTemplateId = templateIdResult.value;

        const sourceTemplate = await this.templateRepo.findById(normalizedTemplateId);
        if (!sourceTemplate) {
            return createResponse(404, "Source template not found");
        }

        const sanitizedName = this.sanitizeVMName(String(new_template_name).trim());
        if (!sanitizedName) {
            return createResponse(400, "Invalid template name: name contains invalid characters or is too long");
        }

        const nextIdResp = await this.vmUtils.getNextVMId();
        if (nextIdResp.code !== 200 || !nextIdResp.body?.data) {
            return createResponse(500, "Failed to get next VM ID");
        }
        const newVmid = nextIdResp.body.data.toString();
        const finalTargetNode = typeof target_node === "string" && target_node ? target_node : sourceTemplate.pve_node;
        const finalStorage = typeof storage === "string" && storage ? storage : "NFS";

        const task = await this.createCloneTemplateTask(normalizedTemplateId, input.user._id!.toString(), newVmid, sourceTemplate.pve_vmid, finalTargetNode);

        try {
            const workflowResult = await this.runCloneWorkflow({
                task,
                sourceTemplate,
                newVmid,
                sanitizedName,
                finalTargetNode,
                storage: finalStorage
            });
            if (workflowResult) return workflowResult;
        } catch (error) {
            logger.error("Error during template cloning process:", error);
            await this.taskRepo.updateOne(
                { task_id: task.task_id },
                {
                    $set: {
                        status: VM_Task_Status.FAILED,
                        updated_at: this.now()
                    }
                }
            );
            return createResponse(500, "Template cloning process failed");
        }

        const newTemplate = await this.templateRepo.create({
            description,
            pve_vmid: newVmid,
            pve_node: finalTargetNode,
            owner: input.user._id,
            ciuser: sourceTemplate.ciuser,
            cipassword: sourceTemplate.cipassword,
            is_public: false
        });

        await this.userRepo.pushOwnedTemplate(input.user._id!.toString(), newTemplate._id);
        await this.taskRepo.updateOne(
            { task_id: task.task_id },
            {
                $set: {
                    status: VM_Task_Status.COMPLETED,
                    progress: 100,
                    updated_at: this.now()
                }
            }
        );

        return createResponse(200, "Template cloned successfully", {
            template_id: newTemplate._id?.toString() || "",
            task_id: task.task_id
        });
    }

    private async runCloneWorkflow(input: {
        task: VM_Task;
        sourceTemplate: any;
        newVmid: string;
        sanitizedName: string;
        finalTargetNode: string;
        storage: string;
    }): Promise<resp<CloneTemplateResponse | undefined> | null> {
        await this.markCloneStepStarted(input.task.task_id);

        const cloneResult = await this.vmUtils.cloneVM(
            input.sourceTemplate.pve_node,
            input.sourceTemplate.pve_vmid,
            input.newVmid,
            input.sanitizedName,
            input.finalTargetNode,
            input.storage,
            "1"
        );

        if (!cloneResult.success) {
            await this.markStepFailed(input.task.task_id, 0, cloneResult.errorMessage);
            return createResponse(500, `Failed to clone template: ${cloneResult.errorMessage}`);
        }

        if (cloneResult.upid) {
            await this.markStepUpid(input.task.task_id, 0, cloneResult.upid, "Clone task submitted to PVE");
            const waitResult = await this.vmUtils.waitForTaskCompletion(input.sourceTemplate.pve_node, cloneResult.upid, "Template clone");
            if (!waitResult.success) {
                await this.markStepFailed(input.task.task_id, 0, waitResult.errorMessage);
                return createResponse(500, `Template cloning failed: ${waitResult.errorMessage}`);
            }
        }

        await this.markCloneStepCompleted(input.task.task_id);
        await this.markConvertStepStarted(input.task.task_id);

        const convertResult = await this.vmUtils.convertVMToTemplate(input.finalTargetNode, input.newVmid);
        if (!convertResult.success) {
            await this.markStepFailed(input.task.task_id, 1, convertResult.errorMessage);
            await this.vmUtils.deleteVMWithDiskCleanup(input.finalTargetNode, input.newVmid);
            return createResponse(500, `Failed to convert cloned VM to template: ${convertResult.errorMessage}`);
        }

        if (convertResult.upid) {
            await this.markStepUpid(input.task.task_id, 1, convertResult.upid, "Template conversion task submitted to PVE");
            const waitResult = await this.vmUtils.waitForTaskCompletion(input.finalTargetNode, convertResult.upid, "Template conversion");
            if (!waitResult.success) {
                await this.markStepFailed(input.task.task_id, 1, waitResult.errorMessage);
                return createResponse(500, `Template conversion failed: ${waitResult.errorMessage}`);
            }
        }

        await this.markConvertStepCompleted(input.task.task_id);
        return null;
    }

    private async createCloneTemplateTask(sourceTemplateId: string, userId: string, newVmid: string, sourceVmid: string, targetNode: string): Promise<VM_Task> {
        const currentTime = this.now();
        const task: VM_Task = {
            task_id: `clone-template-${sourceTemplateId}-${currentTime.getTime()}-${userId}`,
            user_id: userId,
            vmid: newVmid,
            template_vmid: sourceVmid,
            target_node: targetNode,
            status: VM_Task_Status.PENDING,
            progress: 0,
            created_at: currentTime,
            updated_at: currentTime,
            steps: [
                {
                    step_name: "Clone Template to VM",
                    pve_upid: "PENDING",
                    step_status: VM_Task_Status.PENDING,
                    step_message: "",
                    step_start_time: currentTime,
                    step_end_time: undefined,
                    error_message: ""
                },
                {
                    step_name: "Convert VM to Template",
                    pve_upid: "PENDING",
                    step_status: VM_Task_Status.PENDING,
                    step_message: "",
                    step_start_time: undefined,
                    step_end_time: undefined,
                    error_message: ""
                }
            ]
        };

        await this.taskRepo.create(task);
        return task;
    }

    private markCloneStepStarted(taskId: string): Promise<unknown> {
        return this.taskRepo.updateOne(
            { task_id: taskId, "steps.0.step_name": "Clone Template to VM" },
            {
                $set: {
                    status: VM_Task_Status.IN_PROGRESS,
                    progress: 25,
                    "steps.0.step_status": VM_Task_Status.IN_PROGRESS,
                    "steps.0.step_start_time": this.now(),
                    "steps.0.step_message": "Starting template clone process"
                }
            }
        );
    }

    private markCloneStepCompleted(taskId: string): Promise<unknown> {
        return this.taskRepo.updateOne(
            { task_id: taskId, "steps.0.step_name": "Clone Template to VM" },
            {
                $set: {
                    progress: 50,
                    "steps.0.step_status": VM_Task_Status.COMPLETED,
                    "steps.0.step_end_time": this.now(),
                    "steps.0.step_message": "Template clone completed successfully"
                }
            }
        );
    }

    private markConvertStepStarted(taskId: string): Promise<unknown> {
        return this.taskRepo.updateOne(
            { task_id: taskId, "steps.1.step_name": "Convert VM to Template" },
            {
                $set: {
                    progress: 75,
                    "steps.1.step_status": VM_Task_Status.IN_PROGRESS,
                    "steps.1.step_start_time": this.now(),
                    "steps.1.step_message": "Converting cloned VM to template"
                }
            }
        );
    }

    private markConvertStepCompleted(taskId: string): Promise<unknown> {
        return this.taskRepo.updateOne(
            { task_id: taskId, "steps.1.step_name": "Convert VM to Template" },
            {
                $set: {
                    "steps.1.step_status": VM_Task_Status.COMPLETED,
                    "steps.1.step_end_time": this.now(),
                    "steps.1.step_message": "Template conversion completed successfully"
                }
            }
        );
    }

    private markStepUpid(taskId: string, stepIndex: 0 | 1, upid: string, message: string): Promise<unknown> {
        return this.taskRepo.updateOne(
            { task_id: taskId, [`steps.${stepIndex}.step_name`]: stepIndex === 0 ? "Clone Template to VM" : "Convert VM to Template" },
            {
                $set: {
                    [`steps.${stepIndex}.pve_upid`]: upid,
                    [`steps.${stepIndex}.step_message`]: message
                }
            }
        );
    }

    private markStepFailed(taskId: string, stepIndex: 0 | 1, errorMessage?: string): Promise<unknown> {
        return this.taskRepo.updateOne(
            { task_id: taskId },
            {
                $set: {
                    status: VM_Task_Status.FAILED,
                    [`steps.${stepIndex}.step_status`]: VM_Task_Status.FAILED,
                    [`steps.${stepIndex}.step_end_time`]: this.now(),
                    [`steps.${stepIndex}.error_message`]: errorMessage
                }
            }
        );
    }
}

export const templateCloneService = new TemplateCloneService();
