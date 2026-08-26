/**
 * <network-detail> — one discovered participant, and the operations aimed at it.
 *
 * The neighbours grid lists ambient signals but cannot act on a single one.
 * This is the target profile the grid links into: identity, live telemetry, and
 * an operations panel.
 *
 * Two tiers of operation, deliberately separated:
 *   - Perimeter enforcement (block / release) is a capability that already
 *     exists elsewhere in the console; it is wired live here and operator-gated.
 *   - The offensive probes — port scan, service fingerprint, load test — are
 *     staged as disabled affordances. Their engines are not built yet; showing
 *     them armed would be a lie. They render as "Planned" so the page is the
 *     launch point it is meant to become without pretending to fire.
 *
 * Escaping: every string here comes from a device on the other end of a sweep,
 * so it is escaped through the shell's escapeHTML before it reaches innerHTML.
 */
import { apiGet, apiSend } from "./api.js";
import { bindActions } from "./actions.js";

const REFRESH_MS = 12000;

class NetworkDetail extends HTMLElement {
  constructor() {
    super();
    this.data = null;
    this.error = null;
    this.notFound = false;
    this.notice = null;
    this.busy = new Set();
  }

  get targetId() {
    return this.getAttribute("target-id") || "";
  }

  get canOperate() {
    const role = this.getAttribute("role-name");
    return role === "admin" || role === "operator";
  }

  connectedCallback() {
    bindActions(this, {
      block: () => this.enforce("block"),
      release: () => this.enforce("release"),
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
      this.data = await apiGet(`/api/network/neighbors/${encodeURIComponent(this.targetId)}`);
      this.error = null;
      this.notFound = false;
    } catch (e) {
      if (e.status === 404) {
        this.notFound = true;
      } else {
        this.error = e.message;
      }
    }
    this.render();
  }

  /** block | release — keyed on the participant's own address. */
  async enforce(kind) {
    const ip = this.data?.device?.ip;
    if (!ip || this.busy.has(kind)) return;
    this.busy.add(kind);
    this.render();
    try {
      const url = kind === "block" ? "/api/agents/firewall/block" : "/api/agents/firewall/unblock";
      await apiSend(url, "POST", { ip });
      this.notice = kind === "block"
        ? `${ip} committed to the blocklist.`
        : `${ip} released from the blocklist.`;
      this.error = null;
      await this.load();
    } catch (e) {
      this.error = `${kind} failed for ${ip}: ${e.message}`;
    } finally {
      this.busy.delete(kind);
      this.render();
    }
  }

  render() {
    const esc = globalThis.escapeHTML ?? ((v) => String(v));

    if (this.notFound) {
      this.innerHTML = `
        <div class="network-detail">
          <div class="empty-state" role="status">
            <span class="eyebrow">This participant is no longer visible in the current sweep</span>
            <a href="/network/neighbors" class="btn btn--sm ghost">Back to signals</a>
          </div>
        </div>`;
      return;
    }
    if (this.error && !this.data) {
      this.innerHTML = `<div class="error-box" role="alert"><span class="danger-dot" aria-hidden="true"></span>${esc(this.error)}</div>`;
      return;
    }
    if (!this.data) {
      this.innerHTML = `<div class="network-detail">${'<div class="skeleton skeleton--block"></div>'.repeat(3)}</div>`;
      return;
    }

    const d = this.data.device;
    const vector = this.data.vector;
    const trust = this.data.trust;
    const name = d.ssid || d.hostname || d.name || d.mac || "ANONYMOUS_ENTITY";
    const trustState = trust > 70 ? "ok" : trust > 40 ? "warn" : "crit";
    const trustLabel = trust > 70 ? "Optimal" : trust > 40 ? "Caution" : "Untrusted";
    const vectorState = vector === "WIFI" ? "info" : vector === "BLUETOOTH" ? "warn" : "ok";

    this.innerHTML = `
      <div class="network-detail">
        ${this.error ? `<div class="error-box" role="alert"><span class="danger-dot" aria-hidden="true"></span>${esc(this.error)}</div>` : ""}
        ${this.notice ? `<div class="notice-box" role="status">${esc(this.notice)}</div>` : ""}

        <section class="panel" data-state="${vectorState}">
          <header class="panel__head">
            <span class="panel__title">
              <span class="indicator" data-state="${vectorState}" aria-hidden="true"></span>
              ${esc(name)}
            </span>
            <div class="network-detail__controls">
              <span class="pill" data-state="${vectorState}">${esc(vector)}</span>
              <span class="pill" data-state="${trustState}">Trust ${esc(String(trust))}%</span>
            </div>
          </header>

          <div class="stat-grid">
            <div class="stat-cell">
              <span class="eyebrow">Hardware Address</span>
              <span class="stat-cell__value mono">${esc(d.mac || "—")}</span>
            </div>
            <div class="stat-cell">
              <span class="eyebrow">Address</span>
              <span class="stat-cell__value mono">${esc(d.ip || "—")}</span>
            </div>
            <div class="stat-cell">
              <span class="eyebrow">Vendor</span>
              <span class="stat-cell__value">${esc(d.vendor || "Unknown")}</span>
            </div>
            <div class="stat-cell">
              <span class="eyebrow">Trust Assessment</span>
              <span class="stat-cell__value tone-text" data-state="${trustState}">${esc(trustLabel)}</span>
            </div>
          </div>

          <p class="network-detail__desc">${esc((d.publicIntel || "STANDARD_NODE_IDENTIFIED").replace(/_/g, " "))}</p>
        </section>

        ${this.renderTelemetry(esc, d, vector, vectorState)}
        ${this.renderAttributes(esc, d, vector)}
        ${this.renderOperations(esc, d)}
      </div>
    `;
  }

  renderTelemetry(esc, d, vector, state) {
    const isBT = vector === "BLUETOOTH";
    const isMesh = vector === "MESH";
    const magnitude = isMesh ? "VERIFIED" : isBT ? `${esc(String(d.signal ?? "—"))} dBm` : `${esc(String(d.signal ?? "—"))}%`;
    const strength = isMesh ? 100 : Number(d.signal);
    return `
      <section class="panel">
        <header class="panel__head">
          <span class="panel__title">Signal Telemetry</span>
          <span class="mono tone-text" data-state="${state}">${magnitude}</span>
        </header>
        <div class="signal-track">${this.renderBars(strength, state)}</div>
      </section>`;
  }

  /** Signal strength as a row of segments; opacity rides on data-value, applied
   *  by the shell's meter helper. An inline style would be refused by the CSP. */
  renderBars(signal, state) {
    const bars = 16;
    const pct = Number.isFinite(signal) ? (signal < 0 ? 100 + signal : signal) : 0;
    const active = Math.ceil(pct / (100 / bars));
    let html = "";
    for (let i = 0; i < bars; i++) {
      const opacity = i < active ? Math.round((0.2 + (i / bars) * 0.8) * 100) : 3;
      html += `<div class="tone-bg signal-seg" data-state="${state}" data-value="${opacity}"></div>`;
    }
    return html;
  }

  renderAttributes(esc, d, vector) {
    const rows = [];
    if (vector === "WIFI") {
      rows.push(["Channel", d.channel ?? "—"], ["Band", d.band ?? "—"], ["Encryption", d.encryption ?? "OPEN"]);
    } else if (vector === "BLUETOOTH") {
      rows.push(["Class", d.type ?? "DEVICE"], ["Battery", d.battery ?? "—"], ["Address Type", "LE_PUBLIC"]);
    } else {
      rows.push(["Network", vector === "MESH" ? "MESH" : "LOCAL"], ["State", d.state ?? "—"], ["Auth", vector === "MESH" ? "VERIFIED" : "NONE"]);
    }
    return `
      <section class="panel">
        <header class="panel__head"><span class="panel__title">Attributes</span></header>
        <div class="stat-grid">
          ${rows.map(([label, value]) => `
            <div class="stat-cell">
              <span class="eyebrow">${esc(label)}</span>
              <span class="stat-cell__value">${esc(String(value))}</span>
            </div>`).join("")}
        </div>
      </section>`;
  }

  renderOperations(esc, d) {
    const blocked = this.data.blocked;
    const canEnforce = this.data.canEnforce && this.canOperate;
    const blockBusy = this.busy.has("block");
    const releaseBusy = this.busy.has("release");

    // Perimeter enforcement: a live, existing capability, gated to operators and
    // only meaningful when the participant has an address to enforce against.
    const enforcement = !this.data.canEnforce
      ? `<div class="empty-state"><span class="eyebrow">No routable address to enforce against</span></div>`
      : `
        <article class="ledger-row" data-state="${blocked ? "idle" : "info"}">
          <div class="ledger-row__id">
            <span class="indicator" data-state="${blocked ? "crit" : "ok"}" aria-hidden="true"></span>
            <span class="ledger-row__ip">${esc(d.ip)}</span>
          </div>
          <div class="ledger-row__facts">
            <span class="eyebrow" data-tone="${blocked ? "danger" : "success"}">
              ${blocked ? "Blocked at perimeter" : "Permitted"}
            </span>
          </div>
          ${canEnforce ? `
            <div class="network-detail__row-actions">
              ${blocked
                ? `<button type="button" class="btn btn--sm" data-action="release" ${releaseBusy ? "disabled" : ""}>${releaseBusy ? "…" : "Release"}</button>`
                : `<button type="button" class="btn btn--sm danger" data-action="block" ${blockBusy ? "disabled" : ""}>${blockBusy ? "…" : "Block"}</button>`}
            </div>`
            : `<span class="eyebrow">Operator role required</span>`}
        </article>`;

    // Offensive probes: not yet armed. Disabled, and labelled as such — the
    // page is the launch point these will attach to, not a pretend trigger.
    const planned = [
      ["Port Scan", "Enumerate reachable services on this host"],
      ["Service Fingerprint", "Identify software and versions behind open ports"],
      ["Load Test", "Sustained request pressure against a chosen endpoint"],
    ];

    return `
      <section class="panel">
        <header class="panel__head">
          <span class="panel__title">Perimeter</span>
          <span class="eyebrow">Block or release this participant</span>
        </header>
        <div class="ledger-list">${enforcement}</div>
      </section>

      <section class="panel">
        <header class="panel__head">
          <span class="panel__title">Operations</span>
          <span class="eyebrow">Active probes — not yet armed</span>
        </header>
        <div class="network-detail__ops">
          ${planned.map(([label, desc]) => `
            <div class="network-detail__op">
              <div class="network-detail__op-head">
                <span class="stat-cell__value">${esc(label)}</span>
                <span class="pill" data-state="idle">Planned</span>
              </div>
              <span class="eyebrow">${esc(desc)}</span>
              <button type="button" class="btn btn--sm ghost" disabled aria-disabled="true">Not armed</button>
            </div>`).join("")}
        </div>
      </section>`;
  }
}

customElements.define("network-detail", NetworkDetail);
