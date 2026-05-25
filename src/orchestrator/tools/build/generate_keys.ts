/**
 * Developer Key Generator
 * Generates an Ed25519 key pair for signing sidecar manifests.
 * The public key should be hardcoded in SidecarManager.ts
 */

async function main() {
    console.log("Generating Developer Ed25519 Key Pair...");

    const keyPair = await crypto.subtle.generateKey(
        "Ed25519",
        true,
        ["sign", "verify"]
    );

    const publicKey = await crypto.subtle.exportKey("raw", keyPair.publicKey);
    const privateKey = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

    const pubHex = Array.from(new Uint8Array(publicKey))
        .map(b => b.toString(16).padStart(2, "0")).join("");

    const privHex = Array.from(new Uint8Array(privateKey))
        .map(b => b.toString(16).padStart(2, "0")).join("");

    console.log("\n--- PUBLIC KEY (Hardcode this in SidecarManager.ts) ---");
    console.log(pubHex);

    console.log("\n--- PRIVATE KEY (Save this SECURELY, e.g., to .dev_private_key) ---");
    console.log(privHex);

    await Deno.writeTextFile(".dev_public_key", pubHex);
    await Deno.writeTextFile(".dev_private_key", privHex);

    console.log("\nKeys saved to .dev_public_key and .dev_private_key");
}

if (import.meta.main) {
    main().catch(console.error);
}
