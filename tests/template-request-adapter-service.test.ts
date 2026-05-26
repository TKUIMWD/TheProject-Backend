import { describe, expect, it } from "vitest";
import { TemplateRequestAdapterService } from "../src/modules/templates/TemplateRequestAdapterService";

const user = { _id: "507f1f77bcf86cd799439011" } as any;

function makeService() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new TemplateRequestAdapterService({
        list: {
            listAllTemplates: async () => {
                calls.push({ method: "listAllTemplates", args: [] });
                return { code: 200, message: "ok", body: [] };
            },
            listAccessibleTemplates: async (inputUser) => {
                calls.push({ method: "listAccessibleTemplates", args: [inputUser] });
                return { code: 200, message: "ok", body: [] };
            },
            listSubmittedTemplates: async () => {
                calls.push({ method: "listSubmittedTemplates", args: [] });
                return { code: 200, message: "ok", body: [] };
            }
        },
        conversion: {
            convertVMToTemplate: async (input) => {
                calls.push({ method: "convertVMToTemplate", args: [input] });
                return { code: 200, message: "ok", body: undefined };
            }
        },
        submissionCreate: {
            submitTemplate: async (input) => {
                calls.push({ method: "submitTemplate", args: [input] });
                return { code: 200, message: "ok", body: undefined };
            }
        },
        audit: {
            auditSubmittedTemplate: async (input) => {
                calls.push({ method: "auditSubmittedTemplate", args: [input] });
                return { code: 200, message: "ok", body: undefined };
            }
        }
    });

    return { calls, service };
}

describe("TemplateRequestAdapterService", () => {
    it("delegates template list requests to list workflows", async () => {
        const { calls, service } = makeService();

        await service.getAllTemplates();
        await service.getAccessibleTemplates({ user });
        await service.getAllSubmittedTemplates();

        expect(calls).toEqual([
            { method: "listAllTemplates", args: [] },
            { method: "listAccessibleTemplates", args: [user] },
            { method: "listSubmittedTemplates", args: [] }
        ]);
    });

    it("maps request bodies to template mutation workflows", async () => {
        const { calls, service } = makeService();
        const body = { template_id: "template-1", status: "approved" };

        await service.convertVMToTemplate({ user, body });
        await service.submitTemplate({ user, body });
        await service.auditSubmittedTemplate({ user, body });

        expect(calls).toEqual([
            { method: "convertVMToTemplate", args: [{ user, body }] },
            { method: "submitTemplate", args: [{ user, body }] },
            { method: "auditSubmittedTemplate", args: [{ user, body }] }
        ]);
    });
});
