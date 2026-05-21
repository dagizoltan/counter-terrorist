import { Context } from "hono";
import { jsx } from "hono/jsx";

export const handler = async (c: Context) => {
  const { AuditPage } = await import("../../features/forensic/audit/page.tsx");
  const { csrfToken, nonce, userRole } = c.get("uiContext");
  return c.html(jsx(AuditPage, { csrfToken, nonce, userRole }) as unknown as string);
};
