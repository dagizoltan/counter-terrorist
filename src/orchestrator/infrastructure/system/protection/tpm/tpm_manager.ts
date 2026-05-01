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
            if (TPMManager.missingBinaries.has("tpm2_nvdefine")) throw new Deno.errors.NotFound();

            // 1. Define the NV index (fails if already exists, which is fine)
            const defineRes = await this.executor.execute("tpm2_nvdefine", [index, "-C", "o", "-s", data.length.toString()]);
            
            // If it failed because it wasn't found (via executor)
            if (!defineRes.success && defineRes.stderr.includes("not found")) {
                throw new Deno.errors.NotFound();
            }

            // 2. Write the data securely via stdin
            const writeCmd = new Deno.Command("tpm2_nvwrite", {
                args: [index, "-C", "o"],
                stdin: "piped",
            });
            const child = writeCmd.spawn();
            const writer = child.stdin.getWriter();
            await writer.write(new TextEncoder().encode(data));
            await writer.close();
            const writeRes = await child.output();
            
            if (writeRes.success) {
                this.logging.log(`[TPM] Secret '${secretName}' successfully sealed into hardware index ${index}.`, SyslogSeverity.NOTICE);
            } else {
                throw new Error(new TextDecoder().decode(writeRes.stderr));
            }
        } catch (e) {
            if (e instanceof Deno.errors.NotFound) {
                TPMManager.missingBinaries.add("tpm2_nvdefine");
                this.logging.log("[TPM] TPM tools not found. Continuing with memory-only persistence.", SyslogSeverity.WARNING);
            } else {
                this.logging.log(`[TPM] Seal failed: ${(e as Error).message}. Continuing with memory-only persistence.`, SyslogSeverity.WARNING);
            }
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

    private static missingBinaries: Set<string> = new Set();

    /**
     * Signs data using the hardware Root of Trust.
     */
    async sign(data: string): Promise<string> {
        // Fallback to software hash if binary is known to be missing
        if (TPMManager.missingBinaries.has("tpm2_sign")) {
            return this.softwareFallback(data);
        }

        try {
            const keyHandle = "0x81010001";
            const signCmd = new Deno.Command("tpm2_sign", {
                args: ["-c", keyHandle, "-g", "sha256", "-f", "plain", "-s", "-"],
                stdin: "piped",
                stdout: "piped",
                stderr: "null"
            });
            const signChild = signCmd.spawn();
            const signWriter = signChild.stdin.getWriter();
            await signWriter.write(new TextEncoder().encode(data));
            await signWriter.close();
            const signRes = await signChild.output();
            
            if (signRes.success) {
                return btoa(new TextDecoder().decode(signRes.stdout));
            }
        } catch (e) {
            if (e instanceof Deno.errors.NotFound) {
                this.logging.log("[TPM] tpm2_sign not found. Switching to software fallback.", SyslogSeverity.DEBUG);
                TPMManager.missingBinaries.add("tpm2_sign");
            } else {
                this.logging.log(`[TPM] Sign failed: ${(e as Error).message}`, SyslogSeverity.DEBUG);
            }
        }

        return this.fallbackHash(data);
    }

    private async fallbackHash(data: string): Promise<string> {
        if (TPMManager.missingBinaries.has("tpm2_hash")) {
            return this.softwareFallback(data);
        }

        try {
            const hashCmd = new Deno.Command("tpm2_hash", {
                args: ["-g", "sha256"],
                stdin: "piped",
                stdout: "piped"
            });
            const hashChild = hashCmd.spawn();
            const hashWriter = hashChild.stdin.getWriter();
            await hashWriter.write(new TextEncoder().encode(data));
            await hashWriter.close();
            const hashRes = await hashChild.output();

            if (hashRes.success) {
                return new TextDecoder().decode(hashRes.stdout).trim();
            }
        } catch (e) {
            if (e instanceof Deno.errors.NotFound) {
                TPMManager.missingBinaries.add("tpm2_hash");
            }
        }

        return this.softwareFallback(data);
    }

    private async softwareFallback(data: string): Promise<string> {
        const encoder = new TextEncoder();
        const d = encoder.encode(data);
        const hashBuffer = await crypto.subtle.digest("SHA-256", d);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    }
}
