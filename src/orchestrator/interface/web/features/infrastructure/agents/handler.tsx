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
    const nonce = c.get("nonce") as string;
    return c.html(<AgentsPage status={status} csrfToken={csrfToken} nonce={nonce} />);
  });

  router.get("/:name", async (c: Context) => {
    const name = c.req.param("name");
    const status = await getStatus();
    const agent = status.plugins.find(p => p.name === name);
    const csrfToken = c.get("csrfToken") as string;
    const nonce = c.get("nonce") as string;

    if (!agent) return c.notFound();

    const { FirewallPage, VpnPage, ScannerPage, EbpfPage, FimPage, PcapPage, HoneypotPage, MeshPage } = await import("./subpages/core.tsx");
    
    if (name === "firewall" || name === "sentinel") return c.html(<FirewallPage csrfToken={csrfToken} nonce={nonce} />);
    if (name === "vpn" || name === "tunnel") return c.html(<VpnPage csrfToken={csrfToken} nonce={nonce} />);
    if (name === "mesh") return c.html(<MeshPage status={status} csrfToken={csrfToken} nonce={nonce} />);
    if (name === "scanner" || name === "analyzer") return c.html(<ScannerPage csrfToken={csrfToken} nonce={nonce} />);
    if (name === "ebpf" || name === "sentinel") return c.html(<EbpfPage csrfToken={csrfToken} nonce={nonce} />);
    if (name === "fim" || name === "watchfile") return c.html(<FimPage csrfToken={csrfToken} nonce={nonce} />);
    if (name === "pcap" || name === "netcap") return c.html(<PcapPage csrfToken={csrfToken} nonce={nonce} />);
    if (name === "honeypot" || name === "decoy") return c.html(<HoneypotPage csrfToken={csrfToken} nonce={nonce} />);

    return c.html(<AgentDetailPage agent={agent} csrfToken={csrfToken} nonce={nonce} />);
  });

  return router;
}
