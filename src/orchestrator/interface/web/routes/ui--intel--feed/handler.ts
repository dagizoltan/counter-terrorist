import { Context } from "hono";
import { jsx } from "hono/jsx";

export const handler = async (c: Context) => {
  const { NewsPage } = await import("../../features/situational/intel/OperationalNewsPage.tsx");
  const { status, csrfToken, nonce, userRole } = c.get("uiContext");
  return c.html(jsx(NewsPage, { status, csrfToken, nonce, userRole }) as unknown as string);
};
