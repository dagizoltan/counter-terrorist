import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { isAllowedSidecar } from "@infrastructure/system/validation.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const name = c.req.param("name");
  if (!isAllowedSidecar(name)) return c.json({ error: "Invalid agent name" }, 400);

  const payload = await c.req.json();

  try {
    const result = await services.command.sendCommand(name, payload);
    return c.json(result);
  } catch (e) {
    return c.json({ success: false, error: (e as Error).message }, 500);
  }
};
