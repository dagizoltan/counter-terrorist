import { Context } from "hono";
import { getMetricsSnapshot } from "@domain/analysis/metrics_service.ts";

export const handlerFactory = () => {
  return async (c: Context) => {
    return c.json(getMetricsSnapshot() || {});
  };
};
