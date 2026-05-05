const kv = await Deno.openKv("./volume/storage/orchestrator.db");
const iter = kv.list<any>({ prefix: ["curated_threats"] });
let ipCount = 0;
let hashCount = 0;
let total = 0;
for await (const res of iter) {
    total++;
    if (res.value.type === "IP") ipCount++;
    if (res.value.type === "HASH") hashCount++;
}
console.log(`Total: ${total}, IPs: ${ipCount}, Hashes: ${hashCount}`);
kv.close();
