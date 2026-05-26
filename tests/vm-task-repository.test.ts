import { describe, expect, it } from "vitest";
import { VM_Task, VM_Task_Status } from "../src/interfaces/VM/VM_Task";
import { VMTaskRepository } from "../src/modules/vm/VMTaskRepository";

function makeRepository() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const taskRefs = [{ task_id: "newest" }, { task_id: "old" }];
    const queryResult = [{ task_id: "task-1" }];
    const makeQuery = (result: any) => ({
        sort: (sort: unknown) => {
            calls.push({ method: "sort", args: [sort] });
            return makeQuery(result);
        },
        skip: (skip: number) => {
            calls.push({ method: "skip", args: [skip] });
            return makeQuery(result);
        },
        limit: (limit: number) => {
            calls.push({ method: "limit", args: [limit] });
            return {
                exec: async () => result
            };
        },
        exec: async () => result
    });

    const taskModel = {
        create: async (task: VM_Task) => {
            calls.push({ method: "create", args: [task] });
        },
        updateByTaskId: async (taskId: string, update: unknown) => {
            calls.push({ method: "updateByTaskId", args: [taskId, update] });
            return { acknowledged: true, matchedCount: 1, modifiedCount: 1 } as any;
        },
        findUserTaskRefsNewestFirst: async (userId: string) => {
            calls.push({ method: "findUserTaskRefsNewestFirst", args: [userId] });
            return taskRefs;
        },
        deleteByTaskIds: async (taskIds: string[]) => {
            calls.push({ method: "deleteByTaskIds", args: [taskIds] });
            return { acknowledged: true, deletedCount: taskIds.length } as any;
        },
        find: (query: unknown) => {
            calls.push({ method: "find", args: [query] });
            return makeQuery(queryResult);
        },
        findOne: (query: unknown) => {
            calls.push({ method: "findOne", args: [query] });
            return makeQuery(queryResult[0]);
        },
        countDocuments: async (query?: unknown) => {
            calls.push({ method: "countDocuments", args: [query] });
            return 7;
        },
        deleteMany: async (query: unknown) => {
            calls.push({ method: "deleteMany", args: [query] });
            return { acknowledged: true, deletedCount: 3 } as any;
        },
        aggregate: async (pipeline: unknown[]) => {
            calls.push({ method: "aggregate", args: [pipeline] });
            return [{ _id: VM_Task_Status.COMPLETED, count: 2 }];
        }
    };

    return {
        calls,
        repository: new VMTaskRepository(taskModel)
    };
}

describe("VMTaskRepository", () => {
    it("creates VM tasks", async () => {
        const { repository, calls } = makeRepository();
        const task = {
            task_id: "task-1",
            user_id: "user-1",
            vm_id: "120",
            status: VM_Task_Status.PENDING,
            steps: [],
            created_at: new Date("2026-05-26T00:00:00.000Z"),
            updated_at: new Date("2026-05-26T00:00:00.000Z")
        } as any;

        await repository.createTask(task);

        expect(calls).toEqual([
            {
                method: "create",
                args: [task]
            }
        ]);
    });

    it("updates tasks by task ID", async () => {
        const { repository, calls } = makeRepository();
        const update = { status: VM_Task_Status.COMPLETED };

        await repository.updateTask("task-1", update);

        expect(calls).toEqual([
            {
                method: "updateByTaskId",
                args: ["task-1", update]
            }
        ]);
    });

    it("lists user task references newest first", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.listUserTaskRefsNewestFirst("user-1")).resolves.toEqual([
            { task_id: "newest" },
            { task_id: "old" }
        ]);

        expect(calls).toEqual([
            {
                method: "findUserTaskRefsNewestFirst",
                args: ["user-1"]
            }
        ]);
    });

    it("deletes tasks by task IDs", async () => {
        const { repository, calls } = makeRepository();

        await repository.deleteTasksByIds(["old", "oldest"]);

        expect(calls).toEqual([
            {
                method: "deleteByTaskIds",
                args: [["old", "oldest"]]
            }
        ]);
    });

    it("lists tasks by IDs for a user", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.listTasksByIdsForUser(["task-1"], "user-1")).resolves.toEqual([{ task_id: "task-1" }]);

        expect(calls).toEqual([
            {
                method: "find",
                args: [{ task_id: { $in: ["task-1"] }, user_id: "user-1" }]
            }
        ]);
    });

    it("finds the latest task for a user", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.findLatestForUser("user-1")).resolves.toEqual({ task_id: "task-1" });

        expect(calls).toEqual([
            { method: "findOne", args: [{ user_id: "user-1" }] },
            { method: "sort", args: [{ created_at: -1 }] }
        ]);
    });

    it("lists paginated user tasks and counts matching documents", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.listForUser({ user_id: "user-1" }, { skip: 20, limit: 10 })).resolves.toEqual([{ task_id: "task-1" }]);
        await expect(repository.count({ user_id: "user-1" })).resolves.toBe(7);

        expect(calls).toEqual([
            { method: "find", args: [{ user_id: "user-1" }] },
            { method: "sort", args: [{ created_at: -1 }] },
            { method: "skip", args: [20] },
            { method: "limit", args: [10] },
            { method: "countDocuments", args: [{ user_id: "user-1" }] }
        ]);
    });

    it("finds a task by task ID/user and supports cleanup stats", async () => {
        const { repository, calls } = makeRepository();
        const cutoff = new Date("2026-04-26T00:00:00.000Z");

        await expect(repository.findByTaskIdForUser("task-1", "user-1")).resolves.toEqual({ task_id: "task-1" });
        await expect(repository.deleteOlderThan(cutoff)).resolves.toMatchObject({ deletedCount: 3 });
        await expect(repository.countByStatus()).resolves.toEqual([{ _id: VM_Task_Status.COMPLETED, count: 2 }]);

        expect(calls).toEqual([
            { method: "findOne", args: [{ task_id: "task-1", user_id: "user-1" }] },
            { method: "deleteMany", args: [{ created_at: { $lt: cutoff } }] },
            { method: "aggregate", args: [[{ $group: { _id: "$status", count: { $sum: 1 } } }]] }
        ]);
    });
});
