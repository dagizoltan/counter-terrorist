import { Hono, Context } from "hono";
import { jsx } from "hono/jsx";
import { Dashboard } from "./page.tsx";
import { ApplicationStatus } from "../../core/ports.ts";

export function createDashboardRouter(status: ApplicationStatus) {
  const router = new Hono();

  router.get("/", (c: Context) => {
    return c.html(<Dashboard status={status} />);
  });

  return router;
}
