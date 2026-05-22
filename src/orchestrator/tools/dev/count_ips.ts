const kv = await Deno.openKv("./volume/storage/orchestrator.db");
const iter = kv.list({ prefix: ["enforcement"] });
let count = 0;
for await (const _ of iter) count++;
console.log(`Enforcement count: ${count}`);
kv.close();
