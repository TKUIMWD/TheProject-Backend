import * as path from "path";
import { describe, expect, it } from "vitest";
import { buildAIBoxBuildSSHExecutionPlan } from "../src/modules/ai-box-build/AIBoxBuildSSHExecutionPolicy";

describe("AIBoxBuildSSHExecutionPolicy", () => {
    it("builds root SSH/SCP execution arguments for generated scripts", () => {
        const plan = buildAIBoxBuildSSHExecutionPlan({
            workspacePath: "/tmp/workspace/job-1",
            scriptName: "setup.sh",
            vmIp: "10.0.0.5"
        });

        expect(plan).toMatchObject({
            sshUser: "root",
            remoteTarget: "root@10.0.0.5",
            localScript: path.join("/tmp/workspace/job-1", "generated", "setup.sh"),
            localReference: path.join("/tmp/workspace/job-1", "reference"),
            remoteDir: "/tmp/cstg-ai-build",
            remoteScript: "/tmp/cstg-ai-build/setup.sh",
            uploadLogMessage: "Uploading setup.sh to root@10.0.0.5.",
            referenceUploadLogMessage: "Uploading reference bundle to root@10.0.0.5."
        });
        expect(plan.mkdirArgs).toEqual([
            "-e", "ssh",
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "ConnectTimeout=20",
            "root@10.0.0.5",
            "mkdir -p /tmp/cstg-ai-build"
        ]);
        expect(plan.uploadScriptArgs).toEqual([
            "-e", "scp",
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "ConnectTimeout=20",
            path.join("/tmp/workspace/job-1", "generated", "setup.sh"),
            "root@10.0.0.5:/tmp/cstg-ai-build/setup.sh"
        ]);
        expect(plan.runScriptArgs.at(-1)).toBe("bash /tmp/cstg-ai-build/setup.sh");
        expect(plan.runInput).toBeUndefined();
    });

    it("builds sudo execution arguments for non-root SSH users", () => {
        const plan = buildAIBoxBuildSSHExecutionPlan({
            workspacePath: "/tmp/workspace/job-1",
            scriptName: "validation.sh",
            vmIp: "10.0.0.6",
            sshUser: "student",
            sshPassword: "secret"
        });

        expect(plan.remoteTarget).toBe("student@10.0.0.6");
        expect(plan.removeReferenceArgs).toEqual([
            "-e", "ssh",
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "ConnectTimeout=20",
            "student@10.0.0.6",
            "rm -rf /tmp/cstg-ai-build/reference"
        ]);
        expect(plan.uploadReferenceArgs).toEqual([
            "-e", "scp", "-r",
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "ConnectTimeout=20",
            path.join("/tmp/workspace/job-1", "reference"),
            "student@10.0.0.6:/tmp/cstg-ai-build/reference"
        ]);
        expect(plan.runScriptArgs.at(-1)).toBe("sudo -S -p '' bash /tmp/cstg-ai-build/validation.sh");
        expect(plan.runInput).toBe("secret\n");
    });
});
