import { Context } from "hono";
import { jsx } from "hono/jsx";

export const handler = async (c: Context) => {
  const { SysInfoPage } = await import("../../features/situational/sysinfo/page.tsx");
  const { status, csrfToken, nonce } = c.get("uiContext");
  return c.html(jsx(SysInfoPage, { status, csrfToken, nonce }) as unknown as string);
};
