import { Hono, Context } from "hono";
import { jsx } from "hono/jsx";
import { EventsPage } from "./events/page.tsx";
import { ProcessesPage } from "./processes/page.tsx";
import { SysInfoPage } from "./sysinfo/page.tsx";
import { NotificationsPage } from "./settings/notifications.tsx";
import { ApplicationStatus } from "../../../core/ports.ts";

export function createExtraPagesRouter(getStatus: () => Promise<ApplicationStatus>) {
  const router = new Hono();

  router.get("/events", async (c: Context) => {
    const csrfToken = c.get("csrfToken") as string;
    return c.html(<EventsPage csrfToken={csrfToken} />);
  });

  router.get("/processes", async (c: Context) => {
    const csrfToken = c.get("csrfToken") as string;
    return c.html(<ProcessesPage csrfToken={csrfToken} />);
  });

  router.get("/sysinfo", async (c: Context) => {
    const status = await getStatus();
    const csrfToken = c.get("csrfToken") as string;
    return c.html(<SysInfoPage status={status} csrfToken={csrfToken} />);
  });

  router.get("/settings/notifications", async (c: Context) => {
    const csrfToken = c.get("csrfToken") as string;
    return c.html(<NotificationsPage csrfToken={csrfToken} />);
  });

  return router;
}
