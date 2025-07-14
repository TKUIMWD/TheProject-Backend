export interface PVE_node {
    id: string;
    node: string;
    level: string
    status: string;
    type: string;
    ssl_fingerprint: string;
}

export interface PVE_qemu_config {
    vmid: number;
    name: string;
    node: string;
    cores: number;
    memory: string;
    sockets: number;
    numa: number;
    cpu: string;
    ostype: string;
    agent: string;
    boot: string;
    digest: string;
    meta: string;
    vmgenid: string;
    scsihw: string;
    net0: string;
    net1: string;
    net2: string;
    scsi0: string;
    ide2: string;
    smbios1: string;
}

export type PVE_Task_Status = 'running' | 'stopped';

export type PVE_Task_ExitStatus = 'OK' | null | string;

export const PVE_TASK_STATUS = {
    RUNNING: 'running' as const,
    STOPPED: 'stopped' as const
} as const;

export const PVE_TASK_EXIT_STATUS = {
    OK: 'OK' as const
} as const;

// PVE 任務狀態接口
export interface PVE_Task_Status_Response {
    upid: string;
    node: string;
    status: PVE_Task_Status;
    type: string;
    user: string;
    starttime: number;
    endtime?: number;
    exitstatus?: PVE_Task_ExitStatus;
    progress?: number;
    error?: string;
}