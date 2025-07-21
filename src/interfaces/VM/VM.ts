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
    status?: {
        current_status: string;
        uptime?: number;
    } | null;
    network?: {
        ip_addresses: string[];
        interfaces?: any[];
    } | null;
    error: string | null;
}

export interface VMDetailWithBasicConfig {
    _id?: string;
    pve_vmid: string;
    pve_node: string;
    owner?: string;
    config?: VMBasicConfig | null;
    status?: {
        current_status: string;
        uptime?: number;
    } | null;
    error: string | null;
}

// 網路介面類型定義
export interface NetworkIPAddress {
    'ip-address': string;
    'ip-address-type': 'ipv4' | 'ipv6';
    prefix: number;
}

export interface NetworkStatistics {
    'rx-bytes'?: number;
    'tx-bytes'?: number;
    'rx-packets'?: number;
    'tx-packets'?: number;
    'rx-errors'?: number;
    'tx-errors'?: number;
    'rx-dropped'?: number;
    'tx-dropped'?: number;
}

export interface NetworkInterface {
    name: string;
    'hardware-address': string;
    'ip-addresses'?: NetworkIPAddress[];
    statistics?: NetworkStatistics;
}

export interface NetworkInterfacesResponse {
    result: NetworkInterface[];
}

export interface SimplifiedNetworkInterface {
    name: string;
    macAddress: string;
    ipAddresses: string[];
}