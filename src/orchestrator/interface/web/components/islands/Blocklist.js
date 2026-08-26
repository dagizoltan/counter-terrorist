/**
 * <block-list> — the active enforcement ledger.
 *
 * What this replaces: the blocked-IP panel used to be assembled client-side
 * from metrics.firewall.blockedIps (capped at 20 by emitMetrics) and, when
 * that came back empty, a regex over raw iptables stdout hunting for
 * /(\d+\.\d+\.\d+\.\d+)/ on lines containing DROP/REJECT/DENY. So it
 * truncated silently past 20 entries, never matched an IPv6 block, and could
 * only ever show a bare address.
 *
 * The record behind each block — reason, when it was committed, when its TTL
 * lapses — has been in KV since the feature was written. It is read over
 * /api/agents/firewall/blocklist now.
 *
 * Blocks are not permanent: CuratedIntelService's lifecycle audit re-verifies
 * each entry as its TTL expires and either extends it 24h or purges it. An
 * entry past its expiry is shown as awaiting that audit rather than as gone,
 * because it is still being enforced until the sweep runs.
 */
import { apiGet, apiSend } from "./api.js";
import { bindActions, preserveFocus } from "./actions.js";

const REFRESH_MS = 15000;

/** "3d 4h", "12m", "just now" — a TTL an operator can read at a glance. */
function humanizeMs(ms) {
  const abs = Math.abs(ms);
  const d = Math.floor(abs / 86400000);
  const h = Math.floor((abs % 86400000) / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "under a minute";
}

class Blocklist extends HTMLElement {
  constructor() {
    super();
    this.entries = null;
    this.error = null;
    this.search = "";
    this.busy = new Set();
  }

  get canOperate() {
    const role = this.getAttribute("role-name");
    return role === "admin" || role === "operator";
  }

  connectedCallback() {
    bindActions(this, {
      release: (el) => this.release(el.dataset.ip),
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
      const payload = await apiGet("/api/agents/firewall/blocklist");
      this.entries = Array.isArray(payload?.entries) ? payload.entries : [];
      this.error = null;
    } catch (e) {
      this.error = e.message;
    }
    this.render();
  }

  async release(ip) {
    if (!ip || this.busy.has(ip)) return;
    this.busy.add(ip);
    this.render();
    try {
      await apiSend("/api/agents/firewall/unblock", "POST", { ip });
      this.error = null;
      await this.load();
    } catch (e) {
      this.error = `Release failed for ${ip}: ${e.message}`;
    } finally {
      this.busy.delete(ip);
      this.render();
    }
  }

  get visible() {
    if (!this.entries) return [];
    const q = this.search.trim().toLowerCase();
    if (!q) return this.entries;
    return this.entries.filter((e) =>
      e.ip.toLowerCase().includes(q) || (e.reason || "").toLowerCase().includes(q)
    );
  }

  render() {
    preserveFocus(this, () => this.paint());
  }

  paint() {
    const esc = globalThis.escapeHTML ?? ((v) => String(v));
    const entries = this.visible;
    const total = this.entries?.length ?? 0;
    const lapsed = (this.entries ?? []).filter((e) => e.expiresInMs !== null && e.expiresInMs <= 0).length;

    let body;
    if (this.error) {
      body = `<div class="error-box" role="alert"><span class="danger-dot" aria-hidden="true"></span>${esc(this.error)}</div>`;
    } else if (this.entries === null) {
      body = `<div class="ledger-list">${'<div class="skeleton skeleton--wide"></div>'.repeat(4)}</div>`;
    } else if (total === 0) {
      body = `<div class="empty-state"><span class="eyebrow">Perimeter clear — no active blocks</span></div>`;
    } else if (entries.length === 0) {
      body = `<div class="empty-state"><span class="eyebrow">No block matches “${esc(this.search)}”</span></div>`;
    } else {
      body = `<div class="ledger-list">${entries.map((e) => this.renderEntry(e, esc)).join("")}</div>`;
    }

    this.innerHTML = `
      <div class="ledger">
        <header class="ledger__head">
          <span class="eyebrow eyebrow--tick">Active Quarantine Ledger</span>
          <div class="ledger__meta">
            ${this.entries === null ? "" : `
              <span class="eyebrow"><span class="num">${total}</span>&nbsp;enforced</span>
              ${lapsed > 0 ? `<span class="pill" data-state="warn"><span class="num">${lapsed}</span>&nbsp;awaiting re-verification</span>` : ""}
            `}
            <input type="search" class="input input--sm" placeholder="Filter by address or reason"
                   value="${esc(this.search)}" data-action="setSearch" data-on="input"
                   aria-label="Filter the enforcement ledger" />
            <button type="button" class="btn btn--sm" data-action="refresh">Refresh</button>
          </div>
        </header>
        ${body}
      </div>
    `;
  }

  renderEntry(entry, esc) {
    const pending = this.busy.has(entry.ip);
    const lapsed = entry.expiresInMs !== null && entry.expiresInMs <= 0;
    // Manual blocks carry no intel behind them; auto-committed ones name the
    // indicator that triggered isolation.
    const reason = entry.reason ?? "unrecorded";
    const state = lapsed ? "warn" : "crit";

    let ttl;
    if (entry.expiresAt === null) {
      ttl = "no TTL on record";
    } else if (lapsed) {
      ttl = `lapsed ${humanizeMs(entry.expiresInMs)} ago · awaiting audit`;
    } else {
      ttl = `expires in ${humanizeMs(entry.expiresInMs)}`;
    }

    return `
      <article class="ledger-row" data-state="${state}">
        <div class="ledger-row__id">
          <span class="indicator" data-pulse="" aria-hidden="true"></span>
          <span class="ledger-row__ip">${esc(entry.ip)}</span>
        </div>

        <div class="ledger-row__facts">
          <span class="eyebrow" data-tone="${lapsed ? "warning" : "danger"}">${esc(reason.replace(/_/g, " "))}</span>
          <span class="ledger-row__ttl">${esc(ttl)}</span>
        </div>

        <div class="ledger-row__when">
          ${entry.committedAt === null
            ? `<span class="eyebrow">committed before this record</span>`
            : `<span class="eyebrow">held ${esc(humanizeMs(Date.now() - entry.committedAt))}</span>`}
          ${entry.persisted ? "" : `<span class="eyebrow" data-tone="warning">memory only</span>`}
        </div>

        ${this.canOperate ? `
          <button type="button" class="btn btn--sm danger" data-action="release"
                  data-ip="${esc(entry.ip)}" ${pending ? "disabled" : ""}>
            ${pending ? "Releasing…" : "Release"}
          </button>` : ""}
      </article>
    `;
  }
}

customElements.define("block-list", Blocklist);
