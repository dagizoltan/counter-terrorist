/**
 * Manifest Signing Tool
 * Uses the developer private key to sign sidecars.manifest.json.
 */
import { dirname, resolve } from "@std/path";
import { fromFileUrl } from "@std/path/from-file-url";
import { canonicalStringify } from "../../core/crypto_utils.ts";

const scriptDir = dirname(fromFileUrl(import.meta.url));
const manifestPath = resolve(scriptDir, "..", "..", "infrastructure", "runtime", "sidecars.manifest.json");

async function main() {
    let privHex: string;
    try {
        privHex = await Deno.readTextFile(".dev_private_key");
    } catch {
        console.error("Error: .dev_private_key not found. Run generate_keys.ts first.");
        Deno.exit(1);
    }

    const privateKeyBytes = new Uint8Array(privHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const privateKey = await crypto.subtle.importKey(
        "pkcs8",
        privateKeyBytes,
        "Ed25519",
        false,
        ["sign"]
    );

    const manifestText = await Deno.readTextFile(manifestPath);
    const manifest = JSON.parse(manifestText);

    // We sign the 'sidecars' object to ensure integrity of all hashes
    const dataToSign = new TextEncoder().encode(canonicalStringify(manifest.sidecars));
    const signature = await crypto.subtle.sign(
        "Ed25519",
        privateKey,
        dataToSign
    );

    manifest.signature = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, "0")).join("");
    manifest.signedBy = "Counter-Terrorist Developer";

    await Deno.writeTextFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`✅ Manifest signed successfully: ${manifest.signature.slice(0, 16)}...`);
}

if (import.meta.main) {
    main().catch(console.error);
}
