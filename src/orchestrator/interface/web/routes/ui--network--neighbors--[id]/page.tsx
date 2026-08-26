import { Layout } from "@interface/components/Layout.tsx";
import { TacticalHeader } from "@interface/components/Tactical.tsx";

/**
 * One network participant in detail — identity, live telemetry, and the
 * operations that can be aimed at it.
 *
 * The neighbours grid discovers ambient signals but had nowhere to drill into
 * a single one. This is that target profile: the launch point for
 * per-participant actions. Perimeter enforcement (block / release) is wired
 * live and operator-gated; the offensive probes (port scan, service
 * fingerprint, load test) are staged as disabled affordances until their
 * engines land — see islands/NetworkDetail.js.
 */
export const NetworkDetailPage = (props: {
  id: string;
  csrfToken?: string;
  nonce?: string;
  userRole?: string;
}) => (
  <Layout
    title="Target Profile // Network Participant"
    islandPaths={["/components/islands/NetworkDetail.js"]}
    csrfToken={props.csrfToken}
    nonce={props.nonce}
    userRole={props.userRole}
  >
    <TacticalHeader
      title="Target Profile"
      subtitle="Single participant — identity, telemetry, and operations"
    >
      <a href="/network/neighbors" class="btn btn--sm ghost">Back to signals</a>
    </TacticalHeader>

    <section>
      <network-detail target-id={props.id} role-name={props.userRole}></network-detail>
    </section>
  </Layout>
);
