import { describe, expect, it } from "vitest";
import { VMCreationSourceRepository } from "../src/modules/vm/VMCreationSourceRepository";

function makeRepository() {
    const calls: Array<{ target: string; method: string; args: unknown[] }> = [];
    const template = {
        _id: "template-1",
        pve_vmid: "9000",
        pve_node: "pve-a"
    };
    const box = {
        _id: "box-1",
        vmtemplate_id: "template-1"
    };

    const templateModel = {
        findOne: (query: unknown) => {
            calls.push({ target: "template", method: "findOne", args: [query] });
            return {
                exec: async () => template
            };
        }
    };

    const boxModel = {
        findById: (id: string) => {
            calls.push({ target: "box", method: "findById", args: [id] });
            return {
                exec: async () => box
            };
        }
    };

    return {
        calls,
        repository: new VMCreationSourceRepository(templateModel as any, boxModel as any)
    };
}

describe("VMCreationSourceRepository", () => {
    it("finds VM templates by ID", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.findTemplateById("template-1")).resolves.toMatchObject({
            _id: "template-1",
            pve_vmid: "9000"
        });

        expect(calls).toEqual([
            {
                target: "template",
                method: "findOne",
                args: [{ _id: "template-1" }]
            }
        ]);
    });

    it("finds VM boxes by ID", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.findBoxById("box-1")).resolves.toMatchObject({
            _id: "box-1",
            vmtemplate_id: "template-1"
        });

        expect(calls).toEqual([
            {
                target: "box",
                method: "findById",
                args: ["box-1"]
            }
        ]);
    });
});
