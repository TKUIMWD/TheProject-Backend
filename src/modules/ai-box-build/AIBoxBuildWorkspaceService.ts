import * as fs from "fs/promises";
import * as path from "path";
import { env } from "../../config/env";
import { AIBoxBuildJob } from "../../interfaces/AIBoxBuildJob";
import { logger } from "../../middlewares/log";
import { AIBoxRunRequest } from "./AIBoxBuildRunPolicy";
import { normalizeAIBoxBuildArtifacts } from "./AIBoxBuildArtifactPolicy";
import {
    buildAIBoxBuildWorkspaceContext,
    buildAIBoxWorkspaceArtifactRefreshUpdate,
    buildJobWorkspacePath,
    validateJobWorkspaceDeletion,
    validateReferenceBundlePath
} from "./AIBoxBuildWorkspacePolicy";
import {
    extractReferenceBundlePath,
    buildReferenceFallbackWorkspaceFiles,
    safeReferenceBundleName,
    shouldIgnoreReferenceEntry
} from "./AIBoxBuildReferencePolicy";
import {
    buildAIBoxWorkspaceAgentInstructions,
    buildOpenCodeConfig
} from "./AIBoxBuildOpenCodePolicy";
import {
    buildGeneratedScriptPath,
    buildMissingGeneratedScriptMessage,
    validateGeneratedScriptContent
} from "./AIBoxBuildGeneratedScriptPolicy";
import { aiBoxBuildJobRepository } from "./AIBoxBuildJobRepository";

export type StagedReferenceBundle = {
    source_path: string;
    workspace_path: string;
    relative_path: string;
    file_count: number;
    total_bytes: number;
} | null;

type AIBoxBuildJobRepositoryPort = {
    findById(jobId: string): Promise<AIBoxBuildJob | null>;
    updateById(jobId: string, update: unknown): Promise<unknown>;
};

export type AIBoxBuildWorkspaceServiceConfig = {
    workspaceRoot: string;
    referenceRoot: string;
    referenceMaxFiles: number;
    referenceMaxBytes: number;
    rawModel: string;
    openAIBaseUrl: string;
    latestUbuntuServer: string;
    referenceFallbackAssetRoot: string;
};

export type AIBoxBuildWorkspaceServiceDeps = {
    jobRepository?: AIBoxBuildJobRepositoryPort;
    config?: Partial<AIBoxBuildWorkspaceServiceConfig>;
};

export class AIBoxBuildWorkspaceService {
    private readonly jobRepository: AIBoxBuildJobRepositoryPort;

    constructor(deps: AIBoxBuildWorkspaceServiceDeps = {}) {
        this.jobRepository = deps.jobRepository ?? aiBoxBuildJobRepository;
        this.configOverrides = deps.config ?? {};
    }

    private readonly configOverrides: Partial<AIBoxBuildWorkspaceServiceConfig>;

    public workspaceRoot(): string {
        return this.config().workspaceRoot;
    }

    public referenceRoot(): string {
        return this.config().referenceRoot;
    }

    public async prepareOpencodeWorkspace(input: {
        jobId: string;
        job: AIBoxBuildJob;
        config: AIBoxRunRequest;
        vmContext: { vmIp?: string; pveVmid?: string; pveNode?: string; sshUser?: string };
    }): Promise<string> {
        const config = this.config();
        const workspacePath = buildJobWorkspacePath(config.workspaceRoot, input.jobId);
        await fs.mkdir(path.join(workspacePath, "generated"), { recursive: true });

        const artifacts = normalizeAIBoxBuildArtifacts(input.job.artifacts, input.job.direction);
        await fs.writeFile(path.join(workspacePath, "design.md"), artifacts.design_md, "utf8");
        await fs.writeFile(path.join(workspacePath, "setup.md"), artifacts.setup_md, "utf8");
        await fs.writeFile(path.join(workspacePath, "writeup.md"), artifacts.writeup_md, "utf8");
        const stagedReferences = await this.stageReferenceBundle(workspacePath, input.job);
        const workspaceContext = buildAIBoxBuildWorkspaceContext({
            direction: input.job.direction,
            constraints: input.job.constraints,
            allowAiAssistant: input.job.allow_ai_assistant,
            referenceBundle: stagedReferences,
            provisioning: {
                templateId: input.config.template_id,
                targetNode: input.config.target,
                vmName: input.config.name,
                cpuCores: input.config.cpuCores,
                memoryMb: input.config.memorySize,
                diskGb: input.config.diskSize,
                dryRun: input.config.dry_run
            },
            vm: {
                pveNode: input.vmContext.pveNode,
                pveVmid: input.vmContext.pveVmid,
                vmIp: input.vmContext.vmIp,
                sshUser: input.vmContext.sshUser
            }
        });

        await fs.writeFile(path.join(workspacePath, "build-context.json"), JSON.stringify(workspaceContext, null, 2), "utf8");
        await fs.writeFile(path.join(workspacePath, "AGENTS.md"), buildAIBoxWorkspaceAgentInstructions(), "utf8");
        await fs.writeFile(path.join(workspacePath, "opencode.json"), buildOpenCodeConfig({
            rawModel: config.rawModel,
            baseUrl: config.openAIBaseUrl
        }), "utf8");
        await this.jobRepository.updateById(input.jobId, { workspace_path: workspacePath, updated_at: new Date() });
        return workspacePath;
    }

    public async refreshArtifactsFromWorkspace(jobId: string, workspacePath: string): Promise<void> {
        const [designMdRaw, setupMdRaw, writeupMdRaw, setupScript] = await Promise.all([
            fs.readFile(path.join(workspacePath, "design.md"), "utf8"),
            fs.readFile(path.join(workspacePath, "setup.md"), "utf8"),
            fs.readFile(path.join(workspacePath, "writeup.md"), "utf8"),
            fs.readFile(path.join(workspacePath, "generated", "setup.sh"), "utf8").catch(() => "")
        ]);
        const job = await this.jobRepository.findById(jobId);
        await this.jobRepository.updateById(
            jobId,
            buildAIBoxWorkspaceArtifactRefreshUpdate({
                designMdRaw,
                setupMdRaw,
                writeupMdRaw,
                setupScript,
                direction: job?.direction,
                constraints: job?.constraints,
                latestUbuntuServer: this.config().latestUbuntuServer
            })
        );
    }

    public async deleteJobWorkspace(jobId: string, workspacePath: string): Promise<void> {
        const pathValidation = validateJobWorkspaceDeletion(this.workspaceRoot(), jobId, workspacePath);
        if (!pathValidation.valid) throw new Error(pathValidation.message);
        const targetPath = pathValidation.targetPath;

        const stat = await fs.stat(targetPath).catch(() => null);
        if (!stat) {
            logger.warn(`AI build workspace already missing for job ${jobId}: ${targetPath}`);
            return;
        }
        if (!stat.isDirectory()) {
            throw new Error("Refusing to delete AI build workspace because target is not a directory");
        }

        await fs.rm(targetPath, { recursive: true, force: true });
        const remaining = await fs.stat(targetPath).catch(() => null);
        if (remaining) {
            throw new Error("AI build workspace deletion did not complete");
        }
    }

    public async ensureGeneratedScript(workspacePath: string, scriptName: "setup.sh" | "validation.sh"): Promise<void> {
        const scriptPath = buildGeneratedScriptPath(workspacePath, scriptName);
        const stat = await fs.stat(scriptPath).catch(() => null);
        if (!stat || !stat.isFile()) {
            throw new Error(buildMissingGeneratedScriptMessage(scriptName));
        }
        const content = await fs.readFile(scriptPath, "utf8");
        const validation = validateGeneratedScriptContent(scriptName, content);
        if (!validation.valid) throw new Error(validation.message);
        await fs.chmod(scriptPath, 0o700);
    }

    public async writeReferenceFallbackFiles(workspacePath: string, reason: string): Promise<boolean> {
        const referencePath = path.join(workspacePath, "reference", "114-2-midterm_v2");
        const referenceStat = await fs.stat(referencePath).catch(() => null);
        if (!referenceStat?.isDirectory()) return false;

        const assetRoot = this.config().referenceFallbackAssetRoot;
        const setupScript = await fs.readFile(path.join(assetRoot, "setup.sh"), "utf8").catch(() => "");
        const validationScript = await fs.readFile(path.join(assetRoot, "validation.sh"), "utf8").catch(() => "");
        if (!setupScript.trim() || !validationScript.trim()) return false;

        const referenceSetup = await fs.readFile(path.join(referencePath, "Lab", "setup.md"), "utf8").catch(() => "");
        const referenceEthci = await fs.readFile(path.join(referencePath, "Lab", "modify_for_ethci.md"), "utf8").catch(() => "");
        const referenceWriteup = await fs.readFile(path.join(referencePath, "Writeup", "Writeup.md"), "utf8").catch(() => "");
        const fallbackFiles = buildReferenceFallbackWorkspaceFiles({
            reason,
            referenceSetup,
            referenceEthci,
            referenceWriteup,
            setupScript
        });

        await fs.mkdir(path.join(workspacePath, "generated"), { recursive: true });
        await fs.writeFile(path.join(workspacePath, "design.md"), fallbackFiles.designMd, "utf8");
        await fs.writeFile(path.join(workspacePath, "setup.md"), fallbackFiles.setupMd, "utf8");
        await fs.writeFile(path.join(workspacePath, "writeup.md"), fallbackFiles.writeupMd, "utf8");
        await fs.writeFile(path.join(workspacePath, "generated", "setup.sh"), setupScript, "utf8");
        await fs.writeFile(path.join(workspacePath, "generated", "validation.sh"), validationScript, "utf8");
        await fs.chmod(path.join(workspacePath, "generated", "setup.sh"), 0o755);
        await fs.chmod(path.join(workspacePath, "generated", "validation.sh"), 0o755);
        return true;
    }

    private async stageReferenceBundle(workspacePath: string, job: AIBoxBuildJob): Promise<StagedReferenceBundle> {
        const referencePath = extractReferenceBundlePath(`${job.direction}\n${job.constraints || ""}`);
        if (!referencePath) return null;

        const config = this.config();
        const pathValidation = validateReferenceBundlePath(config.referenceRoot, referencePath);
        if (!pathValidation.valid) throw new Error(pathValidation.message);
        const sourcePath = pathValidation.sourcePath;

        const stat = await fs.stat(sourcePath).catch(() => null);
        if (!stat || !stat.isDirectory()) {
            throw new Error("Reference bundle path does not exist or is not a directory");
        }

        const summary = await this.summarizeReferenceDirectory(sourcePath);
        if (summary.fileCount > config.referenceMaxFiles) {
            throw new Error(`Reference bundle has too many files (${summary.fileCount}/${config.referenceMaxFiles})`);
        }
        if (summary.totalBytes > config.referenceMaxBytes) {
            throw new Error(`Reference bundle is too large (${summary.totalBytes}/${config.referenceMaxBytes} bytes)`);
        }

        const safeName = safeReferenceBundleName(sourcePath);
        const referenceRoot = path.join(workspacePath, "reference");
        const targetPath = path.join(referenceRoot, safeName);
        await fs.rm(targetPath, { recursive: true, force: true });
        await fs.mkdir(referenceRoot, { recursive: true });
        await fs.cp(sourcePath, targetPath, {
            recursive: true,
            dereference: false,
            filter: async (src) => {
                const name = path.basename(src);
                if (shouldIgnoreReferenceEntry(name)) return false;
                const entry = await fs.lstat(src).catch(() => null);
                return Boolean(entry && !entry.isSymbolicLink());
            }
        });

        return {
            source_path: sourcePath,
            workspace_path: targetPath,
            relative_path: path.relative(workspacePath, targetPath).replace(/\\/g, "/"),
            file_count: summary.fileCount,
            total_bytes: summary.totalBytes
        };
    }

    private async summarizeReferenceDirectory(sourcePath: string): Promise<{ fileCount: number; totalBytes: number }> {
        let fileCount = 0;
        let totalBytes = 0;
        const walk = async (dir: string): Promise<void> => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (shouldIgnoreReferenceEntry(entry.name)) continue;
                const fullPath = path.join(dir, entry.name);
                if (entry.isSymbolicLink()) continue;
                if (entry.isDirectory()) {
                    await walk(fullPath);
                    continue;
                }
                if (!entry.isFile()) continue;
                const stat = await fs.stat(fullPath);
                fileCount += 1;
                totalBytes += stat.size;
            }
        };
        await walk(sourcePath);
        return { fileCount, totalBytes };
    }

    private config(): AIBoxBuildWorkspaceServiceConfig {
        return {
            workspaceRoot: env.opencode.workdir || path.join(env.runtime.homeDir, ".cstg-ai-box-build-workspaces"),
            referenceRoot: env.opencode.referenceRoot || path.join(env.runtime.homeDir, ".cstg-ai-box-build-references"),
            referenceMaxFiles: env.opencode.referenceMaxFiles,
            referenceMaxBytes: env.opencode.referenceMaxBytes,
            rawModel: env.opencode.boxBuildModel || env.openai.boxBuildModel || env.openai.model,
            openAIBaseUrl: env.openai.baseUrl,
            latestUbuntuServer: env.openai.boxBuildUbuntuServerLts,
            referenceFallbackAssetRoot: path.join(process.cwd(), "src", "assets", "ai-box-build", "114-2-midterm-v2"),
            ...this.configOverrides
        };
    }
}

export const aiBoxBuildWorkspaceService = new AIBoxBuildWorkspaceService();
