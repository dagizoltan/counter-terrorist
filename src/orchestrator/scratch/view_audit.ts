const kv = await Deno.openKv();
const entries = kv.list({ prefix: ["audit"] });
const logs = [];
for await (const entry of entries) {
    logs.push(entry.value);
}

// Filter for pcap dissector logs
const dissectorLogs = logs.filter((l: any) => l.caller === "pcap:dissector");

console.log(JSON.stringify(dissectorLogs, null, 2));
