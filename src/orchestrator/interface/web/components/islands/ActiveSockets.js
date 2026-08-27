import { apiGet, apiSend } from "./api.js";
import { bindActions, preserveFocus } from "./actions.js";

const REFRESH_MS = 5000;

class ActiveSockets extends HTMLElement {
  constructor() {
    super();
    this.data = null;
    this.error = null;
    this.notice = null;
    this.search = "";
    this.busy = new Set();
  }

  get canOperate() {
    const role = this.getAttribute("role-name");
    return role === "admin" || role === "operator";
  }

  connectedCallback() {
    bindActions(this, {
      isolateIp: (el) => this.isolateIp(el.dataset.ip),
      killPid: (el) => this.killPid(el.dataset.pid),
      setSearch: (el) => { this.search = el.value; this.render(); },
      refresh: () => this.load(),
    });
    this.render();
    this.load();
    this.timer = setInterval(() => this.load(), REFRESH_MS);
  }

  disconnectedCallback() {
    if (this.timer) clearInterval(this.timer);
  }

  async load() {
    try {
      this.data = await apiGet("/api/network/sockets");
      this.error = null;
    } catch (e) {
      this.error = e.message;
    }
    this.render();
  }

  async isolateIp(ip) {
    if (!ip) return;
    if (!globalThis.confirm(`Commit kernel isolation for remote IP ${ip}?`)) return;
    const key = `isolate:${ip}`;
    this.busy.add(key);
    this.render();
    try {
      await apiSend("/api/defense/isolate", "POST", { source: ip, reason: "Manual active socket isolation" });
      this.notice = `Remote IP ${ip} isolated at perimeter kernel.`;
      this.error = null;
      await this.load();
    } catch (e) {
      this.error = `Failed to isolate ${ip}: ${e.message}`;
    } finally {
      this.busy.delete(key);
      this.render();
    }
  }

  async killPid(pid) {
    if (!pid) return;
    if (!globalThis.confirm(`Terminate process PID ${pid}?`)) return;
    const key = `kill:${pid}`;
    this.busy.add(key);
    this.render();
    try {
      await apiSend(`/api/processes/kill/${encodeURIComponent(pid)}`, "POST", { signal: "SIGKILL" });
      this.notice = `Process PID ${pid} terminated.`;
      this.error = null;
      await this.load();
    } catch (e) {
      this.error = `Failed to terminate PID ${pid}: ${e.message}`;
    } finally {
      this.busy.delete(key);
      this.render();
    }
  }

  get visible() {
    const sockets = this.data?.sockets ?? [];
    const q = this.search.trim().toLowerCase();
    if (!q) return sockets;
    return sockets.filter((s) =>
      String(s.localPort).includes(q) ||
      String(s.remotePort).includes(q) ||
      s.localIp.toLowerCase().includes(q) ||
      s.remoteIp.toLowerCase().includes(q) ||
      (s.process || "").toLowerCase().includes(q) ||
      (s.geo?.country || "").toLowerCase().includes(q) ||
      (s.state || "").toLowerCase().includes(q)
    );
  }

  render() {
    preserveFocus(this, () => this.paint());
  }

  paint() {
    const esc = globalThis.escapeHTML ?? ((v) => String(v));

    if (this.data && this.data.supported === false) {
      this.innerHTML = `<div class="empty-state"><span class="eyebrow">Active socket inspection not supported on this platform</span></div>`;
      return;
    }

    const sockets = this.visible;
    const total = this.data?.sockets?.length ?? 0;
    const threats = (this.data?.sockets ?? []).filter((s) => s.isThreat).length;

    let body;
    if (this.error && !this.data) {
      body = `<div class="error-box" role="alert"><span class="danger-dot" aria-hidden="true"></span>${esc(this.error)}</div>`;
    } else if (!this.data) {
      body = `<div class="ledger-list">${'<div class="skeleton skeleton--row"></div>'.repeat(5)}</div>`;
    } else if (total === 0) {
      body = `<div class="empty-state"><span class="eyebrow">No active external socket flows detected</span></div>`;
    } else if (sockets.length === 0) {
      body = `<div class="empty-state"><span class="eyebrow">No socket flow matches “${esc(this.search)}”</span></div>`;
    } else {
      body = `<div class="ledger-list">${sockets.map((s) => this.renderSocketRow(s, esc)).join("")}</div>`;
    }

    this.innerHTML = `
      <div class="ledger">
        <header class="ledger__head">
          <span class="eyebrow eyebrow--tick">Active Socket Flows (Real-Time Ingress & Egress)</span>
          <div class="ledger__meta">
            ${this.data ? `<span class="eyebrow"><span class="num">${total}</span>&nbsp;active flows</span>` : ""}
            ${threats > 0 ? `<span class="pill" data-state="crit"><span class="num">${threats}</span>&nbsp;threat signals</span>` : ""}
            <input type="search" class="input input--sm" placeholder="Filter by IP, port, PID, or process"
                   value="${esc(this.search)}" data-action="setSearch" data-on="input"
                   aria-label="Filter active flows" />
            <button type="button" class="btn btn--sm" data-action="refresh">Refresh</button>
          </div>
        </header>

        ${this.error && this.data ? `<div class="error-box" role="alert"><span class="danger-dot" aria-hidden="true"></span>${esc(this.error)}</div>` : ""}
        ${this.notice ? `<div class="notice-box" role="status">${esc(this.notice)}</div>` : ""}

        ${body}
      </div>
    `;
  }

  renderSocketRow(s, esc) {
    const isCrit = s.isThreat || (s.threatScore && s.threatScore >= 70);
    const stateAttr = isCrit ? "crit" : s.state === "ESTABLISHED" ? "info" : "idle";

    const isolateKey = `isolate:${s.remoteIp}`;
    const killKey = `kill:${s.pid}`;

    return `
      <article class="ledger-row" data-state="${esc(stateAttr)}">
        <div class="ledger-row__id">
          <span class="indicator" aria-hidden="true"></span>
          <span class="ledger-row__ip font-mono">${esc(s.localIp)}:${esc(s.localPort)} → ${esc(s.remoteIp)}:${esc(s.remotePort)}</span>
        </div>

        <div class="ledger-row__facts">
          <span class="eyebrow"${isCrit ? ' data-tone="danger"' : ''}>
            ${esc(s.protocol.toUpperCase())} · ${esc(s.state)}
            ${s.geo?.country ? ` · ${esc(s.geo.country)}` : ""}
            ${s.threatScore ? ` · Threat Score: ${esc(s.threatScore)}` : ""}
          </span>
          <span class="ledger-row__ttl">
            ${s.process ? `Process: ${esc(s.process)}` : "Process: Unattributed"} ${s.pid ? `(PID ${esc(s.pid)})` : ""}
          </span>
        </div>

        <div class="flex items-center gap-2">
          ${this.canOperate && s.remoteIp ? `
            <button type="button" class="btn btn--sm danger" data-action="isolateIp"
                    data-ip="${esc(s.remoteIp)}" ${this.busy.has(isolateKey) ? "disabled" : ""}>
              ${this.busy.has(isolateKey) ? "…" : "Isolate IP"}
            </button>` : ""}
          ${this.canOperate && s.pid ? `
            <button type="button" class="btn btn--sm warning" data-action="killPid"
                    data-pid="${esc(s.pid)}" ${this.busy.has(killKey) ? "disabled" : ""}>
              ${this.busy.has(killKey) ? "…" : "Kill PID"}
            </button>` : ""}
        </div>
      </article>
    `;
  }
}

customElements.define("active-sockets", ActiveSockets);
