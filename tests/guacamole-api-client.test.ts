import { describe, expect, it } from "vitest";
import { GuacamoleApiClient } from "../src/modules/guacamole/GuacamoleApiClient";

describe("GuacamoleApiClient", () => {
    it("posts auth token requests as form-urlencoded data", async () => {
        const calls: Array<{ method: string; url: string; body: unknown; headers?: HeadersInit }> = [];
        const client = new GuacamoleApiClient("https://guac.example", async (method, url, body, options) => {
            calls.push({ method, url, body, headers: options.headers });
            return { authToken: "token", dataSource: "postgresql" };
        });

        const response = await client.createToken("user@example.test", "secret");

        expect(response.authToken).toBe("token");
        expect(calls[0].method).toBe("POST");
        expect(calls[0].url).toBe("https://guac.example/api/tokens");
        expect(calls[0].body).toBeInstanceOf(URLSearchParams);
        expect((calls[0].body as URLSearchParams).toString()).toBe("username=user%40example.test&password=secret");
        expect(calls[0].headers).toMatchObject({
            "Content-Type": "application/x-www-form-urlencoded"
        });
    });

    it("adds Guacamole-Token headers to authenticated requests", async () => {
        let headers: HeadersInit | undefined;
        const client = new GuacamoleApiClient("https://guac.example", async (_method, _url, _body, options) => {
            headers = options.headers;
            return {};
        });

        await client.listConnections("postgresql", "token-123");

        expect(headers).toMatchObject({
            "Guacamole-Token": "token-123"
        });
    });

    it("kills active connections with a json-patch request", async () => {
        const calls: Array<{ method: string; url: string; body: unknown; headers?: HeadersInit }> = [];
        const client = new GuacamoleApiClient("https://guac.example", async (method, url, body, options) => {
            calls.push({ method, url, body, headers: options.headers });
            return "";
        });

        await client.deleteActiveConnection("default", "active-1", "token-123");

        expect(calls[0]).toMatchObject({
            method: "PATCH",
            url: "https://guac.example/api/session/data/default/activeConnections/active-1",
            body: { operations: [{ op: "remove", path: "/" }] }
        });
        expect(calls[0].headers).toMatchObject({
            "Content-Type": "application/json-patch+json",
            "Guacamole-Token": "token-123"
        });
    });
});
