import { describe, expect, it } from "vitest";
import { isCorsOriginAllowed } from "../src/modules/http/CorsPolicy";

describe("isCorsOriginAllowed", () => {
    it("allows requests without an Origin header", () => {
        expect(isCorsOriginAllowed(undefined, ["https://app.example.test"])).toBe(true);
    });

    it("allows any origin when wildcard is configured", () => {
        expect(isCorsOriginAllowed("https://unknown.example.test", ["*"])).toBe(true);
    });

    it("allows origins listed in the whitelist", () => {
        expect(isCorsOriginAllowed("https://app.example.test", ["https://app.example.test"])).toBe(true);
    });

    it("rejects origins that are not in the whitelist", () => {
        expect(isCorsOriginAllowed("https://evil.example.test", ["https://app.example.test"])).toBe(false);
    });
});

