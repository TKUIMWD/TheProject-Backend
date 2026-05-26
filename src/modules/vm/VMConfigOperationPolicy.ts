export type VMConfigOperationName = "name" | "cpu" | "memory" | "disk" | "cloudInit";

export type VMConfigOperationMetadata = {
    waitLabel: string;
    completedMessage: string;
};

const VM_CONFIG_OPERATION_METADATA: Record<VMConfigOperationName, VMConfigOperationMetadata> = {
    name: {
        waitLabel: "VM name update",
        completedMessage: "VM name update completed"
    },
    cpu: {
        waitLabel: "CPU configuration",
        completedMessage: "CPU configuration completed"
    },
    memory: {
        waitLabel: "Memory configuration",
        completedMessage: "Memory configuration completed"
    },
    disk: {
        waitLabel: "Disk resize",
        completedMessage: "Disk resize completed"
    },
    cloudInit: {
        waitLabel: "Cloud-Init configuration",
        completedMessage: "Cloud-Init configuration completed"
    }
};

export function getVMConfigOperationMetadata(operation: VMConfigOperationName): VMConfigOperationMetadata {
    return VM_CONFIG_OPERATION_METADATA[operation];
}

export function normalizeVMConfigOperationError(error: unknown): string {
    return error instanceof Error ? error.message : "Unknown error";
}
