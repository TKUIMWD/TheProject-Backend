import { describe, expect, it } from "vitest";
import { buildPVEVMDetailStatus, simplifyPVEVMNetworkInterfaces, validatePVEVMDetailQuery } from "../src/modules/pve/PVEVMDetailPolicy";

describe("PVEVMDetailPolicy", () => {
    it("validates node and VMID query fields", () => {
        expect(validatePVEVMDetailQuery({ node: "gapvea", vmid: "101" })).toEqual({
            valid: true,
            node: "gapvea",
            vmid: "101"
        });
        expect(validatePVEVMDetailQuery({ node: "", vmid: "101" })).toMatchObject({
            valid: false,
            message: "node is required"
        });
        expect(validatePVEVMDetailQuery({ node: "gapvea", vmid: "abc" })).toMatchObject({
            valid: false,
            message: "vmid is invalid"
        });
    });

    it("builds VM detail DTOs from PVE config, status, and network data", () => {
        expect(buildPVEVMDetailStatus({
            node: "gapvea",
            vmid: "101",
            config: {
                name: "lab-vm-a",
                cores: 4,
                memory: 8192,
                scsi0: "local-zfs:vm-101-disk-0,size=40G",
                net0: "virtio=AA:BB:CC",
                ostype: "l26",
                bootdisk: "scsi0"
            },
            status: {
                status: "running",
                uptime: 90,
                cpu: 0.32,
                mem: 2 * 1024 ** 3,
                maxmem: 8 * 1024 ** 3
            },
            networkInterfaces: {
                result: [
                    {
                        name: "eth0",
                        "hardware-address": "aa:bb:cc",
                        "ip-addresses": [
                            { "ip-address": "127.0.0.1", "ip-address-type": "ipv4" },
                            { "ip-address": "10.0.0.5", "ip-address-type": "ipv4" }
                        ]
                    }
                ]
            }
        })).toMatchObject({
            vmid: 101,
            name: "lab-vm-a",
            node: "gapvea",
            status: "running",
            cpu_percent: 32,
            memory_used_gb: 2,
            memory_total_gb: 8,
            memory_percent: 25,
            disk_gb: 40,
            config: {
                cores: 4,
                memory_mb: 8192,
                bootdisk: "scsi0",
                ostype: "l26"
            },
            network: {
                interfaces: [
                    {
                        name: "eth0",
                        macAddress: "aa:bb:cc",
                        ipAddresses: ["10.0.0.5"]
                    }
                ]
            }
        });
    });

    it("simplifies malformed or loopback-only network data to an empty list", () => {
        expect(simplifyPVEVMNetworkInterfaces({ result: [{ name: "lo", "hardware-address": "00:00", "ip-addresses": [] }] })).toEqual([]);
        expect(simplifyPVEVMNetworkInterfaces({ bad: true })).toEqual([]);
    });
});
