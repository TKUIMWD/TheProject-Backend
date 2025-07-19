import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { Request } from "express";
import { validateTokenAndGetUser } from "../utils/auth";
import { VMModel } from "../orm/schemas/VM/VMSchemas";
import { User } from "../interfaces/User";
import { VMUtils } from "../utils/VMUtils";
import { VM } from "../interfaces/VM/VM";
import { logger } from "../middlewares/log";

export class VMOperateService extends Service {

    /**
     * 啟動 VM (boot)
     */
    public async bootVM(Request: Request): Promise<resp<{ upid?: string } | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return createResponse(error.code, error.message);
            }

            const { vm_id } = Request.body;
            if (!vm_id) {
                return createResponse(400, "VM ID is required");
            }

            // 檢查 VM 是否存在且屬於用戶
            const vm = await VMModel.findOne({ _id: vm_id });
            if (!vm) {
                return createResponse(404, "VM not found");
            }

            if (vm.owner !== user._id.toString()) {
                return createResponse(403, "You don't have permission to operate this VM");
            }

            // 獲取VM狀態，確保VM不是已經在運行
            const statusResult = await VMUtils.getVMStatus(vm.pve_node, vm.pve_vmid);
            if (!statusResult) {
                return createResponse(500, "Failed to get VM status");
            }

            if (statusResult.status === 'running') {
                return createResponse(400, "VM is already running");
            }

            // 啟動 VM
            const result = await VMUtils.startVM(vm.pve_node, vm.pve_vmid);
            if (!result.success) {
                logger.error(`Failed to start VM ${vm_id}:`, result.errorMessage);
                return createResponse(500, result.errorMessage || "Failed to start VM");
            }

            logger.info(`VM ${vm_id} started successfully by user ${user.username}, UPID: ${result.upid}`);
            return createResponse(200, "VM started successfully", { upid: result.upid });

        } catch (error) {
            logger.error("Error in bootVM:", error);
            return createResponse(500, "Internal server error");
        }
    }

    /**
     * 正常關機 VM (shutdown)
     */
    public async shutdownVM(Request: Request): Promise<resp<{ upid?: string } | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return createResponse(error.code, error.message);
            }

            const { vm_id } = Request.body;
            if (!vm_id) {
                return createResponse(400, "VM ID is required");
            }

            // 檢查 VM 是否存在且屬於用戶
            const vm = await VMModel.findOne({ _id: vm_id });
            if (!vm) {
                return createResponse(404, "VM not found");
            }

            if (vm.owner !== user._id.toString()) {
                return createResponse(403, "You don't have permission to operate this VM");
            }

            // 獲取VM狀態，確保VM正在運行
            const statusResult = await VMUtils.getVMStatus(vm.pve_node, vm.pve_vmid);
            if (!statusResult) {
                return createResponse(500, "Failed to get VM status");
            }

            if (statusResult.status !== 'running') {
                return createResponse(400, "VM is not running");
            }

            // 正常關機 VM
            const result = await VMUtils.shutdownVM(vm.pve_node, vm.pve_vmid);
            if (!result.success) {
                logger.error(`Failed to shutdown VM ${vm_id}:`, result.errorMessage);
                return createResponse(500, result.errorMessage || "Failed to shutdown VM");
            }

            logger.info(`VM ${vm_id} shutdown successfully by user ${user.username}, UPID: ${result.upid}`);
            return createResponse(200, "VM shutdown initiated successfully", { upid: result.upid });

        } catch (error) {
            logger.error("Error in shutdownVM:", error);
            return createResponse(500, "Internal server error");
        }
    }

    /**
     * 強制停止 VM (poweroff)
     */
    public async poweroffVM(Request: Request): Promise<resp<{ upid?: string } | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return createResponse(error.code, error.message);
            }

            const { vm_id } = Request.body;
            if (!vm_id) {
                return createResponse(400, "VM ID is required");
            }

            // 檢查 VM 是否存在且屬於用戶
            const vm = await VMModel.findOne({ _id: vm_id });
            if (!vm) {
                return createResponse(404, "VM not found");
            }

            if (vm.owner !== user._id.toString()) {
                return createResponse(403, "You don't have permission to operate this VM");
            }

            // 獲取VM狀態，確保VM正在運行
            const statusResult = await VMUtils.getVMStatus(vm.pve_node, vm.pve_vmid);
            if (!statusResult) {
                return createResponse(500, "Failed to get VM status");
            }

            if (statusResult.status !== 'running') {
                return createResponse(400, "VM is not running");
            }

            // 強制停止 VM
            const result = await VMUtils.stopVM(vm.pve_node, vm.pve_vmid);
            if (!result.success) {
                logger.error(`Failed to poweroff VM ${vm_id}:`, result.errorMessage);
                return createResponse(500, result.errorMessage || "Failed to poweroff VM");
            }

            logger.info(`VM ${vm_id} powered off successfully by user ${user.username}, UPID: ${result.upid}`);
            return createResponse(200, "VM powered off successfully", { upid: result.upid });

        } catch (error) {
            logger.error("Error in poweroffVM:", error);
            return createResponse(500, "Internal server error");
        }
    }

    /**
     * 重啟 VM (reboot)
     */
    public async rebootVM(Request: Request): Promise<resp<{ upid?: string } | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return createResponse(error.code, error.message);
            }

            const { vm_id } = Request.body;
            if (!vm_id) {
                return createResponse(400, "VM ID is required");
            }

            // 檢查 VM 是否存在且屬於用戶
            const vm = await VMModel.findOne({ _id: vm_id });
            if (!vm) {
                return createResponse(404, "VM not found");
            }

            if (vm.owner !== user._id.toString()) {
                return createResponse(403, "You don't have permission to operate this VM");
            }

            // 獲取VM狀態，確保VM正在運行
            const statusResult = await VMUtils.getVMStatus(vm.pve_node, vm.pve_vmid);
            if (!statusResult) {
                return createResponse(500, "Failed to get VM status");
            }

            if (statusResult.status !== 'running') {
                return createResponse(400, "VM must be running to reboot");
            }

            // 重啟 VM
            const result = await VMUtils.rebootVM(vm.pve_node, vm.pve_vmid);
            if (!result.success) {
                logger.error(`Failed to reboot VM ${vm_id}:`, result.errorMessage);
                return createResponse(500, result.errorMessage || "Failed to reboot VM");
            }

            logger.info(`VM ${vm_id} rebooted successfully by user ${user.username}, UPID: ${result.upid}`);
            return createResponse(200, "VM rebooted successfully", { upid: result.upid });

        } catch (error) {
            logger.error("Error in rebootVM:", error);
            return createResponse(500, "Internal server error");
        }
    }

    /**
     * 重置 VM (reset) - 硬重置，類似按下電源按鈕
     */
    public async resetVM(Request: Request): Promise<resp<{ upid?: string } | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return createResponse(error.code, error.message);
            }

            const { vm_id } = Request.body;
            if (!vm_id) {
                return createResponse(400, "VM ID is required");
            }

            // 檢查 VM 是否存在且屬於用戶
            const vm = await VMModel.findOne({ _id: vm_id });
            if (!vm) {
                return createResponse(404, "VM not found");
            }

            if (vm.owner !== user._id.toString()) {
                return createResponse(403, "You don't have permission to operate this VM");
            }

            // 獲取VM狀態，確保VM正在運行
            const statusResult = await VMUtils.getVMStatus(vm.pve_node, vm.pve_vmid);
            if (!statusResult) {
                return createResponse(500, "Failed to get VM status");
            }

            if (statusResult.status !== 'running') {
                return createResponse(400, "VM must be running to reset");
            }

            // 重置 VM
            const result = await VMUtils.resetVM(vm.pve_node, vm.pve_vmid);
            if (!result.success) {
                logger.error(`Failed to reset VM ${vm_id}:`, result.errorMessage);
                return createResponse(500, result.errorMessage || "Failed to reset VM");
            }

            logger.info(`VM ${vm_id} reset successfully by user ${user.username}, UPID: ${result.upid}`);
            return createResponse(200, "VM reset successfully", { upid: result.upid });

        } catch (error) {
            logger.error("Error in resetVM:", error);
            return createResponse(500, "Internal server error");
        }
    }
}
