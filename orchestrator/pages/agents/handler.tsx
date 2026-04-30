import { Hono, Context } from "hono";
import { jsx } from "hono/jsx";
import { AgentsPage } from "./page.tsx";
import { AgentDetailPage } from "./detail.tsx";
import { ApplicationStatus } from "../../core/ports.ts";

export function createAgentsRouter(getStatus: () => Promise<ApplicationStatus>) {
  const router = new Hono();

  router.get("/", async (c: Context) => {
    const status = await getStatus();
    return c.html(<AgentsPage status={status} />);
  });

  router.get("/:name", async (c: Context) => {
    const name = c.req.param("name");
    const status = await getStatus();
    const agent = status.plugins.find(p => p.name === name);

    if (!agent) return c.notFound();

    return c.html(<AgentDetailPage agent={agent} />);
  });

  return router;
}
