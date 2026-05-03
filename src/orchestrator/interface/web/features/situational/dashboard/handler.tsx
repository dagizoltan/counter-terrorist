import { jsx } from "hono/jsx";
import { Hono, Context } from "hono";
import { Dashboard } from "./page.tsx";
import { ApplicationStatus } from "@core/ports.ts";

export function createDashboardRouter(getStatus: () => Promise<ApplicationStatus>) {
  const router = new Hono();

  router.get("/", async (c: Context) => {
    const status = await getStatus();
    const csrfToken = c.get("csrfToken") as string;
    return c.html(<Dashboard status={status} csrfToken={csrfToken} />);
  });

  return router;
}
