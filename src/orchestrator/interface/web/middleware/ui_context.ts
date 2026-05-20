import { Context, Next } from "hono";
import { ApplicationStatus } from "@core/ports.ts";

/**
 * UI Context Middleware
 * Populates common UI state into the Hono context to reduce boilerplate in route handlers.
 */
export function uiContext(getStatus: () => Promise<ApplicationStatus>) {
  return async (c: Context, next: Next) => {
    // Only apply to HTML/UI requests
    const isApi = c.req.path.startsWith("/api/");
    const isStatic = /\.(css|js|png|jpg|jpeg|svg|json|ico|woff2?|ttf|otf)$/i.test(c.req.path);

    if (isApi || isStatic) {
      return next();
    }

    try {
      const status = await getStatus();
      const csrfToken = c.get("csrfToken") || "";
      const nonce = c.get("nonce") || "";
      const hostname = Deno.hostname();
      const userRole = c.get("role") || c.get("user")?.role || "viewer";

      c.set("uiContext", {
        status,
        csrfToken,
        nonce,
        hostname,
        userRole
      });
    } catch (error) {
      console.error("[UI_CONTEXT_ERR]", error);
      return c.html("<h1>500: Internal System Error (UI Context)</h1>", 500);
    }

    await next();
  };
}
