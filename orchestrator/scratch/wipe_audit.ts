const kv = await Deno.openKv();
const entries = kv.list({ prefix: ["audit"] });
for await (const entry of entries) {
  await kv.delete(entry.key);
}
console.log("Audit logs wiped.");
kv.close();
