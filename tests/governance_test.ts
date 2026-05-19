import { assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { GovernanceService } from "../src/orchestrator/domain/orchestration/governance_service.ts";
import { LogType, LogSeverity } from "../src/orchestrator/core/ports.ts";

Deno.test("GovernanceService - single node override", async () => {
    const mesh = {
        getNodeId: () => "node-1",
        getActiveNodeCount: () => 0,
        getNodes: () => [{ id: "node-1", lastSeen: Date.now() }]
    } as any;

    const firewall = {
        lockdown: async () => {}
    };
    const protection = { firewall };

    let logs: any[] = [];
    const logging = {
        log: (entry: any) => logs.push(entry)
    } as any;

    const gov = new GovernanceService(mesh, protection, logging);
    const id = await gov.propose("LOCKDOWN", "all");

    assertNotEquals(id, undefined);
    // Should execute immediately in single node mode
    const executionLog = logs.find(l => l.message.includes("QUORUM REACHED"));
    assertNotEquals(executionLog, undefined);

    await gov.shutdown();
});

Deno.test("GovernanceService - proposal cleanup", async () => {
    const mesh = {
        getNodeId: () => "node-1",
        getActiveNodeCount: () => 0,
        getNodes: () => [{ id: "node-1", lastSeen: Date.now() }]
    } as any;

    const protection = { firewall: {} };
    const logging = { log: () => {} } as any;

    const gov = new GovernanceService(mesh, protection, logging);

    // Inject old proposal
    const oldId = "old-prop";
    (gov as any).proposals.set(oldId, {
        id: oldId,
        timestamp: Date.now() - (25 * 3600 * 1000), // 25 hours ago
        votes: new Map()
    });

    const newId = "new-prop";
    (gov as any).proposals.set(newId, {
        id: newId,
        timestamp: Date.now(),
        votes: new Map()
    });

    // Run cleanup
    (gov as any).cleanupProposals();

    assertEquals((gov as any).proposals.has(oldId), false);
    assertEquals((gov as any).proposals.has(newId), true);

    await gov.shutdown();
});

Deno.test("GovernanceService - quorum logic", async () => {
    let currentNodes = 2; // 2 active nodes + self = 3 total
    const mesh = {
        getNodeId: () => "node-1",
        getActiveNodeCount: () => currentNodes,
        getNodes: () => [
            { id: "node-1", lastSeen: Date.now() },
            { id: "node-2", lastSeen: Date.now() },
            { id: "node-3", lastSeen: Date.now() }
        ]
    } as any;

    const protection = { firewall: { blockIp: async () => {} } };
    let logs: any[] = [];
    const logging = { log: (entry: any) => logs.push(entry) } as any;

    const gov = new GovernanceService(mesh, protection, logging);

    // Propose
    const id = await gov.propose("ACTIVE_SABOTAGE", "10.0.0.5");

    // 1/3 voted (proposer). Need 2/3 for quorum (Math.floor(3/2)+1 = 2)
    assertEquals(logs.some(l => l.message.includes("QUORUM REACHED")), false);

    // Vote from node-2
    await gov.handleVote({ id, voter: "node-2", approved: true });

    assertEquals(logs.some(l => l.message.includes("QUORUM REACHED")), true);

    await gov.shutdown();
});

Deno.test("GovernanceService - policy rejection", async () => {
    const mesh = {
        getNodeId: () => "node-1",
        getActiveNodeCount: () => 1,
        getNodes: () => [
            { id: "node-1", lastSeen: Date.now() },
            { id: "node-2", lastSeen: Date.now() - 100000 } // Old node
        ]
    } as any;

    const protection = { firewall: { lockdown: async () => {} } };
    let logs: any[] = [];
    const logging = { log: (entry: any) => logs.push(entry) } as any;

    const gov = new GovernanceService(mesh, protection, logging);

    // Proposal from unknown node
    await gov.handleProposal({
        id: "prop-1",
        proposer: "node-unknown",
        type: "LOCKDOWN",
        target: "all",
        timestamp: Date.now()
    });

    assertEquals(logs.some(l => l.message.includes("Proposer node-unknown not found")), true);

    // Proposal from too new node
    mesh.getNodes = () => [
        { id: "node-1", lastSeen: Date.now() },
        { id: "node-2", lastSeen: Date.now() } // Just seen (uptime 0)
    ];

    await gov.handleProposal({
        id: "prop-2",
        proposer: "node-2",
        type: "LOCKDOWN",
        target: "all",
        timestamp: Date.now()
    });

    assertEquals(logs.some(l => l.message.includes("Proposer node is too new")), true);

    await gov.shutdown();
});
