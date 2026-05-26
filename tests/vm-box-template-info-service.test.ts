import { describe, expect, it } from "vitest";
import { VMBoxTemplateInfoService } from "../src/modules/vm-box/VMBoxTemplateInfoService";

function makeService(getTemplateInfo: any) {
    return new VMBoxTemplateInfoService({
        vmUtils: { getTemplateInfo }
    });
}

describe("VMBoxTemplateInfoService", () => {
    it("returns default template info when template is missing", async () => {
        const service = makeService(async () => {
            throw new Error("should not fetch config");
        });

        await expect(service.buildTemplateInfo(undefined, "Fallback setup")).resolves.toEqual({
            name: "Unknown Template",
            description: "Fallback setup",
            default_cpu_cores: 2,
            default_memory_size: 2048,
            default_disk_size: 20,
            owner: "Unknown"
        });
    });

    it("builds template info from PVE QEMU config", async () => {
        const service = makeService(async (node: string, vmid: string) => ({
            code: 200,
            message: "ok",
            body: {
                name: `${node}-${vmid}-lab`,
                cores: 4,
                memory: "8192",
                scsi0: "local-lvm:vm-101-disk-0,size=64G"
            }
        }));

        await expect(service.buildTemplateInfo({
            _id: "template-1",
            pve_node: "pve-a",
            pve_vmid: "101",
            description: "Template description",
            owner: "owner@example.test"
        }, "Fallback setup")).resolves.toEqual({
            name: "pve-a-101-lab",
            description: "Template description",
            default_cpu_cores: 4,
            default_memory_size: 8192,
            default_disk_size: 64,
            owner: "owner@example.test"
        });
    });

    it("falls back to defaults when PVE config lookup is unsuccessful", async () => {
        const service = makeService(async () => ({
            code: 404,
            message: "not found"
        }));

        await expect(service.buildTemplateInfo({
            _id: "template-1",
            pve_node: "pve-a",
            pve_vmid: "101",
            description: "Template description",
            owner: "owner@example.test"
        }, "Fallback setup", {
            useTemplateOwnerOnError: true
        })).resolves.toEqual({
            name: "Unknown Template",
            description: "Fallback setup",
            default_cpu_cores: 2,
            default_memory_size: 2048,
            default_disk_size: 20,
            owner: "Unknown"
        });
    });

    it("can preserve template owner when config lookup throws and owner fallback is enabled", async () => {
        const service = makeService(async () => {
            throw new Error("pve unavailable");
        });

        await expect(service.buildTemplateInfo({
            _id: "template-1",
            pve_node: "pve-a",
            pve_vmid: "101",
            owner: "owner@example.test"
        }, "Fallback setup", {
            useTemplateOwnerOnError: true
        })).resolves.toEqual({
            name: "Unknown Template",
            description: "Fallback setup",
            default_cpu_cores: 2,
            default_memory_size: 2048,
            default_disk_size: 20,
            owner: "owner@example.test"
        });
    });
});
