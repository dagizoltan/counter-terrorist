import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { loggingService, LogSeverity, LogType } from "@infrastructure/system/logging.ts";
import { isValidIP, isCriticalInfrastructure } from "@infrastructure/system/validation.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const peerIp = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || (c.env as (Record<string, unknown> & { remoteAddr?: { hostname: string } }))?.remoteAddr?.hostname || "unknown";
  const result = await services.rateLimit.checkLimit(`mesh_sync:${peerIp}`, 100, 1000);
  if (!result.allowed) {
      return c.json({
          error: "Rate limit exceeded",
          code: "RATE_LIMIT_EXCEEDED",
          retryAfterMs: result.retryAfterMs
      }, 429);
  }

  const payload = await c.req.json();

  const signature = c.req.header("X-Mesh-Signature");
  if (signature) {
      const isValid = await services.mesh.verifySignature(payload, signature);
      if (!isValid) {
          loggingService.log({
              timestamp: new Date().toISOString(),
              type: LogType.AUDIT,
              severity: LogSeverity.ERROR,
              caller: "orchestrator:interface:web:api:mesh",
              message: `REJECTED: Invalid mesh signature from ${peerIp}`
          });
          return c.json({ error: "Invalid signature" }, 401);
      }
  } else if (services.config.getEnv("MESH_SECRET")) {
      return c.json({ error: "Missing required mesh signature" }, 401);
  }

  if (payload.timestamp && Math.abs(Date.now() - payload.timestamp) > 300000) {
      return c.json({ error: "Stale payload" }, 401);
  }

  if (payload.type === "GOSSIP_BLOCK" && payload.ip) {
      if (isValidIP(payload.ip) && !isCriticalInfrastructure(payload.ip)) {
          await services.protection.firewall.blockIp(payload.ip);
      }
  }

  if (payload.type === "GOSSIP_THREAT_HASH" && payload.hash) {
      await services.audit.logEvent({
          type: "MESH_THREAT",
          message: `Mesh-wide binary blacklist updated: ${payload.hash.slice(0, 8)}`,
          data: payload
      });
  }

  if (payload.type === "GOSSIP_AUDIT" && payload.events) {
      await services.audit.syncEvents(payload.events);
  }

  if (payload.type === "GOSSIP_LOCKDOWN") {
      await services.mediator.broadcastEvent({
          type: "MESH_LOCKDOWN",
          message: `Mesh-wide LOCKDOWN initiated by node ${payload.sourceNode || "unknown"}`,
          data: payload,
          timestamp: new Date().toISOString()
      });
  }

  if (payload.type === "GOSSIP_AUDIT_VERIFY") {
      const localStatus = await services.audit.getChainStatus();
      if (localStatus.lastHash !== payload.lastHash || localStatus.count !== payload.count) {
          if (localStatus.count < payload.count) {
              await services.mesh.requestAuditSync(payload.sourceNode);
          }
      }
  }

  // SOV-P4: Differential Merkle Catch-Up Handler
  if (payload.type === "MERKLE_CATCH_UP") {
      const { lastKnownHash } = payload;
      const events = await services.audit.getEventsInRange(lastKnownHash, 100);

      if (events.length > 0) {
          const lastEvent = events[events.length - 1];
          const proof = await services.audit.getMerkleProof(lastEvent.hash);

          return c.json({
              success: true,
              events,
              proof
          });
      } else {
          // If we can't find the hash or it's up to date, check if they are way behind
          const status = await services.audit.getChainStatus();
          if (status.lastHash !== lastKnownHash) {
              return c.json({ success: true, full_sync_required: true });
          }
          return c.json({ success: true, events: [] });
      }
  }

  if (payload.type === "FETCH_STATE") {
      const snapshot = await services.mesh.getLocalStateSnapshot();
      return c.json({ success: true, kv_snapshot: snapshot.kv_snapshot });
  }

  return c.json({ success: true });
};
