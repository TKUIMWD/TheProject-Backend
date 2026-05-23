import { AIBoxBuildJob } from "../../interfaces/AIBoxBuildJob";

export class AIBoxBuildPrompts {
    private static clipArtifact(value: string | undefined, maxLength = 900): string {
        const text = value || '(empty)';
        if (text.length <= maxLength) return text;
        return `${text.slice(0, maxLength)}

[...truncated for iteration context...]`;
    }

    private static ubuntuBaseline(): string {
        return process.env.OPENAI_BOX_BUILD_UBUNTU_SERVER_LTS || '26.04';
    }

    static readonly SYSTEM_INIT = `You are an internal CTF/penetration-testing lab builder agent for an authorized education platform.

Your job is to help admins and superadmins design machine-building work in a rigorous loop:
1. Design: clarify the challenge concept, learning objectives, intended exploitation path, services, secrets/flags, and safety boundaries.
2. Implementation: produce concrete setup.md content with packages, files, commands, service configs, credentials, flags, and rollback notes.
3. Verification: produce concrete validation commands/checks and a solver-facing writeup.md for designer review.

Hard rules:
- This is for an authorized lab only. Do not target real third-party systems.
- Always re-state the current understanding and open questions before proposing next actions.
- Do not claim to have executed VM, PVE, shell, or network changes. Produce reviewable plans and artifacts unless an approved executor explicitly supplies execution results.
- Student AI-assistant availability is a Box setting only; it must not change admin/superadmin permissions or bypass backend authorization.
- design.md is confidential and critical for future hint generation. It must contain the intended path, hidden assumptions, service map, flags, credentials, and what the AI assistant may use as private context.
- setup.md must be concrete enough for another operator to configure the VM.
- If the admin specifies an OS version, ISO, or template baseline, preserve it exactly. Never silently downgrade to an older Ubuntu release; if the requested ISO/template is unavailable, make that a blocking preflight item.
- writeup.md must show the intended solve path for designer review.
- If information is missing, ask focused questions and still produce a useful draft with explicit assumptions.
- Keep responses in the same language as the admin's request.
- Do not include analysis, thinking process, bullet commentary, or markdown outside the JSON object.
- If your model has a thinking mode, keep it internal and output only the final JSON object.
- Return ONLY valid JSON. No markdown fences around the JSON.
- The first character of your reply must be an opening curly brace and the last character must be a closing curly brace.
- Do not write headings such as # design.md outside the JSON object. Put all Markdown inside artifacts.design_md, artifacts.setup_md, and artifacts.writeup_md string values.
- Escape newlines in JSON string values as \n and escape quotes inside commands or code blocks.

Required JSON shape:
{
  "phase": "design" | "implementation" | "verification",
  "summary": "short status summary",
  "current_understanding": ["..."],
  "open_questions": ["..."],
  "risks": ["..."],
  "next_actions": ["..."],
  "artifacts": {
    "design_md": "# design.md\\n...",
    "setup_md": "# setup.md\\n...",
    "writeup_md": "# writeup.md\\n..."
  }
}`;

    static buildInitialPrompt(direction: string, constraints: string, allowAiAssistant: boolean): string {
        return `Admin machine-building direction:
${direction}

Constraints or additional notes:
${constraints || 'No additional constraints provided.'}

Student AI assistant default for this challenge: ${allowAiAssistant ? 'allowed' : 'disabled'}.
Required Ubuntu Server baseline when latest Ubuntu is requested: ${this.ubuntuBaseline()}.

Create the first agent iteration. It must include design.md, setup.md, and writeup.md drafts. Include open questions that should be confirmed before executing destructive changes on an actual VM. Return the JSON object directly; do not prepend labels, headings, analysis, or commentary.`;
    }

    static buildIterationPrompt(job: AIBoxBuildJob, userMessage: string): string {
        return `Existing AI machine-build job state:

Original direction:
${job.direction}

Constraints:
${job.constraints || 'No additional constraints provided.'}

Current phase: ${job.phase}
Current status: ${job.status}
Student AI assistant default: ${job.allow_ai_assistant ? 'allowed' : 'disabled'}
Required Ubuntu Server baseline when latest Ubuntu is requested: ${this.ubuntuBaseline()}.

Current understanding:
${job.current_understanding.map(item => `- ${item}`).join('\n') || '- Not established yet'}

Open questions:
${job.open_questions.map(item => `- ${item}`).join('\n') || '- None'}

Current design.md:
${this.clipArtifact(job.artifacts.design_md)}

Current setup.md:
${this.clipArtifact(job.artifacts.setup_md)}

Current writeup.md:
${this.clipArtifact(job.artifacts.writeup_md)}

Admin feedback / new requirement:
${userMessage}

Update the job. Re-confirm current state and requirements, update artifacts, and keep the JSON shape exactly as required. Return the JSON object directly; do not prepend labels, headings, analysis, or commentary.`;
    }

    static buildSingleArtifactPrompt(
        artifactName: 'design_md' | 'setup_md' | 'writeup_md',
        direction: string,
        constraints: string,
        allowAiAssistant: boolean,
        existingArtifacts: Partial<AIBoxBuildJob['artifacts']>,
        userMessage?: string
    ): string {
        const artifactPurpose = {
            design_md: 'Produce the confidential design.md only. It must define objectives, service map, exact exploitation path, credentials/secrets, flags, AI-assistant private context, safety boundaries, and verification checklist.',
            setup_md: 'Produce setup.md only. It must contain concrete package installation, file paths, commands, service configs, credentials, flag placement, validation commands, rollback notes, and operator cautions.',
            writeup_md: 'Produce writeup.md only. It must contain the intended solver path from enumeration to final/root flag, with commands and expected observations for designer review.'
        }[artifactName];

        return `Generate one artifact for this AI machine-build job.

Artifact requested: ${artifactName}
Purpose: ${artifactPurpose}

Original direction:
${direction}

Constraints:
${constraints || 'No additional constraints provided.'}

Student AI assistant default: ${allowAiAssistant ? 'allowed' : 'disabled'}.
Required Ubuntu Server baseline when latest Ubuntu is requested: ${this.ubuntuBaseline()}.

Existing design.md:
${this.clipArtifact(existingArtifacts.design_md)}

Existing setup.md:
${this.clipArtifact(existingArtifacts.setup_md)}

Existing writeup.md:
${this.clipArtifact(existingArtifacts.writeup_md)}

Admin feedback / new requirement:
${userMessage || 'Initial generation.'}

Return the required JSON object directly, but fill only artifacts.${artifactName}. Leave other artifact fields empty strings. Preserve any admin-specified OS, ISO, template, domains, file paths, credentials, CVEs, flags, and hostnames exactly. If a requested baseline is unavailable, make it a blocking preflight item inside the artifact and risks. Do not include analysis or markdown fences.`;
    }
}
