import { jsx as _jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { TacticalHeader } from "@interface/components/Tactical.tsx";

/**
 * One decoy in detail.
 *
 * The grid could arm and disarm a module; it could not show what the module
 * caught. Everything needed was already being logged under `decoy:<id>` —
 * hits, source addresses, and the attacker's own session transcripts — with
 * no route reading it back. See islands/DecoyDetail.js.
 */
export const DecoyDetailPage = (props: {
  moduleId: string;
  moduleName?: string;
  csrfToken?: string;
  nonce?: string;
  userRole?: string;
}) => (
  <Layout
    title={`${props.moduleName ?? props.moduleId} // Decoy Detail`}
    islandPaths={["/components/islands/DecoyDetail.js"]}
    csrfToken={props.csrfToken}
    nonce={props.nonce}
    userRole={props.userRole}
  >
    <TacticalHeader
      title={props.moduleName ?? props.moduleId}
      subtitle="Decoy detail — engagements, sources, and captured sessions"
    >
      <a href="/agents/deception" class="btn btn--sm ghost">Back to grid</a>
    </TacticalHeader>

    <section>
      <decoy-detail module-id={props.moduleId} role-name={props.userRole}></decoy-detail>
    </section>
  </Layout>
);
