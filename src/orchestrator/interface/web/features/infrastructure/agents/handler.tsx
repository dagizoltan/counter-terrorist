import { jsx } from "hono/jsx";
import { Hono, Context } from "hono";
import { AgentsPage } from "./page.tsx";
import { AgentDetailPage } from "./detail.tsx";
import { ApplicationStatus } from "@core/ports.ts";

export function createAgentsRouter(getStatus: () => Promise<ApplicationStatus>) {
  const router = new Hono();

  router.get("/", async (c: Context) => {
    const status = await getStatus();
    const csrfToken = c.get("csrfToken") as string;
    return c.html(<AgentsPage status={status} csrfToken={csrfToken} />);
  });

  router.get("/:name", async (c: Context) => {
    const name = c.req.param("name");
    const status = await getStatus();
    const agent = status.plugins.find(p => p.name === name);
    const csrfToken = c.get("csrfToken") as string;

    if (!agent) return c.notFound();

    const { FirewallPage, VpnPage, ScannerPage, EbpfPage, FimPage, PcapPage, HoneypotPage } = await import("./subpages/core.tsx");
    
    if (name === "firewall") return c.html(<FirewallPage />);
    if (name === "vpn") return c.html(<VpnPage />);
    if (name === "scanner") return c.html(<ScannerPage />);
    if (name === "ebpf") return c.html(<EbpfPage />);
    if (name === "fim") return c.html(<FimPage />);
    if (name === "pcap") return c.html(<PcapPage />);
    if (name === "honeypot") return c.html(<HoneypotPage />);

    return c.html(<AgentDetailPage agent={agent} csrfToken={csrfToken} />);
  });

  return router;
}
