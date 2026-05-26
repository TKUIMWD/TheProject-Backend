import { describe, expect, it } from "vitest";
import {
    buildGuacamoleDeleteConnectionSuccessPayload,
    buildGuacamoleDisconnectSuccessPayload,
    buildGuacamoleCreateConnectionFailureMessage,
    classifyGuacamoleCreateConnectionResponse,
    classifyGuacamoleDeleteConnectionResponse,
    findGuacamoleConnectionIdByName
} from "../src/modules/guacamole/GuacamoleConnectionLifecyclePolicy";

describe("GuacamoleConnectionLifecyclePolicy", () => {
    it("finds existing connection IDs by connection name", () => {
        expect(findGuacamoleConnectionIdByName({
            "1": { name: "SSH-box-root-user@example.test" },
            "2": { name: "RDP-box-user@example.test" }
        }, "RDP-box-user@example.test")).toBe("2");
    });

    it("returns null when connection lists are missing or no name matches", () => {
        expect(findGuacamoleConnectionIdByName(null, "SSH-box")).toBeNull();
        expect(findGuacamoleConnectionIdByName({ "1": { name: "other" } }, "SSH-box")).toBeNull();
    });

    it("classifies successful connection creation responses", () => {
        expect(classifyGuacamoleCreateConnectionResponse({ identifier: 123 })).toEqual({
            success: true,
            identifier: "123"
        });
    });

    it("classifies Guacamole error payloads", () => {
        expect(classifyGuacamoleCreateConnectionResponse({
            type: "INTERNAL_ERROR",
            message: "backend unavailable"
        })).toEqual({
            success: false,
            kind: "internal_error",
            message: "backend unavailable"
        });

        expect(classifyGuacamoleCreateConnectionResponse({ type: "NOT_FOUND" })).toEqual({
            success: false,
            kind: "not_found",
            message: "Resource not found"
        });
    });

    it("classifies missing identifiers", () => {
        expect(classifyGuacamoleCreateConnectionResponse({})).toEqual({
            success: false,
            kind: "missing_identifier",
            message: "Connection creation response did not include an identifier"
        });
    });

    it("builds protocol-specific creation failure messages", () => {
        expect(buildGuacamoleCreateConnectionFailureMessage("ssh", {
            success: false,
            kind: "internal_error",
            message: "backend unavailable"
        })).toBe("Guacamole internal error: backend unavailable. Please check SSH service and credentials.");

        expect(buildGuacamoleCreateConnectionFailureMessage("ssh", {
            success: false,
            kind: "missing_identifier",
            message: "missing"
        })).toBe("Failed to create connection configuration - missing identifier");

        expect(buildGuacamoleCreateConnectionFailureMessage("rdp", {
            success: false,
            kind: "not_found",
            message: "connection missing"
        })).toBe("Guacamole connection failed: connection missing");

        expect(buildGuacamoleCreateConnectionFailureMessage("vnc", {
            success: false,
            kind: "internal_error",
            message: "internal"
        }, {
            hostname: "10.0.0.5",
            port: 5901
        })).toBe("Guacamole internal server error. Please check if VNC service is running on 10.0.0.5:5901");
    });

    it("classifies successful connection deletion responses", () => {
        expect(classifyGuacamoleDeleteConnectionResponse(undefined)).toEqual({ success: true });
        expect(classifyGuacamoleDeleteConnectionResponse({})).toEqual({ success: true });
    });

    it("classifies Guacamole deletion error payloads", () => {
        expect(classifyGuacamoleDeleteConnectionResponse({
            type: "INTERNAL_ERROR",
            message: "database unavailable"
        })).toEqual({
            success: false,
            statusCode: 500,
            message: "Guacamole internal error: database unavailable"
        });

        expect(classifyGuacamoleDeleteConnectionResponse({ type: "NOT_FOUND" })).toEqual({
            success: false,
            statusCode: 404,
            message: "Connection not found"
        });

        expect(classifyGuacamoleDeleteConnectionResponse({ error: { message: "permission denied" } })).toEqual({
            success: false,
            statusCode: 500,
            message: "Failed to delete connection: permission denied"
        });
    });

    it("builds disconnect success payloads with stable timestamp formatting", () => {
        expect(buildGuacamoleDisconnectSuccessPayload("local-1", new Date("2026-05-26T12:34:56.000Z"))).toEqual({
            message: "Connection closed successfully",
            connection_id: "local-1",
            disconnected_at: "2026-05-26T12:34:56.000Z"
        });

        expect(buildGuacamoleDisconnectSuccessPayload("local-2", "2026-05-26T12:35:00.000Z")).toEqual({
            message: "Connection closed successfully",
            connection_id: "local-2",
            disconnected_at: "2026-05-26T12:35:00.000Z"
        });
    });

    it("builds delete success payloads while preserving Date values", () => {
        const deletedAt = new Date("2026-05-26T12:40:00.000Z");

        expect(buildGuacamoleDeleteConnectionSuccessPayload({
            connectionId: "42",
            connectionName: "SSH-lab-user@example.test",
            deletedBy: "user@example.test",
            deletedAt
        })).toEqual({
            connection_id: "42",
            name: "SSH-lab-user@example.test",
            deleted_at: deletedAt,
            deleted_by: "user@example.test"
        });
    });
});
