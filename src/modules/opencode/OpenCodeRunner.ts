import { spawn } from "child_process";

export type CommandResult = {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
};

export type CommandRunOptions = {
    cwd?: string;
    timeoutMs: number;
    env?: NodeJS.ProcessEnv;
    input?: string;
};

export class OpenCodeRunner {
    public runCommand(command: string, args: string[], options: CommandRunOptions): Promise<CommandResult> {
        return new Promise((resolve) => {
            const detached = process.platform !== "win32";
            const child = spawn(command, args, {
                cwd: options.cwd,
                env: options.env,
                shell: false,
                detached
            });

            let stdout = "";
            let stderr = "";
            let timedOut = false;
            let settled = false;
            let timer: NodeJS.Timeout;
            const finish = (result: CommandResult) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(result);
            };
            const killChild = (signal: NodeJS.Signals) => {
                try {
                    if (detached && child.pid) {
                        process.kill(-child.pid, signal);
                    } else {
                        child.kill(signal);
                    }
                } catch {
                    try {
                        child.kill(signal);
                    } catch {
                        // process already exited
                    }
                }
            };
            timer = setTimeout(() => {
                timedOut = true;
                killChild("SIGTERM");
                setTimeout(() => killChild("SIGKILL"), 5000).unref();
            }, options.timeoutMs);

            child.stdout?.on("data", (chunk) => {
                stdout += chunk.toString();
                stdout = this.tail(stdout, 24000);
            });
            child.stderr?.on("data", (chunk) => {
                stderr += chunk.toString();
                stderr = this.tail(stderr, 24000);
            });
            child.on("error", (error) => {
                finish({ exitCode: 127, stdout, stderr: `${stderr}\n${error.message}`.trim(), timedOut });
            });
            child.on("close", (code) => {
                finish({ exitCode: code, stdout, stderr, timedOut });
            });
            if (options.input !== undefined) {
                child.stdin?.write(options.input);
            }
            child.stdin?.end();
        });
    }

    public summarizeCommandResult(label: string, result: CommandResult): string {
        const parts = [
            `${label} exit=${result.exitCode ?? "unknown"}${result.timedOut ? " timeout=true" : ""}`,
            result.stdout ? `stdout:\n${this.tail(result.stdout.trim(), 2500)}` : "",
            result.stderr ? `stderr:\n${this.tail(result.stderr.trim(), 2500)}` : ""
        ].filter(Boolean);
        return parts.join("\n");
    }

    private tail(value: string, maxLength: number): string {
        if (value.length <= maxLength) return value;
        return value.slice(value.length - maxLength);
    }
}

export const openCodeRunner = new OpenCodeRunner();
