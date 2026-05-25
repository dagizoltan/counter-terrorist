const kv = await Deno.openKv("./volume/storage/orchestrator.db");
const iter = kv.list({ prefix: ["curated_threats"] });
let count = 0;
for await (const res of iter) {
    const value = res.value as { type?: string };
    if (value.type === "HASH") {
        console.log(JSON.stringify(res.value, null, 2));
        count++;
    }
    if (count > 5) break;
}
console.log(`Total HASH entries found: ${count}`);
kv.close();
