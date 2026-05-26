import { describe, expect, it } from "vitest";
import {
    buildGuacamoleConfigurationMissingLogMessage,
    buildGuacamoleServiceConnectivityFailureMessage,
    buildGuacamoleVMDisplayName,
    GUACAMOLE_AUTHENTICATION_FAILURE_MESSAGE,
    GUACAMOLE_SERVICE_NOT_CONFIGURED_MESSAGE
} from "../src/modules/guacamole/GuacamoleConnectionPreflightPolicy";

describe("GuacamoleConnectionPreflightPolicy", () => {
    it("keeps shared preflight messages stable", () => {
        expect(GUACAMOLE_SERVICE_NOT_CONFIGURED_MESSAGE).toBe("Guacamole service is not configured. Please contact administrator to configure the service.");
        expect(GUACAMOLE_AUTHENTICATION_FAILURE_MESSAGE).toBe("Failed to authenticate with Guacamole service");
        expect(buildGuacamoleConfigurationMissingLogMessage("ssh")).toBe("Guacamole service is not configured for SSH connection");
    });

    it("builds VM display names from config with fallback to PVE VMID", () => {
        expect(buildGuacamoleVMDisplayName({ name: "Kali Lab" }, "101")).toBe("Kali Lab");
        expect(buildGuacamoleVMDisplayName({ name: "   " }, "102")).toBe("VM-102");
        expect(buildGuacamoleVMDisplayName(null, 103)).toBe("VM-103");
    });

    it("builds SSH/RDP connectivity failure messages", () => {
        expect(buildGuacamoleServiceConnectivityFailureMessage("ssh", "10.0.0.5", 22, "timeout")).toBe(
            "Cannot establish SSH connection: timeout. Please ensure SSH service is running on the target VM."
        );
        expect(buildGuacamoleServiceConnectivityFailureMessage("rdp", "10.0.0.6", 3389, "refused")).toBe(
            "Cannot establish RDP connection: refused. Please ensure RDP service is running on the target VM."
        );
    });

    it("builds VNC connectivity failure messages with default guidance", () => {
        expect(buildGuacamoleServiceConnectivityFailureMessage("vnc", "10.0.0.7", 5901)).toBe(
            "VNC service is not available on 10.0.0.7:5901. Please ensure VNC server is running on the target VM."
        );
    });
});
