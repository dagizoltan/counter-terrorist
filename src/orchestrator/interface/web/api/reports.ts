import { Hono } from "hono";
import { BaselineService } from "@domain/index.ts";
import { ProtectionPort } from "@core/ports.ts";

export function createReportsApi(baseline: BaselineService, protection: ProtectionPort) {
  const api = new Hono();

  api.get("/export", async (c) => {
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
  api.get("/forensics/list", async (c) => {
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

  return api;
}
