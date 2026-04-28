import { Hono } from "hono";
import { pluginManager } from "../plugins/manager.ts";
import { HttpHoneypot } from "../plugins/http_honeypot.ts";

const honeypotsApi = new Hono();

// Register default plugins here for now
pluginManager.register(new HttpHoneypot());

honeypotsApi.get("/", (c) => {
  const plugins = pluginManager.list().map(p => ({
    config: p.config,
    status: p.status() ? "running" : "stopped"
  }));
  return c.json(plugins);
});

honeypotsApi.post("/:name/start", async (c) => {
  const name = c.req.param("name");
  const plugin = pluginManager.get(name);

  if (!plugin) {
    return c.json({ error: "Plugin not found" }, 404);
  }

  const success = await plugin.start();
  if (success) {
    return c.json({ message: `Honeypot ${name} started successfully` });
  } else {
    return c.json({ error: `Failed to start honeypot ${name}` }, 500);
  }
});

honeypotsApi.post("/:name/stop", async (c) => {
  const name = c.req.param("name");
  const plugin = pluginManager.get(name);

  if (!plugin) {
    return c.json({ error: "Plugin not found" }, 404);
  }

  const success = await plugin.stop();
  if (success) {
    return c.json({ message: `Honeypot ${name} stopped successfully` });
  } else {
    return c.json({ error: `Failed to stop honeypot ${name}` }, 500);
  }
});

export default honeypotsApi;
