import { resp, createResponse } from "../../utils/resp";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";

export type AIBoxRunRequest = {
    template_id: string;
    target: string;
    name: string;
    cpuCores: number;
    memorySize: number;
    diskSize: number;
    ciuser?: string;
    cipassword?: string;
    dry_run?: boolean;
};

export function validateAIBoxRunRequest(
    body: unknown,
    options: { blockedTargetNodes: readonly string[] }
): { value: AIBoxRunRequest } | { error: resp<undefined> } {
    const raw = body && typeof body === "object" && !Array.isArray(body)
        ? body as Record<string, unknown>
        : {};

    const { template_id, target, name, cpuCores, memorySize, diskSize, ciuser, cipassword, dry_run } = raw;
    const isDryRun = dry_run === true;

    if (!isDryRun) {
        const templateIdResult = validateObjectIdInput(template_id, "template_id");
        if (!templateIdResult.valid) {
            return { error: createResponse(400, templateIdResult.message === "template_id is required" ? "template_id is required" : templateIdResult.message) };
        }
    }

    if (!isDryRun && (!target || typeof target !== "string")) {
        return { error: createResponse(400, "target node is required") };
    }

    const normalizedTarget = String(target || "").trim();
    if (!isDryRun && options.blockedTargetNodes.includes(normalizedTarget)) {
        return { error: createResponse(400, `target node ${normalizedTarget} is blocked for AI box builds`) };
    }

    if (!name || typeof name !== "string" || name.trim().length < 3) {
        return { error: createResponse(400, "name must be at least 3 characters") };
    }

    const numericFields: Array<[unknown, string]> = [
        [cpuCores, "cpuCores"],
        [memorySize, "memorySize"],
        [diskSize, "diskSize"]
    ];
    for (const [value, label] of numericFields) {
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
            return { error: createResponse(400, `${label} must be a positive number`) };
        }
    }
    const normalizedCpuCores = cpuCores as number;
    const normalizedMemorySize = memorySize as number;
    const normalizedDiskSize = diskSize as number;

    if (ciuser !== undefined && typeof ciuser !== "string") {
        return { error: createResponse(400, "ciuser must be a string") };
    }
    if (cipassword !== undefined && typeof cipassword !== "string") {
        return { error: createResponse(400, "cipassword must be a string") };
    }
    if (!isDryRun && (!ciuser || !String(ciuser).trim() || !cipassword || !String(cipassword).trim())) {
        return { error: createResponse(400, "ciuser and cipassword are required for SSH setup execution") };
    }

    return {
        value: {
            template_id: String(template_id || "").trim(),
            target: normalizedTarget,
            name: name.trim(),
            cpuCores: normalizedCpuCores,
            memorySize: normalizedMemorySize,
            diskSize: normalizedDiskSize,
            ciuser: ciuser as string | undefined,
            cipassword: cipassword as string | undefined,
            dry_run: isDryRun
        }
    };
}
