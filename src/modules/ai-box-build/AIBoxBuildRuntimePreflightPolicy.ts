export function validateAIBoxRuntimeConfig(input: {
    openAIApiKey?: string;
    openAIBaseUrl?: string;
}): string[] {
    const errors: string[] = [];
    if (!input.openAIApiKey) {
        errors.push("OPENAI_API_KEY is not configured");
    }
    if (!input.openAIBaseUrl) {
        errors.push("OPENAI_BASE_URL is not configured");
    }
    return errors;
}

export function shouldCheckSshpassForAIBoxRun(dryRun?: boolean): boolean {
    return dryRun !== true;
}

export function buildOpencodePreflightError(opencodeBinary: string, summary: string): string {
    return `opencode is not executable at ${opencodeBinary}: ${summary}`;
}

export function buildSshpassPreflightError(summary: string): string {
    return `sshpass is required for SSH setup execution: ${summary}`;
}

export function buildAIBoxRuntimePreflightFailureMessage(errors: string[]): string {
    return `AI build runtime preflight failed: ${errors.join("; ")}`;
}
