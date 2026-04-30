/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { Layout } from "../Layout.tsx";

import { ApplicationStatus } from "../../core/ports.ts";

export const Dashboard = (props: { status: ApplicationStatus }) => {
  const { os, platformTag, isRoot, plugins } = props.status;
  
  const cssPaths = ['/pages/dashboard/style.css'];
  const islandPaths = [
    '/pages/dashboard/islands/StatusIndicator.js',
    '/pages/dashboard/islands/BlockingLog.js',
    '/pages/dashboard/islands/ProcessTree.js'
  ];

  return (
    <Layout title="Dashboard" cssPaths={cssPaths} islandPaths={islandPaths}>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div class="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg dashboard-card">
          <h3 class="text-slate-400 text-sm font-semibold mb-2 uppercase">System OS</h3>
          <p class="text-2xl font-bold text-white capitalize">{os}</p>
        </div>
        <div class="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg dashboard-card">
          <h3 class="text-slate-400 text-sm font-semibold mb-2 uppercase">Privileges</h3>
          <p class={`text-2xl font-bold ${isRoot ? "text-green-400" : "text-yellow-400"}`}>
            {isRoot ? "Elevated (Root)" : "Limited (User)"}
          </p>
        </div>
        <div class="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg dashboard-card">
          <h3 class="text-slate-400 text-sm font-semibold mb-2 uppercase">Protection Status</h3>
          <p class="text-2xl font-bold text-red-500 status-badge">ACTIVE</p>
        </div>
        <div class="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg dashboard-card">
          <h3 class="text-slate-400 text-sm font-semibold mb-2 uppercase">Platform Tag</h3>
          <p class="text-2xl font-bold text-white">{platformTag}</p>
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

          <section class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div class="bg-slate-700/50 p-4 border-b border-slate-700 flex justify-between items-center">
              <h2 class="font-bold">Process Hierarchy (eBPF Tracked)</h2>
              <button onclick="document.querySelector('process-tree').refresh()" class="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded border border-slate-600 transition-colors">REFRESH</button>
            </div>
            <div class="p-4 max-h-[300px] overflow-y-auto">
              <process-tree></process-tree>
            </div>
          </section>
        </div>

        <div class="space-y-6">
          <section class="bg-slate-800 p-6 rounded-xl border border-slate-700">
            <h2 class="font-bold mb-4">System Baseline & Reports</h2>
            <div class="grid grid-cols-2 gap-4">
              <button
                onclick="fetch('/api/baseline/set', {method:'POST', headers: {'X-CT-Token': (document.cookie.match(/csrf_token=([^;]+)/)||[])[1] || ''}})"
                class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm transition-colors"
              >
                SET NEW BASELINE
              </button>
              <button
                onclick="fetch('/api/baseline/check', {method:'POST', headers: {'X-CT-Token': (document.cookie.match(/csrf_token=([^;]+)/)||[])[1] || ''}})"
                class="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded text-sm transition-colors"
              >
                RUN DRIFT AUDIT
              </button>
              <button
                onclick="window.open('/api/reports/export', '_blank')"
                class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded text-sm transition-colors col-span-2"
              >
                EXPORT SECURITY REPORT (JSON)
              </button>
            </div>
          </section>

          <section class="bg-slate-800 p-6 rounded-xl border border-slate-700">
            <h2 class="font-bold mb-4">Hardening Controls</h2>
            <div class="space-y-4">
              <div class="flex items-center justify-between p-3 bg-slate-900 rounded-lg">
                <span>Rootkit Scanner</span>
                <button
                  onclick="fetch('/api/protection/rkhunter/scan', {method:'POST', headers: {'X-CT-Token': (document.cookie.match(/csrf_token=([^;]+)/)||[])[1] || ''}})"
                  class="bg-red-600 hover:bg-red-700 text-white text-xs py-1 px-2 rounded"
                >
                  RUN RKHUNTER
                </button>
              </div>
              <div class="flex items-center justify-between p-3 bg-slate-900 rounded-lg">
                <span>Incoming Firewall</span>
                <span class="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded border border-green-500/30">LOCKED</span>
              </div>
              <div class="flex items-center justify-between p-3 bg-slate-900 rounded-lg">
                <span>Privacy VPN</span>
                <span class="px-2 py-1 bg-slate-700 text-slate-400 text-xs rounded border border-slate-600">DISCONNECTED</span>
              </div>
              <div class="flex items-center justify-between p-3 bg-slate-900 rounded-lg">
                <span>Antivirus (ClamAV)</span>
                <button
                  onclick="fetch('/api/protection/clamav/scan', {method:'POST', headers: {'X-CT-Token': (document.cookie.match(/csrf_token=([^;]+)/)||[])[1] || ''}})"
                  class="bg-red-600 hover:bg-red-700 text-white text-xs py-1 px-2 rounded"
                >
                  RUN SCAN
                </button>
              </div>
            </div>
          </section>

          <section class="bg-slate-800 p-6 rounded-xl border border-slate-700">
            <h2 class="font-bold mb-4">Active Plugins</h2>
            <div class="space-y-3">
              {plugins.length === 0 ? (
                <p class="text-sm text-slate-400">No plugins loaded.</p>
              ) : (
                plugins.map(p => (
                  <div class="flex items-center justify-between p-3 bg-slate-900 rounded-lg">
                    <div>
                      <div class="font-medium text-sm flex items-center gap-2">
                        {p.name}
                        <span class={`w-2 h-2 rounded-full ${p.status === 'RUNNING' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                      </div>
                      <div class="text-xs text-slate-500 font-mono mt-1">{p.version}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </Layout>
  );
};
