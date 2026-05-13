import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * PCAP Agent Page
 * Deep Packet Capture and real-time traffic analysis.
 */
export const PcapPage = (props: { status: any, csrfToken?: string, nonce?: string }) => {
  return (
    <Layout nonce={props.nonce} title="PCAP Agent // Traffic Capture" islandPaths={[
      '/components/islands/PcapAgent.js'
    ]} csrfToken={props.csrfToken} nonce={props.nonce}>
      
      <header class="page-header">
        <div class="title-group">
          <h1>Packet_Capture</h1>
          <span class="subtitle">Deep Packet Inspection & Wire-speed Analysis // Status: Capturing</span>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-6 mb-8">
        <div class="col-span-12 t-panel glass-panel p-6 border-t-2 border-warning/30">
          <pcap-agent></pcap-agent>
        </div>
      </div>
    </Layout>
  );
};
