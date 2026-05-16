import { Hono } from "hono";
import { BaselineService } from "@domain/index.ts";
import { ProtectionPort } from "@core/ports.ts";
import { SecurityMiddleware } from "../middleware/security.ts";

import { ForensicService } from "@domain/index.ts";

export function createReportsApi(baseline: BaselineService, protection: ProtectionPort, security: SecurityMiddleware, forensics: ForensicService) {
  const api = new Hono();

  api.get("/export", security.requireRole("admin", "operator", "viewer"), async (c) => {
      const report = {
          generatedAt: new Date().toISOString(),
          baseline: await baseline.checkDrift(),
          antivirus: await protection.antivirus.getStatus(),
          rkhunter: protection.rkhunter.getLastResult(),
          system: {
              os: Deno.build.os,
              arch: Deno.build.arch,
          }
      };

      return c.json(report);
  });

  // NEW: Tactical Evidence Aggregator
  // Collects list of available forensic artifacts (PCAPs, Memory Dumps)
  api.get("/forensics/list", security.requireRole("admin", "operator", "viewer"), async (c) => {
      const forensicDir = "./volume/storage/forensics";
      const artifacts = [];

      try {
          for await (const entry of Deno.readDir(forensicDir)) {
              if (entry.isFile) {
                  const stat = await Deno.stat(`${forensicDir}/${entry.name}`);
                  artifacts.push({
                      name: entry.name,
                      size: stat.size,
                      mtime: stat.mtime?.toISOString(),
                      type: entry.name.endsWith(".pcap") ? "NETWORK_CAPTURE" : "MEMORY_DUMP"
                  });
              }
          }
      } catch (e) {
          // Directory might not exist yet
      }

      return c.json(artifacts);
  });

  api.post("/forensics/bundle", security.requireRole("admin", "operator"), async (c) => {
      const bundle = await forensics.generateEvidenceBundle();
      return c.json({ success: true, bundleId: bundle.id });
  });

  api.get("/forensics/download/:name", security.requireRole("admin", "operator", "viewer"), async (c) => {
      const name = c.req.param("name");

      // SEC: Path Traversal Mitigation
      if (name.includes("..") || name.includes("/") || name.includes("\\")) {
          return c.json({ error: "Invalid filename" }, 400);
      }

      const forensicDir = "./volume/storage/forensics";
      const filePath = `${forensicDir}/${name}`;

      try {
          const file = await Deno.readFile(filePath);
          c.header("Content-Type", name.endsWith(".pcap") ? "application/vnd.tcpdump.pcap" : "application/octet-stream");
          c.header("Content-Disposition", `attachment; filename="${name}"`);
          return c.body(file);
      } catch (e) {
          return c.json({ error: "File not found" }, 404);
      }
  });

  return api;
}
