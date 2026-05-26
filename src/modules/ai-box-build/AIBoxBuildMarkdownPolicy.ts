import { containsConcreteSetupCommand } from "./AIBoxBuildValidationPolicy";

export function requiredUbuntuBaseline(sourceText: string, latestUbuntuServer: string): string | null {
    const explicitUbuntuVersion = sourceText.match(/ubuntu(?:\s+server)?\s*(\d{2}\.\d{2})|(\d{2}\.\d{2})\s*ubuntu/i);
    if (explicitUbuntuVersion) return explicitUbuntuVersion[1] || explicitUbuntuVersion[2] || null;
    if (/(latest|newest).{0,40}ubuntu|ubuntu.{0,40}(latest|newest)|ubuntu server release iso/i.test(sourceText)) {
        return latestUbuntuServer;
    }
    return null;
}

export function ensureUbuntuBaselineInMarkdown(
    content: string,
    sourceText: string,
    latestUbuntuServer: string
): string {
    const requiredVersion = requiredUbuntuBaseline(sourceText, latestUbuntuServer);
    if (!requiredVersion || content.toLowerCase().includes(requiredVersion.toLowerCase())) return content;

    return `${content.trim()}\n\n## Platform Baseline\n\n- Target OS: Ubuntu Server ${requiredVersion}. Preserve this baseline for ISO/template selection, setup, and validation.\n`;
}

export function ensureSetupMarkdownHasGeneratedCommands(setupMd: string, setupScript: string): string {
    if (containsConcreteSetupCommand(setupMd) || !setupScript.trim()) return setupMd;

    const clippedScript = setupScript.trim().slice(0, 7000);
    return `${setupMd.trim()}\n\n## Generated Setup Command Plan\n\nThe exact operator command plan from generated/setup.sh is mirrored here for review.\n\n\`\`\`bash\n${clippedScript}\n\`\`\`\n`;
}
