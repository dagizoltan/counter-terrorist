import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { jsx } from "hono/jsx";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const moduleId = c.req.param("id");
  const decoy = services.deceptionGrid?.honeypot?.getModule(moduleId);

  // 404 rather than rendering a shell around an id that does not exist — the
  // island would only be able to report the same thing, one round trip later.
  if (!decoy) return c.notFound();

  const { DecoyDetailPage } = await import("./page.tsx");
  return c.html(jsx(DecoyDetailPage, {
    moduleId,
    moduleName: decoy.name,
    csrfToken: c.get("csrfToken") as string,
    nonce: c.get("nonce") as string,
    userRole: c.get("user")?.role,
  }) as never);
};
