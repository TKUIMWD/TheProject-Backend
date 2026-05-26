import { describe, expect, it } from "vitest";
import { PVE_TASK_EXIT_STATUS, PVE_TASK_STATUS } from "../src/interfaces/PVE";
import { VM_Task, VM_Task_Status } from "../src/interfaces/VM/VM_Task";
import { PVETaskService } from "../src/modules/pve/PVETaskService";

const userId = "507f1f77bcf86cd7994390b1";
const now = new Date("2026-05-26T00:00:00.000Z");

function makeUser() {
    return {
        _id: userId,
        username: "student",
        email: "student@example.com",
        role: "user",
        course_ids: [],
        owned_vms: [],
        owned_templates: []
    } as any;
}

function makeTask(overrides: Partial<VM_Task> = {}): VM_Task {
    return {
        task_id: "task-1",
        user_id: userId,
        vmid: "101",
        template_vmid: "9000",
        target_node: "pve-a",
        status: VM_Task_Status.PENDING,
        progress: 0,
        created_at: now,
        updated_at: now,
        steps: [
            {
                step_name: "Clone VM from Template",
                pve_upid: "UPID:1",
                step_status: VM_Task_Status.PENDING,
                step_message: "",
                step_start_time: now,
                error_message: ""
            }
        ],
        ...overrides
    };
}

function makeService(options: {
    tasks?: VM_Task[];
    latestTask?: VM_Task | null;
    task?: VM_Task | null;
    count?: number;
    pveData?: Record<string, unknown>;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new PVETaskService({
        now: () => new Date(now),
        pve: {
            request: async (method, url) => {
                calls.push({ method: "pve.request", args: [method, url] });
                return {
                    data: options.pveData ?? {
                        status: PVE_TASK_STATUS.RUNNING,
                        type: "qmclone",
                        user: "root@pam",
                        starttime: 1,
                        progress: 42
                    }
                } as any;
            }
        },
        taskRepo: {
            listTasksByIdsForUser: async (taskIds, id) => {
                calls.push({ method: "listTasksByIdsForUser", args: [taskIds, id] });
                return options.tasks ?? [makeTask()];
            },
            findLatestForUser: async (id) => {
                calls.push({ method: "findLatestForUser", args: [id] });
                return options.latestTask === undefined ? makeTask() : options.latestTask;
            },
            listForUser: async (query, pagination) => {
                calls.push({ method: "listForUser", args: [query, pagination] });
                return options.tasks ?? [makeTask()];
            },
            count: async (query) => {
                calls.push({ method: "count", args: [query] });
                return options.count ?? 1;
            },
            findByTaskIdForUser: async (taskId, id) => {
                calls.push({ method: "findByTaskIdForUser", args: [taskId, id] });
                return options.task === undefined ? makeTask() : options.task;
            },
            updateTask: async (taskId, update) => {
                calls.push({ method: "updateTask", args: [taskId, update] });
                return { modifiedCount: 1 };
            },
            deleteOlderThan: async (cutoffDate) => {
                calls.push({ method: "deleteOlderThan", args: [cutoffDate] });
                return { acknowledged: true, deletedCount: 3 } as any;
            },
            countByStatus: async () => {
                calls.push({ method: "countByStatus", args: [] });
                return [{ _id: VM_Task_Status.COMPLETED, count: 2 }];
            }
        }
    });

    return { calls, service };
}

describe("PVETaskService", () => {
    it("rejects empty multiple-task status requests", async () => {
        const { service, calls } = makeService();

        await expect(service.getMultipleTasksStatus({
            user: makeUser(),
            taskIds: []
        })).resolves.toMatchObject({
            code: 400,
            message: "task_ids must be a non-empty array"
        });
        expect(calls).toEqual([]);
    });

    it("returns paginated user tasks with live PVE status", async () => {
        const { service, calls } = makeService({ count: 12 });

        await expect(service.getUserAllTasksStatus({
            user: makeUser(),
            page: "2",
            limit: "5",
            status: VM_Task_Status.PENDING
        })).resolves.toMatchObject({
            code: 200,
            message: "User tasks status fetched successfully",
            body: {
                pagination: {
                    page: 2,
                    limit: 5,
                    total: 12,
                    totalPages: 3
                },
                tasks: [
                    expect.objectContaining({
                        task_id: "task-1",
                        pve_status: expect.objectContaining({
                            status: PVE_TASK_STATUS.RUNNING,
                            progress: 42
                        })
                    })
                ]
            }
        });
        expect(calls).toContainEqual({
            method: "listForUser",
            args: [{ user_id: userId, status: VM_Task_Status.PENDING }, { skip: 5, limit: 5 }]
        });
    });

    it("refreshes a task and persists changed PVE state", async () => {
        const { service, calls } = makeService({
            pveData: {
                status: PVE_TASK_STATUS.STOPPED,
                type: "qmclone",
                user: "root@pam",
                starttime: 1,
                endtime: 1_779_724_800,
                exitstatus: PVE_TASK_EXIT_STATUS.OK
            }
        });

        await expect(service.refreshTaskStatus({
            user: makeUser(),
            taskId: "task-1"
        })).resolves.toMatchObject({
            code: 200,
            message: "Task status refreshed successfully",
            body: {
                task_id: "task-1",
                status: VM_Task_Status.COMPLETED,
                progress: 100
            }
        });

        const updateCall = calls.find((call) => call.method === "updateTask");
        expect(updateCall?.args[0]).toBe("task-1");
        expect(updateCall?.args[1]).toMatchObject({
            status: VM_Task_Status.COMPLETED,
            progress: 100,
            "steps.0.step_status": VM_Task_Status.COMPLETED
        });
    });

    it("cleans old tasks and returns post-cleanup counts", async () => {
        const { service, calls } = makeService({ count: 9 });

        await expect(service.cleanupTasks()).resolves.toMatchObject({
            code: 200,
            message: "Task cleanup completed",
            body: {
                totalTasks: 9,
                tasksByStatus: [{ _id: VM_Task_Status.COMPLETED, count: 2 }]
            }
        });

        expect(calls).toContainEqual({
            method: "deleteOlderThan",
            args: [new Date("2026-04-26T00:00:00.000Z")]
        });
    });
});
