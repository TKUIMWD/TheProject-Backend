import { describe, expect, it } from "vitest";
import {
    extractIPv4AddressesFromGuestInterfaces,
    selectGuacamoleTargetIP
} from "../src/modules/guacamole/GuacamoleVMNetworkPolicy";

const interfaces = [
    {
        name: "lo",
        "ip-addresses": [
            { "ip-address-type": "ipv4", "ip-address": "127.0.0.1" }
        ]
    },
    {
        name: "eth0",
        "ip-addresses": [
            { "ip-address-type": "ipv6", "ip-address": "fe80::1" },
            { "ip-address-type": "ipv4", "ip-address": "203.0.113.10" }
        ]
    },
    {
        name: "eth1",
        "ip-addresses": [
            { "ip-address-type": "ipv4", "ip-address": "10.0.0.5" }
        ]
    }
];

describe("GuacamoleVMNetworkPolicy", () => {
    it("extracts IPv4 addresses from guest agent interface arrays", () => {
        expect(extractIPv4AddressesFromGuestInterfaces(interfaces)).toEqual([
            "203.0.113.10",
            "10.0.0.5"
        ]);
    });

    it("extracts IPv4 addresses from guest agent result objects", () => {
        expect(extractIPv4AddressesFromGuestInterfaces({ result: interfaces })).toEqual([
            "203.0.113.10",
            "10.0.0.5"
        ]);
    });

    it("selects requested IPs only when available", () => {
        expect(selectGuacamoleTargetIP(["203.0.113.10", "10.0.0.5"], "10.0.0.5")).toEqual({
            selected: true,
            ip: "10.0.0.5",
            allIPs: ["203.0.113.10", "10.0.0.5"],
            autoSelected: false
        });

        expect(selectGuacamoleTargetIP(["203.0.113.10"], "10.0.0.5")).toEqual({
            selected: false,
            message: "Requested IP 10.0.0.5 is not available for this VM. Available IPs: 203.0.113.10",
            allIPs: ["203.0.113.10"]
        });
    });

    it("prefers private IPs when auto-selecting", () => {
        expect(selectGuacamoleTargetIP(["203.0.113.10", "172.20.0.7"])).toEqual({
            selected: true,
            ip: "172.20.0.7",
            allIPs: ["203.0.113.10", "172.20.0.7"],
            autoSelected: true
        });
    });

    it("reports missing usable IP addresses", () => {
        expect(extractIPv4AddressesFromGuestInterfaces("bad-shape")).toEqual([]);
        expect(selectGuacamoleTargetIP([])).toEqual({
            selected: false,
            message: "No valid IP addresses found for VM"
        });
    });
});
