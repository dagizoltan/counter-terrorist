import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { SidecarName } from "@infrastructure/system/validation.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const name = c.req.param("name") as SidecarName;
  try {
    await services.command.restartSidecar(name);
    return c.json({ success: true, message: `Agent ${name} restarted.` });
  } catch (e) {
    return c.json({ success: false, error: (e as Error).message }, 500);
  }
};
