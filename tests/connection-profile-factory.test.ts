import { describe, expect, it } from "vitest";
import {
    buildRDPConnectionProfile,
    buildSSHConnectionProfile,
    buildVNCConnectionProfile,
    normalizeTerminalFontSize
} from "../src/modules/guacamole/ConnectionProfileFactory";

describe("ConnectionProfileFactory", () => {
    it("normalizes terminal font size to Guacamole-safe bounds", () => {
        expect(normalizeTerminalFontSize(undefined)).toBe(14);
        expect(normalizeTerminalFontSize("abc")).toBe(14);
        expect(normalizeTerminalFontSize("9")).toBe(10);
        expect(normalizeTerminalFontSize(12.6)).toBe(13);
        expect(normalizeTerminalFontSize("99")).toBe(24);
    });

    it("builds SSH profiles with root fallback, font size, and connection limits", () => {
        const profile = buildSSHConnectionProfile({
            vmName: "box",
            email: "user@example.test",
            hostname: "10.0.0.5",
            fontSize: 16,
            nowMs: 12345
        });

        expect(profile.name).toBe("SSH-box-root-16pt-12345-user@example.test");
        expect(profile.config).toMatchObject({
            protocol: "ssh",
            parameters: {
                hostname: "10.0.0.5",
                port: "22",
                username: "root",
                "font-size": "16",
                "disable-copy": "false",
                "disable-paste": "false"
            },
            attributes: {
                "max-connections": "5",
                "max-connections-per-user": "2"
            }
        });
    });

    it("normalizes SSH profile font size before naming and config output", () => {
        const profile = buildSSHConnectionProfile({
            vmName: "box",
            email: "user@example.test",
            hostname: "10.0.0.5",
            fontSize: 99,
            nowMs: 12345
        });

        expect(profile.name).toBe("SSH-box-root-24pt-12345-user@example.test");
        expect(profile.config.parameters["font-size"]).toBe("24");
    });

    it("builds RDP profiles with security and clipboard settings", () => {
        const profile = buildRDPConnectionProfile({
            vmName: "windows",
            email: "user@example.test",
            hostname: "10.0.0.6",
            username: "administrator",
            password: "secret"
        });

        expect(profile.name).toBe("RDP-windows-user@example.test");
        expect(profile.config.parameters).toMatchObject({
            hostname: "10.0.0.6",
            port: "3389",
            username: "administrator",
            password: "secret",
            "ignore-cert": "true",
            security: "any",
            "normalize-clipboard": "preserve"
        });
    });

    it("builds VNC profiles with UTF-8 clipboard settings", () => {
        const profile = buildVNCConnectionProfile({
            vmName: "linux",
            email: "user@example.test",
            hostname: "10.0.0.7",
            password: "secret",
            port: 5901
        });

        expect(profile.name).toBe("VNC-linux-user@example.test-utf8");
        expect(profile.config.parameters).toMatchObject({
            hostname: "10.0.0.7",
            port: "5901",
            password: "secret",
            "color-depth": "32",
            "clipboard-encoding": "UTF-8"
        });
    });
});
