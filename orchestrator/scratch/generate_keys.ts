import { ApiKeysService } from "../services/api_keys.ts";
import { loggingService } from "../infrastructure/logging.ts";

const kv = await Deno.openKv("./data/orchestrator.db");
const apiKeysService = new ApiKeysService(kv, loggingService);

// We need to bypass the role check for the script to create an admin API key
async function forceCreateApiKey(name: string, role: any) {
  const id = crypto.randomUUID();
  const rawKey = `ct_${role}_${crypto.randomUUID().replace(/-/g, "")}`;
  
  const encoder = new TextEncoder();
  const data = encoder.encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

  const metadata = {
    id,
    name,
    role,
    createdAt: Date.now(),
  };

  await kv.set(["api_keys_hash", keyHash], metadata);
  await kv.set(["api_keys_id", id], keyHash);

  console.log(`Created ${role} key [${name}]: ${rawKey}`);
}

console.log("--- Generating Scoped API Tokens ---");
await forceCreateApiKey("Global Admin", "admin");
await forceCreateApiKey("System Operator", "operator");
await forceCreateApiKey("Security Auditor", "viewer");

kv.close();
