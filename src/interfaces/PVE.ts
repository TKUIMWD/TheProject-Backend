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