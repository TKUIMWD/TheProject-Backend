import { resp } from "../../utils/resp";
import { User } from "../User";

// VM 刪除響應接口
export interface VMDeletionResponse {
    vm_id: string;
    pve_vmid: string;
    pve_node: string;
    task_id?: string;
    message: string;
}

// VM 刪除用戶驗證接口
export interface VMDeletionUserValidation {
    user: User | null;
    error?: resp<any>;
}

export interface CloneTemplateResponse {
    template_id: string;
    task_id: string;
}