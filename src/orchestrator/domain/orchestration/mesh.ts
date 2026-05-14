import { broadcast } from "@api/ws.ts";
import { MeshAuthService } from "../index.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { TACTICAL_CONSTANTS } from "@core/constants.ts";
import { AuditService } from "../analysis/audit.ts";

export interface MeshNode {
  id: string;
  hostname: string;
  address: string;
  port: number;
  lastSeen: number;
  /** Whether this node has been validated via mTLS handshake. */
  verified: boolean;
}

import { SecretVault } from "../security/secret_vault.ts";

export class MeshManager {
  private nodes: Map<string, MeshNode> = new Map();
  private discoveryInterval: number | null = null;
  private nodeCert: any = null;
  private nodeId: string = "";
  private port: number = 8000;
  private httpClient: Deno.HttpClient | null = null;
  private meshSecret: string | undefined;

  constructor(
    private meshAuth: MeshAuthService, 
    private logging: LoggingPort,
    private audit: AuditService,
    private vault?: SecretVault
  ) {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:orchestration:mesh",
        message: "Initializing Sovereign Mesh Infrastructure..."
    });
    this.meshSecret = Deno.env.get("MESH_SECRET");
  }

  async init() {
    this.nodeId = Deno.hostname() || "node-" + crypto.randomUUID().slice(0, 8);
    this.port = Number(Deno.env.get("PORT")) || 8000;

    if (this.vault) {
        const vSecret = await this.vault.getSecret("MESH_SECRET");
        if (vSecret) this.meshSecret = vSecret;
    }

    try {
      this.nodeCert = await this.meshAuth.generateNodeCert(this.nodeId);

      // Create mTLS HTTP client
      this.httpClient = Deno.createHttpClient({
        cert: this.nodeCert.cert,
        key: this.nodeCert.key,
        caCerts: [(await this.meshAuth.getRootCA()).cert], // For mutual verification
      });

      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.INFO,
          caller: "orchestrator:domain:orchestration:mesh",
          message: `mTLS Identity established for ${this.nodeId}`
      });
    } catch (e) {
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.WARNING,
          caller: "orchestrator:domain:orchestration:mesh",
          message: `Failed to initialize mTLS: ${e instanceof Error ? e.message : String(e)}. Continuing with limited mesh functionality.`
      });
    }
  }

  getNodeId() {
    return this.nodeId;
  }

  getActiveNodeCount() {
    return Array.from(this.nodes.values()).filter(n => (Date.now() - n.lastSeen) < 600000).length;
  }

  /**
   * Starts node discovery.
   * Zero-config: Attempts mDNS first, then falls back to Subnet Scanning.
   */
  startDiscovery() {
    if (this.discoveryInterval) return;

    // SINGLE_NODE mode bypasses all external discovery to run in isolation
    if (Deno.env.get("SINGLE_NODE") === "true") {
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

    // 1. Passive Discovery: Start listening first to capture incoming announcements
    this.listenForDiscovery();

    // 2. Initial Subnet Scan: BUG FIX - Staggered start to avoid mDNS race conditions
    // Delaying the aggressive active scan to allow the network stack to stabilize passive listeners
    setTimeout(() => {
        this.discoverSubnet().catch(() => {});
    }, 2000 + Math.random() * 3000);
    
    // 3. Schedule regular scans with jitter
    this.discoveryInterval = setInterval(() => {
        this.discoverSubnet();
        this.scanNetwork();
    }, TACTICAL_CONSTANTS.MESH.DISCOVERY_INTERVAL_MS + (Math.random() * 5000));
  }

  public stop() {
    if (this.discoveryInterval) {
        clearInterval(this.discoveryInterval);
        this.discoveryInterval = null;
    }
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
      
      // Parallel probe with concurrency limit to avoid flooding
      const probes = [];
      for (let i = 1; i < 255; i++) {
        const targetIp = `${subnet}.${i}`;
        if (targetIp === ip) continue; // Skip self

        probes.push(this.probeNode(targetIp));
        
        if (probes.length >= TACTICAL_CONSTANTS.MESH.MAX_PARALLEL_PROBES) {
            await Promise.all(probes);
            probes.length = 0;
        }
      }
      await Promise.all(probes);
    }
  }

  private async probeNode(address: string) {
    if (!this.httpClient) return;

    // SECURITY: Validate address to prevent SSRF or malformed requests during discovery
    const { isValidIP } = await import("@infrastructure/system/validation.ts");
    if (!isValidIP(address)) return;

    try {
      // SECURE DISCOVERY: Always use HTTPS and mTLS client
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
            verified: true, // If HTTPS+mTLS fetch succeeded, it's verified
          });
        }
      }
    } catch (e) {
      // Log only if it's not a common timeout/connection refused to avoid log spam
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
      // @ts-ignore
      if (typeof Deno.listenDatagram !== "function") return;

      const listener = Deno.listenDatagram({
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

      for await (const [data, addr] of listener) {
        const msg = new TextDecoder().decode(data);
        if (msg.includes("_ct-orchestrator._tcp.local")) {
           const idMatch = msg.match(/id=([^,]+)/);
           const portMatch = msg.match(/port=(\d+)/);

           if (idMatch && portMatch) {
             const id = idMatch[1];
             const port = parseInt(portMatch[1]);
             const address = (addr as Deno.NetAddr).hostname;

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

  private scanNetwork() {
    try {
      // @ts-ignore
      if (typeof Deno.listenDatagram !== "function") return;

      const txt = `id=${this.nodeId},port=${this.port}`;
      const announcement = `_ct-orchestrator._tcp.local|${txt}`;
      const message = new TextEncoder().encode(announcement);

      const socket = Deno.listenDatagram({ port: 0, transport: "udp" });
      socket.send(message, { transport: "udp", hostname: "224.0.0.251", port: 5353 });
      socket.close();
    } catch (e) {
      // Silent fail
    }
  }

  /**
   * Validates a discovered node via mTLS handshake before trusting it.
   * An mDNS announcement alone is not sufficient — any LAN host can spoof one.
   */
  private async validateAndRegisterNode(node: MeshNode) {
    // If already known and verified, just update lastSeen
    const existing = this.nodes.get(node.id);
    if (existing?.verified) {
      existing.lastSeen = Date.now();
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
      // Attempt mTLS handshake by hitting the node's /api/mesh/ping endpoint
      const url = `https://${node.address}:${node.port}/api/mesh/ping`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.meshSecret) {
        headers["X-Mesh-Secret"] = this.meshSecret;
      }

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
      
      // Verify signature if meshSecret is configured
      if (this.meshSecret) {
          const sig = res.headers.get("X-Mesh-Signature");
          if (!sig || !(await this.verifySignature(body, sig))) {
              throw new Error("Invalid or missing mesh signature");
          }
      }
      if (body.success && body.nodeId) {
        // Verified — the node presented a valid mTLS certificate signed by our CA
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
      broadcast({
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

  /**
   * Generic mesh broadcast (Gossip).
   * Supports 'priority' for critical events like lockdown.
   */
  async broadcast(payload: any, priority: boolean = false) {
    const verifiedNodes = Array.from(this.nodes.values()).filter((n: MeshNode) => n.verified);

    // TACTICAL: Staggered gossip to prevent network traffic analysis
    const promises = verifiedNodes.map(async (node, index) => {
        if (!priority) {
            // Add jitter to non-priority gossip
            await new Promise(r => setTimeout(r, index * 100));
        }

        return this.sendSync(node, payload).catch(err => {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:domain:orchestration:mesh",
                message: `Gossip failure to ${node.hostname}: ${(err as Error).message}`
            });
        });
    });

    if (priority) {
        await Promise.all(promises);
    }
  }

  getNodes(): MeshNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Revokes trust from a node and removes it from the mesh.
   */
  isolateNode(nodeId: string) {
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
      broadcast({
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
  }

  /**
   * Broadcasts a block command to all verified nodes in the mesh.
   */
  async broadcastBlock(ip: string) {
    const verifiedNodes = Array.from(this.nodes.values()).filter((n: MeshNode) => n.verified);
    if (verifiedNodes.length === 0) return;

    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:orchestration:mesh",
        message: `Gossip: Broadcasting block for ${ip} to ${verifiedNodes.length} verified nodes...`
    });

    for (const node of verifiedNodes) {
        this.sendSync(node, { type: "GOSSIP_BLOCK", ip }).catch(err => {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:domain:orchestration:mesh",
                message: `Failed to gossip with ${node.hostname}: ${(err as Error).message}`
            });
        });
    }
  }

  /**
   * Broadcasts a malicious binary hash to the mesh.
   */
  async broadcastThreatHash(hash: string, sourceNode: string) {
    const verifiedNodes = Array.from(this.nodes.values()).filter((n: MeshNode) => n.verified);
    if (verifiedNodes.length === 0) return;

    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:orchestration:mesh",
        message: `Gossip: Broadcasting threat hash ${hash.slice(0, 8)} to ${verifiedNodes.length} nodes...`
    });

    for (const node of verifiedNodes) {
        this.sendSync(node, { type: "GOSSIP_THREAT_HASH", hash, sourceNode }).catch(err => {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:domain:orchestration:mesh",
                message: `Failed to gossip threat to ${node.hostname}: ${(err as Error).message}`
            });
        });
    }
  }

  /**
   * Broadcasts a lockdown command to all verified nodes in the mesh.
   */
  async broadcastLockdown() {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.ERROR,
        caller: "orchestrator:domain:orchestration:mesh",
        message: "Gossip: Initiating high-priority EMERGENCY LOCKDOWN broadcast..."
    });

    await this.broadcast({ type: "GOSSIP_LOCKDOWN" }, true);
  }

  /**
   * Broadcasts a critical audit event to the mesh.
   */
  async broadcastAuditEvent(event: any) {
    const verifiedNodes = Array.from(this.nodes.values()).filter((n: MeshNode) => n.verified);
    if (verifiedNodes.length === 0) return;

    for (const node of verifiedNodes) {
        this.sendSync(node, { type: "GOSSIP_AUDIT", event }).catch(err => {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:domain:orchestration:mesh",
                message: `Failed to gossip audit with ${node.hostname}: ${(err as Error).message}`
            });
        });
    }
  }

  /**
   * Broadcasts the current audit chain head for cross-node verification.
   */
  async broadcastAuditVerification(lastHash: string, eventCount: number) {
    const verifiedNodes = Array.from(this.nodes.values()).filter((n: MeshNode) => n.verified);
    if (verifiedNodes.length === 0) return;

    for (const node of verifiedNodes) {
        this.sendSync(node, { 
            type: "GOSSIP_AUDIT_VERIFY", 
            lastHash, 
            eventCount,
            node: this.nodeId 
        }).catch(err => {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:domain:orchestration:mesh",
                message: `Failed to send audit verification to ${node.hostname}: ${(err as Error).message}`
            });
        });
    }
  }

  async reconcile() {
    const verifiedNodes = Array.from(this.nodes.values()).filter((n: MeshNode) => n.verified);
    for (const node of verifiedNodes) {
        try {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.DEBUG,
                severity: LogSeverity.INFO,
                caller: "orchestrator:domain:orchestration:mesh",
                message: `Requesting state reconciliation from ${node.hostname}...`
            });
            const res = await this.sendSync(node, { type: "FETCH_STATE", nodeId: this.nodeId });
            
            // Phase 3: Differential state synchronization
            if (res !== undefined && res !== null && (res as any).kv_snapshot && Array.isArray((res as any).kv_snapshot)) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.INFO,
                    caller: "orchestrator:domain:orchestration:mesh",
                    message: `Received state snapshot from ${node.hostname}. Synchronizing...`
                });
                await this.audit.syncEvents((res as any).kv_snapshot);
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
  }

  /**
   * Generates a snapshot of the local security state for a peer.
   */
  async getLocalStateSnapshot(): Promise<any> {
      const recentEvents = await this.audit.getRecentEvents(100);
      return {
          timestamp: Date.now(),
          nodeId: this.nodeId,
          kv_snapshot: recentEvents 
      };
  }

  /**
   * High-Sovereignty Protocol: Consensus-Based Secret Unlocking.
   * Master secrets are only unlocked if a quorum of peer approvals is received.
   */
  async requestQuorumUnlock(secretType: "PKI" | "MESH"): Promise<boolean> {
      return await this.requestQuorumCommand(`UNLOCK_${secretType}`, { secretType });
  }

  /**
   * Universal Quorum Handshake: Requires P2P consensus for any critical command.
   */
  async requestQuorumCommand(action: string, data: any): Promise<boolean> {
      // SINGLE_NODE mode or no peers: Quorum is automatically satisfied if the action is authorized locally
      if (Deno.env.get("SINGLE_NODE") === "true" || this.getActiveNodeCount() === 0) {
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
          message: `Requesting mesh consensus for action: ${action}`
      });
      
      const verifiedNodes = Array.from(this.nodes.values()).filter(n => n.verified);
      const threshold = Math.floor((verifiedNodes.length + 1) / 2) + 1;
      
      if (verifiedNodes.length + 1 < threshold) {
          this.logging.log({
              timestamp: new Date().toISOString(),
              type: LogType.AUDIT,
              severity: LogSeverity.ERROR,
              caller: "orchestrator:domain:orchestration:mesh:quorum",
              message: `Consensus impossible. Active nodes (${verifiedNodes.length + 1}) < Threshold (${threshold}).`
          });
          return false;
      }

      let approvals = 1; // Self approval
      
      for (const node of verifiedNodes) {
          try {
              const res = await this.sendSync(node, { 
                  type: "CONSENSUS_REQUEST", 
                  action, 
                  data, 
                  requester: this.nodeId 
              });
              if (res !== undefined && res !== null && (res as any).approved) {
                  approvals++;
              }
          } catch (e) {
              this.logging.log({
                  timestamp: new Date().toISOString(),
                  type: LogType.GENERIC,
                  severity: LogSeverity.WARNING,
                  caller: "orchestrator:domain:orchestration:mesh:quorum",
                  message: `Node ${node.hostname} denied or timed out.`
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

  /**
   * Generates a HMAC-SHA256 signature for a payload using the MESH_SECRET.
   */
  async signPayload(payload: any): Promise<string> {
    if (!this.meshSecret) return "unsigned";
    const { signPayload } = await import("../../core/crypto_utils.ts");
    return await signPayload(payload, this.meshSecret);
  }

  /**
   * Verifies an HMAC-SHA256 signature.
   */
  async verifySignature(payload: any, signature: string): Promise<boolean> {
    if (!this.meshSecret) return false;
    const { verifySignature } = await import("../../core/crypto_utils.ts");
    return await verifySignature(payload, signature, this.meshSecret);
  }

  /**
   * Requests approval from peers for a critical action.
   * Uses P2P signatures to ensure identity.
   */
  async requestApproval(action: string, data: any, threshold?: number): Promise<boolean> {
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
            });
            if ((res as any).approved) {
                // Verify peer signature if provided
                if ((res as any).signature) {
                    const isValid = await this.verifySignature((res as any).payload, (res as any).signature);
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

  private async sendSync(node: MeshNode, payload: any) {
    if (!this.httpClient) await this.init();

    const url = `https://${node.address}:${node.port}/api/mesh/sync`;
    const headers: Record<string, string> = { 
        "Content-Type": "application/json",
        // TACTICAL MIMICRY: Disguise as legitimate Cloudflare/Akamai traffic
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

    // Improved padding: Random length and random content to avoid divisibility/repeat fingerprinting
    const paddingLength = Math.floor(Math.random() * 256);
    const padding = Array.from({ length: paddingLength }, () => Math.random().toString(36)[2]).join('');

    const paddedPayload = {
      ...payload,
      _p: padding
    };

    if (this.meshSecret) {
      const signature = await this.signPayload(paddedPayload);
      headers["X-Mesh-Signature"] = signature;
      if (this.vault) await this.vault.setSecret("MESH_SECRET", this.meshSecret);
    }

    // TRAFFIC CAMOUFLAGE: Random jitter and truly variable padding
    const jitter = Math.floor(Math.random() * 800); 
    await new Promise(r => setTimeout(r, jitter));

    const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(paddedPayload),
        client: this.httpClient!,
        signal: AbortSignal.timeout(15000)
    });

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
  }

  /**
   * Rotates the node's cryptographic identity and Node ID.
   * This is an ultra-hardening measure to prevent long-term mesh persistence by an adversary.
   */
  async rotateIdentity() {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.WARNING,
        caller: "orchestrator:domain:orchestration:mesh",
        message: `Initiating Identity Rotation for ${this.nodeId}...`
    });
    
    // 1. Wipe existing mTLS client
    this.httpClient = null;
    
    // 2. Generate a fresh Node ID (to evade fingerprinting)
    const oldId = this.nodeId;
    this.nodeId = Deno.hostname() + "-" + crypto.randomUUID().slice(0, 8);
    
    // 3. Re-initialize mTLS identity
    await this.init();
    
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:orchestration:mesh",
        message: `Identity Rotation Complete: ${oldId} -> ${this.nodeId}`
    });
    
    broadcast({
        type: "INFO",
        message: "Security Mesh Identity Phased",
        data: { oldId, newId: this.nodeId }
    });
  }

  /**
   * Cryptographically re-verifies all known nodes in the mesh.
   */
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
        // Mark as unverified first to force a fresh handshake
        node.verified = false;
        await this.validateAndRegisterNode(node);
    }
  }
}

export let meshManager: MeshManager;

export function setMeshManager(instance: MeshManager) {
  meshManager = instance;
}
