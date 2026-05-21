import { Context } from "hono";
import { jsx } from "hono/jsx";

export const handler = async (c: Context) => {
  const { default: ArtifactIntelPage } = await import("./page.tsx");
  const { status, csrfToken, nonce, userRole } = c.get("uiContext");
  return c.html(jsx(ArtifactIntelPage, { status, csrfToken, nonce, userRole }) as unknown as string);
};
