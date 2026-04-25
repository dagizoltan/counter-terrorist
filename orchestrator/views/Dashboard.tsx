/** @jsxImportSource hono/jsx */
import { Layout } from "./Layout.tsx";

export const Dashboard = (props: { os: string; isRoot: boolean }) => {
  return (
    <Layout title="Dashboard">
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
          <p class="text-2xl font-bold text-red-500">ACTIVE</p>
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
            <h2 class="font-bold mb-4">Hardening Controls</h2>
            <div class="space-y-4">
              <div class="flex items-center justify-between p-3 bg-slate-900 rounded-lg">
                <span>Incoming Firewall</span>
                <span class="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded border border-green-500/30">LOCKED</span>
              </div>
              <div class="flex items-center justify-between p-3 bg-slate-900 rounded-lg">
                <span>Privacy VPN</span>
                <span class="px-2 py-1 bg-slate-700 text-slate-400 text-xs rounded border border-slate-600">DISCONNECTED</span>
              </div>
              <div class="flex items-center justify-between p-3 bg-slate-900 rounded-lg">
                <span>Process Blocker</span>
                <span class="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded border border-green-500/30">ARMED</span>
              </div>
            </div>
          </section>

          <section class="bg-slate-800 p-6 rounded-xl border border-slate-700">
            <h2 class="font-bold mb-4">Agent Status</h2>
            <status-indicator name="Network Sensor"></status-indicator>
            <status-indicator name="Persistence Monitor"></status-indicator>
            <status-indicator name="Active Blocker"></status-indicator>
          </section>
        </div>
      </div>
    </Layout>
  );
};
