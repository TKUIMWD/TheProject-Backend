import path from "path";
import { ensureSetupMarkdownHasGeneratedCommands, ensureUbuntuBaselineInMarkdown } from "./AIBoxBuildMarkdownPolicy";

export function buildJobWorkspacePath(workspaceRoot: string, jobId: string): string {
    return path.join(workspaceRoot, jobId);
}

export function buildAIBoxBuildWorkspaceContext(input: {
    direction: string;
    constraints?: string;
    allowAiAssistant: boolean;
    referenceBundle: unknown;
    provisioning: {
        templateId: string;
        targetNode: string;
        vmName: string;
        cpuCores: number;
        memoryMb: number;
        diskGb: number;
        dryRun?: boolean;
    };
    vm: {
        pveNode?: string;
        pveVmid?: string;
        vmIp?: string;
        sshUser?: string;
    };
}): Record<string, unknown> {
    return {
        direction: input.direction,
        constraints: input.constraints,
        allow_ai_assistant: input.allowAiAssistant,
        reference_bundle: input.referenceBundle,
        provisioning: {
            template_id: input.provisioning.templateId,
            target_node: input.provisioning.targetNode,
            vm_name: input.provisioning.vmName,
            cpu_cores: input.provisioning.cpuCores,
            memory_mb: input.provisioning.memoryMb,
            disk_gb: input.provisioning.diskGb,
            dry_run: input.provisioning.dryRun
        },
        vm: {
            pve_node: input.vm.pveNode,
            pve_vmid: input.vm.pveVmid,
            ip: input.vm.vmIp,
            ssh_user: input.vm.sshUser
        }
    };
}

export function buildAIBoxWorkspaceArtifactRefreshUpdate(input: {
    designMdRaw: string;
    setupMdRaw: string;
    writeupMdRaw: string;
    setupScript?: string;
    direction?: string;
    constraints?: string;
    latestUbuntuServer: string;
    now?: Date;
}): {
    artifacts: {
        design_md: string;
        setup_md: string;
        writeup_md: string;
    };
    updated_at: Date;
} {
    const sourceText = `${input.direction || ""}\n${input.constraints || ""}`;
    const designMd = ensureUbuntuBaselineInMarkdown(input.designMdRaw, sourceText, input.latestUbuntuServer);
    const setupMdWithBaseline = ensureUbuntuBaselineInMarkdown(input.setupMdRaw, sourceText, input.latestUbuntuServer);
    const setupMd = ensureSetupMarkdownHasGeneratedCommands(setupMdWithBaseline, input.setupScript || "");
    const writeupMd = ensureUbuntuBaselineInMarkdown(input.writeupMdRaw, sourceText, input.latestUbuntuServer);

    return {
        artifacts: {
            design_md: designMd,
            setup_md: setupMd,
            writeup_md: writeupMd
        },
        updated_at: input.now || new Date()
    };
}

export function validateJobWorkspaceDeletion(
    workspaceRoot: string,
    jobId: string,
    workspacePath: string
): { valid: true; rootPath: string; targetPath: string } | { valid: false; message: string } {
    const rootPath = path.resolve(workspaceRoot);
    const targetPath = path.resolve(workspacePath);
    const expectedPath = path.resolve(rootPath, jobId);

    if (targetPath !== expectedPath) {
        return { valid: false, message: "Refusing to delete AI build workspace because the path does not match the job workspace" };
    }

    if (!isPathInside(targetPath, rootPath)) {
        return { valid: false, message: "Refusing to delete AI build workspace outside configured workspace root" };
    }

    return { valid: true, rootPath, targetPath };
}

export function validateReferenceBundlePath(
    referenceRoot: string,
    referencePath: string
): { valid: true; rootPath: string; sourcePath: string } | { valid: false; message: string } {
    const rootPath = path.resolve(referenceRoot);
    const sourcePath = path.resolve(referencePath);

    if (sourcePath !== rootPath && !isPathInside(sourcePath, rootPath)) {
        return { valid: false, message: "Reference bundle path must be inside the configured AI build reference root" };
    }

    return { valid: true, rootPath, sourcePath };
}

export function isPathInside(targetPath: string, rootPath: string): boolean {
    const relative = path.relative(rootPath, targetPath);
    return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}
