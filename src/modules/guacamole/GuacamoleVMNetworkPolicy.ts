interface GuestNetworkAddress {
    "ip-address"?: string;
    "ip-address-type"?: string;
}

interface GuestNetworkInterface {
    name?: string;
    "ip-addresses"?: GuestNetworkAddress[];
}

export function extractIPv4AddressesFromGuestInterfaces(interfacesData: unknown): string[] {
    let interfaces: GuestNetworkInterface[];

    if (Array.isArray(interfacesData)) {
        interfaces = interfacesData as GuestNetworkInterface[];
    } else if (
        interfacesData
        && typeof interfacesData === "object"
        && "result" in interfacesData
        && Array.isArray((interfacesData as { result?: unknown }).result)
    ) {
        interfaces = (interfacesData as { result: GuestNetworkInterface[] }).result;
    } else {
        return [];
    }

    const addresses: string[] = [];
    for (const iface of interfaces) {
        if (iface.name === "lo" || !Array.isArray(iface["ip-addresses"])) {
            continue;
        }

        for (const ip of iface["ip-addresses"]) {
            const address = ip["ip-address"];
            if (address && ip["ip-address-type"] === "ipv4" && !address.startsWith("127.")) {
                addresses.push(address);
            }
        }
    }

    return addresses;
}

export function selectGuacamoleTargetIP(
    allIPAddresses: string[],
    requestedIP?: string
): { selected: true; ip: string; allIPs: string[]; autoSelected: boolean } | { selected: false; message: string; allIPs?: string[] } {
    if (allIPAddresses.length === 0) {
        return { selected: false, message: "No valid IP addresses found for VM" };
    }

    if (requestedIP) {
        if (allIPAddresses.includes(requestedIP)) {
            return { selected: true, ip: requestedIP, allIPs: allIPAddresses, autoSelected: false };
        }

        return {
            selected: false,
            message: `Requested IP ${requestedIP} is not available for this VM. Available IPs: ${allIPAddresses.join(', ')}`,
            allIPs: allIPAddresses
        };
    }

    const privateIP = allIPAddresses.find((ip) => {
        if (ip.startsWith("10.") || ip.startsWith("192.168.")) {
            return true;
        }

        if (!ip.startsWith("172.")) {
            return false;
        }

        const secondOctet = Number(ip.split(".")[1]);
        return Number.isInteger(secondOctet) && secondOctet >= 16 && secondOctet <= 31;
    });

    return {
        selected: true,
        ip: privateIP || allIPAddresses[0],
        allIPs: allIPAddresses,
        autoSelected: true
    };
}
