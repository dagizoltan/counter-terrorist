const kv = await Deno.openKv("./volume/storage/orchestrator.db");
const iter = kv.list({ prefix: ["logs"] }, { limit: 10, reverse: true });
const logs = [];
for await (const entry of iter) {
    logs.push(entry.value);
}
console.log(JSON.stringify(logs, null, 2));
kv.close();
