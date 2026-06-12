import { BaseService } from "@core/base_service.ts";
import { LoggingPort, LogSeverity, LogType, ConfigurationPort, MeshAuthPort, MeshPort } from "@core/ports.ts";
import type { AuditEvent as DomainAuditEvent } from "../analysis/audit.ts";
import { Result, ok, err } from "@core/result.ts";
import { TACTICAL_CONSTANTS } from "@core/constants.ts";
import { AuditService } from "../analysis/audit.ts";
import { z } from "zod";
import { ServiceLocatorPort } from "../../core/ports.ts";
import { MeshChaosEngine } from "./chaos_engine.ts";
import { MeshGossipManager } from "./mesh/gossip_manager.ts";
import { MeshConsensusManager } from "./mesh/consensus_manager.ts";
import { MeshDiscoveryManager } from "./mesh/discovery_manager.ts";
import { MeshIdentityManager } from "./mesh/identity_manager.ts";
import { MeshSyncManager } from "./mesh/sync_manager.ts";
import { MeshResilienceManager } from "./mesh/resilience_manager.ts";
import { MeshAuditSyncManager } from "./mesh/audit_sync_manager.ts";
import { MeshConsensusDelegate } from "./mesh/consensus_delegate.ts";
import { MeshProbeManager } from "./mesh/probe_manager.ts";

export const MeshNodeSchema = z.object({
  id: z.string(),
  hostname: z.string(),
  address: z.string(),
  port: z.number(),
  lastSeen: z.number(),
  verified: z.boolean()
});

export type MeshNode = z.infer<typeof MeshNodeSchema>;

export class MeshManager extends BaseService implements MeshPort {
  private nodes: Map<string, MeshNode> = new Map();
  private nodeId: string = "";
  private discoveryId: string = "";
  private meshSecret: string | undefined;
  declare public locator?: ServiceLocatorPort;

  private chaosEngine: MeshChaosEngine;
  private gossip!: MeshGossipManager;
  private consensus!: MeshConsensusManager;
  private discovery!: MeshDiscoveryManager;
  private identity!: MeshIdentityManager;
  private syncManager!: MeshSyncManager;
  private resilience!: MeshResilienceManager;
  private auditSync!: MeshAuditSyncManager;
  private consensusDelegate!: MeshConsensusDelegate;
  private probeManager!: MeshProbeManager;

  constructor(
    private meshAuth: MeshAuthPort,
    private logging: LoggingPort,
    private audit: AuditService,
    private config: ConfigurationPort
  ) {
    super();
    this.chaosEngine = new MeshChaosEngine(logging);
    this.identity = new MeshIdentityManager(logging, config, meshAuth);
    this.syncManager = new MeshSyncManager(logging, config, this.chaosEngine, {
        signPayload: (p) => this.signPayload(p),
        init: () => this.init()
    }, null);
    this.resilience = new MeshResilienceManager(logging, audit, {
        sendSyncInternal: (n, p) => this.sendSyncInternal(n, p),
        requestAuditSync: (id) => this.requestAuditSync(id)
    });
    this.auditSync = new MeshAuditSyncManager(logging, audit, {
        sendSyncInternal: (n, p) => this.sendSyncInternal(n, p)
    });
    this.consensusDelegate = new MeshConsensusDelegate(logging, {
        signPayload: (p) => this.signPayload(p),
        verifySignature: (p, s, id) => this.verifySignature(p, s, id),
        sendSyncInternal: (n, p) => this.sendSyncInternal(n, p)
    });
    this.probeManager = new MeshProbeManager(logging, config, {
        signPayload: (p) => this.signPayload(p),
        validateAndRegisterNode: (n) => this.validateAndRegisterNode(n)
    }, null, 8000);

    this.discovery = new MeshDiscoveryManager(logging, config, {
        probeNode: (addr) => this.probeManager.probeNode(addr, this.meshSecret, this.nodeId),
        scanNetwork: () => this.scanNetwork(),
        resolveSplitBrain: () => this.resilience.resolveSplitBrain(this.getNodes(), "GENESIS"),
        registerNode: (n) => this.registerNode(n)
    });
  }

  public setLocator(locator: ServiceLocatorPort) {
    this.locator = locator;
  }

  protected override async onInit(): Promise<Result<void>> {
    this.nodeId = Deno.hostname() || "node-" + crypto.randomUUID().slice(0, 8);

    this.gossip = new MeshGossipManager(this.logging, this);
    this.consensus = new MeshConsensusManager(this.logging, this.config, this);

    const idRes = await this.identity.initialize(this.nodeId);
    if (!idRes.success) return idRes;

    this.syncManager.setHttpClient(idRes.data.httpClient);
    this.probeManager.setHttpClient(idRes.data.httpClient);

    this.meshSecret = this.config.getEnv("MESH_SECRET");

    return ok(undefined);
  }

  protected override async onShutdown(): Promise<Result<void>> {
    this.discovery.stop();
    this.nodes.clear();
    return ok(undefined);
  }

  getNodeId() { return this.nodeId; }
  getNodes(): MeshNode[] { return Array.from(this.nodes.values()); }

  async registerNode(node: MeshNode) {
    const isNew = !this.nodes.has(node.id);
    this.nodes.set(node.id, { ...node, lastSeen: Date.now() });
    if (isNew && this.eventBus) {
        await this.eventBus.emit("UI_BROADCAST", {
            type: "AUDIT_EVENT",
            data: { type: LogType.AUDIT, severity: LogSeverity.SUCCESS, message: `New node: ${node.hostname}`, data: node }
        });
    }
  }

  async broadcast(payload: Record<string, unknown>, priority: boolean = false): Promise<Result<void>> {
    const verifiedNodes = Array.from(this.nodes.values()).filter(n => n.verified && !this.chaosEngine.shouldPartition(n.id));
    return await this.gossip.broadcast(payload, verifiedNodes, priority);
  }

  async reconcile(): Promise<Result<void>> {
    await this.auditSync.reconcile(this.getNodes(), this.nodeId);
    return ok(undefined);
  }

  async requestApproval(action: string, data: unknown, threshold?: number): Promise<boolean> {
    return await this.consensusDelegate.requestApproval(this.getNodes(), this.nodeId, action, data, threshold);
  }

  async signPayload(payload: unknown): Promise<string> {
      const { canonicalStringify, signPayload } = await import("../../core/crypto_utils.ts");
      if (this.config.getBoolean("TPM_RESIDENT_IDENTITY", true)) {
          const res = await this.meshAuth.signWithNodeKey(this.nodeId, canonicalStringify(payload));
          return res.success ? res.data : "unsigned";
      }
      return this.meshSecret ? await signPayload(payload as Record<string, unknown>, this.meshSecret) : "unsigned";
  }

  async verifySignature(payload: unknown, signature: string, peerId?: string): Promise<boolean> {
      const { canonicalStringify, verifySignature } = await import("../../core/crypto_utils.ts");
      if (this.config.getBoolean("TPM_RESIDENT_IDENTITY", true) && signature.startsWith("p-sig:")) {
          return signature === `p-sig:node-key-${peerId || this.nodeId}:${canonicalStringify(payload)}`;
      }
      return this.meshSecret ? await verifySignature(payload as Record<string, unknown>, signature, this.meshSecret) : false;
  }

  private async sendSyncInternal(node: MeshNode, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
      return await this.syncManager.sendSync(node, payload);
  }

  private async scanNetwork() { /* stub */ }
  private async validateAndRegisterNode(node: MeshNode) { await this.registerNode(node); }
  async requestAuditSync(nodeId: string) {
      const node = this.nodes.get(nodeId);
      if (node) await this.sendSyncInternal(node, { type: "FETCH_STATE" });
  }

  async isolateNode(nodeId: string): Promise<Result<void>> {
      this.nodes.delete(nodeId);
      return ok(undefined);
  }

  async requestQuorumCommand(action: string, data: unknown): Promise<boolean> {
      return await this.consensus.requestQuorumCommand(action, data, this.getNodes());
  }

  async rotateIdentity(): Promise<Result<void>> {
      const oldId = this.nodeId;
      this.nodeId = Deno.hostname() + "-" + crypto.randomUUID().slice(0, 8);
      const res = await this.identity.rotateIdentity(this.nodeId);
      if (res.success) {
          this.syncManager.setHttpClient(res.data.httpClient);
          this.probeManager.setHttpClient(res.data.httpClient);
          return ok(undefined);
      }
      this.nodeId = oldId;
      return err(res.error);
  }

  async broadcastBlock(ip: string): Promise<Result<void>> { return await this.broadcast({ type: "GOSSIP_BLOCK", data: { ip } }, true); }
  async broadcastQuarantine(target: string): Promise<Result<void>> { return await this.broadcast({ type: "GOSSIP_QUARANTINE", data: { target } }, true); }
  async broadcastLockdown(): Promise<Result<void>> { return await this.broadcast({ type: "GOSSIP_LOCKDOWN" }, true); }
  async broadcastAuditEvent(event: DomainAuditEvent) { await this.broadcast({ type: "GOSSIP_AUDIT", data: event }); }
  async broadcastAuditVerification(lastHash: string, eventCount: number) { await this.broadcast({ type: "GOSSIP_AUDIT_VERIFY", data: { lastHash, eventCount } }); }
  async broadcastThreatHash(hash: string, sourceNode: string): Promise<Result<void>> { return await this.broadcast({ type: "GOSSIP_THREAT_HASH", data: { hash, sourceNode } }); }

  startDiscovery() { this.discovery.start(); }
  discoverSubnet() { return this.discovery.discoverSubnet(); }
  getActiveNodeCount() { return this.getNodes().filter(n => (Date.now() - n.lastSeen) < 600000).length; }
  getKv() { return (this.config as any).kv; }
  getChaosEngine() { return this.chaosEngine; }
  sendSync(node: MeshNode, payload: Record<string, unknown>) { return this.sendSyncInternal(node, payload); }
}

export let meshManager: MeshManager;
export function setMeshManager(instance: MeshManager) { meshManager = instance; }
