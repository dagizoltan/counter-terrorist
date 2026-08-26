/**
 * <decoy-detail> — one decoy, what it caught, and the controls that act on it.
 *
 * The deception grid could arm and disarm a decoy and nothing else. Everything
 * a decoy actually captures was already being written — HoneypotService tags
 * each entry `decoy:<id>`, hits carry { source_ip, port }, and SessionData
 * carries the attacker's own transcript — but nothing read it back, so a
 * triggered trap looked identical to an idle one.
 *
 * Controls here act on a source address, not just the module: block it at the
 * perimeter, or run the Breaker protocol against its session. Breaker already
 * fires automatically on every hit; this aims it deliberately.
 */
import { apiGet, apiSend } from "./api.js";
import { bindActions } from "./actions.js";

const REFRESH_MS = 10000;

class DecoyDetail extends HTMLElement {
  constructor() {
    super();
    this.data = null;
    this.error = null;
    this.notice = null;
    this.busy = new Set();
    this.openTranscript = null;
  }

  get moduleId() {
    return this.getAttribute("module-id");
  }

  get canOperate() {
    const role = this.getAttribute("role-name");
    return role === "admin" || role === "operator";
  }

  connectedCallback() {
    bindActions(this, {
      toggleArm: () => this.toggleArm(),
      block: (el) => this.act(el.dataset.ip, "block"),
      release: (el) => this.act(el.dataset.ip, "release"),
      sabotage: (el) => this.act(el.dataset.ip, "sabotage"),
      showTranscript: (el) => {
        this.openTranscript = this.openTranscript === el.dataset.key ? null : el.dataset.key;
        this.render();
      },
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
      this.data = await apiGet(`/api/agents/deception/${encodeURIComponent(this.moduleId)}`);
      this.error = null;
    } catch (e) {
      this.error = e.message;
    }
    this.render();
  }

  async toggleArm() {
    const next = !this.data?.module?.active;
    this.busy.add("__arm");
    this.render();
    try {
      await apiSend(`/api/agents/deception/${encodeURIComponent(this.moduleId)}/toggle`, "POST", { active: next });
      this.notice = next ? "Decoy armed." : "Decoy disarmed.";
      await this.load();
    } catch (e) {
      this.error = `${next ? "Arm" : "Disarm"} failed: ${e.message}`;
    } finally {
      this.busy.delete("__arm");
      this.render();
    }
  }

  /** block | release | sabotage, all keyed on a source address. */
  async act(ip, kind) {
    const key = `${kind}:${ip}`;
    if (!ip || this.busy.has(key)) return;
    this.busy.add(key);
    this.render();

    const call = {
      block: () => apiSend("/api/agents/firewall/block", "POST", { ip }),
      release: () => apiSend("/api/agents/firewall/unblock", "POST", { ip }),
      sabotage: () => apiSend("/api/agents/deception/sabotage", "POST", { ip, level: "HIGH" }),
    }[kind];

    try {
      await call();
      this.notice = {
        block: `${ip} committed to the blocklist.`,
        release: `${ip} released from the blocklist.`,
        sabotage: `Breaker protocol engaged against ${ip}.`,
      }[kind];
      this.error = null;
      await this.load();
    } catch (e) {
      this.error = `${kind} failed for ${ip}: ${e.message}`;
    } finally {
      this.busy.delete(key);
      this.render();
    }
  }

  render() {
    const esc = globalThis.escapeHTML ?? ((v) => String(v));

    if (this.error && !this.data) {
      this.innerHTML = `<div class="error-box" role="alert"><span class="danger-dot" aria-hidden="true"></span>${esc(this.error)}</div>`;
      return;
    }
    if (!this.data) {
      this.innerHTML = `<div class="decoy-detail">${'<div class="skeleton" style="height:96px"></div>'.repeat(3)}</div>`;
      return;
    }

    const m = this.data.module;
    const state = m.active ? "warn" : "idle";

    this.innerHTML = `
      <div class="decoy-detail">
        ${this.error ? `<div class="error-box" role="alert"><span class="danger-dot" aria-hidden="true"></span>${esc(this.error)}</div>` : ""}
        ${this.notice ? `<div class="notice-box" role="status">${esc(this.notice)}</div>` : ""}

        <section class="panel" data-state="${state}">
          <header class="panel__head">
            <span class="panel__title">
              <span class="indicator"${m.active ? ' data-pulse=""' : ""} aria-hidden="true"></span>
              ${esc(m.name)}
            </span>
            <div class="decoy-detail__controls">
              <span class="pill" data-state="${state}">${m.active ? "Armed" : "Dormant"}</span>
              ${this.canOperate ? `
                <button type="button" class="btn btn--sm ${m.active ? "danger" : "warning"}"
                        data-action="toggleArm" ${this.busy.has("__arm") ? "disabled" : ""}>
                  ${this.busy.has("__arm") ? "Working…" : m.active ? "Disarm" : "Arm Decoy"}
                </button>` : ""}
            </div>
          </header>

          <div class="stat-grid">
            <div class="stat-cell">
              <span class="eyebrow">Listening Port</span>
              <span class="stat-cell__value">${esc(String(m.port))}</span>
            </div>
            <div class="stat-cell">
              <span class="eyebrow">Recent Hits</span>
              <span class="stat-cell__value">${this.data.hitCount}</span>
            </div>
            <div class="stat-cell">
              <span class="eyebrow">Distinct Sources</span>
              <span class="stat-cell__value">${this.data.sources.length}</span>
            </div>
            <div class="stat-cell">
              <span class="eyebrow">Transcripts</span>
              <span class="stat-cell__value">${this.data.transcripts.length}</span>
            </div>
          </div>

          <p class="decoy-detail__desc">${esc(m.description || "")}</p>
        </section>

        ${this.renderSources(esc)}
        ${this.renderTranscripts(esc)}
      </div>
    `;
  }

  renderSources(esc) {
    const sources = this.data.sources;
    const body = sources.length === 0
      ? `<div class="empty-state"><span class="eyebrow">Nothing has touched this decoy in the scanned window</span></div>`
      : `<div class="ledger-list">${sources.map((s) => {
        const blockBusy = this.busy.has(`block:${s.sourceIp}`);
        const releaseBusy = this.busy.has(`release:${s.sourceIp}`);
        const sabotageBusy = this.busy.has(`sabotage:${s.sourceIp}`);
        return `
          <article class="ledger-row" data-state="${s.blocked ? "idle" : "crit"}">
            <div class="ledger-row__id">
              <span class="indicator" aria-hidden="true"></span>
              <span class="ledger-row__ip">${esc(s.sourceIp)}</span>
            </div>

            <div class="ledger-row__facts">
              <span class="eyebrow" data-tone="${s.blocked ? "success" : "danger"}">
                ${s.blocked ? "Blocked at perimeter" : "Not enforced"}
              </span>
              <span class="ledger-row__ttl">
                ${esc(s.hits)} hit${s.hits === 1 ? "" : "s"} · last ${esc(new Date(s.lastSeen).toLocaleTimeString())}
              </span>
            </div>

            ${this.canOperate ? `
              <div class="decoy-detail__row-actions">
                ${s.blocked
                  ? `<button type="button" class="btn btn--sm" data-action="release" data-ip="${esc(s.sourceIp)}" ${releaseBusy ? "disabled" : ""}>${releaseBusy ? "…" : "Release"}</button>`
                  : `<button type="button" class="btn btn--sm danger" data-action="block" data-ip="${esc(s.sourceIp)}" ${blockBusy ? "disabled" : ""}>${blockBusy ? "…" : "Block"}</button>`}
                <button type="button" class="btn btn--sm warning" data-action="sabotage" data-ip="${esc(s.sourceIp)}" ${sabotageBusy ? "disabled" : ""}>
                  ${sabotageBusy ? "…" : "Breaker"}
                </button>
              </div>` : `<span></span>`}
          </article>
        `;
      }).join("")}</div>`;

    return `
      <section class="panel">
        <header class="panel__head">
          <span class="panel__title">Sources Caught</span>
          <span class="eyebrow">Block, release, or run Breaker against a session</span>
        </header>
        ${body}
      </section>
    `;
  }

  renderTranscripts(esc) {
    const transcripts = this.data.transcripts;
    const body = transcripts.length === 0
      ? `<div class="empty-state"><span class="eyebrow">No session transcripts captured</span></div>`
      : transcripts.map((t, i) => {
        const key = `t${i}`;
        const open = this.openTranscript === key;
        return `
          <article class="transcript" data-open="${open}">
            <button type="button" class="transcript__head" data-action="showTranscript" data-key="${key}"
                    aria-expanded="${open}">
              <span class="arrow-icon" aria-hidden="true">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m9 18 6-6-6-6"/></svg>
              </span>
              <span class="ledger-row__ip">${esc(t.sourceIp)}</span>
              <span class="eyebrow">${esc(new Date(t.timestamp).toLocaleString())}</span>
              <span class="eyebrow">${esc(t.data.length)} bytes</span>
            </button>
            ${open ? `<pre class="transcript__body">${esc(t.data)}</pre>` : ""}
          </article>
        `;
      }).join("");

    return `
      <section class="panel">
        <header class="panel__head">
          <span class="panel__title">Session Transcripts</span>
          <span class="eyebrow">Captured attacker input · truncated at 16KB by the service</span>
        </header>
        <div class="transcript-list">${body}</div>
      </section>
    `;
  }
}

customElements.define("decoy-detail", DecoyDetail);
