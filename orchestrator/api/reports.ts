import { baseline } from "../services/baseline.ts";
import { firewall } from "../protection/firewall.ts";
import { vpn } from "../protection/vpn.ts";
import { antivirus } from "../protection/antivirus.ts";

export async function generateSecurityReport() {
    const baselineStatus = await baseline.checkDrift();
    const firewallStatus = await firewall.getStatus();
    const vpnStatus = await vpn.isConnected();
    const avStatus = await antivirus.getStatus();

    const report = {
        timestamp: new Date().toISOString(),
        summary: {
            overall_status: (baselineStatus?.newProcs.length === 0 && baselineStatus?.newPorts.length === 0) ? "SECURE" : "WARNING",
            drift_detected: (baselineStatus?.newProcs.length ?? 0) > 0 || (baselineStatus?.newPorts.length ?? 0) > 0,
        },
        details: {
            baseline: baselineStatus,
            firewall: {
                success: firewallStatus.success,
                details: firewallStatus.stdout
            },
            vpn: {
                connected: vpnStatus
            },
            antivirus: avStatus
        }
    };

    return report;
}
