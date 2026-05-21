import { Context } from "hono";
import { jsx } from "hono/jsx";

export const handler = async (c: Context) => {
  const { ComplianceCenterPage } = await import("./page.tsx");
  const { status, csrfToken, nonce, userRole } = c.get("uiContext");
  return c.html(jsx(ComplianceCenterPage, { status, csrfToken, nonce, userRole }) as unknown as string);
};
