const kv = await Deno.openKv();
const stats: Record<string, number> = {};
const iter = kv.list<any>({ prefix: ["curated_threats"] });
for await (const res of iter) {
    const t = res.value;
    stats[t.provider] = (stats[t.provider] || 0) + 1;
}
console.log(JSON.stringify(stats, null, 2));
kv.close();
