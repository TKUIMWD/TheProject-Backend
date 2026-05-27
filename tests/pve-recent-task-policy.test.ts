import { describe, expect, it } from "vitest";
import { VM_Task_Status } from "../src/interfaces/VM/VM_Task";
import { buildPVERecentTaskDTO, parsePVERecentTaskStatusFilter } from "../src/modules/pve/PVERecentTaskPolicy";

const now = new Date("2026-05-26T00:00:00.000Z");

describe("PVERecentTaskPolicy", () => {
    it("maps dashboard status filters to repository query status", () => {
        expect(parsePVERecentTaskStatusFilter(undefined)).toEqual({ valid: true });
        expect(parsePVERecentTaskStatusFilter("running")).toEqual({
            valid: true,
            normalized: "running",
            queryStatus: { $in: [VM_Task_Status.PENDING, VM_Task_Status.IN_PROGRESS] }
        });
        expect(parsePVERecentTaskStatusFilter("completed")).toEqual({
            valid: true,
            normalized: "completed",
            queryStatus: VM_Task_Status.COMPLETED
        });
        expect(parsePVERecentTaskStatusFilter("failed")).toEqual({
            valid: true,
            normalized: "failed",
            queryStatus: VM_Task_Status.FAILED
        });
        expect(parsePVERecentTaskStatusFilter("other")).toEqual({
            valid: false,
            message: "Invalid task status filter"
        });
    });

    it("builds compact recent task DTOs from task and PVE status data", () => {
        expect(buildPVERecentTaskDTO({
            task_id: "task-1",
            user_id: "user-1",
            vmid: "101",
            target_node: "pve-a",
            status: VM_Task_Status.FAILED,
            progress: 70,
            created_at: now,
            updated_at: new Date("2026-05-26T00:06:00.000Z"),
            steps: [
                {
                    step_name: "Clone VM from Template",
                    pve_upid: "UPID:failed",
                    step_status: VM_Task_Status.FAILED,
                    step_start_time: now,
                    step_end_time: new Date("2026-05-26T00:05:00.000Z"),
                    error_message: "storage full"
                }
            ],
            pve_status: {
                upid: "UPID:failed",
                node: "pve-a",
                status: "stopped",
                type: "qmclone",
                user: "root@pam",
                starttime: 1,
                exitstatus: "storage full"
            }
        })).toEqual({
            task_id: "task-1",
            upid: "UPID:failed",
            node: "pve-a",
            vmid: "101",
            action_type: "Clone VM from Template",
            status: VM_Task_Status.FAILED,
            start_time: "2026-05-26T00:00:00.000Z",
            end_time: "2026-05-26T00:05:00.000Z",
            progress: 70,
            error_message: "storage full"
        });
    });
});
