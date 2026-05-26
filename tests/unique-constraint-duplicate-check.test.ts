import { describe, expect, it } from "vitest";
import {
    formatDuplicateCheckResults,
    hasDuplicateCheckFailures,
    listUniqueConstraintDuplicateCheckSpecs,
    summarizeDuplicateCheckResults
} from "../src/modules/data-hardening/UniqueConstraintDuplicateCheck";

describe("UniqueConstraintDuplicateCheck", () => {
    it("defines duplicate checks for every deferred unique key", () => {
        const specs = listUniqueConstraintDuplicateCheckSpecs();

        expect(specs.map(spec => spec.key)).toEqual([
            "users.email",
            "users.username",
            "compute_resource_plans.name",
            "vms.pve_node_pve_vmid",
            "vm_tasks.task_id"
        ]);
        expect(specs.map(spec => spec.collection)).toEqual([
            "users",
            "users",
            "compute_resource_plans",
            "vms",
            "vm_tasks"
        ]);
    });

    it("normalizes identity checks with case-insensitive grouping where needed", () => {
        const specs = listUniqueConstraintDuplicateCheckSpecs();
        const emailGroup = specs.find(spec => spec.key === "users.email")!.pipeline[1];
        const vmGroup = specs.find(spec => spec.key === "vms.pve_node_pve_vmid")!.pipeline[1];

        expect(emailGroup).toEqual({
            $group: {
                _id: { $toLower: "$email" },
                ids: { $push: "$_id" },
                count: { $sum: 1 }
            }
        });
        expect(vmGroup).toEqual({
            $group: {
                _id: {
                    pve_node: "$pve_node",
                    pve_vmid: { $toString: "$pve_vmid" }
                },
                ids: { $push: "$_id" },
                count: { $sum: 1 }
            }
        });
    });

    it("summarizes and formats duplicate failures", () => {
        const results = [
            {
                key: "users.email" as const,
                collection: "users",
                label: "users.email",
                duplicates: [{ _id: "a@example.test", ids: ["id-1", "id-2"], count: 2 }]
            },
            {
                key: "vm_tasks.task_id" as const,
                collection: "vm_tasks",
                label: "vm_tasks.task_id",
                duplicates: []
            }
        ];

        expect(hasDuplicateCheckFailures(results)).toBe(true);
        expect(summarizeDuplicateCheckResults(results)).toEqual({
            checked: 2,
            failed: 1,
            duplicateGroups: 1
        });
        expect(formatDuplicateCheckResults(results)).toContain("[FAIL] users.email: 1 duplicate group(s)");
        expect(formatDuplicateCheckResults(results)).toContain("[PASS] vm_tasks.task_id");
    });
});
