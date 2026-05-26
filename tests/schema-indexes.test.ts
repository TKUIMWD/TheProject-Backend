import { describe, expect, it } from "vitest";
import { UsersSchemas } from "../src/orm/schemas/UserSchemas";
import { VMSchema } from "../src/orm/schemas/VM/VMSchemas";
import { VM_TaskSchemas } from "../src/orm/schemas/VM/VM_TaskSchemas";
import { AIBoxBuildJobSchema } from "../src/orm/schemas/AIBoxBuildJobSchemas";
import { ReviewsSchemas } from "../src/orm/schemas/ReviewsSchemas";
import { ComputeResourcePlanSchemas } from "../src/orm/schemas/ComputeResourcePlanSchemas";

function hasIndex(indexes: ReturnType<typeof UsersSchemas.indexes>, expected: Record<string, 1 | -1>): boolean {
    return indexes.some(([fields]) => JSON.stringify(fields) === JSON.stringify(expected));
}

describe("schema indexes", () => {
    it("defines high-traffic user lookup indexes", () => {
        const indexes = UsersSchemas.indexes();

        expect(hasIndex(indexes, { email: 1 })).toBe(true);
        expect(hasIndex(indexes, { username: 1 })).toBe(true);
        expect(hasIndex(indexes, { role: 1 })).toBe(true);
        expect(hasIndex(indexes, { course_ids: 1 })).toBe(true);
        expect(hasIndex(indexes, { owned_vms: 1 })).toBe(true);
    });

    it("defines VM ownership and PVE lookup indexes", () => {
        const indexes = VMSchema.indexes();

        expect(hasIndex(indexes, { owner: 1 })).toBe(true);
        expect(hasIndex(indexes, { pve_node: 1, pve_vmid: 1 })).toBe(true);
        expect(hasIndex(indexes, { is_box_vm: 1, box_id: 1 })).toBe(true);
        expect(hasIndex(indexes, { fromTemplateId: 1 })).toBe(true);
    });

    it("defines task and AI box build list indexes", () => {
        expect(hasIndex(VM_TaskSchemas.indexes(), { task_id: 1 })).toBe(true);
        expect(hasIndex(VM_TaskSchemas.indexes(), { user_id: 1, created_at: -1 })).toBe(true);
        expect(hasIndex(VM_TaskSchemas.indexes(), { status: 1, updated_at: -1 })).toBe(true);
        expect(hasIndex(AIBoxBuildJobSchema.indexes(), { requester_user_id: 1, updated_at: -1 })).toBe(true);
        expect(hasIndex(AIBoxBuildJobSchema.indexes(), { execution_status: 1, updated_at: 1 })).toBe(true);
        expect(hasIndex(AIBoxBuildJobSchema.indexes(), { status: 1, updated_at: -1 })).toBe(true);
    });

    it("defines review lookup indexes", () => {
        const indexes = ReviewsSchemas.indexes();

        expect(hasIndex(indexes, { reviewer_user_id: 1, submitted_date: -1 })).toBe(true);
        expect(hasIndex(indexes, { rating_score: 1 })).toBe(true);
    });

    it("defines compute resource plan lookup indexes", () => {
        expect(hasIndex(ComputeResourcePlanSchemas.indexes(), { name: 1 })).toBe(true);
    });
});
