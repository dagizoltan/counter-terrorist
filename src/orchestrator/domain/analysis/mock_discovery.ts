/**
 * MockDiscovery
 * Refined to match the user's actual physical environment for tactical parity.
 * Environment: 1 Mobile Router + 3 Connected Assets.
 */
export class MockDiscovery {
    async scan() {
        return {
            ethernet: [
                { 
                    mac: "84:15:72:33:53:98", 
                    ip: "192.168.1.1", 
                    hostname: "MOBILE_ROUTER (Gateway)", 
                    vendor: "Huawei/TP-Link",
                    details: "TCP Ports: 80, 443, 1900 | TTL: 64"
                },
                { 
                    mac: "02:1e:8f:e8:c9:94", 
                    ip: "192.168.1.197", 
                    hostname: "OPERATOR_WORKSTATION", 
                    vendor: "Local_Asset",
                    details: "TCP Ports: 22, 8000, 8001 | OS: Deno/V8 (Linux)"
                },
                { 
                    mac: "70:85:c2:d3:a1:44", 
                    ip: "192.168.1.105", 
                    hostname: "CONNECTED_MOBILE_01", 
                    vendor: "Apple/Android",
                    details: "Protocol: mDNS/AirPlay | MDM: Inactive"
                }
            ],
            wifi: [
                { mac: "38:A6:59:A4:C3:31", ssid: "Telekom-7bNb4Y", signal: 97, encryption: "WPA2/AES", channel: 6, band: "2.4GHz", vendor: "Arcadyan" },
                { mac: "DA:D8:E5:05:A6:00", ssid: "Public_Hotspot", signal: 45, encryption: "OPEN", channel: 36, band: "5GHz", vendor: "Unknown" },
                { mac: "BC:CF:CC:11:22:33", ssid: "Deno_Mesh_01", signal: 82, encryption: "WPA3", channel: 149, band: "5GHz", vendor: "Sovereign" }
            ],
            bluetooth: [
                { mac: "DC:0D:30:44:11:02", hostname: "BT_BEACON_01", signal: -65, type: "LE_ADVERTISER", battery: "84%" },
                { mac: "AC:44:F2:99:11:33", hostname: "OPERATOR_SMARTPHONE", signal: -42, type: "MOBILE_PHONE", details: "Paired // Encrypted" }
            ]
        };
    }
}

