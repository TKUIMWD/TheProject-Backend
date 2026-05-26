import { describe, expect, it } from "vitest";
import { classifyVMDiskReadiness } from "../src/modules/vm/VMDiskReadinessPolicy";

describe("VMDiskReadinessPolicy", () => {
    it("classifies disks with supported file formats as ready", () => {
        expect(classifyVMDiskReadiness({
            scsi0: "NFS:120/vm-120-disk-0.qcow2,size=32G"
        })).toEqual({
            ready: true,
            state: "ready",
            scsi0: "NFS:120/vm-120-disk-0.qcow2,size=32G",
            format: "qcow2"
        });

        expect(classifyVMDiskReadiness({ scsi0: "local:vm-120-disk-0.raw" })).toMatchObject({
            ready: true,
            format: "raw"
        });
        expect(classifyVMDiskReadiness({ scsi0: "local:vm-120-disk-0.vmdk " })).toMatchObject({
            ready: true,
            format: "vmdk"
        });
    });

    it("classifies importing or cloning disks as still preparing", () => {
        expect(classifyVMDiskReadiness({
            scsi0: "NFS:120/vm-120-disk-0.qcow2,importing=1"
        })).toEqual({
            ready: false,
            state: "preparing",
            scsi0: "NFS:120/vm-120-disk-0.qcow2,importing=1"
        });

        expect(classifyVMDiskReadiness({
            scsi0: "NFS:120/vm-120-disk-0.qcow2,cloning=1"
        })).toMatchObject({
            ready: false,
            state: "preparing"
        });
    });

    it("classifies missing or empty scsi0 config", () => {
        expect(classifyVMDiskReadiness({})).toEqual({
            ready: false,
            state: "missing_config"
        });
        expect(classifyVMDiskReadiness({ scsi0: "" })).toEqual({
            ready: false,
            state: "missing_config"
        });
    });

    it("classifies finished-looking disks without known formats as unclear", () => {
        expect(classifyVMDiskReadiness({
            scsi0: "NFS:120/vm-120-disk-0,size=32G"
        })).toEqual({
            ready: false,
            state: "unclear_format",
            scsi0: "NFS:120/vm-120-disk-0,size=32G"
        });
    });
});
