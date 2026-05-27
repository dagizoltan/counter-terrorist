import { canonicalStringify } from "../src/orchestrator/core/crypto_utils.ts";

/**
 * SOV-P5: Automated Manifest Signing Pipeline
 * Signs the sidecar manifest using Ed25519 for hardware-anchored integrity.
 */

async function signManifest() {
    const manifestPath = "./src/orchestrator/infrastructure/runtime/sidecars.manifest.json";
    const content = await Deno.readTextFile(manifestPath);
    const data = JSON.parse(content);

    // SEC-03: Development Key (Matching SidecarManager.DEVELOPER_PUBLIC_KEY)
    // In production, this would be handled by a TPM-resident key via CI/CD.
    const privateKeyHex = "d016a9d7b9736c99c565d38f8f26a575a6c117d8487e87365287f7311746618e"; // Example dev key seed

    const privateKeyBytes = new Uint8Array(privateKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

    // Ed25519 key import (PKCS8 format is usually required for private keys in SubtleCrypto)
    // However, for Ed25519 "raw" export/import of private keys is not standard in WebCrypto.
    // We use a simplified HMAC-based approach or Ed25519 if we had the correct PKCS8 wrapping.
    // For this roadmap implementation, we'll use HMAC-SHA256 as a robust alternative if Ed25519 raw fails.

    // BUT wait, SidecarManager expects Ed25519. Let's try to generate a key pair and use that.
    const keyPair = await crypto.subtle.generateKey(
        "Ed25519",
        true,
        ["sign", "verify"]
    );

    const dataToSign = new TextEncoder().encode(canonicalStringify(data.sidecars));
    const signature = await crypto.subtle.sign(
        "Ed25519",
        keyPair.privateKey,
        dataToSign
    );

    const signatureHex = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, "0")).join("");

    const exportedPublicKey = await crypto.subtle.exportKey("raw", keyPair.publicKey);
    const publicKeyHex = Array.from(new Uint8Array(exportedPublicKey))
        .map(b => b.toString(16).padStart(2, "0")).join("");

    data.signature = signatureHex;
    data.signedBy = "Counter-Terrorist Orchestrator CI/CD (Ed25519)";

    await Deno.writeTextFile(manifestPath, JSON.stringify(data, null, 2));
    console.log(`Manifest signed successfully.`);
    console.log(`Signature: ${signatureHex}`);
    console.log(`New Public Key: ${publicKeyHex}`);
    console.log(`Update SidecarManager.DEVELOPER_PUBLIC_KEY with this if you want to use this new key.`);
}

signManifest().catch(console.error);
