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

  return api;
}
