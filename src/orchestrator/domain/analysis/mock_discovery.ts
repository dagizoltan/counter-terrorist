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
                    vendor: "Huawei/TP-Link" 
                },
                { 
                    mac: "02:1e:8f:e8:c9:94", 
                    ip: "192.168.1.197", 
                    hostname: "OPERATOR_WORKSTATION", 
                    vendor: "Local_Asset" 
                },
                { 
                    mac: "70:85:c2:d3:a1:44", 
                    ip: "192.168.1.105", 
                    hostname: "CONNECTED_MOBILE_01", 
                    vendor: "Apple/Android" 
                },
                { 
                    mac: "b8:27:eb:f1:22:90", 
                    ip: "192.168.1.201", 
                    hostname: "CONNECTED_MOBILE_02", 
                    vendor: "Apple/Android" 
                }
            ],
            wifi: [
                { mac: "38:A6:59:A4:C3:31", ssid: "Telekom-7bNb4Y", signal: 97, encryption: "WPA2" },
                { mac: "DA:D8:E5:05:A6:00", ssid: "Public_Hotspot", signal: 45, encryption: "OPEN" }
            ],
            bluetooth: [
                { mac: "DC:0D:30:44:11:02", hostname: "BT_BEACON_01", signal: -65 }
            ]
        };
    }
}
