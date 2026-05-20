import { Context } from "hono";
import { jsx } from "hono/jsx";
import { ApplicationStatus } from "@core/ports.ts";

export const agentsHandler = (getStatus: () => Promise<ApplicationStatus>) => async (c: Context) => {
  const { AgentsPage } = await import("./page.tsx");
  const status = await getStatus();
  const csrfToken = c.get("csrfToken") as string;
  const nonce = c.get("nonce") as string;
  const userRole = c.get("user")?.role;
  return c.html(jsx(AgentsPage, { status, csrfToken, nonce, userRole }));
};

export const agentDetailHandler = (getStatus: () => Promise<ApplicationStatus>) => async (c: Context) => {
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

  if (name === "firewall" || name === "sentinel" || name === "vpn" || name === "tunnel") return c.html(jsx(FirewallPage, { csrfToken, nonce, userRole }));
  if (name === "mesh") return c.html(jsx(MeshPage, { status, csrfToken, nonce, userRole }));
  if (name === "scanner" || name === "analyzer") {
    const { ScannerPage } = await import("./scanner_page.tsx");
    return c.html(jsx(ScannerPage, { status, csrfToken, nonce }));
  }
  if (name === "ebpf") return c.html(jsx(EbpfPage, { csrfToken, nonce, userRole }));
  if (name === "fim" || name === "watchfile") return c.html(jsx(FimPage, { csrfToken, nonce, userRole }));
  if (name === "pcap" || name === "netcap") return c.html(jsx(PcapPage, { csrfToken, nonce, userRole }));
  if (name === "honeypot" || name === "decoy") return c.html(jsx(HoneypotPage, { csrfToken, nonce, userRole }));

  const { AgentDetailPage } = await import("./detail.tsx");
  return c.html(jsx(AgentDetailPage, { agent, csrfToken, nonce, userRole }));
};
