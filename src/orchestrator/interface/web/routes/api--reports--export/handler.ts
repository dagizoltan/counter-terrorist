import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const report = {
      generatedAt: new Date().toISOString(),
      baseline: await services.baseline.checkDrift(),
      antivirus: await services.protection.antivirus.getStatus(),
      rkhunter: services.protection.rkhunter.getLastResult(),
      system: {
          os: Deno.build.os,
          arch: Deno.build.arch,
      }
  };

  return c.json(report);
};
