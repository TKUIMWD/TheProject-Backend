import { describe, expect, it } from "vitest";
import {
    buildAIBoxVMBootFailureMessage,
    buildAIBoxVMBootTaskFailureMessage,
    buildAIBoxVMCreatedLogMessage,
    buildAIBoxVMCreationFailureMessage,
    buildCloudInitAlreadyConfiguredLogMessage,
    buildCloudInitApplyLogMessage,
    buildCloudInitConfigUnavailableLogMessage,
    buildCloudInitRegeneratedLogMessage,
    buildCloudInitRegenerationFailureLogMessage,
    buildCloudInitRegenerationTaskFailureLogMessage,
    buildCloudInitSkippedLogMessage,
    buildGuestNetworkIdentityFailureLogMessage,
    buildGuestNetworkIdentitySkippedLogMessage,
    buildGuestNetworkIdentityStartLogMessage,
    buildGuestNetworkIdentitySuccessLogMessage,
    buildVMIPDetectedLogMessage,
    buildVMIPWaitLogMessage,
    selectPreferredVMIPAddress
} from "../src/modules/ai-box-build/AIBoxBuildProvisioningPolicy";

describe("AIBoxBuildProvisioningPolicy", () => {
    it("builds stable VM creation and boot messages", () => {
        expect(buildAIBoxVMCreationFailureMessage(500, "bad gateway")).toBe("VM creation failed: 500 bad gateway");
        expect(buildAIBoxVMCreatedLogMessage("pve-a", "101")).toBe("VM created: pve-a/101.");
        expect(buildAIBoxVMBootFailureMessage("denied")).toBe("VM boot failed: denied");
        expect(buildAIBoxVMBootFailureMessage()).toBe("VM boot failed: unknown error");
        expect(buildAIBoxVMBootTaskFailureMessage("timeout")).toBe("VM boot task failed: timeout");
    });

    it("builds cloud-init lifecycle log messages", () => {
        expect(buildCloudInitSkippedLogMessage()).toBe("Cloud-init preparation skipped by configuration.");
        expect(buildCloudInitConfigUnavailableLogMessage()).toBe("Unable to read VM config before boot; continuing without cloud-init network preparation.");
        expect(buildCloudInitApplyLogMessage("ip=dhcp")).toBe("Applying cloud-init network config: ipconfig0=ip=dhcp.");
        expect(buildCloudInitAlreadyConfiguredLogMessage("ip=dhcp")).toBe("Cloud-init network config already set: ipconfig0=ip=dhcp.");
        expect(buildCloudInitAlreadyConfiguredLogMessage("")).toBe("Cloud-init network config already set: ipconfig0=unset.");
        expect(buildCloudInitRegenerationFailureLogMessage("no drive")).toBe("Cloud-init regeneration failed before boot: no drive.");
        expect(buildCloudInitRegenerationTaskFailureLogMessage()).toBe("Cloud-init regeneration task did not complete cleanly: unknown error.");
        expect(buildCloudInitRegeneratedLogMessage()).toBe("Cloud-init regenerated before VM boot.");
    });

    it("builds guest network identity log messages with filtered summaries", () => {
        expect(buildGuestNetworkIdentitySkippedLogMessage()).toBe("Guest network identity normalization skipped by configuration.");
        expect(buildGuestNetworkIdentityStartLogMessage()).toBe("Normalizing guest machine-id and DHCP client identity after boot.");
        expect(buildGuestNetworkIdentityFailureLogMessage("failed", "stderr")).toBe("Guest network identity normalization did not complete: failed: stderr.");
        expect(buildGuestNetworkIdentityFailureLogMessage()).toBe("Guest network identity normalization did not complete: unknown error.");
        expect(buildGuestNetworkIdentitySuccessLogMessage([
            "ignored line",
            "network_identity=changed",
            "interface=eth0",
            "old_machine_id=abc",
            "new_machine_id=def",
            "2: eth0"
        ].join("\n"))).toBe("Guest network identity normalized. network_identity=changed; interface=eth0; old_machine_id=abc; new_machine_id=def; 2: eth0");
    });

    it("selects preferred VM IP addresses and builds wait logs", () => {
        expect(selectPreferredVMIPAddress(["169.254.1.2", "10.0.0.5"])).toBe("10.0.0.5");
        expect(selectPreferredVMIPAddress(["169.254.1.2"])).toBe("169.254.1.2");
        expect(selectPreferredVMIPAddress([])).toBeUndefined();
        expect(buildVMIPDetectedLogMessage("10.0.0.5")).toBe("VM IP detected: 10.0.0.5.");
        expect(buildVMIPWaitLogMessage(6, 30)).toBe("Still waiting for VM IP (6/30).");
    });
});
