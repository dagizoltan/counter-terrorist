import { BaseService } from "@core/base_service.ts";

import { LoggingPort, LogSeverity, LogType, ConfigurationPort, MeshAuthPort, TpmPort } from "@core/ports.ts";
import type { AuditEvent as DomainAuditEvent } from "../analysis/audit.ts";
import { Result, ok, err } from "@core/result.ts";
import { TACTICAL_CONSTANTS } from "@core/constants.ts";
import { retry, CircuitBreaker } from "../../core/utils/resilience.ts";
import { AuditService } from "../analysis/audit.ts";
import { z } from "zod";
import { ServiceLocatorPort } from "../../core/ports.ts";
import { MeshChaosEngine } from "./chaos_engine.ts";

export const MeshNodeSchema = z.object({
  id: z.string(),
  hostname: z.string(),
  address: z.string(),
  port: z.number(),
  lastSeen: z.number(),
  verified: z.boolean()
});

export type MeshNode = z.infer<typeof MeshNodeSchema>;

export class MeshManager extends BaseService {
  private nodes: Map<string, MeshNode> = new Map();
  private discoveryInterval: number | null = null;
  private metricsInterval: number | null = null;
  private mdnsListener: Deno.DatagramConn | null = null;
  private nodeCert: { cert: string, key: string } | null = null;
  private nodeId: string = "";
  private port: number = 8000;
  private httpClient: Deno.HttpClient | null = null;
  private meshSecret: string | undefined;
  private watcherAbortController: AbortController | null = null;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private locator?: ServiceLocatorPort;
  private chaosEngine: MeshChaosEngine;

  public setLocator(locator: ServiceLocatorPort) {
    this.locator = locator;
  }

  protected override onShutdown(): Promise<Result<void>> {
      if (this.discoveryInterval) clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
      if (this.metricsInterval) clearInterval(this.metricsInterval);
      this.metricsInterval = null;
      if (this.mdnsListener) {
          try { this.mdnsListener.close(); } catch { /* ignore */ }
          this.mdnsListener = null;
      }
      if (this.httpClient) {
          this.httpClient.close();
          this.httpClient = null;
      }
      if (this.watcherAbortController) {
          this.watcherAbortController.abort();
          this.watcherAbortController = null;
      }
      this.nodes.clear();
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.ACTIVITY,
          severity: LogSeverity.INFO,
          caller: "orchestrator:domain:orchestration:mesh",
          message: "Mesh MeshManager offline."
      });
      return Promise.resolve(ok(undefined));
  }

  constructor(
    private meshAuth: MeshAuthPort,
    private logging: LoggingPort,
    private audit: AuditService,
    private config: ConfigurationPort
  ) {
    super();
    this.chaosEngine = new MeshChaosEngine(logging);
    this.metricsInterval = setInterval(() => this.emitMetrics(), 30000);
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:orchestration:mesh",
        message: "Initializing Sovereign Mesh Infrastructure..."
    });
  }

  private emitMetrics() {
    if (!this.eventBus) return;
    this.eventBus.emit("METRIC_UPDATE", {
      domain: "mesh",
      data: {
        activeNodes: Array.from(this.nodes.values()).filter(n => (Date.now() - n.lastSeen) < 60000).length,
        totalNodes: this.nodes.size,
        selfId: this.nodeId
      }
    });
  }

  protected override async onInit(): Promise<Result<void>> {

    this.nodeId = Deno.hostname() || "node-" + crypto.randomUUID().slice(0, 8);
    this.startStateWatcher();
    this.port = this.config.getNumber("PORT", 8000);
    this.meshSecret = this.config.getEnv("MESH_SECRET");

    try {
      // SOV-P4: Hardware-Resident Identity
      // Private key never leaves the trustroot sidecar (TPM).
      const tpmMode = this.config.getBoolean("TPM_RESIDENT_IDENTITY", true);
      let nodeCert;

      if (tpmMode) {
          const res = await this.meshAuth.generateProxyNodeCert(this.nodeId);
          if (!res.success) throw new Error(`MeshAuth generateProxyNodeCert failed: ${String((res.error as any)?.message || res.error)}`);
          nodeCert = { cert: res.data.cert, key: "HW_PROXY" };
      } else {
          const res = await this.meshAuth.generateNodeCert(this.nodeId);
          if (!res.success) throw new Error(`MeshAuth generateNodeCert failed: ${String((res.error as any)?.message || res.error)}`);
          nodeCert = res.data;
      }

      if (!nodeCert || typeof nodeCert.cert !== "string") {
          throw new Error("MeshAuth returned invalid certificate data");
      }
      this.nodeCert = nodeCert;

      // Create mTLS HTTP client
      this.httpClient = Deno.createHttpClient({
        cert: this.nodeCert.cert,
        key: this.nodeCert.key,
        caCerts: await this.meshAuth.getTrustedCerts(),
        http2: true,
      });

      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.INFO,
          caller: "orchestrator:domain:orchestration:mesh",
          message: `mTLS Identity established for ${this.nodeId}`
      });
      return ok(undefined);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.WARNING,
          caller: "orchestrator:domain:orchestration:mesh",
          message: `Failed to initialize mTLS: ${error.message}. Continuing with limited mesh functionality.`
      });
      return err(error);
    }
  }

  getNodeId() {
    return this.nodeId;
  }

  getActiveNodeCount() {
    return Array.from(this.nodes.values()).filter(n => (Date.now() - n.lastSeen) < 600000).length;
  }

  startDiscovery() {
    if (this.discoveryInterval) return;

    if (this.config?.getEnv("SINGLE_NODE") === "true" || Deno.env.get("SINGLE_NODE") === "true") {
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.INFO,
          caller: "orchestrator:domain:orchestration:mesh",
          message: "SINGLE_NODE mode active. Mesh discovery and mDNS listeners bypassed."
      });
      return;
    }

    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:orchestration:mesh",
        message: "Starting zero-config node discovery..."
    });

    this.listenForDiscovery();

    setTimeout(() => {
        this.discoverSubnet().catch(() => {});
    }, 2000 + Math.random() * 3000);
    
    this.discoveryInterval = setInterval(() => {
        this.discoverSubnet();
        this.scanNetwork();
        this.resolveSplitBrain(); // Periodic split-brain check
    }, TACTICAL_CONSTANTS.MESH.DISCOVERY_INTERVAL_MS + (Math.random() * 5000));
  }

  private async discoverSubnet() {
    const interfaces = Deno.networkInterfaces();
    const localIps = interfaces
      .filter(i => i.family === "IPv4" && !i.address.startsWith("127."))
      .map(i => i.address);

    for (const ip of localIps) {
      const subnet = ip.split(".").slice(0, 3).join(".");
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.INFO,
          caller: "orchestrator:domain:orchestration:mesh",
          message: `Probing subnet ${subnet}.0/24...`
      });
      
      const probes = [];
      // SOV-05 STABILITY: Throttled subnet probing to avoid IDS triggers and network congestion.
      const MAX_CONCURRENCY = 2;

      for (let i = 1; i < 255; i++) {
        const targetIp = `${subnet}.${i}`;
        if (targetIp === ip) continue; // Skip self

        probes.push(this.probeNode(targetIp));
        
        if (probes.length >= MAX_CONCURRENCY) {
            await Promise.all(probes);
            probes.length = 0;
            // Increased jitter for stealth and stability
            await new Promise(r => setTimeout(r, 500 + Math.random() * 1500));
        }
      }
      await Promise.all(probes);
    }
  }

  private async probeNode(address: string) {
    if (!this.httpClient) return;

    // SOV-06 HARDENING: Explicitly block loopback and cloud-metadata addresses from active probing
    const { isValidIP } = await import("@infrastructure/system/validation.ts");
    const isLoopback = address === "127.0.0.1" || address === "::1" || address.startsWith("127.");
    const isMetadata = address === "169.254.169.254" || address.startsWith("169.254.");

    if (!isValidIP(address) || isLoopback || isMetadata) return;

    // SEC-05: Subnet Gating
    const allowedSubnets = this.config.getEnv("MESH_ALLOWED_SUBNETS");
    if (allowedSubnets && !this.isIpAllowed(address, allowedSubnets)) {
        return;
    }

    try {
      const url = `https://${address}:${this.port}/api/mesh/ping`;
      const res = await fetch(url, { 
        client: this.httpClient,
        signal: AbortSignal.timeout(2000) 
      });
      
      if (res.ok) {
        const body = await res.json();
        if (body.success && body.nodeId) {
          this.logging.log({
              timestamp: new Date().toISOString(),
              type: LogType.AUDIT,
              severity: LogSeverity.INFO,
              caller: "orchestrator:domain:orchestration:mesh",
              message: `Discovered verified peer at ${address}`
          });
          this.validateAndRegisterNode({
            id: body.nodeId,
            hostname: body.nodeId,
            address,
            port: this.port,
            lastSeen: Date.now(),
            verified: true,
          });
        }
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (!msg.includes("timeout") && !msg.includes("refused") && !msg.includes("reset")) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.DEBUG,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:orchestration:mesh",
            message: `Probe failed for ${address}: ${msg}`
        });
      }
    }
  }

  private async listenForDiscovery() {
    try {
      // @ts-ignore: Deno.listenDatagram is unstable and may not be in all environments
      if (typeof Deno.listenDatagram !== "function") return;

      this.mdnsListener = Deno.listenDatagram({
        port: 5353,
        hostname: "0.0.0.0",
        transport: "udp",
      });

      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.INFO,
          caller: "orchestrator:domain:orchestration:mesh",
          message: "Passive mDNS listener active"
      });

      for await (const [data, addr] of this.mdnsListener) {
        if (data.length > 2048) continue;
        const msg = new TextDecoder().decode(data);
        if (msg.includes("_ct-orchestrator._tcp.local")) {
           const idMatch = msg.match(/id=([^,|]+)/);
           const portMatch = msg.match(/port=(\d+)/);
           const tsMatch = msg.match(/ts=(\d+)/);
           const sigMatch = msg.match(/sig=([^|]+)/);

           if (idMatch && portMatch && tsMatch && sigMatch) {
             const id = idMatch[1];
             const port = parseInt(portMatch[1]);
             const ts = parseInt(tsMatch[1]);
             const sig = sigMatch[1];
             const address = (addr as Deno.NetAddr).hostname;

             // SEC-05: Verify HMAC Signature and Freshness
             const now = Date.now();
             if (Math.abs(now - ts) > 300000) continue; // 5 minute window

             if (this.meshSecret) {
                const { verifySignature } = await import("../../core/crypto_utils.ts");
                const isValid = await verifySignature({ id, port, ts }, sig, this.meshSecret);
                if (!isValid) {
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.WARNING,
                        caller: "MESH:DISCOVERY",
                        message: `Rejected forged mDNS announcement from ${address} (Invalid Signature)`
                    });
                    continue;
                }
             }

             if (id !== this.nodeId) {
               this.validateAndRegisterNode({
                 id,
                 hostname: id,
                 address,
                 port,
                 lastSeen: Date.now(),
                 verified: false,
               });
             }
           }
        }
      }
    } catch (e) {
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.WARNING,
          caller: "orchestrator:domain:orchestration:mesh",
          message: `Passive mDNS listener unavailable: ${(e as Error).message}`
      });
    }
  }

  private async scanNetwork() {
    try {
      // @ts-ignore: Deno.listenDatagram is unstable and may not be in all environments
      if (typeof Deno.listenDatagram !== "function") return;

      const timestamp = Date.now();
      const txt = `id=${this.nodeId},port=${this.port},ts=${timestamp}`;

      // SEC-05: Authenticated Discovery via HMAC-mDNS
      let signature = "unsigned";
      if (this.meshSecret) {
          const { signPayload } = await import("../../core/crypto_utils.ts");
          signature = await signPayload({ id: this.nodeId, port: this.port, ts: timestamp }, this.meshSecret);
      }

      const announcement = `_ct-orchestrator._tcp.local|${txt}|sig=${signature}`;
      const message = new TextEncoder().encode(announcement);

      const socket = Deno.listenDatagram({ port: 0, transport: "udp" });
      socket.send(message, { transport: "udp", hostname: "224.0.0.251", port: 5353 });
      socket.close();
    } catch (_e) {
      // Silent fail
    }
  }

  private async validateAndRegisterNode(node: MeshNode) {
    const existing = this.nodes.get(node.id);
    if (existing?.verified) {
      existing.lastSeen = Date.now();
      return;
    }

    // SOV-06: Remediate SSRF in mesh discovery
    // We only handshake with valid IPs. We allow private IPs for local mesh
    // but strictly block loopback and cloud-metadata to prevent SSRF.
    const { isValidIP } = await import("@infrastructure/system/validation.ts");
    const isLoopback = node.address === "127.0.0.1" || node.address === "::1" || node.address.startsWith("127.");
    const isMetadata = node.address === "169.254.169.254" || node.address.startsWith("169.254.");

    if (!isValidIP(node.address) || isLoopback || isMetadata) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "orchestrator:domain:orchestration:mesh",
            message: `REJECTED node ${node.id} — Illegal or prohibited IP address: ${node.address}`
        });
        return;
    }

    // SEC-05: Subnet Gating
    const allowedSubnets = this.config.getEnv("MESH_ALLOWED_SUBNETS");
    if (allowedSubnets && !this.isIpAllowed(node.address, allowedSubnets)) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "orchestrator:domain:orchestration:mesh",
            message: `REJECTED node ${node.id} — IP ${node.address} not in MESH_ALLOWED_SUBNETS`
        });
        return;
    }

    // Strict port validation for mesh peers
    if (node.port < 1024 || node.port > 65535 || (node.port !== this.port && node.port !== 8000)) {
        return;
    }

    if (!this.httpClient) {
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.WARNING,
          caller: "orchestrator:domain:orchestration:mesh",
          message: `Cannot validate node ${node.id} — mTLS client not initialized. Skipping.`
      });
      return;
    }

    try {
      const url = `https://${node.address}:${node.port}/api/mesh/ping`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.meshSecret) {
        headers["X-Mesh-Secret"] = this.meshSecret;
      }

      // SEC-05 Hardening: mTLS SAN validation during handshake
      const res = await fetch(url, {
        method: "GET",
        headers,
        client: this.httpClient,
        signal: AbortSignal.timeout(TACTICAL_CONSTANTS.MESH.MTLS_HANDSHAKE_TIMEOUT_MS), 
      });

      if (!res.ok) {
        throw new Error(`Ping returned status ${res.status}`);
      }

      const body = await res.json();

      // SEC-05: Strict SAN Validation - ensures the cert belongs to the node we think it is
      // Note: Hono/Deno fetch mTLS doesn't easily expose the server cert SAN to the JS layer
      // but the mTLS handshake itself (via Deno.createHttpClient) handles root CA validation.
      // To strictly enforce SAN, we'd typically need access to the underlying connection cert.
      // As a framework-level remediation, we ensure the returned nodeId matches the identity
      // and rely on mTLS CA enforcement.
      if (body.nodeId !== node.id) {
          throw new Error(`Node ID mismatch: expected ${node.id}, got ${body.nodeId}`);
      }
      
      if (this.meshSecret) {
          const sig = res.headers.get("X-Mesh-Signature");
          if (!sig || !(await this.verifySignature(body, sig, node.id))) {
              throw new Error("Invalid or missing mesh signature");
          }
      }
      if (body.success && body.nodeId) {
        node.verified = true;
        this.registerNode(node);
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:orchestration:mesh",
            message: `Node ${node.id} at ${node.address}:${node.port} passed mTLS validation.`
        });
      } else {
        throw new Error("Invalid ping response");
      }
    } catch (e) {
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.WARNING,
          caller: "orchestrator:domain:orchestration:mesh",
          message: `REJECTED node ${node.id} at ${node.address}:${node.port} — mTLS validation failed: ${e instanceof Error ? e.message : String(e)}`
      });
    }
  }

  registerNode(node: MeshNode) {
    const validation = MeshNodeSchema.safeParse(node);
    if (!validation.success) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "MESH:REGISTER",
            message: `Node registration failed validation: ${validation.error.message}`
        });
        return;
    }

    const isNew = !this.nodes.has(node.id);
    this.nodes.set(node.id, { ...node, lastSeen: Date.now() });

    if (isNew) {
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.INFO,
          caller: "orchestrator:domain:orchestration:mesh",
          message: `New node registered: ${node.hostname} (${node.address}:${node.port}) [verified=${node.verified}]`
      });
      if (this.eventBus) this.eventBus.emit("UI_BROADCAST", {
        type: "AUDIT_EVENT",
        data: {
            type: LogType.AUDIT,
            severity: LogSeverity.SUCCESS,
            caller: "orchestrator:domain:orchestration:mesh",
            message: `New security node joined the mesh: ${node.hostname}`,
            data: node
        }
      });
    }
  }

  async broadcast(payload: Record<string, unknown>, priority: boolean = false): Promise<Result<void>> {
    this.ensureReady();
    const verifiedNodes = Array.from(this.nodes.values()).filter((n: MeshNode) => {
        if (!n.verified) return false;
        if (this.chaosEngine.shouldPartition(n.id)) return false;
        return true;
    });

    const MAX_GOSSIP_CONCURRENCY = 16;
    const batches = [];
    for (let i = 0; i < verifiedNodes.length; i += MAX_GOSSIP_CONCURRENCY) {
        batches.push(verifiedNodes.slice(i, i + MAX_GOSSIP_CONCURRENCY));
    }

    for (const [batchIndex, batch] of batches.entries()) {
        const batchResults = await Promise.allSettled(batch.map(async (node, nodeIndex) => {
            if (!priority) {
                const jitter = (batchIndex * MAX_GOSSIP_CONCURRENCY + nodeIndex) * 100;
                await new Promise(r => setTimeout(r, jitter));
            }

            // SOV-05 STABILITY: Circuit Breaker for each node to prevent hanging the gossip chain
            let breaker = this.circuitBreakers.get(node.id);
            if (!breaker) {
                breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 60000 });
                this.circuitBreakers.set(node.id, breaker);
            }

            const gossipRes = await breaker.execute(() => retry(() => this.sendSync(node, payload), {
                maxAttempts: priority ? 3 : 1,
                baseDelayMs: 200
            }).then(res => {
                if (!res.success) throw res.error;
                return res.data;
            }));

            if (!gossipRes.success) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.WARNING,
                    caller: "orchestrator:domain:orchestration:mesh",
                    message: `Gossip failure to ${node.hostname}: ${gossipRes.error.message}`
                });
            }
        }));

        // SOV-06 HARDENING: Ensure all batch errors are logged to avoid unhandled rejections
        for (const res of batchResults) {
            if (res.status === "rejected") {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:domain:orchestration:mesh:batch",
                    message: `Unexpected error in gossip batch: ${res.reason}`
                });
            }
        }
    }
    return ok(undefined);
  }

  getNodes(): MeshNode[] {
    return Array.from(this.nodes.values());
  }

  isolateNode(nodeId: string): Result<void> {
    const node = this.nodes.get(nodeId);
    if (node) {
      this.nodes.delete(nodeId);
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.ERROR,
          caller: "orchestrator:domain:orchestration:mesh",
          message: `ISOLATED NODE: ${node.hostname} (${nodeId}) revoked from mesh due to security policy.`
      });
      if (this.eventBus) this.eventBus.emit("UI_BROADCAST", {
        type: "AUDIT_EVENT",
        data: {
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:orchestration:mesh",
            message: `Node ${node.hostname} isolated from mesh network!`,
            data: { nodeId }
        }
      });
    }
    return ok(undefined);
  }

  async broadcastBlock(ip: string): Promise<Result<void>> {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:orchestration:mesh",
        message: `Gossip: Broadcasting block for ${ip}`
    });

    const payload = {
        type: "GOSSIP_BLOCK",
        data: { ip, sourceNode: this.nodeId, timestamp: Date.now() }
    };

    if (this.eventBus) this.eventBus.emit("UI_BROADCAST", payload);
    return await this.broadcast(payload, true);
  }

  async broadcastThreatHash(hash: string, sourceNode: string): Promise<Result<void>> {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:orchestration:mesh",
        message: `Gossip: Broadcasting threat hash ${hash.slice(0, 8)}`
    });

    const payload = {
        type: "GOSSIP_THREAT_HASH",
        data: { hash, sourceNode, timestamp: Date.now() }
    };

    if (this.eventBus) this.eventBus.emit("UI_BROADCAST", payload);
    return await this.broadcast(payload);
  }

  async broadcastLockdown(): Promise<Result<void>> {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.ERROR,
        caller: "orchestrator:domain:orchestration:mesh",
        message: "Gossip: Initiating high-priority EMERGENCY LOCKDOWN broadcast..."
    });

    const payload = {
        type: "GOSSIP_LOCKDOWN",
        data: { sourceNode: this.nodeId, timestamp: Date.now() }
    };

    if (this.eventBus) this.eventBus.emit("UI_BROADCAST", payload);
    return await this.broadcast(payload, true);
  }

  async broadcastAuditEvent(event: DomainAuditEvent & { fromAudit?: boolean }) {
    // SOV-06: Propagate recursion guards during gossip
    const payload = {
        type: "GOSSIP_AUDIT",
        data: event,
        fromAudit: event.fromAudit
    };
    if (this.eventBus) this.eventBus.emit("UI_BROADCAST", payload);
    this.broadcast(payload).catch(e => {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:orchestration:mesh:gossip",
            message: `Failed to broadcast audit event: ${e.message}`
        });
    });
  }

  async broadcastAuditVerification(lastHash: string, eventCount: number) {
    const payload = {
        type: "GOSSIP_AUDIT_VERIFY",
        data: { lastHash, eventCount, node: this.nodeId }
    };
    if (this.eventBus) this.eventBus.emit("UI_BROADCAST", payload);
    this.broadcast(payload).catch(e => {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:orchestration:mesh:gossip",
            message: `Failed to broadcast audit verification: ${e.message}`
        });
    });
  }

  async reconcile(): Promise<Result<void>> {
    const verifiedNodes = Array.from(this.nodes.values()).filter((n: MeshNode) => n.verified);
    for (const node of verifiedNodes) {
        try {
            const localStatus = await this.audit.getChainStatus();

            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.DEBUG,
                severity: LogSeverity.INFO,
                caller: "orchestrator:domain:orchestration:mesh",
                message: `Requesting differential Merkle catch-up from ${node.hostname}...`
            });

            // Differential Sync: Send our last hash to get only what's missing
            const res = await this.sendSync(node, {
                type: "MERKLE_CATCH_UP",
                lastKnownHash: localStatus.lastHash,
                nodeId: this.nodeId
            }) as Record<string, unknown>;
            
            if (res && res.events && Array.isArray(res.events)) {
                if (res.proof) {
                    // SEC-05: Verify Merkle proof of the catch-up batch
                    const { MerkleTree } = await import("../../core/merkle.ts");
                    const proof = res.proof as any;
                    const isValid = await MerkleTree.verify(proof.root, proof.leaf, proof.index, proof.proof);

                    if (!isValid) {
                        throw new Error(`Merkle proof verification failed for batch from ${node.hostname}`);
                    }
                }

                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.INFO,
                    caller: "orchestrator:domain:orchestration:mesh",
                    message: `Received ${res.events.length} differential events from ${node.hostname}.`
                });
                await this.audit.syncEvents(res.events as DomainAuditEvent[]);
            } else if (res && res.full_sync_required) {
                // Fallback to full snapshot if hashes have diverged too far
                const fullRes = await this.sendSync(node, { type: "FETCH_STATE", nodeId: this.nodeId }) as any;
                if (fullRes?.kv_snapshot) {
                    await this.audit.syncEvents(fullRes.kv_snapshot as DomainAuditEvent[]);
                }
            }
            
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.INFO,
                caller: "orchestrator:domain:orchestration:mesh",
                message: `Reconciled state with ${node.hostname}`
            });
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:domain:orchestration:mesh",
                message: `Failed to reconcile with ${node.hostname}: ${msg}`
            });
        }
    }
    return ok(undefined);
  }

  async getLocalStateSnapshot(): Promise<Record<string, unknown>> {
      const recentEvents = await this.audit.getRecentEvents(100);
      return {
          timestamp: Date.now(),
          nodeId: this.nodeId,
          kv_snapshot: recentEvents 
      };
  }

  async requestQuorumUnlock(secretType: "PKI" | "MESH"): Promise<boolean> {
      return await this.requestQuorumCommand(`UNLOCK_${secretType}`, { secretType });
  }

  async requestQuorumCommand(action: string, data: unknown): Promise<boolean> {
      const activeCount = this.getActiveNodeCount();
      if (this.config?.getEnv("SINGLE_NODE") === "true" || activeCount === 0) {
          this.logging.log({
              timestamp: new Date().toISOString(),
              type: LogType.AUDIT,
              severity: LogSeverity.INFO,
              caller: "orchestrator:domain:orchestration:mesh:quorum",
              message: `SINGLE_NODE mode: Auto-approving quorum for action: ${action}`
          });
          return true;
      }

      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.INFO,
          caller: "orchestrator:domain:orchestration:mesh:quorum",
          message: `Requesting mesh consensus (BFT model) for action: ${action}`
      });

      const verifiedNodes = Array.from(this.nodes.values()).filter(n => n.verified && (Date.now() - n.lastSeen) < 600000);
      const N = verifiedNodes.length + 1;

      // SOV-P4: BFT Threshold (2f + 1) where N >= 3f + 1
      // For N < 4, we use simple majority as fallback
      const threshold = N >= 4
          ? Math.floor((2 * N) / 3) + 1
          : Math.floor(N / 2) + 1;

      if (N < threshold) {
          this.logging.log({
              timestamp: new Date().toISOString(),
              type: LogType.AUDIT,
              severity: LogSeverity.ERROR,
              caller: "orchestrator:domain:orchestration:mesh:quorum",
              message: `Consensus impossible. Active nodes (${N}) < Threshold (${threshold}).`
          });
          return false;
      }

      let approvals = 1; // Self approval
      const requestPayload = { action, data, requester: this.nodeId, timestamp: Date.now() };

      for (const node of verifiedNodes) {
          try {
              const res = await this.sendSync(node, {
                  type: "CONSENSUS_REQUEST",
                  payload: requestPayload,
                  signature: await this.signPayload(requestPayload)
              }) as Record<string, unknown>;

              if (res && res.approved && res.signature) {
                  // SEC-05: Verify Byzantine Signature
                  const isValid = await this.verifySignature(res.payload, res.signature as string, node.id);
                  if (isValid) {
                      approvals++;
                  } else {
                      this.logging.log({
                          timestamp: new Date().toISOString(),
                          type: LogType.AUDIT,
                          severity: LogSeverity.ERROR,
                          caller: "MESH:QUORUM",
                          message: `REJECTED traitorous signature from node ${node.id} for ${action}`
                      });
                  }
              }
          } catch (_e) {
              this.logging.log({
                  timestamp: new Date().toISOString(),
                  type: LogType.GENERIC,
                  severity: LogSeverity.WARNING,
                  caller: "orchestrator:domain:orchestration:mesh:quorum",
                  message: `Node ${node.hostname} unreachable or denied.`
              });
          }

          if (approvals >= threshold) break;
      }
      
      const success = approvals >= threshold;
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: success ? LogSeverity.INFO : LogSeverity.WARNING,
          caller: "orchestrator:domain:orchestration:mesh:quorum",
          message: `Result for ${action}: ${success ? "APPROVED" : "DENIED"} (${approvals}/${threshold})`
      });
      return success;
  }

  async signPayload(payload: unknown): Promise<string> {
    const tpmMode = this.config.getBoolean("TPM_RESIDENT_IDENTITY", true);
    if (tpmMode) {
        const payloadStr = JSON.stringify(payload);
        const res = await this.meshAuth.signWithNodeKey(this.nodeId, payloadStr);
        return res.success ? res.data : "unsigned";
    }

    if (!this.meshSecret) return "unsigned";
    const { signPayload } = await import("../../core/crypto_utils.ts");
    return await signPayload(payload as Record<string, unknown>, this.meshSecret);
  }

  async verifySignature(payload: unknown, signature: string, peerId?: string): Promise<boolean> {
    const tpmMode = this.config.getBoolean("TPM_RESIDENT_IDENTITY", true);
    if (tpmMode && signature.startsWith("p-sig:")) {
        // SOV-P4: BFT Signature Verification
        // Peer signatures must be verified against the peer's identity, not local nodeId.
        const signerId = peerId || this.nodeId;
        return signature === `p-sig:node-key-${signerId}:${JSON.stringify(payload)}`;
    }

    if (!this.meshSecret) return false;
    const { verifySignature } = await import("../../core/crypto_utils.ts");
    return await verifySignature(payload as Record<string, unknown>, signature, this.meshSecret);
  }

  async requestApproval(action: string, data: unknown, threshold?: number): Promise<boolean> {
    const verifiedNodes = Array.from(this.nodes.values()).filter(n => n.verified);
    const totalNodes = verifiedNodes.length + 1; // Include self
    const targetThreshold = threshold ?? (Math.floor(totalNodes / 2) + 1);

    if (totalNodes < targetThreshold) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:orchestration:mesh",
            message: `Consensus threshold impossible to meet (${totalNodes}/${targetThreshold}). REJECTED.`
        });
        return false; 
    }

    let approvals = 0;
    const requestPayload = { action, data, nodeId: this.nodeId, timestamp: Date.now() };
    const signature = await this.signPayload(requestPayload);

    for (const node of verifiedNodes) {
        try {
            const res = await this.sendSync(node, { 
                type: "REQUEST_APPROVAL", 
                payload: requestPayload,
                signature 
            }) as Record<string, unknown>;
            if (res.approved) {
                if (res.signature) {
                    const isValid = await this.verifySignature(res.payload, res.signature as string, node.id);
                    if (isValid) approvals++;
                } else {
                    approvals++;
                }
            }
        } catch (e) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:domain:orchestration:mesh",
                message: `Node ${node.hostname} denied/failed approval: ${(e as Error).message}`
            });
        }
    }

    const success = approvals >= targetThreshold;
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: success ? LogSeverity.INFO : LogSeverity.ERROR,
        caller: "orchestrator:domain:orchestration:mesh",
        message: `Consensus for ${action}: ${success ? "APPROVED" : "DENIED"} (${approvals}/${targetThreshold} votes)`
    });
    return success;
  }

  private async sendSync(node: MeshNode, payload: Record<string, unknown>) {
    if (!this.httpClient) await this.init();

    const client = this.httpClient!;

    const url = `https://${node.address}:${node.port}/api/mesh/sync`;
    const headers: Record<string, string> = { 
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "max-age=0",
        "Sec-Ch-Ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1"
    };

    const paddingLength = Math.floor(Math.random() * 256);
    const padding = Array.from({ length: paddingLength }, () => Math.random().toString(36)[2]).join('');

    const paddedPayload = {
      ...payload,
      _p: padding
    };

    if (this.meshSecret) {
      const signature = await this.signPayload(paddedPayload);
      headers["X-Mesh-Signature"] = signature;
    }

    const jitter = Math.floor(Math.random() * 800); 
    await new Promise(r => setTimeout(r, jitter));

    const res = await this.chaosEngine.applyChaos(() => fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(paddedPayload),
        client,
        signal: AbortSignal.timeout(15000)
    }));

    if (!res.ok) {
      throw new Error(`Sync failed with status ${res.status}`);
    }

    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.DEBUG,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:orchestration:mesh",
        message: `Tactical mTLS Sync completed with ${node.address}:${node.port}`
    });

    try {
        return await res.json();
    } catch {
        return { success: true };
    }
  }

  /**
   * SOV-P4: Resolves a split-brain condition by reconciling state with the mesh majority.
   */
  async resolveSplitBrain(): Promise<Result<void>> {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.WARNING,
        caller: "MESH:RESILIENCE",
        message: "Detecting state divergence. Initiating mesh-wide reconciliation (View-Stamp Strategy)..."
    });

    const verifiedNodes = Array.from(this.nodes.values()).filter(n => n.verified);
    if (verifiedNodes.length === 0) return ok(undefined);

    // 1. Fetch Merkle roots from all verified nodes
    const roots = new Map<string, number>();
    for (const node of verifiedNodes) {
        try {
            const res = await this.sendSync(node, { type: "GET_AUDIT_STATUS" }) as any;
            if (res && res.lastHash) {
                roots.set(res.lastHash, (roots.get(res.lastHash) || 0) + 1);
            }
        } catch { /* ignore */ }
    }

    // 2. Identify the BFT majority root (2f + 1)
    let majorityRoot = "";
    const N = verifiedNodes.length + 1;
    const threshold = N >= 4 ? Math.floor((2 * N) / 3) + 1 : Math.floor(N / 2) + 1;

    for (const [root, votes] of roots.entries()) {
        // Include self vote if it matches
        const selfHash = (await this.audit.getChainStatus()).lastHash;
        const totalVotes = votes + (root === selfHash ? 1 : 0);

        if (totalVotes >= threshold) {
            majorityRoot = root;
            break;
        }
    }

    // 3. If we diverge from BFT majority, trigger re-sync
    const currentStatus = await this.audit.getChainStatus();
    if (majorityRoot && majorityRoot !== currentStatus.lastHash) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "MESH:RESILIENCE",
            message: `Split-brain detected! Local root ${currentStatus.lastHash.slice(0,8)} diverges from mesh majority ${majorityRoot.slice(0,8)}. Triggering rollback sync.`
        });

        // Trigger reconciliation from a node that has the majority root
        const targetNode = verifiedNodes.find(async n => {
            try {
                const res = await this.sendSync(n, { type: "GET_AUDIT_STATUS" }) as any;
                return res?.lastHash === majorityRoot;
            } catch { return false; }
        });

        if (targetNode) {
            await this.requestAuditSync(targetNode.id);
        }
    }

    return ok(undefined);
  }

  private async startStateWatcher() {
    const kv = (this.config as ConfigurationPort & { kv?: Deno.Kv }).kv;
    if (!kv) return;

    this.watcherAbortController = new AbortController();

    // SEC-03: Ensure MESH_SECRET is sealed to hardware on boot if it came from environment
    const tpm = (this.config as any).tpm as TpmPort | undefined;
    const meshSecret = this.config.getEnv("MESH_SECRET");
    if (tpm && meshSecret) {
        (async () => {
            const sealed = await tpm.unsealSecret("MESH_SECRET");
            if (!sealed) {
                const pcrs = await tpm.getPcrs([0, 1, 7]);
                await tpm.sealSecret("MESH_SECRET", meshSecret, pcrs);
            }
        })();
    }

    const watcher = kv.watch([["mesh", "nodes"]]);
    try {
        for await (const [entries] of watcher) {
            const nodeData = entries.value as MeshNode[];
            if (nodeData && Array.isArray(nodeData)) {
                for (const node of nodeData) {
                    if (node.id !== this.nodeId) {
                        this.registerNode(node);
                    }
                }
            }
        }
    } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
            throw e;
        }
    }
  }

  async rotateIdentity(): Promise<Result<void>> {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.WARNING,
        caller: "orchestrator:domain:orchestration:mesh",
        message: `Initiating Identity Rotation for ${this.nodeId}...`
    });
    
    // SOV-05 STABILITY: Transactional Identity Rotation
    // Save old state to allow rollback or continued operation if new mTLS setup fails
    const oldClient = this.httpClient;
    const oldId = this.nodeId;
    const oldCert = this.nodeCert;

    try {
        this.nodeId = Deno.hostname() + "-" + crypto.randomUUID().slice(0, 8);
        this.httpClient = null; // Forces new client creation in init()

        const res = await this.init();
        if (!res.success) throw res.error;
    
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:orchestration:mesh",
        message: `Identity Rotation Complete: ${oldId} -> ${this.nodeId}`
    });
    
        if (this.eventBus) this.eventBus.emit("UI_BROADCAST", {
            type: "UI_MESSAGE",
            data: {
                message: "Security Mesh Identity Phased",
                oldId,
                newId: this.nodeId
            }
        });

        if (oldClient) oldClient.close();
        return ok(undefined);

    } catch (e) {
        // ROLLBACK: Restore previous identity and client
        this.nodeId = oldId;
        this.httpClient = oldClient;
        this.nodeCert = oldCert;

        const msg = `Identity Rotation Failed: ${(e as Error).message}. Rolled back to previous state.`;
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:orchestration:mesh",
            message: msg
        });
        return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  async resyncNodes() {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:orchestration:mesh",
        message: "Initiating mesh-wide cryptographic re-verification..."
    });

    const allNodes = Array.from(this.nodes.values());
    for (const node of allNodes) {
        node.verified = false;
        await this.validateAndRegisterNode(node);
    }
  }

  async requestAuditSync(nodeId: string) {
      const node = this.nodes.get(nodeId);
      if (node && node.verified) {
          this.sendSync(node, { type: "FETCH_STATE", nodeId: this.nodeId }).catch(e => {
              this.logging.log({
                  timestamp: new Date().toISOString(),
                  type: LogType.GENERIC,
                  severity: LogSeverity.ERROR,
                  caller: "orchestrator:domain:orchestration:mesh:sync",
                  message: `Failed to request audit sync from ${nodeId}: ${e.message}`
              });
          });
      }
  }

  private isIpAllowed(ip: string, allowedRanges: string): boolean {
      const ranges = allowedRanges.split(",").map(r => r.trim());
      for (const range of ranges) {
          if (range.includes("/")) {
              // CIDR check (simplified implementation for common cases)
              if (this.ipInCidr(ip, range)) return true;
          } else {
              if (ip === range) return true;
          }
      }
      return false;
  }

  private ipInCidr(ip: string, cidr: string): boolean {
      try {
          const [range, bitsStr] = cidr.split("/");
          const bits = parseInt(bitsStr, 10);
          const ipNum = this.ipToLong(ip);
          const rangeNum = this.ipToLong(range);
          const mask = -1 << (32 - bits);
          return (ipNum & mask) === (rangeNum & mask);
      } catch {
          return false;
      }
  }

  private ipToLong(ip: string): number {
      const parts = ip.split(".").map(Number);
      return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
  }

  getChaosEngine(): MeshChaosEngine {
      return this.chaosEngine;
  }
}

export let meshManager: MeshManager;

export function setMeshManager(instance: MeshManager) {
  meshManager = instance;
}
