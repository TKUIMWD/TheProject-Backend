type GuacamoleConnectionConfig = {
    name: string;
    protocol: "ssh" | "rdp" | "vnc";
    parameters: Record<string, string>;
    attributes: Record<string, string>;
};

export function normalizeTerminalFontSize(value: unknown): number {
    const fontSize = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(fontSize)) return 14;
    return Math.min(24, Math.max(10, Math.round(fontSize)));
}

export function buildSSHConnectionProfile(input: {
    vmName: string;
    email: string;
    hostname: string;
    port?: number;
    username?: string;
    password?: string;
    fontSize: number;
    nowMs: number;
}): { name: string; config: GuacamoleConnectionConfig } {
    const port = input.port || 22;
    const username = input.username || "root";
    const fontSize = normalizeTerminalFontSize(input.fontSize);
    const name = `SSH-${input.vmName}-${username}-${fontSize}pt-${input.nowMs}-${input.email}`;

    return {
        name,
        config: {
            name,
            protocol: "ssh",
            parameters: {
                hostname: input.hostname,
                port: port.toString(),
                username,
                password: input.password || "",
                "font-size": String(fontSize),
                "disable-copy": "false",
                "disable-paste": "false"
            },
            attributes: {
                "max-connections": "5",
                "max-connections-per-user": "2"
            }
        }
    };
}

export function buildRDPConnectionProfile(input: {
    vmName: string;
    email: string;
    hostname: string;
    port?: number;
    username: string;
    password: string;
}): { name: string; config: GuacamoleConnectionConfig } {
    const port = input.port || 3389;
    const name = `RDP-${input.vmName}-${input.email}`;

    return {
        name,
        config: {
            name,
            protocol: "rdp",
            parameters: {
                hostname: input.hostname,
                port: port.toString(),
                username: input.username,
                password: input.password,
                "ignore-cert": "true",
                security: "any",
                "disable-copy": "false",
                "disable-paste": "false",
                "normalize-clipboard": "preserve"
            },
            attributes: {}
        }
    };
}

export function buildVNCConnectionProfile(input: {
    vmName: string;
    email: string;
    hostname: string;
    port?: number;
    password?: string;
}): { name: string; config: GuacamoleConnectionConfig } {
    const port = input.port || 5900;
    const name = `VNC-${input.vmName}-${input.email}-utf8`;

    return {
        name,
        config: {
            name,
            protocol: "vnc",
            parameters: {
                hostname: input.hostname,
                port: port.toString(),
                password: input.password || "",
                "color-depth": "32",
                "disable-copy": "false",
                "disable-paste": "false",
                "clipboard-encoding": "UTF-8"
            },
            attributes: {}
        }
    };
}
