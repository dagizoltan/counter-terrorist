/**
 * IntelEnricher
 * Cross-references local signals with public organizational identifiers.
 */
export class IntelEnricher {
    private static VENDORS: Record<string, string> = {
        "00:0C:29": "VMware_Virtual_Machine",
        "00:50:56": "VMware_Infrastructure",
        "08:00:27": "Oracle_VirtualBox",
        "B8:27:EB": "Raspberry_Pi_Foundation",
        "DC:A6:32": "Raspberry_Pi_4/5",
        "00:16:3E": "Xen_Virtualization",
        "C4:AD:34": "Espressif_Systems_IoT",
        "00:1B:63": "Apple_Device",
        "D4:F5:27": "Cisco_Enterprise",
        "E4:5F:01": "Raspberry_Pi_Modern",
        "F4:39:09": "Espressif_IoT_Device",
        "84:F3:EB": "Espressif_IoT_Device"
    };

    /**
     * Resolves a MAC address to a public vendor and provides intelligence context.
     */
    static getPublicIntel(mac: string): string {
        if (!mac) return "Unknown_Origin";
        
        const cleanMac = mac.toUpperCase().replace(/[:-]/g, "");
        const prefix = mac.toUpperCase().slice(0, 8); // e.g., "00:0C:29"
        
        // 1. Check for Locally Administered Address (LAA) - Randomized
        const firstByte = parseInt(cleanMac.slice(0, 2), 16);
        if ((firstByte & 0x02) === 0x02) {
            return "Randomized_MAC (Privacy_Enhanced)";
        }

        // 2. Known Vendor Lookup
        const vendor = this.VENDORS[prefix];
        if (vendor) return vendor;

        return "Standard_Unregistered_Vendor";
    }

    /**
     * Enriches a list of devices with public intelligence.
     */
    static enrichDevices(devices: any[]) {
        return devices.map(d => ({
            ...d,
            publicIntel: this.getPublicIntel(d.mac || "")
        }));
    }
}
