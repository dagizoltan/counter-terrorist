import { Context } from "hono";
import { jsx } from "hono/jsx";

export const handler = async (c: Context) => {
  const { NewsPage } = await import("./page.tsx");
  const { status, csrfToken, nonce, userRole } = c.get("uiContext");
  return c.html(jsx(NewsPage, { status, csrfToken, nonce, userRole }) as unknown as string);
};
