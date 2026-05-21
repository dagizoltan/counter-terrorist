import { Context } from "hono";
import { jsx } from "hono/jsx";

export const handler = async (c: Context) => {
  const { MeshTopologyPage } = await import("../../features/infrastructure/mesh/page.tsx");
  const { status, csrfToken, nonce, userRole } = c.get("uiContext");
  return c.html(jsx(MeshTopologyPage, { status, csrfToken, nonce, userRole }) as unknown as string);
};
