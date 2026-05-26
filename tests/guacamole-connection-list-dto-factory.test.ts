import { describe, expect, it } from "vitest";
import { buildUserGuacamoleConnectionListDTOs } from "../src/modules/guacamole/GuacamoleConnectionListDTOFactory";

describe("buildUserGuacamoleConnectionListDTOs", () => {
    it("returns an empty list for missing or invalid Guacamole connection payloads", () => {
        expect(buildUserGuacamoleConnectionListDTOs(null, "student@example.test")).toEqual([]);
        expect(buildUserGuacamoleConnectionListDTOs("not-an-object", "student@example.test")).toEqual([]);
    });

    it("filters Guacamole connections by the current user's email in the connection name", () => {
        const createdAt = new Date("2026-05-26T00:00:00.000Z");

        expect(buildUserGuacamoleConnectionListDTOs({
            "1": {
                name: "SSH-box-root-student@example.test",
                protocol: "ssh",
                parameters: {
                    hostname: "10.0.0.10",
                    port: "22",
                    username: "root",
                    password: "hidden"
                }
            },
            "2": {
                name: "RDP-box-admin@example.test",
                protocol: "rdp",
                parameters: {
                    hostname: "10.0.0.11",
                    port: "3389",
                    username: "administrator"
                }
            },
            "3": {
                name: "",
                protocol: "vnc"
            }
        }, "student@example.test", createdAt)).toEqual([
            {
                connection_id: "1",
                name: "SSH-box-root-student@example.test",
                protocol: "ssh",
                parameters: {
                    hostname: "10.0.0.10",
                    port: "22",
                    username: "root"
                },
                created_at: createdAt,
                status: "active"
            }
        ]);
    });

    it("preserves the existing sparse parameter shape when Guacamole omits fields", () => {
        const [connection] = buildUserGuacamoleConnectionListDTOs({
            "vnc-1": {
                name: "VNC-lab-student@example.test",
                protocol: "vnc"
            }
        }, "student@example.test");

        expect(connection.parameters).toEqual({
            hostname: undefined,
            port: undefined,
            username: undefined
        });
        expect(connection.created_at).toBeInstanceOf(Date);
    });
});
