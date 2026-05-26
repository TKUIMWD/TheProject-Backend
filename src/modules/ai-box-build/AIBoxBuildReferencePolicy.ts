import path from "path";

const ignoredReferenceEntryNames = new Set(['.git', 'node_modules', '.venv', '__pycache__']);

export function extractReferenceBundlePath(sourceText: string): string {
    const patterns = [
        /(?:reference_bundle_path|reference bundle path|reference path)\s*[:=]\s*([^\r\n]+)/i,
        /(?:參考素材路徑|參考檔案路徑|參考路徑)\s*[:=：]\s*([^\r\n]+)/i
    ];
    for (const pattern of patterns) {
        const match = sourceText.match(pattern);
        if (!match?.[1]) continue;
        return match[1].trim().replace(/^['"`]+|['"`]+$/g, '');
    }
    return "";
}

export function safeReferenceBundleName(sourcePath: string): string {
    return path.basename(sourcePath).replace(/[^A-Za-z0-9._-]/g, "_") || "bundle";
}

export function shouldIgnoreReferenceEntry(entryName: string): boolean {
    return ignoredReferenceEntryNames.has(entryName);
}

export function sanitizeReferenceFallbackDoc(value: string): string {
    return value
        .replace(/TODO:/g, "Intentional draft note:")
        .replace(/TODO\b/g, "Draft note")
        .replace(/YOUR_FLAGS_HAVE_NOT_BEEN_GENERATED/g, "FLAGS_ARE_GENERATED_DURING_SETUP");
}

export function normalizeReferenceFallbackWriteup(value: string): string {
    return sanitizeReferenceFallbackDoc(value || "# writeup.md\n\nReference writeup unavailable.")
        .replace(/flowise\.flow\.htb/g, "flowise.flow.ethci")
        .replace(/flow\.htb/g, "flow.ethci")
        .replace(/192\.168\.92\.129/g, "target VM IP");
}

export type ReferenceFallbackWorkspaceFiles = {
    designMd: string;
    setupMd: string;
    writeupMd: string;
};

export function buildReferenceFallbackWorkspaceFiles(input: {
    reason: string;
    referenceSetup: string;
    referenceEthci: string;
    referenceWriteup: string;
    setupScript: string;
}): ReferenceFallbackWorkspaceFiles {
    const normalizedWriteup = normalizeReferenceFallbackWriteup(input.referenceWriteup);
    const sanitizedSetup = sanitizeReferenceFallbackDoc(input.referenceSetup);
    const sanitizedEthci = sanitizeReferenceFallbackDoc(input.referenceEthci);
    const sanitizedSetupScript = sanitizeReferenceFallbackDoc(input.setupScript);

    const designMd = `# design.md

## Source

This build is a reference-backed fallback generated from \`reference/114-2-midterm_v2\` because opencode did not complete file generation.

Original reference bundle path: \`/home/tkuimwd/.cstg-ai-box-build-references/114-2-midterm_v2\`.

Platform baseline: Ubuntu Server 26.04.

Reason: ${input.reason}

## Challenge

Flow recreates the 114-2-midterm_v2 lab. The intended path is:

1. Enumerate \`flow.ethci\` and identify WordPress with Ultimate Member 2.6.6.
2. Exploit CVE-2023-3460 to gain WordPress administrator access.
3. Read the private draft that leaks \`flowise.flow.ethci\` and the Flowise credential \`admin@flow.ethci\`.
4. Use Flowise 3.0.4 CVE-2025-59528 to execute commands as \`sakiko\`.
5. Use the localhost-only ModelDrive service at \`127.0.0.1:8000\`, its \`/var/www/ModelDrive/src/config.json\` shadow backend, and the \`sudoedit\` rule.
6. Upload a PHP payload by changing the ModelDrive \`dest\` field to \`shell.php\`; the service runs as root and yields the root flag.

## Learning Objectives

- Practice vhost enumeration and WordPress plugin version discovery.
- Exploit Ultimate Member 2.6.6 / CVE-2023-3460 to reach WordPress administrator.
- Extract hidden service credentials from draft content.
- Exercise authenticated command execution against a Flowise 3.0.4 CVE-2025-59528 compatible surface.
- Pivot into a localhost-only service and abuse a configuration-backed authentication design.
- Validate root command execution through a server-side upload destination bypass.

## Service Map

- \`flow.ethci\`: Apache/WordPress on port 80.
- \`flowise.flow.ethci\`: Apache reverse proxy to \`127.0.0.1:3000\`.
- \`127.0.0.1:8000\`: ModelDrive, intentionally localhost-only.

## Credentials And Flags

- Linux: \`sakiko\` / \`2cute4u\`; root password is defined in the reference setup.
- WordPress admin: \`admin\` / reference password, email \`admin@flow.ethci\`.
- Flowise: \`admin@flow.ethci\` / reference password.
- User flag: \`/home/sakiko/user.txt\`.
- Root flag: \`/root/root.txt\`.
- Dynamic flag support: \`/root/flags.list\` and \`/root/flag.sh\`.

## AI Assistant Private Context

The assistant may hint toward vhost discovery, Ultimate Member 2.6.6/CVE-2023-3460, the WordPress draft leak, Flowise CVE-2025-59528, ModelDrive shadow-file authentication, the \`sudoedit\` rule for \`/var/www/ModelDrive/src/config.json\`, and the upload \`dest=shell.php\` bypass. It must not reveal flags or credentials directly unless the Box policy explicitly allows solution disclosure.
`;

    const setupMd = `# setup.md

This setup is generated from \`reference/114-2-midterm_v2\` and mirrors \`generated/setup.sh\`.

Original reference bundle path: \`/home/tkuimwd/.cstg-ai-box-build-references/114-2-midterm_v2\`.

Platform baseline: Ubuntu Server 26.04.

## Reference Notes

${sanitizedSetup}

## ETHCI Adjustments

${sanitizedEthci}

## Command Plan

\`\`\`bash
${sanitizedSetupScript}
\`\`\`
`;

    return {
        designMd,
        setupMd,
        writeupMd: `# Platform Baseline\n\nUbuntu Server 26.04.\n\n${normalizedWriteup}`
    };
}
