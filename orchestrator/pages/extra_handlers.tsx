import { Hono, Context } from "hono";
import { jsx } from "hono/jsx";
import { EventsPage } from "./events/page.tsx";
import { ProcessesPage } from "./processes/page.tsx";
import { SysInfoPage } from "./sysinfo/page.tsx";
import { ApplicationStatus } from "../core/ports.ts";

export function createExtraPagesRouter(getStatus: () => Promise<ApplicationStatus>) {
  const router = new Hono();

  router.get("/events", async (c: Context) => {
    return c.html(<EventsPage />);
  });

  router.get("/processes", async (c: Context) => {
    return c.html(<ProcessesPage />);
  });

  router.get("/sysinfo", async (c: Context) => {
    const status = await getStatus();
    return c.html(<SysInfoPage status={status} />);
  });

  return router;
}
