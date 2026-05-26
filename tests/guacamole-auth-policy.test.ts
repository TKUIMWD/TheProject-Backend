import { describe, expect, it } from "vitest";
import {
    buildGuacamoleAuthTokenDecision,
    DEFAULT_GUACAMOLE_DATA_SOURCE
} from "../src/modules/guacamole/GuacamoleAuthPolicy";

describe("GuacamoleAuthPolicy", () => {
    it("builds auth token DTOs from authToken responses", () => {
        expect(buildGuacamoleAuthTokenDecision({
            authToken: "token-1",
            dataSource: "mysql"
        }, {
            username: "admin",
            errorPrefix: "Admin authentication failed",
            missingTokenMessage: "Failed to obtain admin auth token"
        })).toEqual({
            success: true,
            authToken: {
                token: "token-1",
                dataSource: "mysql",
                username: "admin"
            }
        });
    });

    it("builds auth token DTOs from token responses with fallback datasource", () => {
        expect(buildGuacamoleAuthTokenDecision({
            token: 12345
        }, {
            username: "user@example.test",
            fallbackDataSource: "postgresql",
            errorPrefix: "User authentication failed",
            missingTokenMessage: "Failed to obtain user auth token"
        })).toEqual({
            success: true,
            authToken: {
                token: "12345",
                dataSource: "postgresql",
                username: "user@example.test"
            }
        });
    });

    it("uses the default Guacamole datasource when no fallback is supplied", () => {
        const decision = buildGuacamoleAuthTokenDecision({
            token: "token-2"
        }, {
            username: "admin",
            errorPrefix: "Admin authentication failed",
            missingTokenMessage: "Failed to obtain admin auth token"
        });

        expect(decision).toEqual({
            success: true,
            authToken: {
                token: "token-2",
                dataSource: DEFAULT_GUACAMOLE_DATA_SOURCE,
                username: "admin"
            }
        });
    });

    it("maps Guacamole auth errors to stable messages", () => {
        expect(buildGuacamoleAuthTokenDecision({
            error: "invalid credentials"
        }, {
            username: "admin",
            errorPrefix: "Admin authentication failed",
            missingTokenMessage: "Failed to obtain admin auth token"
        })).toEqual({
            success: false,
            message: "Admin authentication failed: invalid credentials"
        });
    });

    it("maps missing tokens to caller-provided messages", () => {
        expect(buildGuacamoleAuthTokenDecision({}, {
            username: "user@example.test",
            errorPrefix: "User authentication failed",
            missingTokenMessage: "Failed to obtain user auth token"
        })).toEqual({
            success: false,
            message: "Failed to obtain user auth token"
        });
    });
});
