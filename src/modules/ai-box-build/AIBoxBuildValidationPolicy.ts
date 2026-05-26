import {
    AIBoxBuildArtifacts,
    AIBoxBuildValidationReport
} from "../../interfaces/AIBoxBuildJob";
import {
    AIBoxArtifactName,
    containsUnresolvedPlaceholder,
    mergeStringArrays
} from "./AIBoxBuildArtifactPolicy";

type RequiredReference = {
    value: string;
    label: string;
    sensitive?: boolean;
};

export function validateAIBoxBuildArtifacts(input: {
    direction: string;
    constraints: string;
    allowAiAssistant: boolean;
    artifacts: AIBoxBuildArtifacts;
    latestUbuntuServer: string;
    agentError?: string;
    now?: Date;
}): AIBoxBuildValidationReport {
    const blockers: string[] = [];
    const warnings: string[] = [];
    const passedChecks: string[] = [];
    const requirementChecks: string[] = [];
    const artifactChecks: AIBoxBuildValidationReport['artifact_checks'] = {
        design_md: [],
        setup_md: [],
        writeup_md: []
    };
    const allArtifactText = `${input.artifacts.design_md}\n${input.artifacts.setup_md}\n${input.artifacts.writeup_md}`;
    const sourceText = `${input.direction}\n${input.constraints}`;

    if (input.agentError) {
        blockers.push(`AI service failed before validation completed: ${input.agentError}`);
    }

    validateArtifactPresence('design_md', input.artifacts.design_md, 500, artifactChecks, blockers, warnings);
    validateArtifactPresence('setup_md', input.artifacts.setup_md, 500, artifactChecks, blockers, warnings);
    validateArtifactPresence('writeup_md', input.artifacts.writeup_md, 350, artifactChecks, blockers, warnings);

    validateDesignArtifact(input.artifacts.design_md, artifactChecks, warnings);
    validateSetupArtifact(input.artifacts.setup_md, artifactChecks, blockers, warnings);
    validateWriteupArtifact(input.artifacts.writeup_md, artifactChecks, warnings);
    validateAssistantPolicy(input.allowAiAssistant, input.artifacts.design_md, artifactChecks, warnings);

    const requiredReferences = extractRequiredReferences(sourceText, input.latestUbuntuServer);
    for (const reference of requiredReferences) {
        const description = describeRequiredReference(reference);
        if (artifactContains(allArtifactText, reference.value)) {
            requirementChecks.push(`found: ${description}`);
        } else {
            blockers.push(`Missing required reference from direction/constraints: ${description}`);
        }
    }
    if (requiredReferences.length > 0 && requiredReferences.every((reference) => artifactContains(allArtifactText, reference.value))) {
        passedChecks.push("All extracted direction/constraint references are present in generated artifacts.");
    }

    const sourceLower = sourceText.toLowerCase();
    const allLower = allArtifactText.toLowerCase();
    const latestUbuntuRequested = /(latest|newest).{0,40}ubuntu|ubuntu.{0,40}(latest|newest)|最新版.{0,40}ubuntu|ubuntu.{0,40}最新版|ubuntu server release iso/i.test(sourceText);
    const explicitUbuntuVersion = sourceText.match(/ubuntu(?:\s+server)?\s*(\d{2}\.\d{2})|(\d{2}\.\d{2})\s*ubuntu/i);
    if (latestUbuntuRequested || explicitUbuntuVersion) {
        const requiredVersion = explicitUbuntuVersion?.[1] || explicitUbuntuVersion?.[2] || input.latestUbuntuServer;
        if (!allLower.includes(requiredVersion.toLowerCase())) {
            blockers.push(`Requested Ubuntu baseline is not preserved in artifacts: Ubuntu ${requiredVersion}`);
        } else {
            passedChecks.push(`Ubuntu baseline preserved: ${requiredVersion}`);
        }

        if (requiredVersion !== '24.04' && sourceLower.includes('ubuntu') && allLower.includes('24.04')) {
            warnings.push("Artifacts mention Ubuntu 24.04 from source/reference context; confirm the selected runtime template before publishing.");
        }
    }

    if (input.allowAiAssistant) {
        passedChecks.push("Student AI assistant default is allowed and remains a Box setting.");
    } else {
        passedChecks.push("Student AI assistant default is disabled and remains a Box setting.");
    }

    return {
        status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'pass',
        blockers: mergeStringArrays(blockers).slice(0, 30),
        warnings: mergeStringArrays(warnings).slice(0, 30),
        passed_checks: mergeStringArrays(passedChecks).slice(0, 30),
        artifact_checks: artifactChecks,
        requirement_checks: mergeStringArrays(requirementChecks).slice(0, 50),
        generated_at: input.now || new Date()
    };
}

export function containsConcreteSetupCommand(content: string): boolean {
    return /\b(apt|apt-get|systemctl|docker|docker-compose|npm|pip|curl|wget|chmod|chown|ufw|nginx|apache2|php|mysql|useradd|usermod|userdel|ssh-keygen|mkdir|tee|cat|echo|visudo|sudoers)\b/i.test(content);
}

function validateArtifactPresence(
    artifactName: AIBoxArtifactName,
    content: string,
    minLength: number,
    artifactChecks: AIBoxBuildValidationReport['artifact_checks'],
    blockers: string[],
    warnings: string[]
): void {
    const trimmed = content.trim();
    if (!trimmed) {
        blockers.push(`${artifactName} is empty.`);
        return;
    }

    artifactChecks[artifactName].push(`${artifactName} generated (${trimmed.length} chars).`);
    if (trimmed.length < minLength) {
        warnings.push(`${artifactName} is short for review-grade machine build documentation.`);
    }

    if (containsUnresolvedPlaceholder(trimmed)) {
        blockers.push(`${artifactName} contains placeholders that must be resolved before approval.`);
    }
}

function validateDesignArtifact(
    design: string,
    artifactChecks: AIBoxBuildValidationReport['artifact_checks'],
    warnings: string[]
): void {
    const checks: Array<[RegExp, string]> = [
        [/(learning objective|objective|教學目標|學習目標|目標)/i, "learning objectives"],
        [/(service map|service|port|domain|host|服務|端口|主機|網域)/i, "service map"],
        [/(intended path|attack path|exploit|cve|漏洞|攻擊路徑|解題路徑)/i, "intended attack path"],
        [/(credential|password|secret|flag|憑證|密碼|旗標)/i, "credentials/secrets/flags"],
        [/(ai assistant|assistant context|hint|助理|提示)/i, "AI assistant private context"]
    ];

    for (const [pattern, label] of checks) {
        if (pattern.test(design)) {
            artifactChecks.design_md.push(`design.md includes ${label}.`);
        } else {
            warnings.push(`design.md should explicitly include ${label}.`);
        }
    }

    const intendedPathWarning = "design.md should explicitly include intended attack path.";
    if (
        warnings.includes(intendedPathWarning)
        && /(solve path|solver path|lateral movement|privilege escalation|privesc|gtfobins|sudo -l|ssh\s+-i)/i.test(design)
    ) {
        warnings.splice(warnings.indexOf(intendedPathWarning), 1);
        artifactChecks.design_md.push("design.md includes intended attack path.");
    }
}

function validateSetupArtifact(
    setup: string,
    artifactChecks: AIBoxBuildValidationReport['artifact_checks'],
    blockers: string[],
    warnings: string[]
): void {
    if (containsConcreteSetupCommand(setup)) {
        artifactChecks.setup_md.push("setup.md includes concrete operator commands.");
    } else {
        blockers.push("setup.md must include concrete operator commands.");
    }

    if (/\/[A-Za-z0-9._/-]+/.test(setup)) {
        artifactChecks.setup_md.push("setup.md includes filesystem paths.");
    } else {
        warnings.push("setup.md should include exact filesystem paths.");
    }

    if (/(flag|\/root\/|旗標|flags\.list|flag\.sh)/i.test(setup)) {
        artifactChecks.setup_md.push("setup.md includes flag placement/configuration.");
    } else {
        blockers.push("setup.md must include flag placement/configuration.");
    }

    if (/(verify|validation|test|curl|nmap|systemctl status|檢查|驗證)/i.test(setup)) {
        artifactChecks.setup_md.push("setup.md includes validation checks.");
    } else {
        warnings.push("setup.md should include validation checks after configuration.");
    }
}

function validateWriteupArtifact(
    writeup: string,
    artifactChecks: AIBoxBuildValidationReport['artifact_checks'],
    warnings: string[]
): void {
    const checks: Array<[RegExp, string]> = [
        [/(enumerat|scan|nmap|dirsearch|ffuf|偵察|列舉|掃描)/i, "enumeration step"],
        [/(exploit|cve|payload|漏洞|利用)/i, "exploitation step"],
        [/(user flag|flag|旗標|user\.txt)/i, "flag capture"],
        [/(root|privilege|sudo|權限提升|提權|root\.txt)/i, "privilege escalation/final step"]
    ];

    for (const [pattern, label] of checks) {
        if (pattern.test(writeup)) {
            artifactChecks.writeup_md.push(`writeup.md includes ${label}.`);
        } else {
            warnings.push(`writeup.md should include ${label}.`);
        }
    }

    const exploitationWarning = "writeup.md should include exploitation step.";
    if (
        warnings.includes(exploitationWarning)
        && /(abuse|leverage|misconfig|private key|id_rsa|ssh\s+-i|gtfobins|suid|sudo|path injection|privesc)/i.test(writeup)
    ) {
        warnings.splice(warnings.indexOf(exploitationWarning), 1);
        artifactChecks.writeup_md.push("writeup.md includes exploitation step.");
    }
}

function validateAssistantPolicy(
    allowAiAssistant: boolean,
    design: string,
    artifactChecks: AIBoxBuildValidationReport['artifact_checks'],
    warnings: string[]
): void {
    const designLower = design.toLowerCase();
    if (designLower.includes('ai') || /助理|提示/.test(design)) {
        artifactChecks.design_md.push("design.md mentions AI assistant/hint context.");
    } else {
        warnings.push("design.md should define what private context the AI assistant may use.");
    }

    if (!allowAiAssistant && /(student.*ask|allow.*assistant|允許.*學生|可.*提問)/i.test(design)) {
        warnings.push("AI assistant is disabled by default, but design.md wording may imply students can ask it.");
    }
}

function extractRequiredReferences(sourceText: string, latestUbuntuServer: string): RequiredReference[] {
    const references: RequiredReference[] = [];
    const add = (value: string, label: string, sensitive = false) => {
        const trimmed = value.trim().replace(/[),.;]+$/, '');
        if (!trimmed) return;
        references.push({ value: trimmed, label, sensitive });
    };

    const pathMatches = sourceText.match(/\/[A-Za-z0-9._~:/-]+/g) || [];
    pathMatches
        .filter((path) => isLikelyRequiredPath(path))
        .forEach((path) => add(path, `path ${path}`));

    const domainMatches = sourceText.match(/\b(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\b/g) || [];
    domainMatches
        .filter((domain) => !/\.(json|md|js|ts|py|sh|txt|conf|yaml|yml)$/i.test(domain))
        .forEach((domain) => add(domain, `host/domain ${domain}`));

    const emailMatches = sourceText.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) || [];
    emailMatches.forEach((email) => add(email, `email/account ${email}`));

    const cveMatches = sourceText.match(/\bCVE-\d{4}-\d{4,7}\b/gi) || [];
    cveMatches.forEach((cve) => add(cve.toUpperCase(), `CVE ${cve.toUpperCase()}`));

    sourceText.split(/\s+/)
        .map((token) => token.replace(/^['"`]+|['"`:,;.)]+$/g, ''))
        .filter((token) => isHighEntropyToken(token))
        .forEach((token) => add(token, "credential/secret token", true));

    if (/(latest|newest).{0,40}ubuntu|ubuntu.{0,40}(latest|newest)|最新版.{0,40}ubuntu|ubuntu.{0,40}最新版|ubuntu server release iso/i.test(sourceText)) {
        add(latestUbuntuServer, `latest Ubuntu Server baseline ${latestUbuntuServer}`);
    }

    if (/114-2-midterm|modeldrive|flowise|flow\.ethci|ultimate member|CVE-2023-3460|CVE-2025-59528/i.test(sourceText)) {
        [
            ['flow.ethci', '114-2-midterm host flow.ethci'],
            ['flowise.flow.ethci', '114-2-midterm host flowise.flow.ethci'],
            ['/var/www/ModelDrive/src/config.json', '114-2-midterm ModelDrive config path'],
            ['/root/flags.list', '114-2-midterm dynamic flag list'],
            ['/root/flag.sh', '114-2-midterm dynamic flag script'],
            ['admin@flow.ethci', '114-2-midterm Flowise account'],
            ['1JETB@9eYIZ8J!', '114-2-midterm Flowise credential', true],
            ['CVE-2023-3460', 'Ultimate Member vulnerability'],
            ['CVE-2025-59528', 'Flowise vulnerability']
        ].forEach(([value, label, sensitive]) => add(String(value), String(label), Boolean(sensitive)));
    }

    return uniqueReferences(references).slice(0, 80);
}

function isLikelyRequiredPath(path: string): boolean {
    const normalized = path.trim().replace(/[),.;]+$/, '');
    if (!normalized.startsWith('/') || normalized.startsWith('//') || normalized.length <= 3) return false;
    if (/^\/?(?:design|setup|writeup)(?:\/|$)/i.test(normalized)) return false;
    if (/^\/(?:setup|validation)\.sh$/i.test(normalized)) return false;
    if (/^\/(?:etc|var|home|root|opt|usr|tmp|srv|app|mnt|media|boot|dev|proc|sys|run|lib|bin|sbin)(?:\/|$)/i.test(normalized)) return true;
    if ((normalized.match(/\//g) || []).length >= 2) return true;
    return /\.[A-Za-z0-9]{1,10}(?:$|[/?#])/.test(normalized);
}

function uniqueReferences(references: RequiredReference[]): RequiredReference[] {
    const seen = new Set<string>();
    return references.filter((reference) => {
        const key = reference.value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function artifactContains(content: string, token: string): boolean {
    return content.toLowerCase().includes(token.toLowerCase());
}

function describeRequiredReference(reference: RequiredReference): string {
    if (!reference.sensitive) return reference.label;
    const value = reference.value;
    const masked = value.length <= 8 ? "[sensitive token]" : `${value.slice(0, 3)}...${value.slice(-2)}`;
    return `${reference.label} (${masked})`;
}

function isHighEntropyToken(token: string): boolean {
    if (token.length < 10 || token.length > 80) return false;
    if (!/^[\x21-\x7E]+$/.test(token)) return false;
    if ((token.match(/\?/g) || []).length >= 2) return false;
    if (!/\d/.test(token)) return false;
    if (/^https?:\/\//i.test(token) || token.includes('/')) return false;
    if (/^[A-Za-z0-9_-]+$/.test(token) && token.includes('-')) return false;
    const classes = [
        /[a-z]/.test(token),
        /[A-Z]/.test(token),
        /\d/.test(token),
        /[^A-Za-z0-9]/.test(token)
    ].filter(Boolean).length;
    return classes >= 4 || (classes >= 3 && /[!@#$%^&*+=?]/.test(token));
}
