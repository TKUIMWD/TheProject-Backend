// Guacamole 連線接口定義
export interface GuacamoleConnectionRequest {
    vm_id: string;
    protocol: 'ssh' | 'rdp' | 'vnc';
    username?: string;
    password?: string;
    port?: number;
    ip_address?: string; // 前端可以指定要連接的 IP 地址
}

export interface GuacamoleConnection {
    connection_id: string;
    vm_id: string;
    protocol: string;
    status: 'active' | 'inactive';
    created_at: Date;
    expires_at: Date;
    guacamole_connection_id?: string;
    target_ip?: string;
    available_ips?: string[];
    direct_url?: string; // Guacamole 直接連線 URL
}

export interface GuacamoleAuthToken {
    token: string;
    dataSource?: string;
    username?: string;
}

export interface GuacamoleDisconnectRequest {
    connection_id: string;
    guacamole_connection_id?: string; // Guacamole 內部的連線 ID
}

export interface GuacamoleDisconnectResponse {
    message: string;
}
