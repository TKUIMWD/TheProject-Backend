import path from "path";
import { describe, expect, it } from "vitest";
import {
    buildAIBoxWorkspaceArtifactRefreshUpdate,
    buildAIBoxBuildWorkspaceContext,
    buildJobWorkspacePath,
    isPathInside,
    validateJobWorkspaceDeletion,
    validateReferenceBundlePath
} from "../src/modules/ai-box-build/AIBoxBuildWorkspacePolicy";

describe("AIBoxBuildWorkspacePolicy", () => {
    it("builds deterministic job workspace paths", () => {
        expect(buildJobWorkspacePath("/tmp/workspaces", "job-1")).toBe(path.join("/tmp/workspaces", "job-1"));
    });

    it("builds stable opencode workspace context payloads", () => {
        expect(buildAIBoxBuildWorkspaceContext({
            direction: "Build a web exploitation lab",
            constraints: "Ubuntu latest",
            allowAiAssistant: false,
            referenceBundle: {
                relative_path: "reference/lab",
                file_count: 3,
                total_bytes: 1024
            },
            provisioning: {
                templateId: "template-1",
                targetNode: "pve-a",
                vmName: "ai-box-1",
                cpuCores: 2,
                memoryMb: 4096,
                diskGb: 32,
                dryRun: true
            },
            vm: {
                pveNode: "pve-a",
                pveVmid: "101",
                vmIp: "10.0.0.5",
                sshUser: "student"
            }
        })).toEqual({
            direction: "Build a web exploitation lab",
            constraints: "Ubuntu latest",
            allow_ai_assistant: false,
            reference_bundle: {
                relative_path: "reference/lab",
                file_count: 3,
                total_bytes: 1024
            },
            provisioning: {
                template_id: "template-1",
                target_node: "pve-a",
                vm_name: "ai-box-1",
                cpu_cores: 2,
                memory_mb: 4096,
                disk_gb: 32,
                dry_run: true
            },
            vm: {
                pve_node: "pve-a",
                pve_vmid: "101",
                ip: "10.0.0.5",
                ssh_user: "student"
            }
        });
    });

    it("builds refreshed artifact update payloads from workspace files", () => {
        const now = new Date("2026-05-26T00:00:00.000Z");
        const update = buildAIBoxWorkspaceArtifactRefreshUpdate({
            designMdRaw: "# design.md\n\nUse nginx.",
            setupMdRaw: "# setup.md\n\nReview generated setup script.",
            writeupMdRaw: "# writeup.md\n\nExploit path.",
            setupScript: "#!/usr/bin/env bash\napt-get update\nsystemctl restart nginx",
            direction: "Build this on latest Ubuntu",
            constraints: "",
            latestUbuntuServer: "26.04",
            now
        });

        expect(update.updated_at).toBe(now);
        expect(update.artifacts.design_md).toContain("Ubuntu Server 26.04");
        expect(update.artifacts.setup_md).toContain("Ubuntu Server 26.04");
        expect(update.artifacts.setup_md).toContain("## Generated Setup Command Plan");
        expect(update.artifacts.setup_md).toContain("apt-get update");
        expect(update.artifacts.writeup_md).toContain("Ubuntu Server 26.04");
    });

    it("checks whether a target path is inside a root path", () => {
        expect(isPathInside("/tmp/root/job-1", "/tmp/root")).toBe(true);
        expect(isPathInside("/tmp/root", "/tmp/root")).toBe(false);
        expect(isPathInside("/tmp/other/job-1", "/tmp/root")).toBe(false);
    });

    it("allows deletion only for the exact job workspace", () => {
        expect(validateJobWorkspaceDeletion("/tmp/workspaces", "job-1", "/tmp/workspaces/job-1")).toEqual({
            valid: true,
            rootPath: path.resolve("/tmp/workspaces"),
            targetPath: path.resolve("/tmp/workspaces/job-1")
        });
    });

    it("rejects workspace deletion when path does not match the job", () => {
        expect(validateJobWorkspaceDeletion("/tmp/workspaces", "job-1", "/tmp/workspaces/job-2")).toEqual({
            valid: false,
            message: "Refusing to delete AI build workspace because the path does not match the job workspace"
        });
    });

    it("rejects reference paths outside the configured root", () => {
        expect(validateReferenceBundlePath("/tmp/references", "/tmp/outside")).toEqual({
            valid: false,
            message: "Reference bundle path must be inside the configured AI build reference root"
        });
    });

    it("allows reference root and child paths", () => {
        expect(validateReferenceBundlePath("/tmp/references", "/tmp/references")).toEqual({
            valid: true,
            rootPath: path.resolve("/tmp/references"),
            sourcePath: path.resolve("/tmp/references")
        });
        expect(validateReferenceBundlePath("/tmp/references", "/tmp/references/bundle")).toEqual({
            valid: true,
            rootPath: path.resolve("/tmp/references"),
            sourcePath: path.resolve("/tmp/references/bundle")
        });
    });
});
