export type VMDiskReadinessDecision =
    | { ready: true; state: "ready"; scsi0: string; format: "raw" | "qcow2" | "vmdk" }
    | { ready: false; state: "preparing"; scsi0: string }
    | { ready: false; state: "unclear_format"; scsi0: string }
    | { ready: false; state: "missing_config" };

export function classifyVMDiskReadiness(configData: unknown): VMDiskReadinessDecision {
    const scsi0 = (configData as any)?.scsi0;
    if (typeof scsi0 !== "string" || scsi0.trim() === "") {
        return { ready: false, state: "missing_config" };
    }

    if (scsi0.includes("importing") || scsi0.includes("cloning")) {
        return { ready: false, state: "preparing", scsi0 };
    }

    const diskFormatMatch = scsi0.match(/\.(raw|qcow2|vmdk)(?:[,:\s]|$)/);
    if (!diskFormatMatch) {
        return { ready: false, state: "unclear_format", scsi0 };
    }

    return {
        ready: true,
        state: "ready",
        scsi0,
        format: diskFormatMatch[1] as "raw" | "qcow2" | "vmdk"
    };
}
