import { describe, expect, it } from "vitest";
import { TemplateManageRequestAdapterService } from "../src/modules/templates/TemplateManageRequestAdapterService";

const user = {
    _id: { toString: () => "user-1" },
    username: "alice",
    role: "user"
} as any;

function makeService() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new TemplateManageRequestAdapterService({
        configUpdate: {
            updateTemplateConfig: async (input) => {
                calls.push({ method: "updateTemplateConfig", args: [input] });
                return { code: 200, message: "updated", body: "template-1" };
            }
        },
        deletion: {
            deleteTemplate: async (input) => {
                calls.push({ method: "deleteTemplate", args: [input] });
                return { code: 200, message: "deleted", body: String(input.templateId) };
            }
        },
        clone: {
            cloneTemplate: async (input) => {
                calls.push({ method: "cloneTemplate", args: [input] });
                return {
                    code: 200,
                    message: "cloned",
                    body: {
                        template_id: "template-2",
                        task_id: "task-1"
                    }
                };
            }
        }
    });

    return { calls, service };
}

describe("TemplateManageRequestAdapterService", () => {
    it("forwards template config update body to the config update service", async () => {
        const { service, calls } = makeService();
        const body = { template_id: "template-1", description: "Updated" };

        await expect(service.updateTemplateConfig({ user, body })).resolves.toMatchObject({
            code: 200,
            message: "updated"
        });

        expect(calls).toEqual([
            {
                method: "updateTemplateConfig",
                args: [{ user, body }]
            }
        ]);
    });

    it("maps delete body template_id to the deletion service", async () => {
        const { service, calls } = makeService();

        await expect(service.deleteTemplate({
            user,
            body: { template_id: "template-1" }
        })).resolves.toMatchObject({
            code: 200,
            body: "template-1"
        });

        expect(calls).toEqual([
            {
                method: "deleteTemplate",
                args: [{
                    user,
                    templateId: "template-1"
                }]
            }
        ]);
    });

    it("forwards clone body to the template clone service", async () => {
        const { service, calls } = makeService();
        const body = { template_id: "template-1", new_template_name: "Copy", description: "copy" };

        await expect(service.cloneTemplate({ user, body })).resolves.toMatchObject({
            code: 200,
            body: {
                template_id: "template-2",
                task_id: "task-1"
            }
        });

        expect(calls).toEqual([
            {
                method: "cloneTemplate",
                args: [{ user, body }]
            }
        ]);
    });
});
