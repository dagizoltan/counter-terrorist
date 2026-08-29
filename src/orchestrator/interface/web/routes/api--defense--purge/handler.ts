import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (_services: ServiceContainer) => {
  return async (c: Context) => {
    const { pid } = await c.req.json();
    if (!pid) return c.json({ error: "PID required" }, 400);
    const pidNum = parseInt(String(pid), 10);
    if (isNaN(pidNum)) return c.json({ error: "Invalid PID" }, 400);
    if (pidNum <= 1) return c.json({ error: "Cannot purge system critical processes (PID <= 1)" }, 403);
    return c.json(await _services.protection.firewall.killProcess(pidNum));
  };
};
