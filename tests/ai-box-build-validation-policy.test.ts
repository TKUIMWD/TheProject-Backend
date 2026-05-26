import { describe, expect, it } from "vitest";
import { validateAIBoxBuildArtifacts, containsConcreteSetupCommand } from "../src/modules/ai-box-build/AIBoxBuildValidationPolicy";

const longDesign = `# design.md

Learning objectives cover service enumeration and exploit planning.
Service map: HTTP on port 80 for target.example.test.
Intended attack path uses CVE-2024-12345 to gain access.
Credentials, passwords, and flags are documented for reviewers.
AI assistant private context contains hint boundaries.
${"design detail ".repeat(50)}`;

const longSetup = `# setup.md

Install packages and configure services.

\`\`\`bash
apt-get update
apt-get install -y nginx
mkdir -p /opt/lab
echo flag > /root/root.txt
systemctl restart nginx
curl -f http://127.0.0.1/
\`\`\`

Verification checks use curl and systemctl status.
${"setup detail ".repeat(50)}`;

const longWriteup = `# writeup.md

Start with nmap enumeration and virtual host discovery.
Exploit CVE-2024-12345 with a payload to obtain a shell.
Capture the user flag from /home/student/user.txt.
Use sudo privilege escalation to read /root/root.txt.
${"writeup detail ".repeat(50)}`;

describe("AIBoxBuildValidationPolicy", () => {
    it("passes complete artifacts that preserve required references", () => {
        const report = validateAIBoxBuildArtifacts({
            direction: "Build latest Ubuntu lab for target.example.test using CVE-2024-12345 and /opt/lab",
            constraints: "Use Ubuntu 26.04",
            allowAiAssistant: true,
            latestUbuntuServer: "26.04",
            artifacts: {
                design_md: `${longDesign}\nUbuntu 26.04\n/opt/lab`,
                setup_md: `${longSetup}\nUbuntu 26.04\n/opt/lab`,
                writeup_md: `${longWriteup}\nUbuntu 26.04\ntarget.example.test\nCVE-2024-12345`
            },
            now: new Date("2026-05-01T00:00:00.000Z")
        });

        expect(report.status).toBe("pass");
        expect(report.blockers).toEqual([]);
        expect(report.passed_checks).toContain("Ubuntu baseline preserved: 26.04");
        expect(report.requirement_checks).toContain("found: host/domain target.example.test");
        expect(report.generated_at).toEqual(new Date("2026-05-01T00:00:00.000Z"));
    });

    it("blocks missing setup commands, flags, placeholders, and required references", () => {
        const report = validateAIBoxBuildArtifacts({
            direction: "Build a lab for missing.example.test with /etc/secret.conf",
            constraints: "",
            allowAiAssistant: false,
            latestUbuntuServer: "26.04",
            artifacts: {
                design_md: `${longDesign}\nTODO finish`,
                setup_md: "setup notes without commands".repeat(30),
                writeup_md: longWriteup
            },
            agentError: "model failed"
        });

        expect(report.status).toBe("blocked");
        expect(report.blockers).toContain("AI service failed before validation completed: model failed");
        expect(report.blockers).toContain("design_md contains placeholders that must be resolved before approval.");
        expect(report.blockers).toContain("setup.md must include concrete operator commands.");
        expect(report.blockers).toContain("setup.md must include flag placement/configuration.");
        expect(report.blockers).toContain("Missing required reference from direction/constraints: host/domain missing.example.test");
        expect(report.blockers).toContain("Missing required reference from direction/constraints: path /etc/secret.conf");
    });

    it("warns when AI assistant wording conflicts with disabled setting", () => {
        const report = validateAIBoxBuildArtifacts({
            direction: "Build an internal lab",
            constraints: "",
            allowAiAssistant: false,
            latestUbuntuServer: "26.04",
            artifacts: {
                design_md: `${longDesign}\nAllow students to ask the assistant for hints.`,
                setup_md: longSetup,
                writeup_md: longWriteup
            }
        });

        expect(report.status).toBe("warning");
        expect(report.warnings).toContain("AI assistant is disabled by default, but design.md wording may imply students can ask it.");
        expect(report.passed_checks).toContain("Student AI assistant default is disabled and remains a Box setting.");
    });

    it("detects concrete setup commands", () => {
        expect(containsConcreteSetupCommand("systemctl restart nginx")).toBe(true);
        expect(containsConcreteSetupCommand("describe the deployment")).toBe(false);
    });
});
