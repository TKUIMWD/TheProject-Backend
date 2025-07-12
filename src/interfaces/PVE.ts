export interface PVE_node {
    id: string;
    node: string;
    level: string
    status: string;
    type: string;
    ssl_fingerprint: string;
}

export interface PVE_vm {
    mem:number;
    cpu:number
    maxmem:number;
    name:string;
    diskread:number;
    vmid:number;
    status:string;
    cpus:number;
    diskwrite:number;
    netin:number;
    maxdisk:number;
    disk:number;
    netout:number;
    uptime:number;
}

export interface PVE_template_info {
    vmid: number;
    name: string;
    node: string;
}