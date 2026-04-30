import { Hono, Context } from "hono";
import { jsx } from "hono/jsx";
import { Dashboard } from "./page.tsx";
import { ApplicationStatus } from "../../core/ports.ts";

export function createDashboardRouter(getStatus: () => Promise<ApplicationStatus>) {
  const router = new Hono();

  router.get("/", async (c: Context) => {
    const status = await getStatus();
    return c.html(<Dashboard status={status} />);
  });

  return router;
}
