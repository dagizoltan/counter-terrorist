import { Context } from "hono";
import { jsx } from "hono/jsx";

export const handler = async (c: Context) => {
  const { SystemInfoPage } = await import("../../features/system/info_page.tsx");
  const { status, csrfToken, nonce, hostname, userRole } = c.get("uiContext");
  return c.html(jsx(SystemInfoPage, { status, csrfToken, nonce, hostname, userRole }) as unknown as string);
};
