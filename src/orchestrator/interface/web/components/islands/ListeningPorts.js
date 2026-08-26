/**
 * <listening-ports> — what the host is accepting connections on.
 *
 * The console has always been able to open and close ports: arming a decoy
 * calls allowPort, morphing calls both. Nothing ever reported the result, so
 * an operator could not confirm a port opened, notice one left open, or spot a
 * listener nobody meant to expose. This is the missing half of that control.
 *
 * Decoy ports are labelled from the honeypot manifest, and an armed decoy
 * whose port is NOT listening is called out — the module claims armed and the
 * host disagrees, which is worth knowing.
 */
import { apiGet, apiSend } from "./api.js";
import { bindActions, preserveFocus } from "./actions.js";

const REFRESH_MS = 20000;

/** Ports whose exposure is worth a second look when bound to a wildcard. */
const SENSITIVE = new Map([
  [22, "SSH"], [23, "Telnet"], [445, "SMB"], [3389, "RDP"],
  [3306, "MySQL"], [5432, "PostgreSQL"], [6379, "Redis"], [27017, "MongoDB"],
  [9200, "Elasticsearch"], [2375, "Docker API"], [6443, "Kubernetes API"],
]);

const isWildcard = (address) => address === "*" || address === "0.0.0.0" || address === "::";

class ListeningPorts extends HTMLElement {
  constructor() {
    super();
    this.data = null;
    this.error = null;
    this.notice = null;
    this.search = "";
    this.busy = new Set();
  }

  get canOperate() {
    return this.getAttribute("role-name") === "admin";
  }

  connectedCallback() {
    bindActions(this, {
      deny: (el) => this.setPort(el.dataset.port, el.dataset.protocol, "deny"),
      allow: (el) => this.setPort(el.dataset.port, el.dataset.protocol, "allow"),
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
      this.data = await apiGet("/api/network/ports");
      this.error = null;
    } catch (e) {
      this.error = e.message;
    }
    this.render();
  }

  async setPort(port, protocol, action) {
    const key = `${action}:${port}/${protocol}`;
    if (!port || this.busy.has(key)) return;
    if (action === "deny" && !globalThis.confirm(`Close port ${port}/${protocol} at the perimeter?`)) return;

    this.busy.add(key);
    this.render();
    try {
      await apiSend(`/api/network/ports/${encodeURIComponent(port)}`, "POST", { action, protocol });
      this.notice = `Port ${port}/${protocol} ${action === "allow" ? "opened" : "closed"} at the perimeter.`;
      this.error = null;
      await this.load();
    } catch (e) {
      this.error = `Could not ${action} port ${port}: ${e.message}`;
    } finally {
      this.busy.delete(key);
      this.render();
    }
  }

  get visible() {
    const ports = this.data?.ports ?? [];
    const q = this.search.trim().toLowerCase();
    if (!q) return ports;
    return ports.filter((p) =>
      String(p.port).includes(q) ||
      (p.process || "").toLowerCase().includes(q) ||
      (p.decoy?.name || "").toLowerCase().includes(q) ||
      (SENSITIVE.get(p.port) || "").toLowerCase().includes(q)
    );
  }

  render() {
    preserveFocus(this, () => this.paint());
  }

  paint() {
    const esc = globalThis.escapeHTML ?? ((v) => String(v));

    if (this.data && this.data.supported === false) {
      this.innerHTML = `<div class="empty-state"><span class="eyebrow">Port enumeration is not available on this platform</span></div>`;
      return;
    }

    const ports = this.visible;
    const total = this.data?.ports?.length ?? 0;
    const exposed = (this.data?.ports ?? []).filter((p) => isWildcard(p.address) && SENSITIVE.has(p.port)).length;
    const missing = this.data?.decoys ?? [];

    let body;
    if (this.error && !this.data) {
      body = `<div class="error-box" role="alert"><span class="danger-dot" aria-hidden="true"></span>${esc(this.error)}</div>`;
    } else if (!this.data) {
      body = `<div class="ledger-list">${'<div class="skeleton" style="height:44px"></div>'.repeat(5)}</div>`;
    } else if (total === 0) {
      body = `<div class="empty-state"><span class="eyebrow">Nothing is listening</span></div>`;
    } else if (ports.length === 0) {
      body = `<div class="empty-state"><span class="eyebrow">No listener matches “${esc(this.search)}”</span></div>`;
    } else {
      body = `<div class="ledger-list">${ports.map((p) => this.renderPort(p, esc)).join("")}</div>`;
    }

    this.innerHTML = `
      <div class="ledger">
        <header class="ledger__head">
          <span class="eyebrow eyebrow--tick">Listening Sockets</span>
          <div class="ledger__meta">
            ${this.data ? `<span class="eyebrow"><span class="num">${total}</span>&nbsp;listening</span>` : ""}
            ${exposed > 0 ? `<span class="pill" data-state="warn"><span class="num">${exposed}</span>&nbsp;sensitive and world-bound</span>` : ""}
            <input type="search" class="input input--sm" placeholder="Filter by port, process or decoy"
                   value="${esc(this.search)}" data-action="setSearch" data-on="input"
                   aria-label="Filter listening sockets" />
            <button type="button" class="btn btn--sm" data-action="refresh">Refresh</button>
          </div>
        </header>

        ${this.error && this.data ? `<div class="error-box" role="alert"><span class="danger-dot" aria-hidden="true"></span>${esc(this.error)}</div>` : ""}
        ${this.notice ? `<div class="notice-box" role="status">${esc(this.notice)}</div>` : ""}

        ${missing.length === 0 ? "" : `
          <div class="error-box" role="status">
            <span class="danger-dot" aria-hidden="true"></span>
            Armed but not listening: ${missing.map((d) => `${esc(d.name)} (${esc(d.port)})`).join(", ")}
          </div>`}

        ${body}
      </div>
    `;
  }

  renderPort(p, esc) {
    const wildcard = isWildcard(p.address);
    const wellKnown = SENSITIVE.get(p.port);
    const risky = wildcard && wellKnown && !p.decoy;
    const state = p.decoy ? (p.decoy.active ? "warn" : "idle") : risky ? "crit" : "info";
    const denyKey = `deny:${p.port}/${p.protocol}`;

    return `
      <article class="ledger-row" data-state="${esc(state)}">
        <div class="ledger-row__id">
          <span class="indicator" aria-hidden="true"></span>
          <span class="ledger-row__ip">${esc(p.port)}/${esc(p.protocol)}</span>
        </div>

        <div class="ledger-row__facts">
          <span class="eyebrow"${p.decoy ? ' data-tone="warning"' : risky ? ' data-tone="danger"' : ""}>
            ${p.decoy ? `Decoy · ${esc(p.decoy.name)}` : wellKnown ? esc(wellKnown) : esc(p.process || "unattributed")}
          </span>
          <span class="ledger-row__ttl">
            ${esc(p.address)}${p.pid ? ` · pid ${esc(p.pid)}` : ""}${risky ? " · reachable from any interface" : ""}
          </span>
        </div>

        <div class="ledger-row__when">
          <span class="eyebrow">${wildcard ? "All interfaces" : "Loopback or bound"}</span>
        </div>

        ${this.canOperate && !p.decoy ? `
          <button type="button" class="btn btn--sm danger" data-action="deny"
                  data-port="${esc(p.port)}" data-protocol="${esc(p.protocol)}"
                  ${this.busy.has(denyKey) ? "disabled" : ""}>
            ${this.busy.has(denyKey) ? "…" : "Close"}
          </button>` : `<span></span>`}
      </article>
    `;
  }
}

customElements.define("listening-ports", ListeningPorts);
