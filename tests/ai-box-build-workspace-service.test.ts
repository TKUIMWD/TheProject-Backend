import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
    AIBoxBuildExecutionStatus,
    AIBoxBuildJobStatus,
    AIBoxBuildPhase
} from "../src/interfaces/AIBoxBuildJob";
import { AIBoxBuildWorkspaceService } from "../src/modules/ai-box-build/AIBoxBuildWorkspaceService";

const tempRoots: string[] = [];

async function makeTempRoot() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-box-workspace-service-"));
    tempRoots.push(root);
    return root;
}

function makeJob(referencePath?: string) {
    return {
        _id: "job-1",
        requester_user_id: "user-1",
        requester_role: "admin",
        direction: "Build a Linux web exploitation lab",
        constraints: referencePath ? `reference_bundle_path: ${referencePath}` : "",
        allow_ai_assistant: true,
        status: AIBoxBuildJobStatus.awaiting_review,
        phase: AIBoxBuildPhase.design,
        summary: "",
        current_understanding: [],
        open_questions: [],
        risks: [],
        next_actions: [],
        artifacts: {
            design_md: "# design.md\n\nUse latest Ubuntu.",
            setup_md: "# setup.md\n\nRun generated setup script.",
            writeup_md: "# writeup.md\n\nSolve path."
        },
        validation_report: {
            status: "pass",
            blockers: [],
            warnings: [],
            passed_checks: [],
            artifact_checks: {
                design_md: [],
                setup_md: [],
                writeup_md: []
            },
            requirement_checks: [],
            generated_at: new Date("2026-05-26T00:00:00.000Z")
        },
        messages: [],
        execution_status: AIBoxBuildExecutionStatus.idle,
        created_at: new Date("2026-05-26T00:00:00.000Z"),
        updated_at: new Date("2026-05-26T00:00:00.000Z")
    };
}

function makeRunConfig() {
    return {
        template_id: "template-1",
        target: "pve-a",
        name: "ai-box-job-1",
        cpuCores: 2,
        memorySize: 4096,
        diskSize: 40,
        dry_run: true
    } as any;
}

function makeService(options: {
    workspaceRoot: string;
    referenceRoot: string;
    referenceFallbackAssetRoot?: string;
    job?: any;
}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const job = options.job ?? makeJob();
    const jobRepository = {
        findById: async (jobId: string) => {
            calls.push({ method: "findById", args: [jobId] });
            return job;
        },
        updateById: async (jobId: string, update: unknown) => {
            calls.push({ method: "updateById", args: [jobId, update] });
        }
    };

    return {
        calls,
        service: new AIBoxBuildWorkspaceService({
            jobRepository,
            config: {
                workspaceRoot: options.workspaceRoot,
                referenceRoot: options.referenceRoot,
                referenceMaxFiles: 10,
                referenceMaxBytes: 10000,
                rawModel: "gpt-test",
                openAIBaseUrl: "https://ai.example.test/v1",
                latestUbuntuServer: "26.04",
                ...(options.referenceFallbackAssetRoot ? { referenceFallbackAssetRoot: options.referenceFallbackAssetRoot } : {})
            }
        })
    };
}

afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

describe("AIBoxBuildWorkspaceService", () => {
    it("prepares an opencode workspace and stages safe reference files", async () => {
        const root = await makeTempRoot();
        const workspaceRoot = path.join(root, "workspaces");
        const referenceRoot = path.join(root, "references");
        const bundlePath = path.join(referenceRoot, "bundle-1");
        await fs.mkdir(path.join(bundlePath, "docs"), { recursive: true });
        await fs.mkdir(path.join(bundlePath, ".git"), { recursive: true });
        await fs.writeFile(path.join(bundlePath, "docs", "guide.md"), "# guide", "utf8");
        await fs.writeFile(path.join(bundlePath, ".git", "ignored"), "ignored", "utf8");

        const job = makeJob(bundlePath);
        const { service, calls } = makeService({ workspaceRoot, referenceRoot, job });

        const workspacePath = await service.prepareOpencodeWorkspace({
            jobId: "job-1",
            job,
            config: makeRunConfig(),
            vmContext: {
                pveNode: "pve-a",
                pveVmid: "101",
                vmIp: "10.0.0.5",
                sshUser: "student"
            }
        });

        expect(workspacePath).toBe(path.join(workspaceRoot, "job-1"));
        await expect(fs.readFile(path.join(workspacePath, "design.md"), "utf8")).resolves.toContain("# design.md");
        await expect(fs.readFile(path.join(workspacePath, "reference", "bundle-1", "docs", "guide.md"), "utf8")).resolves.toBe("# guide");
        await expect(fs.stat(path.join(workspacePath, "reference", "bundle-1", ".git")).catch(() => null)).resolves.toBeNull();

        const context = JSON.parse(await fs.readFile(path.join(workspacePath, "build-context.json"), "utf8"));
        expect(context).toMatchObject({
            reference_bundle: {
                relative_path: "reference/bundle-1",
                file_count: 1
            },
            provisioning: {
                template_id: "template-1",
                dry_run: true
            },
            vm: {
                ip: "10.0.0.5",
                ssh_user: "student"
            }
        });
        await expect(fs.readFile(path.join(workspacePath, "opencode.json"), "utf8")).resolves.toContain("gpt-test");
        expect(calls).toEqual([
            {
                method: "updateById",
                args: [
                    "job-1",
                    expect.objectContaining({
                        workspace_path: workspacePath,
                        updated_at: expect.any(Date)
                    })
                ]
            }
        ]);
    });

    it("refreshes job artifacts from workspace files", async () => {
        const root = await makeTempRoot();
        const workspaceRoot = path.join(root, "workspaces");
        const referenceRoot = path.join(root, "references");
        const workspacePath = path.join(workspaceRoot, "job-1");
        await fs.mkdir(path.join(workspacePath, "generated"), { recursive: true });
        await fs.writeFile(path.join(workspacePath, "design.md"), "# design.md\n\nUse latest Ubuntu.", "utf8");
        await fs.writeFile(path.join(workspacePath, "setup.md"), "# setup.md\n\nRun the generated setup script.", "utf8");
        await fs.writeFile(path.join(workspacePath, "writeup.md"), "# writeup.md\n\nExploit path.", "utf8");
        await fs.writeFile(path.join(workspacePath, "generated", "setup.sh"), "#!/usr/bin/env bash\napt-get update", "utf8");

        const { service, calls } = makeService({
            workspaceRoot,
            referenceRoot,
            job: {
                ...makeJob(),
                direction: "Build this on latest Ubuntu"
            }
        });

        await service.refreshArtifactsFromWorkspace("job-1", workspacePath);

        expect(calls).toHaveLength(2);
        expect(calls[0]).toEqual({ method: "findById", args: ["job-1"] });
        expect(calls[1]).toEqual({
            method: "updateById",
            args: [
                "job-1",
                expect.objectContaining({
                    artifacts: expect.objectContaining({
                        design_md: expect.stringContaining("Ubuntu Server 26.04"),
                        setup_md: expect.stringContaining("apt-get update"),
                        writeup_md: expect.stringContaining("Ubuntu Server 26.04")
                    }),
                    updated_at: expect.any(Date)
                })
            ]
        });
    });

    it("deletes only the exact job workspace", async () => {
        const root = await makeTempRoot();
        const workspaceRoot = path.join(root, "workspaces");
        const referenceRoot = path.join(root, "references");
        const workspacePath = path.join(workspaceRoot, "job-1");
        await fs.mkdir(workspacePath, { recursive: true });

        const { service } = makeService({ workspaceRoot, referenceRoot });

        await service.deleteJobWorkspace("job-1", workspacePath);

        await expect(fs.stat(workspacePath).catch(() => null)).resolves.toBeNull();
        await expect(service.deleteJobWorkspace("job-1", path.join(workspaceRoot, "job-2"))).rejects.toThrow(
            "Refusing to delete AI build workspace because the path does not match the job workspace"
        );
    });

    it("validates generated scripts and writes reference fallback files", async () => {
        const root = await makeTempRoot();
        const workspaceRoot = path.join(root, "workspaces");
        const referenceRoot = path.join(root, "references");
        const assetRoot = path.join(root, "assets");
        const workspacePath = path.join(workspaceRoot, "job-1");
        await fs.mkdir(path.join(workspacePath, "generated"), { recursive: true });
        await fs.writeFile(path.join(workspacePath, "generated", "setup.sh"), "#!/usr/bin/env bash\nset -euo pipefail\napt-get update\n", "utf8");
        await fs.writeFile(path.join(workspacePath, "generated", "validation.sh"), "#!/usr/bin/env bash\nset -euo pipefail\nexit 0\n", "utf8");

        await fs.mkdir(path.join(workspacePath, "reference", "114-2-midterm_v2", "Lab"), { recursive: true });
        await fs.mkdir(path.join(workspacePath, "reference", "114-2-midterm_v2", "Writeup"), { recursive: true });
        await fs.writeFile(path.join(workspacePath, "reference", "114-2-midterm_v2", "Lab", "setup.md"), "TODO: setup notes", "utf8");
        await fs.writeFile(path.join(workspacePath, "reference", "114-2-midterm_v2", "Lab", "modify_for_ethci.md"), "ETHCI notes", "utf8");
        await fs.writeFile(path.join(workspacePath, "reference", "114-2-midterm_v2", "Writeup", "Writeup.md"), "flow.htb writeup", "utf8");
        await fs.mkdir(assetRoot, { recursive: true });
        await fs.writeFile(path.join(assetRoot, "setup.sh"), "#!/usr/bin/env bash\necho setup", "utf8");
        await fs.writeFile(path.join(assetRoot, "validation.sh"), "#!/usr/bin/env bash\necho validation", "utf8");

        const { service } = makeService({
            workspaceRoot,
            referenceRoot,
            referenceFallbackAssetRoot: assetRoot
        });

        await expect(service.ensureGeneratedScript(workspacePath, "setup.sh")).resolves.toBeUndefined();
        await expect(service.writeReferenceFallbackFiles(workspacePath, "test failure")).resolves.toBe(true);

        await expect(fs.readFile(path.join(workspacePath, "design.md"), "utf8")).resolves.toContain("test failure");
        await expect(fs.readFile(path.join(workspacePath, "setup.md"), "utf8")).resolves.toContain("Intentional draft note");
        await expect(fs.readFile(path.join(workspacePath, "writeup.md"), "utf8")).resolves.toContain("flow.ethci");
        await expect(fs.readFile(path.join(workspacePath, "generated", "validation.sh"), "utf8")).resolves.toContain("echo validation");
    });
});
