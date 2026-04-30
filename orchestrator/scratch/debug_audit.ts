const kv = await Deno.openKv();
const entries = kv.list({ prefix: ["audit"] });
console.log("--- AUDIT LOGS ---");
for await (const entry of entries) {
  console.log(JSON.stringify(entry.value, null, 2));
}
kv.close();
