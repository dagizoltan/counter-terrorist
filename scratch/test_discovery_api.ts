import { IntelEnricher } from "../src/orchestrator/domain/analysis/intel_enricher.ts";

const wifi = [];
const bluetooth = [];
const ethernet = [];
const mesh = [{ id: "test", hostname: "test", verified: true, address: "1.1.1.1", lastSeen: Date.now() }];

try {
    console.log("Enriching wifi...");
    IntelEnricher.enrichDevices(wifi);
    console.log("Enriching bluetooth...");
    IntelEnricher.enrichDevices(bluetooth);
    console.log("Enriching ethernet...");
    IntelEnricher.enrichDevices(ethernet);
    console.log("Enriching mesh...");
    // Simulating the mapping in api.tsx
    const meshMapped = mesh.map(n => ({
        id: n.id || n.hostname,
        hostname: n.hostname,
        mac: n.id,
        ip: n.address,
        isMeshNode: true,
        type: "MESH",
        state: "REACHABLE",
        lastSeen: new Date(n.lastSeen).toISOString()
    }));
    IntelEnricher.enrichDevices(meshMapped);
    console.log("Success!");
} catch (e) {
    console.error("Crash detected:", e);
}
