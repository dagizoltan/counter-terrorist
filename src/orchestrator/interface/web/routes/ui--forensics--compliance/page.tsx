import { jsx as _jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { TacticalHeader, TacticalPanel } from "@interface/components/Tactical.tsx";

/**
 * Compliance Center.
 *
 * The control matrix is an island now (<compliance-controls>). It used to be
 * an inline <script> that read `data.results` straight off the response —
 * ignoring the { success, data } envelope every /api/* route carries — so the
 * container never populated and the page showed a permanent spinner.
 *
 * See components/islands/ComplianceControls.js.
 */
export const ComplianceCenterPage = (props: {
  status: unknown;
  csrfToken: string;
  nonce?: string;
  userRole?: string;
}) => {
  return (
    <Layout
      title="Compliance Center"
      islandPaths={["/components/islands/ComplianceControls.js"]}
      csrfToken={props.csrfToken}
      nonce={props.nonce}
      userRole={props.userRole}
    >
      <TacticalHeader
        title="Compliance Center"
        subtitle="Hardware-signed evidence and regulatory mapping"
      />

      <section>
        <TacticalPanel>
          <compliance-controls role-name={props.userRole}></compliance-controls>
        </TacticalPanel>
      </section>
    </Layout>
  );
};
