import { jsx as _jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import {
  Eyebrow,
  Metric,
  StatusPill,
  TacticalHeader,
  TacticalPanel,
  TacticalSectionTitle,
} from "@interface/components/Tactical.tsx";

/**
 * Mission dashboard.
 *
 * Rebuilt on the shared component set. Previously every headline number here
 * was `text-6xl font-black italic` — a size the stylesheet never declared, so
 * the four strategic metrics rendered at inherited 13px body text while their
 * panels reserved 2.5rem of padding around them.
 */
interface DashboardStatus {
  platform?: { hostname?: string };
  audit?: { hardwareVerified?: boolean; integrityScore?: number };
  node?: { uptime?: string; cpu?: { load?: number } };
  threats?: { totalIngested?: number };
  firewall?: { blockedCount?: number };
  mesh?: { activeNodes?: number };
  [key: string]: unknown;
}

export const Dashboard = (props: {
  status: DashboardStatus;
  csrfToken: string;
  nonce?: string;
  hostname?: string;
  userRole?: string;
}) => {
  const { platform, audit, node, threats, firewall, mesh } = props.status;

  const integrity = audit?.integrityScore ?? 100;
  const activeNodes = mesh?.activeNodes ?? 0;
  const interventionForce = Math.min(100, activeNodes * 20 + (integrity === 100 ? 20 : 0));
  const armed = integrity > 90 && activeNodes > 0;

  const islandPaths = [
    "/components/islands/NetworkMap.js",
    "/components/islands/HoneypotChart.js",
    "/components/islands/NewsFeed.js",
    "/components/islands/BlockingLog.js",
    "/components/islands/TacticalIntel.js",
  ];

  return (
    <Layout
      title="System Overview // Sovereign Overwatch"
      islandPaths={islandPaths}
      csrfToken={props.csrfToken}
      nonce={props.nonce}
      hostname={props.hostname}
      userRole={props.userRole}
    >
      <TacticalHeader
        title="Operational Overview"
        subtitle={`Node ${platform?.hostname || "localhost"}`}
      >
        <a href="/forensics/compliance" class="btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          Governance
        </a>
        {props.userRole === "admin" && (
          <button type="button" class="btn neutral">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            Force Sweep
          </button>
        )}
      </TacticalHeader>

      {/* ── Strategic core ─────────────────────────────────────────────── */}
      <section>
        <TacticalSectionTitle label="Strategic Core Telemetry" />

        <div class="grid grid-cols-12 gap-4 stagger">
          <TacticalPanel class="col-span-12 md:col-span-6 lg:col-span-3">
            <Metric label="System Integrity" value={integrity} unit="%" status={integrity === 100 ? "ok" : "warn"} large>
              <StatusPill
                status={audit?.hardwareVerified ? "ok" : "warn"}
                label={audit?.hardwareVerified ? "Hardware" : "Software"}
              />
            </Metric>
          </TacticalPanel>

          <TacticalPanel class="col-span-12 md:col-span-6 lg:col-span-3">
            <Metric label="Load Factor" value={node?.cpu?.load ?? 0} unit="% CPU" large>
              <Eyebrow tone="success">{node?.uptime || "Active"}</Eyebrow>
            </Metric>
          </TacticalPanel>

          <TacticalPanel class="col-span-12 md:col-span-6 lg:col-span-3">
            <Metric label="Threat Feed" value={threats?.totalIngested ?? 0} unit="indicators" large>
              <span class="indicator" data-state="ok" data-pulse="" aria-hidden="true"></span>
            </Metric>
          </TacticalPanel>

          <TacticalPanel class="col-span-12 md:col-span-6 lg:col-span-3" accent="crit">
            <Metric label="Enforcement" value={firewall?.blockedCount ?? 0} unit="blocked" status="crit" large>
              <StatusPill status="crit" label="Strict" />
            </Metric>
          </TacticalPanel>
        </div>
      </section>

      {/* ── Enforcement ledger ─────────────────────────────────────────── */}
      <section>
        <TacticalSectionTitle label="Active Enforcement Ledger" tone="primary" />

        <TacticalPanel
          flush
          accent="info"
          title="Perimeter Isolation Events"
          actions={<a href="/system/ledger" class="btn ghost btn--sm">Full Ledger</a>}
        >
          <div class="panel-stage panel-stage--md">
            <blocking-log compact="true" limit="12"></blocking-log>
          </div>
        </TacticalPanel>
      </section>

      {/* ── Tactical intelligence ──────────────────────────────────────── */}
      <section>
        <TacticalSectionTitle label="Tactical Intelligence Deck" tone="danger" />

        <div class="grid grid-cols-12 gap-4">
          <TacticalPanel
            accent="crit"
            title="External Threat Databases"
            actions={<a href="/intel/feed" class="btn ghost btn--sm">Intelligence Center</a>}
            class="col-span-12 lg:col-span-6"
          >
            <news-feed limit="4" compact="true"></news-feed>
          </TacticalPanel>

          {/* TacticalIntel mounts into this root by id. It ships a live view of
              the autonomous mesh's incursion vectors but no page had ever
              loaded the script, so it was dead code. */}
          <TacticalPanel
            accent="warn"
            title="Autonomous Defense Signals"
            class="col-span-12 lg:col-span-6"
          >
            <div id="tactical-intel-root"></div>
          </TacticalPanel>
        </div>
      </section>

      {/* ── Defensive mesh ─────────────────────────────────────────────── */}
      <section>
        <TacticalSectionTitle label="Defensive Mesh Topology" tone="success" />

        <div class="grid grid-cols-12 gap-4">
          <TacticalPanel flush accent="ok" title="Neighbor Signal Graph" class="col-span-12 lg:col-span-8">
            <div class="panel-stage panel-stage--lg">
              <network-map></network-map>
              <div class="map-legend">
                <Eyebrow><span class="indicator" data-state="info" aria-hidden="true"></span>Authorized Node</Eyebrow>
                <Eyebrow><span class="indicator" data-state="crit" aria-hidden="true"></span>Malicious Origin</Eyebrow>
              </div>
            </div>
          </TacticalPanel>

          <div class="col-span-12 lg:col-span-4 flex flex-col gap-4">
            <TacticalPanel title="Deception Lures" accent="warn" class="flex-1">
              <div class="panel-stage panel-stage--sm">
                <honeypot-chart></honeypot-chart>
              </div>
            </TacticalPanel>

            <TacticalPanel title="Intervention Force">
              <Metric label="Strike Readiness" value={interventionForce} unit="%" status={armed ? "ok" : "warn"} />
              <div class="meter" data-state={armed ? "ok" : "warn"} style={`--value:${interventionForce}%`}></div>
              <div class="metric__foot flex justify-between items-center">
                <Eyebrow>Strike State</Eyebrow>
                <StatusPill status={armed ? "ok" : "warn"} label={armed ? "Armed" : "Standby"} dot />
              </div>
            </TacticalPanel>
          </div>
        </div>
      </section>
    </Layout>
  );
};
