import { describe, expect, it } from "vitest";
import { VMTemplateRepository } from "../src/modules/vm/VMTemplateRepository";

function makeRepository() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const template = {
        _id: "template-1",
        description: "Template",
        pve_node: "pve",
        pve_vmid: 9000
    };

    const model = {
        find: (query: unknown) => {
            calls.push({ method: "find", args: [query] });
            return {
                exec: async () => [template]
            };
        },
        findById: (id: string) => {
            calls.push({ method: "findById", args: [id] });
            return {
                exec: async () => ({ ...template, _id: id })
            };
        }
    };

    return {
        calls,
        repository: new VMTemplateRepository(model as any)
    };
}

describe("VMTemplateRepository", () => {
    it("lists templates by IDs", async () => {
        const { repository, calls } = makeRepository();

        await repository.listByIds(["template-1", "template-2"]);

        expect(calls).toEqual([
            { method: "find", args: [{ _id: { $in: ["template-1", "template-2"] } }] }
        ]);
    });

    it("skips empty template ID lookups", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.listByIds([])).resolves.toEqual([]);

        expect(calls).toEqual([]);
    });

    it("finds templates by ID", async () => {
        const { repository, calls } = makeRepository();

        await repository.findById("template-1");

        expect(calls).toEqual([
            { method: "findById", args: ["template-1"] }
        ]);
    });
});
