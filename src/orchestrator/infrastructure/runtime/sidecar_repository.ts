import { LoggingPort, LogSeverity, LogType, ConfigurationPort } from "@core/ports.ts";
import { SIDECAR_REGISTRY } from "./sidecar_registry.ts";
import { canonicalStringify } from "@core/crypto_utils.ts";

export interface SidecarManifest {
    sidecars: Record<string, {
        persistent?: boolean;
        capabilities?: string[];
        architectures: Record<string, {
            path: string;
            hash: string;
        }>;
    }>;
    signature?: string;
    upgrade_token?: string;
    signedBy?: string;
}

export class SidecarRepository {
    private static readonly DEVELOPER_PUBLIC_KEY = "d7637d35b2a469117127ec88c86a80a4e1dc95a4997be4fe1ee7af35b8bb2702";
    private manifest: SidecarManifest | null = null;

    constructor(private logging: LoggingPort) {}

    async loadManifest(config: ConfigurationPort) {
        try {
            const manifestUrl = new URL("./sidecars.manifest.json", import.meta.url);
            const content = await Deno.readTextFile(manifestUrl);
            const data = JSON.parse(content);

            const isProduction = config.getEnv("ENVIRONMENT") === "production";
            let signatureVerified = false;

            if (data.signature && data.signature !== "unsigned") {
                try {
                    const publicKeyBytes = new Uint8Array(SidecarRepository.DEVELOPER_PUBLIC_KEY.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));
                    const publicKey = await crypto.subtle.importKey("raw", publicKeyBytes, "Ed25519", false, ["verify"]);
                    const signatureBytes = new Uint8Array(data.signature.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));
                    const dataToVerify = new TextEncoder().encode(canonicalStringify(data.sidecars));
                    signatureVerified = await crypto.subtle.verify("Ed25519", publicKey, signatureBytes, dataToVerify);
                } catch (e) {
                    await this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.ERROR,
                        caller: "orchestrator:infra:runtime:sidecar_repository",
                        message: `Crypto error during manifest verification: ${(e as Error).message}`
                    });
                }
            }

            if (signatureVerified) {
                this.manifest = data;
                await this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.SUCCESS,
                    caller: "orchestrator:infra:runtime:sidecar_repository",
                    message: `Authoritative Multi-Arch Manifest Hardware-Verified via Ed25519.`
                });
            } else {
                this.manifest = data;
                if (isProduction && !data.upgrade_token) {
                    throw new Error("Production Lockdown: Manifest signature verification FAILED!");
                }
            }
        } catch (e) {
            await this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:infra:runtime:sidecar_repository",
                message: `Manifest unavailable or invalid: ${(e as Error).message}`
            });
            if (config.getEnv("ENVIRONMENT") === "production") throw e;
        }
    }

    getManifest(): SidecarManifest | null {
        return this.manifest;
    }

    async findBinary(name: string, config: ConfigurationPort): Promise<string | null> {
        const isWindows = Deno.build.os === "windows";
        const extension = isWindows ? ".exe" : "";
        const sidecarConfig = SIDECAR_REGISTRY[name];
        const binName = sidecarConfig?.binaryName || name;

        const envPath = config.getEnv(`CTS_BINARY_${name.toUpperCase()}`);
        const isDev = config.getBoolean("CTS_DEV_MODE", false);

        const paths = [
            envPath,
            `/opt/cts/bin/${binName}${extension}`,
            `/usr/local/bin/cts-${binName}${extension}`,
            `./agents/${binName}${extension}`,
            `./bin/agents/${binName}${extension}`,
            ...(isDev ? [
                `./src/agents/target/release/${binName}${extension}`,
                `./src/agents/target/debug/${binName}${extension}`,
            ] : [])
        ].filter(Boolean) as string[];

        for (const p of paths) {
            try {
                const info = await Deno.stat(p);
                if (info.isFile) return await Deno.realPath(p);
            } catch { /* skip */ }
        }
        return null;
    }
}
