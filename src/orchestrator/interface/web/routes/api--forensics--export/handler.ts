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
    // Clamped: the raw query value went straight into the bundle size, so `?limit=1e9`
    // built an unbounded evidence bundle in memory and a non-numeric value passed NaN
    // through to the service.
    const DEFAULT_LIMIT = 1000;
    const MAX_LIMIT = 10000;
    const requested = parseInt(c.req.query("limit") ?? "", 10);
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(requested, 1), MAX_LIMIT)
      : DEFAULT_LIMIT;
    return c.json(await _services.forensicService.generateEvidenceBundle(limit));
  };
};
