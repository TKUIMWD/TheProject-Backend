export function buildAIBoxVMCreationFailureMessage(code: number | string, message: string): string {
    return `VM creation failed: ${code} ${message}`;
}

export function buildAIBoxVMCreatedLogMessage(pveNode: string, pveVmid: string): string {
    return `VM created: ${pveNode}/${pveVmid}.`;
}

export function buildAIBoxVMBootFailureMessage(errorMessage?: string): string {
    return `VM boot failed: ${errorMessage || "unknown error"}`;
}

export function buildAIBoxVMBootTaskFailureMessage(errorMessage?: string): string {
    return `VM boot task failed: ${errorMessage || "unknown error"}`;
}

export function buildCloudInitSkippedLogMessage(): string {
    return "Cloud-init preparation skipped by configuration.";
}

export function buildCloudInitConfigUnavailableLogMessage(): string {
    return "Unable to read VM config before boot; continuing without cloud-init network preparation.";
}

export function buildCloudInitApplyLogMessage(desiredIpConfig: string): string {
    return `Applying cloud-init network config: ipconfig0=${desiredIpConfig}.`;
}

export function buildCloudInitAlreadyConfiguredLogMessage(currentIpConfig: unknown): string {
    return `Cloud-init network config already set: ipconfig0=${currentIpConfig || "unset"}.`;
}

export function buildCloudInitRegenerationFailureLogMessage(errorMessage?: string): string {
    return `Cloud-init regeneration failed before boot: ${errorMessage || "unknown error"}.`;
}

export function buildCloudInitRegenerationTaskFailureLogMessage(errorMessage?: string): string {
    return `Cloud-init regeneration task did not complete cleanly: ${errorMessage || "unknown error"}.`;
}

export function buildCloudInitRegeneratedLogMessage(): string {
    return "Cloud-init regenerated before VM boot.";
}

export function buildGuestNetworkIdentitySkippedLogMessage(): string {
    return "Guest network identity normalization skipped by configuration.";
}

export function buildGuestNetworkIdentityStartLogMessage(): string {
    return "Normalizing guest machine-id and DHCP client identity after boot.";
}

export function buildGuestNetworkIdentityFailureLogMessage(errorMessage?: string, stderr?: string): string {
    const detail = [errorMessage, stderr].filter(Boolean).join(": ").slice(0, 500);
    return `Guest network identity normalization did not complete: ${detail || "unknown error"}.`;
}

export function buildGuestNetworkIdentitySuccessLogMessage(stdout: string): string {
    const summary = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && /^(network_identity=|interface=|old_machine_id=|new_machine_id=|\d+: )/.test(line))
        .join("; ")
        .slice(0, 700);
    return `Guest network identity normalized. ${summary}`;
}

export function selectPreferredVMIPAddress(ipAddresses: string[]): string | undefined {
    return ipAddresses.find((ip) => !ip.startsWith("169.254.")) || ipAddresses[0];
}

export function buildVMIPDetectedLogMessage(ipAddress: string): string {
    return `VM IP detected: ${ipAddress}.`;
}

export function buildVMIPWaitLogMessage(attempt: number, maxAttempts: number): string {
    return `Still waiting for VM IP (${attempt}/${maxAttempts}).`;
}
