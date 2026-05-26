import * as path from "path";

export type AIBoxBuildScriptName = "setup.sh" | "validation.sh";

export type AIBoxBuildSSHExecutionPlan = {
    sshUser: string;
    remoteTarget: string;
    localScript: string;
    localReference: string;
    remoteDir: string;
    remoteScript: string;
    sshOptions: string[];
    mkdirArgs: string[];
    removeReferenceArgs: string[];
    uploadReferenceArgs: string[];
    uploadScriptArgs: string[];
    runScriptArgs: string[];
    runInput?: string;
    uploadLogMessage: string;
    referenceUploadLogMessage: string;
};

export function buildAIBoxBuildSSHExecutionPlan(input: {
    workspacePath: string;
    scriptName: AIBoxBuildScriptName;
    vmIp: string;
    sshUser?: string;
    sshPassword?: string;
}): AIBoxBuildSSHExecutionPlan {
    const sshUser = input.sshUser || "root";
    const remoteTarget = `${sshUser}@${input.vmIp}`;
    const localScript = path.join(input.workspacePath, "generated", input.scriptName);
    const localReference = path.join(input.workspacePath, "reference");
    const remoteDir = "/tmp/cstg-ai-build";
    const remoteScript = `${remoteDir}/${input.scriptName}`;
    const sshOptions = [
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "ConnectTimeout=20"
    ];
    const remoteCommand = sshUser === "root"
        ? `bash ${remoteScript}`
        : `sudo -S -p '' bash ${remoteScript}`;

    return {
        sshUser,
        remoteTarget,
        localScript,
        localReference,
        remoteDir,
        remoteScript,
        sshOptions,
        mkdirArgs: ["-e", "ssh", ...sshOptions, remoteTarget, `mkdir -p ${remoteDir}`],
        removeReferenceArgs: ["-e", "ssh", ...sshOptions, remoteTarget, `rm -rf ${remoteDir}/reference`],
        uploadReferenceArgs: ["-e", "scp", "-r", ...sshOptions, localReference, `${remoteTarget}:${remoteDir}/reference`],
        uploadScriptArgs: ["-e", "scp", ...sshOptions, localScript, `${remoteTarget}:${remoteScript}`],
        runScriptArgs: ["-e", "ssh", ...sshOptions, remoteTarget, remoteCommand],
        runInput: sshUser === "root" ? undefined : `${input.sshPassword || ""}\n`,
        uploadLogMessage: `Uploading ${input.scriptName} to ${remoteTarget}.`,
        referenceUploadLogMessage: `Uploading reference bundle to ${remoteTarget}.`
    };
}
