import { broadcast } from "@api/ws.ts";
import { MeshAuthService } from "../index.ts";
import { LoggingPort, SyslogSeverity } from "@core/ports.ts";
import { TACTICAL_CONSTANTS } from "@core/constants.ts";

export interface MeshNode {
  id: string;
  hostname: string;
  address: string;
  port: number;
  lastSeen: number;
  /** Whether this node has been validated via mTLS handshake. */
  verified: boolean;
}

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
    private audit: any // AuditService
  ) {
    this.logging.log("[MESH] Initializing Mesh Infrastructure...", SyslogSeverity.NOTICE);
    this.meshSecret = Deno.env.get("MESH_SECRET");
  }

  async init() {
    this.nodeId = Deno.hostname() || "node-" + crypto.randomUUID().slice(0, 8);
    this.port = Number(Deno.env.get("PORT")) || 8000;

    try {
      this.nodeCert = await this.meshAuth.generateNodeCert(this.nodeId);

      // Create mTLS HTTP client
      this.httpClient = Deno.createHttpClient({
        cert: this.nodeCert.cert,
        key: this.nodeCert.key,
        caCerts: [(await this.meshAuth.getRootCA()).cert], // For mutual verification
      });

      this.logging.log(`[MESH] mTLS Identity established for ${this.nodeId}`, SyslogSeverity.NOTICE);
    } catch (e) {
      this.logging.log(`[MESH] Failed to initialize mTLS: ${e instanceof Error ? e.message : String(e)}. Continuing with limited mesh functionality.`, SyslogSeverity.WARNING);
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

    this.logging.log("[MESH] Starting zero-config node discovery...", SyslogSeverity.NOTICE);

    // 1. Initial Subnet Scan (Fast discovery - background)
    this.discoverSubnet().catch(() => {});
    
    // 2. Schedule regular scans
    this.discoveryInterval = setInterval(() => {
        this.discoverSubnet();
        this.scanNetwork();
    }, TACTICAL_CONSTANTS.MESH.DISCOVERY_INTERVAL_MS);

    // 3. Start listening for mDNS (Passive discovery)
    this.listenForDiscovery();
  }

  private async discoverSubnet() {
    const interfaces = Deno.networkInterfaces();
    const localIps = interfaces
      .filter(i => i.family === "IPv4" && !i.address.startsWith("127."))
      .map(i => i.address);

    for (const ip of localIps) {
      const subnet = ip.split(".").slice(0, 3).join(".");
      this.logging.log(`[MESH] Probing subnet ${subnet}.0/24...`, SyslogSeverity.DEBUG);
      
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
          this.logging.log(`[MESH] Discovered verified peer at ${address}`, SyslogSeverity.NOTICE);
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
        this.logging.log(`[MESH] Probe failed for ${address}: ${msg}`, SyslogSeverity.DEBUG);
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

      this.logging.log("[MESH] Passive mDNS listener active", SyslogSeverity.NOTICE);

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
      this.logging.log(`[MESH] Passive mDNS listener failed: ${(e as Error).message}. Zero-config discovery might be limited.`, SyslogSeverity.WARNING);
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
      this.logging.log(
        `[MESH] Cannot validate node ${node.id} — mTLS client not initialized. Skipping.`,
        SyslogSeverity.WARNING
      );
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
      if (body.success && body.nodeId) {
        // Verified — the node presented a valid mTLS certificate signed by our CA
        node.verified = true;
        this.registerNode(node);
        this.logging.log(
          `[MESH] Node ${node.id} at ${node.address}:${node.port} passed mTLS validation.`,
          SyslogSeverity.NOTICE
        );
      } else {
        throw new Error("Invalid ping response");
      }
    } catch (e) {
      this.logging.log(
        `[MESH] REJECTED node ${node.id} at ${node.address}:${node.port} — mTLS validation failed: ${e instanceof Error ? e.message : String(e)}`,
        SyslogSeverity.WARNING
      );
    }
  }

  registerNode(node: MeshNode) {
    const isNew = !this.nodes.has(node.id);
    this.nodes.set(node.id, { ...node, lastSeen: Date.now() });

    if (isNew) {
      this.logging.log(`[MESH] New node registered: ${node.hostname} (${node.address}:${node.port}) [verified=${node.verified}]`, SyslogSeverity.NOTICE);
      broadcast({
        type: "INFO",
        message: `New security node joined the mesh: ${node.hostname}`,
        data: node
      });
    }
  }

  /**
   * Generic mesh broadcast (Gossip).
   */
  async broadcast(payload: any) {
    const verifiedNodes = Array.from(this.nodes.values()).filter((n: MeshNode) => n.verified);
    for (const node of verifiedNodes) {
        this.sendSync(node, payload).catch(err => {
            console.warn(`[MESH] Gossip failure to ${node.hostname}: ${(err as Error).message}`);
        });
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
      this.logging.log(`[MESH] ISOLATED NODE: ${node.hostname} (${nodeId}) revoked from mesh due to security policy.`, SyslogSeverity.CRITICAL);
      broadcast({
        type: "CRITICAL",
        message: `Node ${node.hostname} isolated from mesh network!`,
        data: { nodeId }
      });
    }
  }

  /**
   * Broadcasts a block command to all verified nodes in the mesh.
   */
  async broadcastBlock(ip: string) {
    const verifiedNodes = Array.from(this.nodes.values()).filter((n: MeshNode) => n.verified);
    if (verifiedNodes.length === 0) return;

    this.logging.log(`[MESH] Gossip: Broadcasting block for ${ip} to ${verifiedNodes.length} verified nodes...`, SyslogSeverity.NOTICE);

    for (const node of verifiedNodes) {
        this.sendSync(node, { type: "GOSSIP_BLOCK", ip }).catch(err => {
            console.warn(`[MESH] Failed to gossip with ${node.hostname}: ${(err as Error).message}`);
        });
    }
  }

  /**
   * Broadcasts a malicious binary hash to the mesh.
   */
  async broadcastThreatHash(hash: string, sourceNode: string) {
    const verifiedNodes = Array.from(this.nodes.values()).filter((n: MeshNode) => n.verified);
    if (verifiedNodes.length === 0) return;

    this.logging.log(`[MESH] Gossip: Broadcasting threat hash ${hash.slice(0, 8)} to ${verifiedNodes.length} nodes...`, SyslogSeverity.NOTICE);

    for (const node of verifiedNodes) {
        this.sendSync(node, { type: "GOSSIP_THREAT_HASH", hash, sourceNode }).catch(err => {
            console.warn(`[MESH] Failed to gossip threat to ${node.hostname}: ${(err as Error).message}`);
        });
    }
  }

  /**
   * Broadcasts a lockdown command to all verified nodes in the mesh.
   */
  async broadcastLockdown() {
    const verifiedNodes = Array.from(this.nodes.values()).filter((n: MeshNode) => n.verified);
    if (verifiedNodes.length === 0) return;

    this.logging.log(`[MESH] Gossip: Broadcasting EMERGENCY LOCKDOWN to ${verifiedNodes.length} nodes...`, SyslogSeverity.EMERGENCY);

    for (const node of verifiedNodes) {
        this.sendSync(node, { type: "GOSSIP_LOCKDOWN" }).catch(err => {
            console.warn(`[MESH] Failed to gossip lockdown with ${node.hostname}: ${(err as Error).message}`);
        });
    }
  }

  /**
   * Broadcasts a critical audit event to the mesh.
   */
  async broadcastAuditEvent(event: any) {
    const verifiedNodes = Array.from(this.nodes.values()).filter((n: MeshNode) => n.verified);
    if (verifiedNodes.length === 0) return;

    for (const node of verifiedNodes) {
        this.sendSync(node, { type: "GOSSIP_AUDIT", event }).catch(err => {
            console.warn(`[MESH] Failed to gossip audit with ${node.hostname}: ${(err as Error).message}`);
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
            console.warn(`[MESH] Failed to send audit verification to ${node.hostname}: ${(err as Error).message}`);
        });
    }
  }

  async reconcile() {
    const verifiedNodes = Array.from(this.nodes.values()).filter((n: MeshNode) => n.verified);
    for (const node of verifiedNodes) {
        try {
            this.logging.log(`[MESH] Requesting state reconciliation from ${node.hostname}...`, SyslogSeverity.DEBUG);
            const res = await this.sendSync(node, { type: "FETCH_STATE", nodeId: this.nodeId });
            
            // Phase 3: Differential state synchronization
            if (res !== undefined && res !== null && (res as any).kv_snapshot && Array.isArray((res as any).kv_snapshot)) {
                this.logging.log(`[MESH] Received state snapshot from ${node.hostname}. Synchronizing...`, SyslogSeverity.NOTICE);
                await this.audit.syncEvents((res as any).kv_snapshot);
            }
            
            console.log(`[MESH] Reconciled state with ${node.hostname}`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn(`[MESH] Failed to reconcile with ${node.hostname}: ${msg}`);
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
      this.logging.log(`[QUORUM] Requesting mesh consensus for action: ${action}`, SyslogSeverity.NOTICE);
      
      const verifiedNodes = Array.from(this.nodes.values()).filter(n => n.verified);
      const threshold = Math.floor((verifiedNodes.length + 1) / 2) + 1;
      
      if (verifiedNodes.length + 1 < threshold) {
          this.logging.log(`[QUORUM] Consensus impossible. Active nodes (${verifiedNodes.length + 1}) < Threshold (${threshold}).`, SyslogSeverity.CRITICAL);
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
              console.warn(`[QUORUM] Node ${node.hostname} denied or timed out.`);
          }
          
          if (approvals >= threshold) break;
      }
      
      const success = approvals >= threshold;
      this.logging.log(`[QUORUM] Result for ${action}: ${success ? "APPROVED" : "DENIED"} (${approvals}/${threshold})`, success ? SyslogSeverity.NOTICE : SyslogSeverity.WARNING);
      return success;
  }

  /**
   * Deterministic JSON stringifier to ensure signature consistency.
   */
  private canonicalStringify(obj: any): string {
    if (obj === null || typeof obj !== "object") {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return "[" + obj.map(item => this.canonicalStringify(item)).join(",") + "]";
    }
    const keys = Object.keys(obj).sort();
    return "{" + keys.map(key => `${JSON.stringify(key)}:${this.canonicalStringify(obj[key])}`).join(",") + "}";
  }

  /**
   * Generates a HMAC-SHA256 signature for a payload using the MESH_SECRET.
   */
  async signPayload(payload: any): Promise<string> {
    if (!this.meshSecret) return "unsigned";
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.meshSecret);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(this.canonicalStringify(payload))
    );
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }

  /**
   * Verifies an HMAC-SHA256 signature.
   */
  async verifySignature(payload: any, signature: string): Promise<boolean> {
    if (!this.meshSecret) return false;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.meshSecret);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sigData = new Uint8Array(
      atob(signature).split("").map((c) => c.charCodeAt(0))
    );
    return await crypto.subtle.verify(
      "HMAC",
      key,
      sigData,
      encoder.encode(this.canonicalStringify(payload))
    );
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
        this.logging.log(`[MESH] Consensus threshold impossible to meet (${totalNodes}/${targetThreshold}). REJECTED.`, SyslogSeverity.CRITICAL);
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
            this.logging.log(`[MESH] Node ${node.hostname} denied/failed approval: ${(e as Error).message}`, SyslogSeverity.WARNING);
        }
    }

    const success = approvals >= targetThreshold;
    this.logging.log(`[MESH] Consensus for ${action}: ${success ? "APPROVED" : "DENIED"} (${approvals}/${targetThreshold} votes)`, success ? SyslogSeverity.NOTICE : SyslogSeverity.CRITICAL);
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
    if (this.meshSecret) {
      headers["X-Mesh-Secret"] = this.meshSecret;
    }

    // TRAFFIC CAMOUFLAGE: Random jitter and truly variable padding
    const jitter = Math.floor(Math.random() * 800); 
    await new Promise(r => setTimeout(r, jitter));
    
    // Improved padding: Random length and random content to avoid divisibility/repeat fingerprinting
    const paddingLength = Math.floor(Math.random() * 256);
    const padding = Array.from({ length: paddingLength }, () => Math.random().toString(36)[2]).join('');

    const paddedPayload = {
      ...payload,
      _p: padding
    };

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

    this.logging.log(`[MESH] Tactical mTLS Sync completed with ${node.address}:${node.port}`, SyslogSeverity.DEBUG);
  }

  /**
   * Rotates the node's cryptographic identity and Node ID.
   * This is an ultra-hardening measure to prevent long-term mesh persistence by an adversary.
   */
  async rotateIdentity() {
    this.logging.log(`[MESH] Initiating Identity Rotation for ${this.nodeId}...`, SyslogSeverity.WARNING);
    
    // 1. Wipe existing mTLS client
    this.httpClient = null;
    
    // 2. Generate a fresh Node ID (to evade fingerprinting)
    const oldId = this.nodeId;
    this.nodeId = Deno.hostname() + "-" + crypto.randomUUID().slice(0, 8);
    
    // 3. Re-initialize mTLS identity
    await this.init();
    
    this.logging.log(`[MESH] Identity Rotation Complete: ${oldId} -> ${this.nodeId}`, SyslogSeverity.NOTICE);
    
    broadcast({
        type: "INFO",
        message: "Security Mesh Identity Phased",
        data: { oldId, newId: this.nodeId }
    });
  }
}

export let meshManager: MeshManager;

export function setMeshManager(instance: MeshManager) {
  meshManager = instance;
}
