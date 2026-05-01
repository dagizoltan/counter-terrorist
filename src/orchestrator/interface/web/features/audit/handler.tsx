import { jsx } from "hono/jsx";
import { Hono, Context } from "hono";
import { AuditPage } from "./page.tsx";

export function createAuditRouter() {
  const router = new Hono();

  router.get("/", async (c: Context) => {
    return c.html(<AuditPage />);
  });

  return router;
}
