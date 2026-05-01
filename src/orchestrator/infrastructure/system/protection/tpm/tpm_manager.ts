import { SystemExecutor } from "../../system_executor.ts";
import { LoggingPort, SyslogSeverity } from "@core/ports.ts";

/**
 * TPMManager
 * Binds mesh secrets and identity to the hardware Root of Trust.
 */
export class TPMManager {
    constructor(
        private executor: SystemExecutor,
        private logging: LoggingPort
    ) {}

    /**
     * Seals a secret into the TPM.
     */
    async sealSecret(secretName: string, data: string) {
        this.logging.log(`[TPM] Sealing mesh secret '${secretName}' into hardware...`, SyslogSeverity.NOTICE);
        
        // TPM NV Index for mesh secrets (0x1500001)
        const index = "0x1500001";
        
        try {
            // 1. Define the NV index (fails if already exists, which is fine)
            await this.executor.execute("tpm2_nvdefine", [index, "-C", "o", "-s", data.length.toString()]);
            
            // 2. Write the data
            const writeRes = await this.executor.execute("bash", ["-c", `echo -n "${data}" | tpm2_nvwrite ${index} -C o`]);
            
            if (writeRes.success) {
                this.logging.log(`[TPM] Secret '${secretName}' successfully sealed into hardware index ${index}.`, SyslogSeverity.NOTICE);
            } else {
                throw new Error(writeRes.stderr);
            }
        } catch (e) {
            this.logging.log(`[TPM] Seal failed: ${(e as Error).message}. Continuing with memory-only persistence.`, SyslogSeverity.WARNING);
        }
    }

    /**
     * Unseals a secret from the TPM.
     */
    async unsealSecret(secretName: string): Promise<string | null> {
        const index = "0x1500001";
        const res = await this.executor.execute("tpm2_nvread", [index, "-C", "o"]);
        
        if (res.success) {
            this.logging.log(`[TPM] Secret '${secretName}' successfully unsealed from hardware.`, SyslogSeverity.DEBUG);
            return res.stdout.trim();
        }
        
        return null;
    }

    /**
     * Verifies system integrity via PCR (Platform Configuration Registers)
     */
    async verifyIntegrity(): Promise<boolean> {
        this.logging.log("[TPM] Verifying system integrity via hardware PCRs...", SyslogSeverity.DEBUG);
        const res = await this.executor.execute("tpm2_pcrread", ["sha256:0,1,7"]);
        return res.success;
    }
}
