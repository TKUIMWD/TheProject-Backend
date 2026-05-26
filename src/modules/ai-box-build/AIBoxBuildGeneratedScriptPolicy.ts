import * as path from "path";
import { AIBoxBuildScriptName } from "./AIBoxBuildSSHExecutionPolicy";

export function buildGeneratedScriptPath(workspacePath: string, scriptName: AIBoxBuildScriptName): string {
    return path.join(workspacePath, "generated", scriptName);
}

export function buildMissingGeneratedScriptMessage(scriptName: AIBoxBuildScriptName): string {
    return `opencode did not generate generated/${scriptName}`;
}

export function buildUnusableGeneratedScriptMessage(scriptName: AIBoxBuildScriptName): string {
    return `generated/${scriptName} is not a usable bash script`;
}

export function validateGeneratedScriptContent(
    scriptName: AIBoxBuildScriptName,
    content: string
): { valid: true } | { valid: false; message: string } {
    if (!content.includes("#!") || content.trim().length < 40) {
        return { valid: false, message: buildUnusableGeneratedScriptMessage(scriptName) };
    }

    return { valid: true };
}
