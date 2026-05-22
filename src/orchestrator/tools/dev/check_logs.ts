const kv = await Deno.openKv("./volume/storage/orchestrator.db");
const iter = kv.list({ prefix: ["logs"] }, { reverse: true, limit: 100 });
for await (const entry of iter) {
    console.log(JSON.stringify(entry.value));
}
kv.close();
