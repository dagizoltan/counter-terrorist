import { jsx as _jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { Eyebrow, Metric, StatusPill, TacticalHeader, TacticalPanel } from "@interface/components/Tactical.tsx";
// Type-only: a view should not pull the domain graph in at runtime just to
// name a shape. The value import made this page load canary_service and
// everything under it.
import type { HoneypotModule } from "@domain/protection/honeypot_service.ts";

/**
 * Deception Operations.
 *
 * The decoy manifest is an island now (<deception-grid>). It used to be
 * server-rendered with the toggle wired as an inline onclick — which the CSP
 * refuses to execute — pointing at /agents/deception/api/:id/toggle, a path
 * with no route behind it. See components/islands/DeceptionGrid.js.
 *
 * The page keeps the server-rendered modules as a seed attribute so the grid
 * paints immediately rather than flashing empty while its fetch is in flight.
 */
export const HoneypotsPage = (props: {
  modules: HoneypotModule[];
  csrfToken?: string;
  nonce?: string;
  userRole?: string;
}) => {
  const modules = props.modules ?? [];
  const armed = modules.filter((m) => m.active).length;

  return (
    <Layout
      title="Deception Operations // Trap Network"
      islandPaths={[
        "/components/islands/DeceptionGrid.js",
        "/components/islands/HoneypotChart.js",
        "/components/islands/CanaryTokens.js",
      ]}
      csrfToken={props.csrfToken}
      nonce={props.nonce}
      userRole={props.userRole}
    >
      <TacticalHeader
        title="Deception Operations"
        subtitle={`${armed} of ${modules.length} decoys armed`}
      >
        <StatusPill
          status={armed > 0 ? "warn" : "idle"}
          label={armed > 0 ? "Grid Active" : "Grid Dormant"}
          dot
        />
      </TacticalHeader>

      <section>
        <div class="grid grid-cols-12 gap-4">
          <TacticalPanel class="col-span-12 md:col-span-6 lg:col-span-3" accent={armed > 0 ? "warn" : "idle"}>
            <Metric label="Armed Decoys" value={armed} unit={`of ${modules.length}`} status={armed > 0 ? "warn" : "idle"} large />
          </TacticalPanel>

          {/* Trap health used to read a hardcoded "98.4%". It is the share of
              registered modules currently armed — a number the page already
              has, rather than a literal that never changed. */}
          <TacticalPanel class="col-span-12 md:col-span-6 lg:col-span-3">
            <Metric
              label="Grid Coverage"
              value={modules.length === 0 ? 0 : Math.round((armed / modules.length) * 100)}
              unit="%"
              status={modules.length > 0 && armed === modules.length ? "ok" : "warn"}
              large
            />
          </TacticalPanel>

          <TacticalPanel class="col-span-12 lg:col-span-6" flush title="Trap Engagements" actions={<Eyebrow>Last 10 min</Eyebrow>}>
            <div class="panel-stage panel-stage--xs">
              <honeypot-chart></honeypot-chart>
            </div>
          </TacticalPanel>
        </div>
      </section>

      <section>
        <TacticalPanel accent={armed > 0 ? "warn" : "idle"}>
          <deception-grid
            role-name={props.userRole}
            modules={JSON.stringify(modules)}
          ></deception-grid>
        </TacticalPanel>
      </section>

      {/* The credential-lure half of the grid. The service has always
          registered these canary tokens; nothing surfaced them until now, so a
          tripped lure was invisible. See islands/CanaryTokens.js. */}
      <section>
        <TacticalPanel title="Credential Lures" flush>
          <canary-tokens role-name={props.userRole}></canary-tokens>
        </TacticalPanel>
      </section>
    </Layout>
  );
};
