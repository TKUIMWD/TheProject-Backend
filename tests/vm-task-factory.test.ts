import { describe, expect, it } from "vitest";
import { VM_Task_Status } from "../src/interfaces/VM/VM_Task";
import { PVE_TASK_EXIT_STATUS, PVE_TASK_STATUS } from "../src/interfaces/PVE";
import {
    buildVMCreationTask,
    buildVMTaskPVERefreshDecision,
    buildVMTaskStatusUpdate,
    buildVMTaskStepUpdate,
    buildVMTaskWithPVEStatusDTO,
    buildVMUpdateTask,
    VM_CREATION_STEP_INDICES,
    VM_UPDATE_CONFIG_STEP_INDICES
} from "../src/modules/vm/VMTaskFactory";

const now = new Date("2026-05-26T00:00:00.000Z");

describe("VMTaskFactory", () => {
    it("builds VM creation tasks with deterministic IDs and step order", () => {
        const task = buildVMCreationTask({
            templateId: "template-1",
            userId: "user-1",
            vmid: "101",
            templateVmid: "9000",
            targetNode: "pve-a",
            now
        });

        expect(task.task_id).toBe(`clone-template-1-${now.getTime()}-user-1`);
        expect(task.status).toBe(VM_Task_Status.PENDING);
        expect(task.progress).toBe(0);
        expect(task.template_vmid).toBe("9000");
        expect(task.steps?.map(step => step.step_name)).toEqual([
            "Clone VM from Template",
            "Configure CPU Cores",
            "Configure Memory",
            "Resize Disk",
            "Configure Cloud-Init"
        ]);
        expect(task.steps?.[VM_CREATION_STEP_INDICES.CLONE].step_start_time).toBe(now);
        expect(task.steps?.[VM_CREATION_STEP_INDICES.CPU].step_start_time).toBeUndefined();
    });

    it("builds VM update tasks without template VM IDs", () => {
        const task = buildVMUpdateTask({
            vmId: "507f1f77bcf86cd799439011",
            userId: "user-1",
            pveVmid: "101",
            pveNode: "pve-a",
            now
        });

        expect(task.task_id).toBe(`update-507f1f77bcf86cd799439011-${now.getTime()}-user-1`);
        expect(task.template_vmid).toBeUndefined();
        expect(task.steps?.map(step => step.step_name)).toEqual([
            "Update VM Name",
            "Configure CPU Cores",
            "Configure Memory",
            "Resize Disk",
            "Configure Cloud-Init"
        ]);
        expect(task.steps?.[VM_UPDATE_CONFIG_STEP_INDICES.NAME].step_start_time).toBe(now);
        expect(task.steps?.[VM_UPDATE_CONFIG_STEP_INDICES.CLOUD_INIT].pve_upid).toBe("PENDING");
    });

    it("initializes all steps as pending with empty messages", () => {
        const task = buildVMCreationTask({
            templateId: "template-1",
            userId: "user-1",
            vmid: "101",
            templateVmid: "9000",
            targetNode: "pve-a",
            now
        });

        expect(task.steps?.every(step =>
            step.pve_upid === "PENDING"
            && step.step_status === VM_Task_Status.PENDING
            && step.step_message === ""
            && step.error_message === ""
        )).toBe(true);
    });

    it("builds task status update payloads with optional UPID and error messages", () => {
        expect(buildVMTaskStatusUpdate(VM_Task_Status.IN_PROGRESS, "UPID:1", undefined, now)).toEqual({
            status: VM_Task_Status.IN_PROGRESS,
            updated_at: now,
            upid: "UPID:1"
        });

        expect(buildVMTaskStatusUpdate(VM_Task_Status.FAILED, undefined, "clone failed", now)).toEqual({
            status: VM_Task_Status.FAILED,
            updated_at: now,
            error_message: "clone failed"
        });
    });

    it("builds task step update payloads using dynamic step paths", () => {
        expect(buildVMTaskStepUpdate(2, VM_Task_Status.FAILED, "UPID:2", "memory failed", now)).toEqual({
            "steps.2.step_status": VM_Task_Status.FAILED,
            "steps.2.step_end_time": now,
            "steps.2.pve_upid": "UPID:2",
            "steps.2.error_message": "memory failed"
        });

        expect(buildVMTaskStepUpdate(1, VM_Task_Status.IN_PROGRESS, undefined, undefined, now)).toEqual({
            "steps.1.step_status": VM_Task_Status.IN_PROGRESS,
            "steps.1.step_end_time": now
        });
    });

    it("maps running PVE task status to local in-progress updates", () => {
        expect(buildVMTaskPVERefreshDecision({
            status: VM_Task_Status.PENDING,
            progress: 0
        }, {
            upid: "UPID:1",
            node: "pve-a",
            status: PVE_TASK_STATUS.RUNNING,
            type: "qmclone",
            user: "root@pam",
            starttime: 1,
            progress: 42
        }, now)).toEqual({
            shouldUpdate: true,
            status: VM_Task_Status.IN_PROGRESS,
            progress: 42,
            updateData: {
                status: VM_Task_Status.IN_PROGRESS,
                progress: 42,
                updated_at: now,
                "steps.0.step_status": VM_Task_Status.IN_PROGRESS,
                "steps.0.step_end_time": undefined
            }
        });
    });

    it("maps stopped OK PVE task status to completion", () => {
        expect(buildVMTaskPVERefreshDecision({
            status: VM_Task_Status.IN_PROGRESS,
            progress: 65
        }, {
            upid: "UPID:1",
            node: "pve-a",
            status: PVE_TASK_STATUS.STOPPED,
            type: "qmclone",
            user: "root@pam",
            starttime: 1,
            endtime: 1_779_757_200,
            exitstatus: PVE_TASK_EXIT_STATUS.OK
        }, now)).toEqual({
            shouldUpdate: true,
            status: VM_Task_Status.COMPLETED,
            progress: 100,
            updateData: {
                status: VM_Task_Status.COMPLETED,
                progress: 100,
                updated_at: now,
                "steps.0.step_status": VM_Task_Status.COMPLETED,
                "steps.0.step_end_time": new Date(1_779_757_200 * 1000)
            }
        });
    });

    it("maps stopped failed PVE task status to failure with an error message", () => {
        expect(buildVMTaskPVERefreshDecision({
            status: VM_Task_Status.IN_PROGRESS,
            progress: 65
        }, {
            upid: "UPID:1",
            node: "pve-a",
            status: PVE_TASK_STATUS.STOPPED,
            type: "qmclone",
            user: "root@pam",
            starttime: 1,
            exitstatus: "storage unavailable"
        }, now)).toMatchObject({
            shouldUpdate: true,
            status: VM_Task_Status.FAILED,
            progress: 65,
            updateData: {
                "steps.0.error_message": "storage unavailable"
            }
        });
    });

    it("skips PVE refresh updates for errored or unchanged statuses", () => {
        expect(buildVMTaskPVERefreshDecision({
            status: VM_Task_Status.IN_PROGRESS,
            progress: 65
        }, {
            upid: "UPID:1",
            node: "pve-a",
            status: PVE_TASK_STATUS.STOPPED,
            type: "qmclone",
            user: "root@pam",
            starttime: 1,
            error: "cannot reach PVE"
        }, now)).toEqual({ shouldUpdate: false });

        expect(buildVMTaskPVERefreshDecision({
            status: VM_Task_Status.IN_PROGRESS,
            progress: 65
        }, {
            upid: "UPID:1",
            node: "pve-a",
            status: PVE_TASK_STATUS.STOPPED,
            type: "qmclone",
            user: "root@pam",
            starttime: 1,
            exitstatus: null
        }, now)).toEqual({ shouldUpdate: false });
    });

    it("builds task DTOs with optional PVE status", () => {
        const task = buildVMCreationTask({
            templateId: "template-1",
            userId: "user-1",
            vmid: "101",
            templateVmid: "9000",
            targetNode: "pve-a",
            now
        });
        const pveStatus = {
            upid: "UPID:1",
            node: "pve-a",
            status: PVE_TASK_STATUS.RUNNING,
            type: "qmclone",
            user: "root@pam",
            starttime: 1,
            progress: 10
        };

        expect(buildVMTaskWithPVEStatusDTO(task, pveStatus)).toMatchObject({
            task_id: task.task_id,
            vmid: "101",
            template_vmid: "9000",
            target_node: "pve-a",
            status: VM_Task_Status.PENDING,
            progress: 0,
            pve_status: pveStatus
        });
        expect(buildVMTaskWithPVEStatusDTO(task).pve_status).toBeNull();
    });
});
