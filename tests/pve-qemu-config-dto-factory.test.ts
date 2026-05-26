import { describe, expect, it } from "vitest";
import {
    buildBasicQemuConfigDTO,
    buildDetailedQemuConfigDTO
} from "../src/modules/pve/PVEQemuConfigDTOFactory";

const qemuConfig = {
    vmid: 101,
    name: "web-lab",
    cores: 4,
    memory: "4096",
    status: "",
    scsi0: "NFS:101/vm-101-disk-0.qcow2,size=32G",
    net0: "virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0",
    bootdisk: "scsi0",
    ostype: "l26"
};

describe("PVEQemuConfigDTOFactory", () => {
    it("builds user-safe basic QEMU config DTOs", () => {
        expect(buildBasicQemuConfigDTO("pve-a", qemuConfig)).toEqual({
            vmid: 101,
            name: "web-lab",
            cores: 4,
            memory: "4096",
            node: "pve-a",
            status: "stopped",
            disk_size: 32
        });
    });

    it("builds detailed QEMU config DTOs for admin views", () => {
        expect(buildDetailedQemuConfigDTO("pve-a", {
            ...qemuConfig,
            status: "running"
        })).toEqual({
            vmid: 101,
            name: "web-lab",
            cores: 4,
            memory: "4096",
            node: "pve-a",
            status: "running",
            scsi0: "NFS:101/vm-101-disk-0.qcow2,size=32G",
            net0: "virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0",
            bootdisk: "scsi0",
            ostype: "l26",
            disk_size: 32
        });
    });
});
