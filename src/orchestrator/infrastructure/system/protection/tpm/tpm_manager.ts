import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";

/**
 * TPMManager
 * Binds mesh secrets and identity to the hardware Root of Trust.
 * Achieves Full Dependency Hermeticity via native sidecar.
 */
export class TPMManager {
    constructor(
        private sidecar: SidecarManager,
        private logging: LoggingPort
    ) {}

    async sealSecret(secretName: string, data: string) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "TPM",
            message: `Sealing mesh secret '${secretName}' into hardware...`
        });
        
        const index = "0x1500001";
        const res = await this.sidecar.sendCommand("tpm", { type: "Seal", index, data });
        
        if (!res.success) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "TPM",
                message: `Seal cycle failed: ${res.stderr}`
            });
        }
    }

    async unsealSecret(secretName: string): Promise<string | null> {
        const index = "0x1500001";
        const res = await this.sidecar.sendCommand("tpm", { type: "Unseal", index });
        
        if (res.success && res.data?.data) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.INFO,
                caller: "TPM",
                message: `Secret '${secretName}' successfully unsealed from hardware.`
            });
            return res.data.data;
        }
        
        return null;
    }

    async getPcrs(indices: number[] = [0, 1, 7]): Promise<Record<number, string>> {
        const res = await this.sidecar.sendCommand("tpm", { type: "GetPcrs", indices });
        if (!res.success) throw new Error(`Failed to read PCRs: ${res.stderr}`);
        return res.data as Record<number, string>;
    }

    async verifyIntegrity(goldenPcrs?: Record<number, string>): Promise<boolean> {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "TPM",
            message: "Verifying system integrity via hardware PCR attestation..."
        });
        
        const currentPcrs = await this.getPcrs();
        
        // 1. Attempt to fetch Golden Hash from TPM NVRAM (Highest Trust)
        const nvGoldenHash = await this.nvRead("0x1500002");
        if (nvGoldenHash) {
            const currentHash = await this.computePcrHash(currentPcrs);
            if (currentHash === nvGoldenHash) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.SUCCESS,
                    caller: "TPM",
                    message: "Hardware Integrity Verified via TPM NVRAM Golden Hash."
                });
                return true;
            } else {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "TPM",
                    message: "CRITICAL: Hardware Integrity Mismatch against NVRAM Golden Hash!"
                });
                return false;
            }
        }

        // 2. Fallback to Environment-based Golden PCRs (Legacy/Secondary Trust)
        if (!goldenPcrs || Object.keys(goldenPcrs).length === 0) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "TPM",
                message: "Integrity Violation: No golden PCRs provided. Hardware-rooted trust is mandatory."
            });
            return false;
        }

        for (const [index, expected] of Object.entries(goldenPcrs)) {
            if (currentPcrs[Number(index)] !== expected) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "TPM",
                    message: `Hardware Integrity Mismatch: PCR ${index} (Expected: ${expected}, Got: ${currentPcrs[Number(index)]})`
                });
                return false;
            }
        }
        return true;
    }

    async sign(data: string): Promise<string> {
        const res = await this.sidecar.sendCommand("tpm", { type: "Sign", data });
        return res.data?.signature || "";
    }

    async verify(data: string, signature: string): Promise<boolean> {
        const res = await this.sidecar.sendCommand("tpm", { type: "Verify", data, signature });
        return res.success;
    }

    async nvDefine(index: string, size: number) {
        return await this.sidecar.sendCommand("tpm", { type: "NvDefine", index, size });
    }

    async nvWrite(index: string, data: string) {
        return await this.sidecar.sendCommand("tpm", { type: "NvWrite", index, data });
    }

    async nvRead(index: string): Promise<string | null> {
        const res = await this.sidecar.sendCommand("tpm", { type: "NvRead", index });
        if (res.success && res.data?.data) {
            return res.data.data;
        }
        return null;
    }

    /**
     * Seals the current PCR state into TPM NVRAM as the 'Golden' baseline.
     */
    async provisionGoldenPcrs(indices: number[] = [0, 1, 7]) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "TPM:PROVISION",
            message: "Provisioning hardware-rooted Golden PCR baseline..."
        });

        const currentPcrs = await this.getPcrs(indices);
        const pcrHash = await this.computePcrHash(currentPcrs);

        const index = "0x1500002"; // Reserved for Golden PCR Hash
        await this.nvDefine(index, 64);
        const res = await this.nvWrite(index, pcrHash);

        if (res.success) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.SUCCESS,
                caller: "TPM:PROVISION",
                message: "Golden PCR baseline successfully sealed in NVRAM."
            });
        }
        return res.success;
    }

    private async computePcrHash(pcrs: Record<number, string>): Promise<string> {
        const { computeHash } = await import("../../../../core/crypto_utils.ts");
        return await computeHash(pcrs);
    }
}
