export function normalizeOpenCodeRunModel(rawModel: string, defaultProvider = "cstg"): string {
    return rawModel.includes("/") ? rawModel : `${defaultProvider}/${rawModel}`;
}

export function normalizeOpenCodeConfigModelId(rawModel: string): string {
    return rawModel.includes("/") ? rawModel.split("/").slice(1).join("/") : rawModel;
}

export function buildOpenCodeConfig(input: {
    rawModel: string;
    baseUrl: string;
    providerKey?: string;
    providerName?: string;
    apiKeyEnvRef?: string;
}): string {
    const providerKey = input.providerKey || "cstg";
    const modelId = normalizeOpenCodeConfigModelId(input.rawModel);

    return JSON.stringify({
        "$schema": "https://opencode.ai/config.json",
        provider: {
            [providerKey]: {
                npm: "@ai-sdk/openai-compatible",
                name: input.providerName || "CSTG AI Service",
                options: {
                    baseURL: input.baseUrl,
                    apiKey: input.apiKeyEnvRef || "{env:OPENAI_API_KEY}"
                },
                models: {
                    [modelId]: {
                        name: modelId
                    }
                }
            }
        }
    }, null, 2);
}

export function buildAIBoxWorkspaceAgentInstructions(): string {
    return `You are preparing CSTG Box build artifacts in an isolated workspace.

Rules:
- Work only inside this workspace.
- Do not SSH into the VM directly. The platform executor will run generated scripts.
- If a reference/ directory exists, inspect it first and treat it as the authoritative source material.
- Keep design.md confidential: include objectives, service map, intended solve path, credentials, flags, and AI assistant private context.
- setup.md must be operator-readable and mirror generated/setup.sh.
- setup.md must include exact commands in Markdown, not only a pointer to generated/setup.sh.
- writeup.md must be a designer-facing solve path.
- Create generated/setup.sh and generated/validation.sh as executable Bash scripts.
- When using opencode file tools, use the exact schema required by the tool. For write operations the path key is filePath.
- Bash/tool calls also require their documented schema. For bash use a short description plus the command.
- Do not wait for confirmation, do not say you are ready, and do not stop after planning. Create or edit the files immediately.
- If a tool call fails because of schema arguments, retry the same operation with the corrected schema before continuing.
- Scripts must be idempotent and non-interactive.
- Do not place SSH passwords or API keys in files.
`;
}

export function buildAIBoxOpenCodeRunPrompt(input: {
    latestUbuntuServer: string;
    pveNode?: string;
    pveVmid?: string;
    vmIp?: string;
    sshUser?: string;
    fallbackSshUser?: string;
}): string {
    return `Generate the CSTG Box build files for this workspace. Complete the task in one pass.

Work rules:
- Work only in this directory.
- Do not SSH into the VM, do not call PVE APIs, and do not run destructive commands.
- Prefer editing/writing files directly. Shell commands are only for harmless local inspection.
- When writing files through opencode tools, use the exact file tool schema. The write tool path key is filePath, for example {"filePath":"generated/setup.sh","content":"..."}.
- When using the bash tool, include both description and command, for example {"description":"List generated files","command":"ls -la generated"}.
- Do not ask for confirmation, do not say you are ready, and do not finish until all five required files exist on disk.
- If a tool call fails due to missing or invalid schema keys, retry it with the corrected schema immediately.
- If a reference/ directory exists, inspect its Markdown, source code, scripts, and config files before generating outputs. Preserve its concrete lab requirements unless they conflict with build-context.json.
- If details are ambiguous, choose a conservative, reviewable implementation and document the assumption.
- Preserve every concrete requirement from build-context.json and the existing Markdown files.
- Required Ubuntu Server baseline when latest Ubuntu is requested: ${input.latestUbuntuServer}. Mention this baseline in design.md, setup.md, and writeup.md when applicable.

Target VM:
- PVE: ${input.pveNode || "dry-run"}/${input.pveVmid || "dry-run"}
- IP: ${input.vmIp || "dry-run"}
- SSH user: ${input.sshUser || input.fallbackSshUser || "root"}

Required output files:
1. Update design.md with the final challenge design and AI-assistant private context.
2. Update setup.md with exact operator steps, service configs, flag placement, rollback, verification notes, and a command plan that mirrors generated/setup.sh.
3. Update writeup.md with the intended solver path, including enumeration/discovery, exploitation or lateral movement, user flag, privilege escalation, and root flag.
4. Create generated/setup.sh to configure the target VM.
5. Create generated/validation.sh to verify the target VM.

Script requirements:
- Bash with a shebang.
- Idempotent and non-interactive.
- Safe to run through sudo on Ubuntu Server.
- Include explicit package installs, service configuration, flag placement, and verification.
- validation.sh must exit non-zero when required services, files, ports, or flags are missing.

Return a concise status summary only after all five required files exist.`;
}
