import { jsx } from "hono/jsx";
import { Hono, Context } from "hono";
import { HoneypotsPage } from "./page.tsx";
import { HoneypotDetailPage } from "./detail.tsx";
import { HoneypotService } from "@domain/protection/honeypot_service.ts";

export function createHoneypotsRouter(honeypotService: HoneypotService) {
  const router = new Hono();

  router.get("/", (c: Context) => {
    const modules = honeypotService.getModules();
    const userRole = c.get("user")?.role;
    return c.html(<HoneypotsPage modules={modules} userRole={userRole} />);
  });

  router.get("/:id", (c: Context) => {
    const id = c.req.param("id");
    const module = honeypotService.getModule(id);
    if (!module) return c.text("Honeypot not found", 404);
    const userRole = c.get("user")?.role;
    return c.html(<HoneypotDetailPage module={module} userRole={userRole} />);
  });

  router.post("/api/:id/toggle", async (c: Context) => {
    const id = c.req.param("id");
    const { active } = await c.req.json();
    await honeypotService.toggleModule(id, active);
    return c.json({ success: true });
  });

  return router;
}
