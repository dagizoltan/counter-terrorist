import { jsx } from "hono/jsx";
import { Hono, Context } from "hono";
import { HoneypotsPage } from "./page.tsx";
import { HoneypotDetailPage } from "./detail.tsx";
import { HoneypotService } from "@domain/protection/honeypot_service.ts";

export function createHoneypotsRouter(honeypotService: HoneypotService) {
  const router = new Hono();

  router.get("/", (c: Context) => {
    const modules = honeypotService.getModules();
    const nonce = c.get("nonce");
    const csrfToken = c.get("csrfToken");
    return c.html(<HoneypotsPage modules={modules} nonce={nonce} csrfToken={csrfToken} />);
  });

  router.get("/:id", (c: Context) => {
    const id = c.req.param("id");
    const module = honeypotService.getModule(id);
    const nonce = c.get("nonce");
    const csrfToken = c.get("csrfToken");
    if (!module) return c.text("Honeypot not found", 404);
    return c.html(<HoneypotDetailPage module={module} nonce={nonce} csrfToken={csrfToken} />);
  });

  router.post("/api/:id/toggle", async (c: Context) => {
    const id = c.req.param("id");
    const { active } = await c.req.json();
    await honeypotService.toggleModule(id, active);
    return c.json({ success: true });
  });

  return router;
}
