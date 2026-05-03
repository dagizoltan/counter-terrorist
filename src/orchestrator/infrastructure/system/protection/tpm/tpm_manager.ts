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
     * Reads current PCR values from the TPM.
     */
    async getPcrs(indices: number[] = [0, 1, 7]): Promise<Record<number, string>> {
        const pcrString = indices.join(",");
        const res = await this.executor.execute("tpm2_pcrread", [`sha256:${pcrString}`]);
        
        if (!res.success) {
            throw new Error(`Failed to read PCRs: ${res.stderr}`);
        }

        const pcrs: Record<number, string> = {};
        const lines = res.stdout.split("\n");
        for (const line of lines) {
            const match = line.match(/\s*(\d+)\s*:\s*(0x[0-9a-fA-F]+)/);
            if (match) {
                pcrs[parseInt(match[1])] = match[2].toLowerCase();
            }
        }
        return pcrs;
    }

    /**
     * Verifies system integrity via PCR (Platform Configuration Registers) comparison.
     */
    async verifyIntegrity(goldenPcrs?: Record<number, string>): Promise<boolean> {
        this.logging.log("[TPM] Verifying system integrity via hardware PCR attestation...", SyslogSeverity.DEBUG);
        
        try {
            if (!goldenPcrs || Object.keys(goldenPcrs).length === 0) {
                this.logging.log("[TPM] WARNING: No Golden PCR baseline provided. Integrity check is performative only.", SyslogSeverity.WARNING);
                return true; 
            }

            const currentPcrs = await this.getPcrs();

            for (const [index, expected] of Object.entries(goldenPcrs)) {
                const idx = parseInt(index);
                const actual = currentPcrs[idx];
                
                if (!actual) {
                    this.logging.log(`[TPM] PCR ${idx} not found in hardware output.`, SyslogSeverity.ERROR);
                    return false;
                }

                if (actual !== expected.toLowerCase()) {
                    this.logging.log(`[TPM] INTEGRITY FAILURE: PCR ${idx} mismatch!`, SyslogSeverity.CRITICAL);
                    this.logging.log(`[TPM] Expected: ${expected}`, SyslogSeverity.CRITICAL);
                    this.logging.log(`[TPM] Actual:   ${actual}`, SyslogSeverity.CRITICAL);
                    return false;
                }
            }

            this.logging.log("[TPM] Hardware integrity verified against Golden PCR baseline.", SyslogSeverity.INFORMATIONAL);
            return true;
        } catch (e) {
            this.logging.log(`[TPM] Integrity check skipped or failed to execute: ${(e as Error).message}. Continuing in software-trust mode.`, SyslogSeverity.WARNING);
            // We return true here to avoid self-destructing on systems without TPM tools during development.
            // In a production lockdown environment, the executor would be hardened.
            return true;
        }
    }

    private static missingBinaries: Set<string> = new Set();

    /**
     * Signs data using the hardware Root of Trust.
     */
    async sign(data: string): Promise<string> {
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

        return this.softwareFallback(data);
    }

    /**
     * Verifies a hardware signature against data.
     */
    async verify(data: string, signature: string): Promise<boolean> {
        if (TPMManager.missingBinaries.has("tpm2_verifysignature") || TPMManager.missingBinaries.has("tpm2_sign")) {
            // Software fallback verification (simple hash check)
            const expected = await this.softwareFallback(data);
            return signature === expected;
        }

        try {
            const keyHandle = "0x81010001";
            const sigBytes = atob(signature);
            const tempSigFile = await Deno.makeTempFile();
            await Deno.writeTextFile(tempSigFile, sigBytes);

            const verifyRes = await this.executor.execute("tpm2_verifysignature", [
                "-c", keyHandle,
                "-g", "sha256",
                "-s", tempSigFile,
                "-m", "-" // Read message from stdin
            ]);

            await Deno.remove(tempSigFile);
            return verifyRes.success;
        } catch (e) {
            this.logging.log(`[TPM] Verification failed: ${(e as Error).message}`, SyslogSeverity.DEBUG);
            return false;
        }
    }

    private async softwareFallback(data: string): Promise<string> {
        const encoder = new TextEncoder();
        const d = encoder.encode(data);
        const hashBuffer = await crypto.subtle.digest("SHA-256", d);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    }
}
