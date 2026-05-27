import { describe, expect, it } from "vitest";
import { PVEVMDetailService } from "../src/modules/pve/PVEVMDetailService";

function makeService(options: {
    config?: any;
    status?: any;
    network?: any;
    networkError?: Error;
    requestError?: Error;
} = {}) {
    const calls: Array<{ method: string; url: string; options?: unknown }> = [];
    const service = new PVEVMDetailService({
        pve: {
            request: async (method, url, _body, requestOptions) => {
                calls.push({ method, url, options: requestOptions });
                if (options.requestError) throw options.requestError;
                if (url.includes("/config")) {
                    return {
                        data: options.config ?? {
                            name: "lab-vm-a",
                            cores: 2,
                            memory: 4096,
                            scsi0: "local-zfs:vm-101-disk-0,size=32G"
                        }
                    } as any;
                }
                if (url.includes("/status/current")) {
                    return {
                        data: options.status ?? {
                            status: "running",
                            uptime: 60,
                            cpu: 0.12,
                            mem: 1024 ** 3,
                            maxmem: 4 * 1024 ** 3
                        }
                    } as any;
                }
                if (url.includes("/agent/network-get-interfaces")) {
                    if (options.networkError) throw options.networkError;
                    return {
                        data: options.network ?? {
                            result: [
                                {
                                    name: "eth0",
                                    "hardware-address": "aa:bb:cc",
                                    "ip-addresses": [{ "ip-address": "10.0.0.5", "ip-address-type": "ipv4" }]
                                }
                            ]
                        }
                    } as any;
                }
                return { data: {} } as any;
            }
        }
    });

    return { calls, service };
}

describe("PVEVMDetailService", () => {
    it("returns VM detail with network interfaces for running VMs", async () => {
        const { service, calls } = makeService();

        await expect(service.getVMDetail({ node: "gapvea", vmid: "101" })).resolves.toMatchObject({
            code: 200,
            message: "PVE VM detail fetched successfully",
            body: {
                vmid: 101,
                name: "lab-vm-a",
                node: "gapvea",
                status: "running",
                network: {
                    interfaces: [
                        {
                            name: "eth0",
                            ipAddresses: ["10.0.0.5"]
                        }
                    ]
                }
            }
        });

        expect(calls.map((call) => call.url)).toEqual([
            expect.stringContaining("/nodes/gapvea/qemu/101/config"),
            expect.stringContaining("/nodes/gapvea/qemu/101/status/current"),
            expect.stringContaining("/nodes/gapvea/qemu/101/agent/network-get-interfaces")
        ]);
    });

    it("returns a network fallback for stopped VMs", async () => {
        const { service, calls } = makeService({ status: { status: "stopped" } });

        await expect(service.getVMDetail({ node: "gapvea", vmid: "101" })).resolves.toMatchObject({
            code: 200,
            body: {
                status: "stopped",
                network: {
                    interfaces: [],
                    error: "VM is not running"
                }
            }
        });

        expect(calls.some((call) => call.url.includes("/agent/network-get-interfaces"))).toBe(false);
    });

    it("keeps VM detail available when guest network lookup fails", async () => {
        const { service } = makeService({ networkError: new Error("guest agent unavailable") });

        await expect(service.getVMDetail({ node: "gapvea", vmid: "101" })).resolves.toMatchObject({
            code: 200,
            body: {
                network: {
                    interfaces: [],
                    error: "Network information unavailable"
                }
            }
        });
    });

    it("validates query input before calling PVE", async () => {
        const { service, calls } = makeService();

        await expect(service.getVMDetail({ node: "gapvea", vmid: "abc" })).resolves.toEqual({
            code: 400,
            message: "vmid is invalid",
            body: undefined
        });
        expect(calls).toEqual([]);
    });
});
