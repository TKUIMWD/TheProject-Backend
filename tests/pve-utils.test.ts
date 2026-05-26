import { describe, expect, it } from "vitest";
import { PVEUtils } from "../src/utils/PVEUtils";

describe("PVEUtils", () => {
    it("sanitizes VM names into DNS-compatible names", () => {
        expect(PVEUtils.sanitizeVMName("My Box_01!!")).toBe("my-box-01");
        expect(PVEUtils.sanitizeVMName("...")).toBeNull();
        expect(PVEUtils.sanitizeVMName("-valid-name-")).toBe("valid-name");
    });

    it("extracts disk size from qemu scsi config", () => {
        expect(PVEUtils.extractDiskSizeFromConfig("NFS:101/vm-101-disk-0.qcow2,size=32G")).toBe(32);
        expect(PVEUtils.extractDiskSizeFromConfig("NFS:101/vm-101-disk-0.qcow2")).toBeNull();
        expect(PVEUtils.extractDiskSizeFromConfig(undefined)).toBeNull();
    });
});
