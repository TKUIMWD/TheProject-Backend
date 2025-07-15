export interface VM {
    _id?: string;
    pve_vmid: string;
    pve_node: string;
    owner: string;
}

export interface VMConfig {
    cores: number;
    memory: string;
    scsi0?: string;
    vmid?: number;
    name?: string;
    status?: string;
    [key: string]: any;
}