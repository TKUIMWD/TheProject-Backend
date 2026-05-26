import dotenv from "dotenv";

dotenv.config();

type EnvValue = string | undefined;

function required(name: string, value: EnvValue): string {
    if (!value || value.trim() === "") {
        throw new Error(`${name} is not defined in the environment variables`);
    }
    return value;
}

function optional(name: string, fallback: string): string {
    const value = process.env[name];
    return value && value.trim() !== "" ? value : fallback;
}

function optionalNumber(name: string, fallback: number): number {
    const value = process.env[name];
    if (!value || value.trim() === "") return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`${name} must be a valid number`);
    }
    return parsed;
}

function optionalBoolean(name: string, fallback: boolean): boolean {
    const value = process.env[name];
    if (!value || value.trim() === "") return fallback;
    return value.toLowerCase() === "true";
}

function optionalList(name: string, fallback: string[] = []): string[] {
    const value = process.env[name];
    if (!value || value.trim() === "") return fallback;
    return value.split(",").map(item => item.trim()).filter(Boolean);
}

export const env = {
    server: {
        port: optional("PORT", "2083"),
        corsOrigins: optionalList("CORS_ORIGINS", ["*"]),
        assetsPath: optional("assetsPath", "/assets"),
        homePagePath: optional("HomePagePath", "/index.html"),
        backendBaseUrl: optional("BACKEND_BASE_URL", "http://localhost:22100")
    },
    security: {
        jwtSecret: required("JWT_SECRET", process.env.JWT_SECRET)
    },
    database: {
        user: required("DBUSER", process.env.DBUSER),
        password: required("DBPASSWORD", process.env.DBPASSWORD),
        host: required("DBHOST", process.env.DBHOST),
        port: required("DBPORT", process.env.DBPORT),
        name: required("DBNAME", process.env.DBNAME)
    },
    logging: {
        path: optional("LogPath", "logs")
    },
    runtime: {
        homeDir: optional("HOME", process.cwd())
    },
    frontend: {
        baseUrl: optional("FRONTEND_BASE_URL", "http://localhost:5173")
    },
    http: {
        allowInsecureTls: optionalBoolean("HTTP_ALLOW_INSECURE_TLS", optionalBoolean("PVE_ALLOW_INSECURE_TLS", true))
    },
    pve: {
        baseUrl: required("PVE_API_BASE_URL", process.env.PVE_API_BASE_URL),
        userModeToken: process.env.PVE_API_USERMODE_TOKEN || "",
        adminModeToken: process.env.PVE_API_ADMINMODE_TOKEN || "",
        superAdminModeToken: process.env.PVE_API_SUPERADMINMODE_TOKEN || "",
        allowInsecureTls: optionalBoolean("PVE_ALLOW_INSECURE_TLS", true),
        bootNormalizeGuestNetwork: optionalBoolean("VM_BOOT_NORMALIZE_GUEST_NETWORK", true),
        bootGuestIdentityTimeoutMs: optionalNumber("VM_BOOT_GUEST_IDENTITY_TIMEOUT_MS", 120000)
    },
    guacamole: {
        baseUrl: process.env.GUACAMOLE_BASE_URL || "",
        apiUsername: process.env.GUACAMOLE_API_USERNAME || "",
        apiPassword: process.env.GUACAMOLE_API_PASSWORD || "",
        projectUserPassword: process.env.PROJECTUSER_GUACAMOLE_PASSWORD || ""
    },
    openai: {
        apiKey: process.env.OPENAI_API_KEY || "",
        baseUrl: process.env.OPENAI_BASE_URL || "",
        model: optional("OPENAI_MODEL", "gpt-4o"),
        boxBuildModel: process.env.OPENAI_BOX_BUILD_MODEL || "",
        boxBuildModels: optionalList("OPENAI_BOX_BUILD_MODELS"),
        boxBuildMaxTokens: optionalNumber("OPENAI_BOX_BUILD_MAX_TOKENS", 3000),
        boxBuildTimeoutMs: optionalNumber("OPENAI_BOX_BUILD_TIMEOUT_MS", 180000),
        boxBuildUbuntuServerLts: optional("OPENAI_BOX_BUILD_UBUNTU_SERVER_LTS", "26.04")
    },
    opencode: {
        bin: optional("OPENCODE_BIN", "opencode"),
        boxBuildModel: process.env.OPENCODE_BOX_BUILD_MODEL || "",
        workdir: process.env.OPENCODE_BOX_BUILD_WORKDIR || "",
        referenceRoot: process.env.OPENCODE_BOX_BUILD_REFERENCE_ROOT || "",
        blockedTargetNodes: optionalList("OPENCODE_BOX_BUILD_BLOCKED_TARGET_NODES", ["gapvec"]),
        preflightTimeoutMs: optionalNumber("OPENCODE_BOX_BUILD_PREFLIGHT_TIMEOUT_MS", 10000),
        staleAfterMs: optionalNumber("OPENCODE_BOX_BUILD_STALE_AFTER_MS", 90 * 60 * 1000),
        setupTimeoutMs: optionalNumber("OPENCODE_BOX_BUILD_SETUP_TIMEOUT_MS", 20 * 60 * 1000),
        validationTimeoutMs: optionalNumber("OPENCODE_BOX_BUILD_VALIDATION_TIMEOUT_MS", 8 * 60 * 1000),
        prepareCloudInit: optionalBoolean("OPENCODE_BOX_BUILD_PREPARE_CLOUD_INIT", true),
        ipconfig0: optional("OPENCODE_BOX_BUILD_IPCONFIG0", "ip=dhcp"),
        normalizeGuestNetwork: optionalBoolean("OPENCODE_BOX_BUILD_NORMALIZE_GUEST_NETWORK", true),
        guestIdentityTimeoutMs: optionalNumber("OPENCODE_BOX_BUILD_GUEST_IDENTITY_TIMEOUT_MS", 180000),
        ipWaitAttempts: optionalNumber("OPENCODE_BOX_BUILD_IP_WAIT_ATTEMPTS", 60),
        ipWaitMs: optionalNumber("OPENCODE_BOX_BUILD_IP_WAIT_MS", 5000),
        referenceMaxFiles: optionalNumber("OPENCODE_BOX_BUILD_REFERENCE_MAX_FILES", 600),
        referenceMaxBytes: optionalNumber("OPENCODE_BOX_BUILD_REFERENCE_MAX_BYTES", 50 * 1024 * 1024),
        runTimeoutMs: optionalNumber("OPENCODE_BOX_BUILD_TIMEOUT_MS", 15 * 60 * 1000)
    },
    mail: {
        senderEmail: process.env.SENDER_EMAIL || "",
        googleAppPassword: process.env.GOOGLE_APP_PASSWORD || ""
    }
} as const;

export function redactSecret(value: string): string {
    let redacted = value;
    const secrets = [
        env.database.password,
        env.security.jwtSecret,
        env.pve.userModeToken,
        env.pve.adminModeToken,
        env.pve.superAdminModeToken,
        env.guacamole.apiPassword,
        env.guacamole.projectUserPassword,
        env.openai.apiKey,
        env.mail.googleAppPassword
    ].filter(secret => secret.length >= 8);

    for (const secret of secrets) {
        redacted = redacted.replace(new RegExp(escapeRegExp(secret), "g"), "[redacted]");
    }

    return redacted
        .replace(/([?&]token=)[^&\s]+/gi, "$1[redacted]")
        .replace(/(password|cipassword|SSHPASS)\s*[:=]\s*\S+/gi, "$1=[redacted]");
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
