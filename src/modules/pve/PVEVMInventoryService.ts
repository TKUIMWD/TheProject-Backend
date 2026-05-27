import { pve_api } from "../../enum/PVE_API";
import { PVE_VMInventoryResource } from "../../interfaces/ApiEndPoints";
import { PVEResp } from "../../interfaces/Response/PVEResp";
import { logger } from "../../middlewares/log";
import { createResponse, resp } from "../../utils/resp";
import { PVEClient, pveClient } from "./PVEClient";
import { buildPVEVMInventoryStatus, finiteNumber, toPercent } from "./PVEVMInventoryPolicy";

type PVEVMInventoryServiceDeps = {
    pve?: Pick<PVEClient, "request">;
};

type VMInventoryAggregate = {
    cpu: number;
    maxCpu: number;
    mem: number;
    maxMem: number;
    disk: number;
    maxDisk: number;
};

export class PVEVMInventoryService {
    private readonly pve: Pick<PVEClient, "request">;

    constructor(deps: PVEVMInventoryServiceDeps = {}) {
        this.pve = deps.pve ?? pveClient;
    }

    public async getVMInventory(): Promise<resp<any>> {
        try {
            const vmResp: PVEResp = await this.pve.request("GET", pve_api.cluster_resources_vms);
            if (!vmResp || !Array.isArray(vmResp.data)) {
                return createResponse(404, "VM inventory not found");
            }

            const resources = vmResp.data as PVE_VMInventoryResource[];
            const vms = resources.map(buildPVEVMInventoryStatus)
                .sort((a, b) => a.node.localeCompare(b.node) || a.vmid - b.vmid);
            const aggregate = this.aggregate(resources);

            return createResponse(200, "VM inventory fetched successfully", {
                overview: {
                    total_vms: vms.length,
                    running_vms: vms.filter(vm => vm.status === "running").length,
                    stopped_vms: vms.filter(vm => vm.status === "stopped").length,
                    paused_vms: vms.filter(vm => vm.status === "paused").length,
                    templates: vms.filter(vm => vm.template).length,
                    qemu_vms: vms.filter(vm => vm.type === "qemu").length,
                    lxc_containers: vms.filter(vm => vm.type === "lxc").length
                },
                resources: {
                    cpu_percent: aggregate.maxCpu > 0 ? Math.round((aggregate.cpu / aggregate.maxCpu) * 100) : 0,
                    cpu_total: aggregate.maxCpu,
                    memory_used_gb: +(aggregate.mem / 1024 / 1024 / 1024).toFixed(2),
                    memory_total_gb: +(aggregate.maxMem / 1024 / 1024 / 1024).toFixed(2),
                    memory_percent: toPercent(aggregate.mem, aggregate.maxMem),
                    disk_used_gb: +(aggregate.disk / 1024 / 1024 / 1024).toFixed(2),
                    disk_total_gb: +(aggregate.maxDisk / 1024 / 1024 / 1024).toFixed(2),
                    disk_percent: toPercent(aggregate.disk, aggregate.maxDisk)
                },
                vms,
                fetched_at: new Date().toISOString(),
                source: "cluster/resources?type=vm"
            });
        } catch (error) {
            logger.error("Error in PVEVMInventoryService.getVMInventory:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    private aggregate(resources: PVE_VMInventoryResource[]): VMInventoryAggregate {
        return resources.reduce<VMInventoryAggregate>((total, vm) => {
            const maxCpu = finiteNumber(vm.maxcpu);
            total.cpu += finiteNumber(vm.cpu) * maxCpu;
            total.maxCpu += maxCpu;
            total.mem += finiteNumber(vm.mem);
            total.maxMem += finiteNumber(vm.maxmem);
            total.disk += finiteNumber(vm.disk);
            total.maxDisk += finiteNumber(vm.maxdisk);
            return total;
        }, {
            cpu: 0,
            maxCpu: 0,
            mem: 0,
            maxMem: 0,
            disk: 0,
            maxDisk: 0
        });
    }
}

export const pveVMInventoryService = new PVEVMInventoryService();
