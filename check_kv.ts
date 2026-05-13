const kv = await Deno.openKv();
for await (const entry of kv.list({ prefix: ["network_logs"] }, { limit: 10 })) {
    console.log(JSON.stringify(entry));
}
kv.close();
