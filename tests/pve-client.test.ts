import { describe, expect, it } from "vitest";
import { env } from "../src/config/env";
import { PVEClient } from "../src/modules/pve/PVEClient";

describe("PVEClient", () => {
    it("adds the selected PVE token to request headers", async () => {
        const calls: Array<{ method: string; url: string; body: unknown; headers?: HeadersInit }> = [];
        const client = new PVEClient(async (method, url, body, options) => {
            calls.push({ method, url, body, headers: options.headers });
            return { ok: true };
        });

        const response = await client.request("GET", "https://pve.example/api2/json/nodes", undefined, { mode: "user" });

        expect(response).toEqual({ ok: true });
        expect(calls).toHaveLength(1);
        expect(calls[0].headers).toMatchObject({
            Authorization: `PVEAPIToken=${env.pve.userModeToken}`
        });
    });

    it("defaults to the super admin token", async () => {
        let authorization = "";
        const client = new PVEClient(async (_method, _url, _body, options) => {
            authorization = (options.headers as Record<string, string>).Authorization;
            return "ok";
        });

        await client.request("DELETE", "https://pve.example/api2/json/nodes/node/qemu/100");

        expect(authorization).toBe(`PVEAPIToken=${env.pve.superAdminModeToken}`);
    });
});
