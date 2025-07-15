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

export interface VMCreationParams {
    template_id: string;
    name: string;
    target: string;
    cpuCores: number;
    memorySize: number;
    diskSize: number;
    ciuser?: string;
    cipassword?: string;
}

export interface VMBasicConfig {
    vmid: number;
    name: string;
    cores: number;
    memory: string;
    node: string;
    status: string;
    disk_size: number | null;
}

export interface VMDetailedConfig {
    vmid: number;
    name: string;
    cores: number;
    memory: string;
    node: string;
    status: string;
    scsi0?: string;
    net0?: string;
    bootdisk?: string;
    ostype?: string;
    disk_size: number | null;
}

export interface VMDetailWithConfig {
    _id?: string;
    pve_vmid: string;
    pve_node: string;
    owner: string;
    config: VMDetailedConfig | null;
    error: string | null;
}

export interface VMDetailWithBasicConfig {
    _id?: string;
    pve_vmid: string;
    pve_node: string;
    config: VMBasicConfig | null;
    error: string | null;
}