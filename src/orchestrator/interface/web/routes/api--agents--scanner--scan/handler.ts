import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const { path, type } = await c.req.json();

  let result;
  if (type === 'ROOTKIT') {
      result = await services.protection.rkhunter.runScan();
  } else {
      result = await services.protection.antivirus.scanPath(path || "/home/");
  }

  const data = result.success && typeof (result as any).data === "object" && (result as any).data !== null
      ? (result as any).data
      : { success: false, error: (result as any).error?.message || "Unknown error" };

  const { recordScannerResult } = await import("@domain/analysis/metrics_service.ts");
  const scanStatus = (data.success && !data.threatsFound) ? "OK" : (data.threatsFound ? "THREAT_FOUND" : "SCAN_FAILED");
  recordScannerResult(new Date().toLocaleTimeString(), scanStatus);

  return c.json(data);
};
