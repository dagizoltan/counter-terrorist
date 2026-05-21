import { Context } from "hono";
import { jsx } from "hono/jsx";

export const handler = async (c: Context) => {
  const { ForensicCenterPage } = await import("../../features/forensic/ForensicCenter.tsx");
  const { csrfToken, nonce, userRole } = c.get("uiContext");
  return c.html(jsx(ForensicCenterPage, { csrfToken, nonce, userRole }) as unknown as string);
};
