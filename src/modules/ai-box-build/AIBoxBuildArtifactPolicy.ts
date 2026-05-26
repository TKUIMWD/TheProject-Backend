import {
    AIBoxBuildArtifacts,
    AIBoxBuildPhase,
    AIBoxBuildValidationReport
} from "../../interfaces/AIBoxBuildJob";

export type AIBoxArtifactName = keyof AIBoxBuildArtifacts;

export function normalizeAIBoxBuildPhase(value: unknown): AIBoxBuildPhase {
    if (value === AIBoxBuildPhase.implementation) return AIBoxBuildPhase.implementation;
    if (value === AIBoxBuildPhase.verification) return AIBoxBuildPhase.verification;
    return AIBoxBuildPhase.design;
}

export function normalizeString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

export function normalizeStringArray(value: unknown, maxItems = 20): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, maxItems);
}

export function mergeStringArrays(items: unknown[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of items) {
        if (typeof item !== "string") continue;
        const trimmed = item.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(trimmed);
    }
    return result;
}

export function firstNonEmpty(items: unknown[]): string {
    const value = items.find((item) => typeof item === "string" && item.trim().length > 0);
    return typeof value === "string" ? value.trim() : "";
}

export function normalizeAIBoxBuildArtifacts(
    value: Partial<AIBoxBuildArtifacts> | undefined,
    fallbackDirection: string
): AIBoxBuildArtifacts {
    return {
        design_md: typeof value?.design_md === "string" && value.design_md.trim() ? value.design_md : `# design.md\n\n## Direction\n\n${fallbackDirection}`,
        setup_md: typeof value?.setup_md === "string" && value.setup_md.trim() ? value.setup_md : "# setup.md\n\nPending setup details.",
        writeup_md: typeof value?.writeup_md === "string" && value.writeup_md.trim() ? value.writeup_md : "# writeup.md\n\nPending solve path."
    };
}

export function isUsableAIBoxArtifact(artifactName: AIBoxArtifactName, artifact: unknown): artifact is string {
    if (typeof artifact !== "string") return false;
    const trimmed = artifact.trim();
    const minLengthByArtifact: Record<AIBoxArtifactName, number> = {
        design_md: 500,
        setup_md: 500,
        writeup_md: 350
    };
    if (trimmed.length < minLengthByArtifact[artifactName]) return false;
    return !containsUnresolvedPlaceholder(trimmed);
}

export function hasUsableAIBoxArtifacts(
    artifacts: Partial<AIBoxBuildArtifacts> | undefined,
    requiredArtifacts: AIBoxArtifactName[]
): boolean {
    return requiredArtifacts.every((artifactName) => isUsableAIBoxArtifact(artifactName, artifacts?.[artifactName]));
}

export function coerceRawAIBoxArtifact(artifactName: AIBoxArtifactName, content: string): string {
    const heading = artifactName.replace("_", ".").replace(".md", ".md");
    const trimmed = content.trim();
    if (/^#\s+/m.test(trimmed)) return trimmed;
    return `# ${heading}\n\n${trimmed}`;
}

export function containsUnresolvedPlaceholder(content: string): boolean {
    return /\b(TODO|TBD|FIXME|CHANGEME|Pending)\b/i.test(content)
        || /<\s*[^>\n]*(?:TODO|TBD|FIXME|CHANGEME|PLACEHOLDER|REPLACE_ME|REPLACEME|INSERT_HERE|FILL_IN|YOUR_)[^>\n]*\s*>/i.test(content);
}

export function mergeValidationIntoList(base: string[], report: AIBoxBuildValidationReport, mode: "risk" | "action"): string[] {
    const additions = mode === "risk"
        ? [
            ...report.blockers.map((item) => `Validation blocker: ${item}`),
            ...report.warnings.map((item) => `Validation warning: ${item}`)
        ]
        : report.blockers.map((item) => `Resolve validation blocker: ${item}`);

    return mergeStringArrays([...base, ...additions]).slice(0, 20);
}

export function defaultAIBoxBuildValidationReport(now = new Date()): AIBoxBuildValidationReport {
    return {
        status: "blocked",
        blockers: ["Validation has not run for this job."],
        warnings: [],
        passed_checks: [],
        artifact_checks: {
            design_md: [],
            setup_md: [],
            writeup_md: []
        },
        requirement_checks: [],
        generated_at: now
    };
}
