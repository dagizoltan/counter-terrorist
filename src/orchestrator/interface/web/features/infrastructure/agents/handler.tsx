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
    const userRole = c.get("user")?.role;
    return c.html(<AgentsPage status={status} csrfToken={csrfToken} nonce={nonce} userRole={userRole} />);
  });

  router.get("/:name", async (c: Context) => {
    const name = c.req.param("name");
    const status = await getStatus();
    const canonicalName = 
      (name === "sentinel") ? "firewall" :
      (name === "tunnel") ? "vpn" :
      (name === "analyzer") ? "scanner" :
      (name === "watchfile") ? "fim" :
      (name === "netcap") ? "pcap" :
      (name === "decoy") ? "honeypot" : name;

    const agent = status.plugins.find(p => 
      p.name === name || 
      p.name === canonicalName || 
      ((name === "sentinel" || name === "firewall") && (p.name === "ebpf" || p.name === "enforcer")) ||
      ((name === "vpn" || name === "tunnel") && p.name === "tunnel")
    );
    const csrfToken = c.get("csrfToken") as string;
    const nonce = c.get("nonce") as string;
    const userRole = c.get("user")?.role;

    if (!agent) return c.notFound();

    const { FirewallPage, EbpfPage, FimPage, PcapPage, HoneypotPage, MeshPage } = await import("./subpages/core.tsx");
    
    if (name === "firewall" || name === "sentinel" || name === "vpn" || name === "tunnel") return c.html(<FirewallPage csrfToken={csrfToken} nonce={nonce} userRole={userRole} />);
    if (name === "mesh") return c.html(<MeshPage status={status} csrfToken={csrfToken} nonce={nonce} userRole={userRole} />);
    if (name === "scanner" || name === "analyzer") {
      const { ScannerPage } = await import("./scanner_page.tsx");
      return c.html(<ScannerPage status={status} csrfToken={csrfToken} nonce={nonce} />);
    }
    if (name === "ebpf") return c.html(<EbpfPage csrfToken={csrfToken} nonce={nonce} userRole={userRole} />);
    if (name === "fim" || name === "watchfile") return c.html(<FimPage csrfToken={csrfToken} nonce={nonce} userRole={userRole} />);
    if (name === "pcap" || name === "netcap") return c.html(<PcapPage csrfToken={csrfToken} nonce={nonce} userRole={userRole} />);
    if (name === "honeypot" || name === "decoy") return c.html(<HoneypotPage csrfToken={csrfToken} nonce={nonce} userRole={userRole} />);

    return c.html(<AgentDetailPage agent={agent} csrfToken={csrfToken} nonce={nonce} userRole={userRole} />);
  });

  return router;
}
