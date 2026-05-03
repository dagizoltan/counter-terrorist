/**
 * SignatureService
 * Handles Ed25519 cryptographic verification for sensitive manifests.
 * Utilizes native Deno SubtleCrypto for zero-dependency sovereign security.
 */
export class SignatureService {
    /**
     * Verifies that a manifest was signed by the authoritative operator key.
     */
    async verify(manifest: any, signatureBase64: string, publicKeyBase64: string): Promise<boolean> {
        try {
            const publicKeyData = Uint8Array.from(atob(publicKeyBase64), c => c.charCodeAt(0));
            const signature = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
            const data = new TextEncoder().encode(JSON.stringify(manifest));
            
            const key = await crypto.subtle.importKey(
                "raw",
                publicKeyData,
                { name: "Ed25519", namedCurve: "Ed25519" },
                true,
                ["verify"]
            );

            return await crypto.subtle.verify(
                { name: "Ed25519" },
                key,
                signature,
                data
            );
        } catch (e) {
            console.error("[SIGNATURE] Verification failed:", e);
            return false;
        }
    }

    /**
     * Helper to generate a new keypair (for maintenance/setup)
     */
    async generateKeyPair() {
        const keyPair = await crypto.subtle.generateKey(
            { name: "Ed25519", namedCurve: "Ed25519" },
            true,
            ["sign", "verify"]
        );

        const publicKey = await crypto.subtle.exportKey("raw", keyPair.publicKey);
        const privateKey = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

        return {
            privateKey: btoa(String.fromCharCode(...new Uint8Array(privateKey))),
            publicKey: btoa(String.fromCharCode(...new Uint8Array(publicKey)))
        };
    }
}
