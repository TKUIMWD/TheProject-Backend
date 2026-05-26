import { describe, expect, it } from "vitest";
import {
    buildVMConfigUpdateExecutionPlan,
    buildVMConfigUpdateSuccessBody,
    calculateVMConfigUpdateResources,
    validateVMConfigUpdateRequest
} from "../src/modules/vm/VMConfigUpdatePolicy";

describe("VMConfigUpdatePolicy", () => {
    it("rejects update requests without any configuration fields", () => {
        expect(validateVMConfigUpdateRequest({})).toEqual({
            valid: false,
            message: "At least one configuration parameter must be provided (cpuCores, memorySize, diskSize, vmName, or cloud-init settings)"
        });
    });

    it("validates and sanitizes VM names", () => {
        expect(validateVMConfigUpdateRequest({ vmName: "My Box_01!!" })).toEqual({
            valid: true,
            sanitizedVMName: "my-box-01"
        });
        expect(validateVMConfigUpdateRequest({ vmName: 123 })).toEqual({
            valid: false,
            message: "vmName must be a string"
        });
        expect(validateVMConfigUpdateRequest({ vmName: "..." })).toEqual({
            valid: false,
            message: "Invalid VM name: name contains invalid characters or is too long"
        });
    });

    it("reuses Cloud-Init update pair validation", () => {
        expect(validateVMConfigUpdateRequest({ requestCiuser: "student" })).toEqual({
            valid: false,
            message: "Both ciuser and cipassword must be provided and non-empty"
        });
        expect(validateVMConfigUpdateRequest({ requestCiuser: "student", requestCipassword: "secret" })).toEqual({
            valid: true
        });
    });

    it("calculates current, new, and delta resources", () => {
        expect(calculateVMConfigUpdateResources(
            { cores: 2, memory: "2048", scsi0: "NFS:101/vm-101-disk-0.qcow2,size=32G" },
            { cpuCores: 4, memorySize: 4096, diskSize: 40 }
        )).toEqual({
            currentCpuCores: 2,
            currentMemorySize: 2048,
            currentDiskSize: 32,
            newCpuCores: 4,
            newMemorySize: 4096,
            newDiskSize: 40,
            cpuDelta: 2,
            memoryDelta: 2048,
            diskDelta: 8
        });
    });

    it("falls back to current resources when request values are absent or zero", () => {
        expect(calculateVMConfigUpdateResources(
            { cores: 2, memory: "2048", scsi0: "NFS:101/vm-101-disk-0.qcow2,size=32G" },
            { cpuCores: 0, memorySize: undefined, diskSize: 0 }
        )).toMatchObject({
            newCpuCores: 2,
            newMemorySize: 2048,
            newDiskSize: 32,
            cpuDelta: 0,
            memoryDelta: 0,
            diskDelta: 0
        });
    });

    it("plans only changed VM configuration operations", () => {
        expect(buildVMConfigUpdateExecutionPlan({
            currentCpuCores: 2,
            currentMemorySize: 2048,
            currentDiskSize: 32,
            newCpuCores: 4,
            newMemorySize: 2048,
            newDiskSize: 40,
            vmName: "box-a",
            ciuser: "student",
            cipassword: "secret"
        })).toEqual({
            updateName: true,
            updateCpu: true,
            updateMemory: false,
            resizeDisk: true,
            updateCloudInit: true,
            diskReductionError: undefined
        });
    });

    it("flags unsupported disk size reductions in the execution plan", () => {
        expect(buildVMConfigUpdateExecutionPlan({
            currentCpuCores: 2,
            currentMemorySize: 2048,
            currentDiskSize: 40,
            newCpuCores: 2,
            newMemorySize: 2048,
            newDiskSize: 32
        })).toEqual({
            updateName: false,
            updateCpu: false,
            updateMemory: false,
            resizeDisk: false,
            updateCloudInit: false,
            diskReductionError: "Disk size reduction is not supported"
        });
    });

    it("builds VM config update success bodies", () => {
        expect(buildVMConfigUpdateSuccessBody({
            taskId: "task-1",
            vmId: "507f1f77bcf86cd799439011",
            pveVmid: "120",
            cpuCores: 4,
            memorySize: 4096,
            diskSize: 40
        })).toEqual({
            task_id: "task-1",
            vm_id: "507f1f77bcf86cd799439011",
            pve_vmid: "120",
            updated_config: {
                cpu_cores: 4,
                memory_size: 4096,
                disk_size: 40
            }
        });
    });

    it("includes the VM name in update success bodies only when one was changed", () => {
        expect(buildVMConfigUpdateSuccessBody({
            taskId: "task-1",
            vmId: "507f1f77bcf86cd799439011",
            pveVmid: "120",
            cpuCores: 4,
            memorySize: 4096,
            diskSize: 40,
            vmName: "web-lab"
        }).updated_config).toEqual({
            cpu_cores: 4,
            memory_size: 4096,
            disk_size: 40,
            vm_name: "web-lab"
        });
    });
});
