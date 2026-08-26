/**
 * <canary-tokens> — the credential-lure half of the deception grid.
 *
 * The grid registers canary tokens (fake AWS keys, a kube config, a shadow
 * backup, a Vault token, an SSH key) but the page only ever rendered the
 * honeypot port decoys, so the file lures — and any attacker who tripped one —
 * were invisible. This lists them with live trigger status: a token an intruder
 * has touched surfaces as TRIGGERED, sorted to the top.
 *
 * Operator-gated to match the endpoint; the lure paths are not shown to viewers.
 */
import { apiGet } from "./api.js";

const REFRESH_MS = 10000;

class CanaryTokens extends HTMLElement {
  constructor() {
    super();
    this.tokens = [];
    this.error = null;
  }

  get canOperate() {
    const role = this.getAttribute("role-name");
    return role === "admin" || role === "operator";
  }

  connectedCallback() {
    if (!this.canOperate) {
      this.innerHTML = `<div class="empty-state"><span class="eyebrow">Operator role required to view credential lures</span></div>`;
      return;
    }
    this.render();
    this.load();
    this.timer = setInterval(() => this.load(), REFRESH_MS);
  }

  disconnectedCallback() {
    if (this.timer) clearInterval(this.timer);
  }

  async load() {
    try {
      const tokens = await apiGet("/api/agents/deception/canaries");
      this.tokens = Array.isArray(tokens) ? tokens : [];
      this.error = null;
    } catch (e) {
      this.error = e.message;
    }
    this.render();
  }

  render() {
    const esc = globalThis.escapeHTML ?? ((v) => String(v));
    // Triggered lures first — they are the operator's live question.
    const tokens = [...this.tokens].sort((a, b) => (b.triggered ? 1 : 0) - (a.triggered ? 1 : 0));
    const tripped = tokens.filter((t) => t.triggered).length;
    const total = tokens.length;

    const rows = tokens.length === 0
      ? `<div class="empty-state"><span class="eyebrow">No credential lures deployed</span></div>`
      : `<div class="ledger-list">${tokens.map((t) => `
          <article class="ledger-row" data-state="${t.triggered ? "crit" : "idle"}">
            <div class="ledger-row__id">
              <span class="indicator" data-state="${t.triggered ? "crit" : "ok"}"${t.triggered ? ' data-pulse=""' : ""} aria-hidden="true"></span>
              <span class="ledger-row__ip">${esc(t.id)}</span>
            </div>
            <div class="ledger-row__facts">
              <span class="ledger-row__ttl mono">${esc(t.path)}</span>
              <span class="eyebrow">${esc(t.description || "")}</span>
            </div>
            <div class="ledger-row__when">
              <span class="pill" data-state="${t.triggered ? "crit" : "idle"}">${t.triggered ? "Triggered" : "Armed"}</span>
            </div>
          </article>
        `).join("")}</div>`;

    this.innerHTML = `
      <div class="canary-tokens">
        <header class="decoy-grid__head">
          <span class="eyebrow eyebrow--tick">Credential Lures</span>
          <span class="eyebrow">
            <span class="num">${tripped}</span>&nbsp;triggered&nbsp;of&nbsp;<span class="num">${total}</span>
          </span>
        </header>
        ${this.error ? `<div class="error-box" role="alert"><span class="danger-dot" aria-hidden="true"></span>${esc(this.error)}</div>` : ""}
        ${rows}
      </div>
    `;
  }
}

customElements.define("canary-tokens", CanaryTokens);
