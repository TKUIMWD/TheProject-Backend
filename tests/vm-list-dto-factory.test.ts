import { describe, expect, it } from "vitest";
import {
    buildVMListErrorDTO,
    buildVMListItemDTO,
    buildVMOwnerNameMap,
    collectVMOwnerIds,
    getVMOwnerName
} from "../src/modules/vm/VMListDTOFactory";

describe("VMListDTOFactory", () => {
    it("collects unique VM owner IDs for batched lookup", () => {
        expect(collectVMOwnerIds([
            { _id: "vm-1", pve_vmid: "100", pve_node: "pve-a", owner: "user-1" },
            { _id: "vm-2", pve_vmid: "101", pve_node: "pve-a", owner: { toString: () => "user-2" } },
            { _id: "vm-3", pve_vmid: "102", pve_node: "pve-b", owner: "user-1" },
            { _id: "vm-4", pve_vmid: "103", pve_node: "pve-b", owner: "" },
            { _id: "vm-5", pve_vmid: "104", pve_node: "pve-b" }
        ])).toEqual(["user-1", "user-2"]);
    });

    it("builds owner name maps and falls back for missing owners", () => {
        const map = buildVMOwnerNameMap([
            { _id: "user-1", username: "alice" },
            { _id: "user-2", username: 123 },
            { username: "missing-id" }
        ]);

        expect(getVMOwnerName(map, "user-1")).toBe("alice");
        expect(getVMOwnerName(map, { toString: () => "user-1" })).toBe("alice");
        expect(getVMOwnerName(map, "missing")).toBe("Unknown");
        expect(getVMOwnerName(map, undefined, "Unknown User")).toBe("Unknown User");
    });

    it("builds VM list DTOs with optional PVE name and owner", () => {
        expect(buildVMListItemDTO({
            _id: "vm-1",
            pve_vmid: "100",
            pve_node: "pve-a",
            owner: "user-1"
        }, {
            basicConfig: {
                vmid: 100,
                name: "ubuntu-lab",
                cores: 2,
                memory: "2048",
                node: "pve-a",
                status: "running",
                disk_size: 20
            },
            vmStatus: {
                status: "running",
                uptime: 60
            },
            ownerName: "alice",
            includePveName: true
        })).toEqual({
            _id: "vm-1",
            pve_vmid: "100",
            pve_node: "pve-a",
            pve_name: "ubuntu-lab",
            owner: "alice",
            status: {
                current_status: "running",
                uptime: 60
            },
            error: null
        });
    });

    it("builds VM list error fallbacks", () => {
        expect(buildVMListErrorDTO({
            _id: "vm-1",
            pve_vmid: "100",
            pve_node: "pve-a",
            owner: "user-1"
        }, "Failed to fetch VM config or status", "user-1")).toEqual({
            _id: "vm-1",
            pve_vmid: "100",
            pve_node: "pve-a",
            owner: "user-1",
            config: null,
            status: null,
            error: "Failed to fetch VM config or status"
        });
    });
});
