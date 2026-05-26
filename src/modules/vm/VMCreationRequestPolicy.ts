import { PVEUtils } from "../../utils/PVEUtils";
import { INVALID_VM_NAME_MESSAGE } from "./VMCreationResponsePolicy";

export type VMCreationIdentityPolicy =
    | { valid: true; nextId: string; sanitizedName: string }
    | { valid: false; message: string };

export function buildVMCreationValidationParams(input: {
    templateId: string;
    name: unknown;
    target: unknown;
    cpuCores: unknown;
    memorySize: unknown;
    diskSize: unknown;
    ciuser?: unknown;
    cipassword?: unknown;
}): {
    template_id: string;
    name: string;
    target: string;
    cpuCores: number;
    memorySize: number;
    diskSize: number;
    ciuser?: string;
    cipassword?: string;
} {
    return {
        template_id: input.templateId,
        name: input.name as string,
        target: input.target as string,
        cpuCores: input.cpuCores as number,
        memorySize: input.memorySize as number,
        diskSize: input.diskSize as number,
        ciuser: input.ciuser as string | undefined,
        cipassword: input.cipassword as string | undefined
    };
}

export function buildVMCreationIdentityPolicy(input: {
    nextId: unknown;
    name: unknown;
}): VMCreationIdentityPolicy {
    const sanitizedName = PVEUtils.sanitizeVMName(String(input.name ?? ""));
    if (!sanitizedName) {
        return { valid: false, message: INVALID_VM_NAME_MESSAGE };
    }

    return {
        valid: true,
        nextId: String(input.nextId),
        sanitizedName
    };
}
