import { describe, expect, it } from "vitest";
import {
    buildGuacamoleConnectionEstablishedLogMessage,
    buildGuacamoleConnectionEstablishedMessage,
    buildGuacamoleConnectionEstablishFailureMessage,
    buildGuacamoleDirectSessionLogMessage
} from "../src/modules/guacamole/GuacamoleEstablishedConnectionPolicy";

describe("GuacamoleEstablishedConnectionPolicy", () => {
    it("builds stable direct-session and success messages by protocol", () => {
        expect(buildGuacamoleDirectSessionLogMessage("ssh", "42")).toBe("Generated SSH direct session URL for config 42");
        expect(buildGuacamoleConnectionEstablishedMessage("rdp")).toBe("RDP connection established");
        expect(buildGuacamoleConnectionEstablishedMessage("vnc")).toBe("VNC connection established");
    });

    it("builds stable established connection log messages", () => {
        expect(buildGuacamoleConnectionEstablishedLogMessage({
            protocol: "ssh",
            username: "alice",
            vmId: "vm-1",
            pveVmid: "101",
            ip: "10.0.0.5"
        })).toBe("SSH connection established for user alice to VM vm-1 (101) at 10.0.0.5");
    });

    it("builds Guacamole establish failure messages", () => {
        expect(buildGuacamoleConnectionEstablishFailureMessage("rdp", new Error("bad gateway"))).toBe("Failed to establish RDP connection with Guacamole: bad gateway");
        expect(buildGuacamoleConnectionEstablishFailureMessage("vnc", "bad")).toBe("Failed to establish VNC connection with Guacamole: Unknown error");
    });
});
