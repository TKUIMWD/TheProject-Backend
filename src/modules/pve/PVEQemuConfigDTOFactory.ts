import { VMBasicConfig, VMDetailedConfig } from "../../interfaces/VM/VM";
import { PVEUtils } from "../../utils/PVEUtils";

export function buildBasicQemuConfigDTO(node: string, qemuConfig: any): VMBasicConfig {
    return {
        vmid: qemuConfig.vmid,
        name: qemuConfig.name,
        cores: qemuConfig.cores,
        memory: qemuConfig.memory,
        node,
        status: qemuConfig.status || "stopped",
        disk_size: PVEUtils.extractDiskSize(qemuConfig)
    };
}

export function buildDetailedQemuConfigDTO(node: string, qemuConfig: any): VMDetailedConfig {
    return {
        vmid: qemuConfig.vmid,
        name: qemuConfig.name,
        cores: qemuConfig.cores,
        memory: qemuConfig.memory,
        node,
        status: qemuConfig.status || "stopped",
        scsi0: qemuConfig.scsi0,
        net0: qemuConfig.net0,
        bootdisk: qemuConfig.bootdisk,
        ostype: qemuConfig.ostype,
        disk_size: PVEUtils.extractDiskSize(qemuConfig)
    };
}
