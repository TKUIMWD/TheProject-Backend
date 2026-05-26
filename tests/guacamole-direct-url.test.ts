import { describe, expect, it } from "vitest";
import { buildGuacamoleDirectUrl, encodeGuacamoleConnectionId } from "../src/modules/guacamole/GuacamoleDirectUrl";

describe("GuacamoleDirectUrl", () => {
    it("encodes Guacamole connection identifiers using base64url", () => {
        expect(encodeGuacamoleConnectionId("123", "postgresql")).toBe("MTIzAGMAcG9zdGdyZXNxbA");
    });

    it("builds direct URLs with URL-encoded tokens", () => {
        expect(buildGuacamoleDirectUrl(
            "https://guac.example.test",
            "123",
            "postgresql",
            "abc+/= token"
        )).toBe("https://guac.example.test/#/client/MTIzAGMAcG9zdGdyZXNxbA?token=abc%2B%2F%3D%20token");
    });
});

