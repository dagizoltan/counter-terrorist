import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (_services: ServiceContainer) => {
  return async (c: Context) => {
    const type = c.req.query("type");
    if (type === "network_intel") {
      try {
        const reportPath = _services.config.getEnv("INTEL_REPORT_PATH") || "./volume/reports/network_intel_report.md";
        return c.text(await Deno.readTextFile(reportPath));
      } catch {
        return c.text("# Network Intelligence Report\nNo data available yet.", 404);
      }
    }
    const limit = c.req.query("limit") ? parseInt(c.req.query("limit")!) : 1000;
    return c.json(await _services.forensicService.generateEvidenceBundle(limit));
  };
};
