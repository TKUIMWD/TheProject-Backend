import { Service } from "../abstract/Service";
import { resp } from "../utils/resp";
import { User } from "../interfaces/User";
import { VMOperation } from "../modules/vm/VMOperationPolicy";
import { vmOperationExecutionService } from "../modules/vm/VMOperationExecutionService";

export type VMOperationServiceInput = {
    user: User;
    isSuperAdmin: boolean;
    vmId: unknown;
};

type VMOperationExecutionPort = {
    execute(input: VMOperationServiceInput & { operation: VMOperation }): Promise<resp<any>>;
};

export class VMOperateService extends Service {
    constructor(private readonly operationExecutionService: VMOperationExecutionPort = vmOperationExecutionService) {
        super();
    }

    public async executeVMOperation(input: {
        user: User;
        isSuperAdmin: boolean;
        vmId: unknown;
        operation: VMOperation;
    }): Promise<resp<any>> {
        return this.operationExecutionService.execute(input);
    }

    /**
     * 啟動 VM (boot)
     */
    public async bootVM(input: VMOperationServiceInput): Promise<resp<{ upid?: string; network_identity_warning?: string } | undefined>> {
        return this.executeVMOperation({ ...input, operation: "boot" });
    }

    /**
     * 正常關機 VM (shutdown)
     */
    public async shutdownVM(input: VMOperationServiceInput): Promise<resp<{ upid?: string } | undefined>> {
        return this.executeVMOperation({ ...input, operation: "shutdown" });
    }

    /**
     * 強制停止 VM (poweroff)
     */
    public async poweroffVM(input: VMOperationServiceInput): Promise<resp<{ upid?: string } | undefined>> {
        return this.executeVMOperation({ ...input, operation: "poweroff" });
    }

    /**
     * 重啟 VM (reboot)
     */
    public async rebootVM(input: VMOperationServiceInput): Promise<resp<{ upid?: string } | undefined>> {
        return this.executeVMOperation({ ...input, operation: "reboot" });
    }

    /**
     * 重置 VM (reset) - 硬重置，類似按下電源按鈕
     */
    public async resetVM(input: VMOperationServiceInput): Promise<resp<{ upid?: string } | undefined>> {
        return this.executeVMOperation({ ...input, operation: "reset" });
    }
}
