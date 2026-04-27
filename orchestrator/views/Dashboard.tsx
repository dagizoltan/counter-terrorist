/** @jsxImportSource hono/jsx */
import { Layout } from "./Layout.tsx";

export const Dashboard = (props: { os: string; isRoot: boolean; token: string }) => {
  return (
    <Layout title="Dashboard">
      <meta name="api-token" content={props.token} />
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div class="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
          <h3 class="text-slate-400 text-sm font-semibold mb-2 uppercase">System OS</h3>
          <p class="text-2xl font-bold text-white capitalize">{props.os}</p>
        </div>
        <div class="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
          <h3 class="text-slate-400 text-sm font-semibold mb-2 uppercase">Privileges</h3>
          <p class={`text-2xl font-bold ${props.isRoot ? "text-green-400" : "text-yellow-400"}`}>
            {props.isRoot ? "Elevated (Root)" : "Limited (User)"}
          </p>
        </div>
        <div class="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
          <h3 class="text-slate-400 text-sm font-semibold mb-2 uppercase">Protection Status</h3>
          <p class="text-2xl font-bold text-green-400">ACTIVE</p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div class="space-y-6">
          <section class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div class="bg-slate-700/50 p-4 border-b border-slate-700">
              <h2 class="font-bold">Real-time Events</h2>
            </div>
            <div class="p-0">
              <blocking-log id="main-log"></blocking-log>
            </div>
          </section>
        </div>

        <div class="space-y-6">
          <section class="bg-slate-800 p-6 rounded-xl border border-slate-700">
            <h2 class="font-bold mb-4">System Baseline</h2>
            <div class="grid grid-cols-2 gap-4">
              <button
                onclick={`fetch('/api/baseline/set', {method:'POST', headers: {'Authorization': 'Bearer ${props.token}'}})`}
                class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm transition-colors"
              >
                SET NEW BASELINE
              </button>
              <button
                onclick={`fetch('/api/baseline/check', {method:'POST', headers: {'Authorization': 'Bearer ${props.token}'}})`}
                class="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded text-sm transition-colors"
              >
                RUN DRIFT AUDIT
              </button>
            </div>
          </section>

          <section class="bg-slate-800 p-6 rounded-xl border border-slate-700">
            <h2 class="font-bold mb-4">Hardening Controls</h2>
            <div class="space-y-4">
              <div class="flex items-center justify-between p-3 bg-slate-900 rounded-lg">
                <span>Incoming Firewall</span>
                <button
                  id="firewall-toggle"
                  class="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded border border-green-500/30"
                  onclick="location.reload()"
                >LOCKED</button>
              </div>
              <div class="flex items-center justify-between p-3 bg-slate-900 rounded-lg">
                <span>Privacy VPN</span>
                <button
                  id="vpn-toggle"
                  class="px-2 py-1 bg-slate-700 text-slate-400 text-xs rounded border border-slate-600"
                  onclick={`fetch('/api/protection/vpn/connect', {method:'POST', headers: {'Authorization': 'Bearer ${props.token}'}}).then(() => location.reload())`}
                >DISCONNECTED</button>
              </div>
              <div class="flex items-center justify-between p-3 bg-slate-900 rounded-lg">
                <span>VPN Kill-switch</span>
                <button
                  id="killswitch-toggle"
                  class="px-2 py-1 bg-slate-700 text-slate-400 text-xs rounded border border-slate-600"
                  onclick={`const enabled = this.dataset.enabled === 'true'; fetch('/api/protection/firewall/killswitch', {method:'POST', headers: {'Authorization': 'Bearer ${props.token}', 'Content-Type': 'application/json'}, body: JSON.stringify({enabled: !enabled, serverIp: '1.1.1.1', interfaceName: 'wg0'})}).then(() => location.reload())`}
                >DISABLED</button>
              </div>
              <div class="flex items-center justify-between p-3 bg-slate-900 rounded-lg">
                <span>Process Blocker</span>
                <span class="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded border border-green-500/30">ARMED</span>
              </div>
            </div>
          </section>

          <section class="bg-slate-800 p-6 rounded-xl border border-slate-700">
            <h2 class="font-bold mb-4">Agent Status</h2>
            <status-indicator name="Network Sensor" endpoint="/api/protection/firewall/status"></status-indicator>
            <status-indicator name="Persistence Monitor" endpoint="/api/status"></status-indicator>
            <status-indicator name="Active Blocker" endpoint="/api/protection/av/status"></status-indicator>
          </section>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: `
        const token = document.querySelector('meta[name="api-token"]').content;
        fetch('/api/protection/vpn/status', {
          headers: { 'Authorization': 'Bearer ' + token }
        })
        .then(res => res.json())
        .then(data => {
          const vpnBtn = document.getElementById('vpn-toggle');
          if (data.connected) {
            vpnBtn.innerText = 'CONNECTED';
            vpnBtn.className = 'px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded border border-blue-500/30';
            vpnBtn.onclick = () => fetch('/api/protection/vpn/disconnect', {
              method:'POST',
              headers: {'Authorization': 'Bearer ' + token}
            }).then(() => location.reload());
          }
        });

        // Kill-switch status is harder to track without persistent state in backend,
        // but we can heuristic it or add an endpoint if needed.
        // For now we just use the toggle logic.
      `}} />
    </Layout>
  );
};
