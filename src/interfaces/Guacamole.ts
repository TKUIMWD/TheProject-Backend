// Guacamole 連線接口定義
export interface GuacamoleConnectionRequest {
    vm_id: string;
    protocol: 'ssh' | 'rdp' | 'vnc';
    username?: string;
    password?: string;
    port?: number;
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
}

export interface GuacamoleAuthToken {
    token: string;
}

export interface GuacamoleDisconnectRequest {
    connection_id: string;
}

export interface GuacamoleDisconnectResponse {
    message: string;
}
