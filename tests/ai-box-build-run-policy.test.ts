import { describe, expect, it } from "vitest";
import { validateAIBoxRunRequest } from "../src/modules/ai-box-build/AIBoxBuildRunPolicy";

const validRun = {
    template_id: "507f1f77bcf86cd799439011",
    target: "gapvea",
    name: "training-vm",
    cpuCores: 2,
    memorySize: 4096,
    diskSize: 40,
    ciuser: "student",
    cipassword: "strong-password"
};

describe("validateAIBoxRunRequest", () => {
    it("accepts a valid non-dry-run request", () => {
        expect(validateAIBoxRunRequest(validRun, { blockedTargetNodes: ["gapvec"] })).toEqual({
            value: {
                ...validRun,
                dry_run: false
            }
        });
    });

    it("rejects invalid template IDs for non-dry-run requests", () => {
        const result = validateAIBoxRunRequest({ ...validRun, template_id: "bad-id" }, { blockedTargetNodes: [] });

        expect(result).toEqual({
            error: expect.objectContaining({
                code: 400,
                message: "Invalid template_id format"
            })
        });
    });

    it("rejects blocked target nodes", () => {
        const result = validateAIBoxRunRequest({ ...validRun, target: "gapvec" }, { blockedTargetNodes: ["gapvec"] });

        expect(result).toEqual({
            error: expect.objectContaining({
                code: 400,
                message: "target node gapvec is blocked for AI box builds"
            })
        });
    });

    it("rejects invalid VM resource values", () => {
        const result = validateAIBoxRunRequest({ ...validRun, cpuCores: 0 }, { blockedTargetNodes: [] });

        expect(result).toEqual({
            error: expect.objectContaining({
                code: 400,
                message: "cpuCores must be a positive number"
            })
        });
    });

    it("allows dry runs without template credentials", () => {
        const result = validateAIBoxRunRequest({
            dry_run: true,
            name: "dry-run",
            cpuCores: 1,
            memorySize: 1024,
            diskSize: 10
        }, { blockedTargetNodes: ["gapvec"] });

        expect(result).toEqual({
            value: {
                template_id: "",
                target: "",
                name: "dry-run",
                cpuCores: 1,
                memorySize: 1024,
                diskSize: 10,
                dry_run: true
            }
        });
    });
});
