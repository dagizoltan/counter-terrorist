/**
 * <status-indicator name="..."> — one agent's liveness row.
 *
 * Previously wrote its colour through inline `style="background: ...;
 * box-shadow: ..."` attributes built from a `var(--success)` string passed
 * around as a parameter. That meant this dot's treatment could drift from
 * every other status dot in the console, and it was one of the attributes
 * keeping 'unsafe-inline' in the CSP's style-src. State is an attribute the
 * stylesheet matches now, and style-src is down to 'self'.
 */

import { unwrap } from "./api.js";
/** Maps a raw agent condition onto the console's five-state vocabulary. */
const STATE = {
  ONLINE: "ok",
  OFFLINE: "crit",
  ERROR: "crit",
  TRIPPED: "warn",
  "SAFE MODE": "warn",
};

class StatusIndicator extends HTMLElement {
  connectedCallback() {
    this.updateStatus();
    this.interval = setInterval(() => this.updateStatus(), 30000);
  }

  disconnectedCallback() {
    if (this.interval) clearInterval(this.interval);
  }

  async updateStatus() {
    const name = this.getAttribute("name") || "Unknown Agent";

    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch("/api/agent/status", {
        headers: csrfToken ? { "X-CT-Token": csrfToken } : {},
      });

      if (!res.ok) return this.render(name, "ERROR");

      const data = await unwrap(res);

      if (data.safeMode) return this.render(name, "SAFE MODE");

      const sidecar = {
        "Active Blocker": "blocker",
        "Network Sensor": "sentinel",
        "Persistence Monitor": "watchfile",
      }[name];

      if (sidecar && data.trippedSidecars?.includes(sidecar)) {
        return this.render(name, "TRIPPED");
      }

      const online = name === "Active Blocker" ? data.firewall?.active
        : name === "Network Sensor" ? data.ebpf?.active
        : name === "Persistence Monitor" ? data.fim?.active
        : false;

      this.render(name, online ? "ONLINE" : "OFFLINE");
    } catch {
      this.render(name, "ERROR");
    }
  }

  render(name, status) {
    const state = STATE[status] ?? "idle";
    const esc = globalThis.escapeHTML ?? ((v) => String(v));

    this.innerHTML = `
      <div class="stat-row" data-state="${state}">
        <span class="eyebrow">${esc(name)}</span>
        <span class="agent-state">
          <span class="indicator" data-state="${state}"${state === "ok" ? ' data-pulse=""' : ""} aria-hidden="true"></span>
          <span class="agent-state__label">${esc(status)}</span>
        </span>
      </div>
    `;
  }
}

customElements.define("status-indicator", StatusIndicator);
