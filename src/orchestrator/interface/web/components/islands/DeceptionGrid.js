/**
 * <deception-grid> — the decoy manifest, and the controls that act on it.
 *
 * The page used to render these cards server-side with the toggle wired as an
 * inline `onclick` that built a fetch by hand. That was dead three ways:
 *
 *   1. The console's CSP is `script-src 'self' 'nonce-…' 'strict-dynamic'`.
 *      A nonce makes the browser ignore 'unsafe-inline', so inline event
 *      handlers are refused outright — verified in Chromium, the browser logs
 *      "Refused to execute inline event handler".
 *   2. It posted to /agents/deception/api/:id/toggle, which no route served.
 *   3. On success it called location.reload(), throwing away scroll position
 *      and every other island's state on the page.
 *
 * The grid is an island now: real listeners, the shared API client, and an
 * in-place refresh.
 */
import { apiGet, apiSend } from "./api.js";

class DeceptionGrid extends HTMLElement {
  constructor() {
    super();
    this.modules = [];
    this.busy = new Set();
    this.error = null;
  }

  get canOperate() {
    return this.getAttribute("role-name") === "admin" || this.getAttribute("role-name") === "operator";
  }

  connectedCallback() {
    // Server-rendered modules seed the first paint so the grid is not blank
    // while the fetch is in flight.
    try {
      this.modules = JSON.parse(this.getAttribute("modules") || "[]");
    } catch {
      this.modules = [];
    }
    this.render();
    this.refresh();
    this.addEventListener("click", (e) => this.onClick(e));
  }

  async refresh() {
    try {
      const modules = await apiGet("/api/agents/deception");
      this.modules = Array.isArray(modules) ? modules : [];
      this.error = null;
    } catch (e) {
      this.error = e.message;
    }
    this.render();
  }

  onClick(event) {
    const btn = event.target.closest("[data-action]");
    if (!btn || !this.contains(btn)) return;
    event.preventDefault();

    const { action, moduleId } = btn.dataset;
    if (action === "toggle") this.toggle(moduleId, btn.dataset.next === "true");
    else if (action === "morph") this.morph(btn);
  }

  async toggle(id, active) {
    if (!id || this.busy.has(id)) return;
    this.busy.add(id);
    this.render();

    try {
      await apiSend(`/api/agents/deception/${encodeURIComponent(id)}/toggle`, "POST", { active });
      this.error = null;
      await this.refresh();
    } catch (e) {
      this.error = `${active ? "Deploy" : "Kill"} failed for ${id}: ${e.message}`;
    } finally {
      this.busy.delete(id);
      this.render();
    }
  }

  async morph(btn) {
    if (this.busy.has("__morph")) return;
    this.busy.add("__morph");
    btn.disabled = true;
    try {
      await apiSend("/api/agents/deception/morph", "POST");
      this.error = null;
      await this.refresh();
    } catch (e) {
      this.error = `Morph failed: ${e.message}`;
      this.render();
    } finally {
      this.busy.delete("__morph");
    }
  }

  render() {
    const esc = globalThis.escapeHTML ?? ((v) => String(v));
    const active = this.modules.filter((m) => m.active).length;

    const cards = this.modules.length === 0
      ? `<div class="empty-state"><span class="eyebrow">No decoy modules registered</span></div>`
      : this.modules.map((m) => {
        const pending = this.busy.has(m.id);
        return `
          <article class="decoy-card" data-state="${m.active ? "warn" : "idle"}">
            <header class="decoy-card__head">
              <a class="decoy-card__title" href="/agents/deception/${encodeURIComponent(m.id)}">
                <span class="indicator"${m.active ? ' data-pulse=""' : ""} aria-hidden="true"></span>
                ${esc(m.name)}
              </a>
              <span class="eyebrow">Port ${esc(String(m.port))}</span>
            </header>

            <p class="decoy-card__desc">${esc(m.description || "")}</p>

            <footer class="decoy-card__foot">
              <span class="pill" data-state="${m.active ? "warn" : "idle"}">
                ${m.active ? "Armed" : "Dormant"}
              </span>
              ${this.canOperate ? `
                <button type="button"
                        class="btn btn--sm ${m.active ? "danger" : "warning"}"
                        data-action="toggle"
                        data-module-id="${esc(m.id)}"
                        data-next="${m.active ? "false" : "true"}"
                        ${pending ? "disabled" : ""}>
                  ${pending ? "Working…" : m.active ? "Kill Decoy" : "Deploy Trap"}
                </button>
              ` : ""}
            </footer>
          </article>
        `;
      }).join("");

    this.innerHTML = `
      <div class="decoy-grid">
        <header class="decoy-grid__head">
          <span class="eyebrow eyebrow--tick">Active Decoy Grid</span>
          <span class="eyebrow">
            <span class="num">${active}</span>&nbsp;of&nbsp;<span class="num">${this.modules.length}</span>&nbsp;armed
          </span>
        </header>

        ${this.error ? `<div class="error-box" role="alert"><span class="danger-dot" aria-hidden="true"></span>${esc(this.error)}</div>` : ""}

        <div class="decoy-grid__cards">${cards}</div>

        ${this.canOperate ? `
          <footer class="decoy-grid__actions">
            <button type="button" class="btn btn--sm" data-action="morph">Morph Decoy Signatures</button>
            <span class="eyebrow">Rotates the port signature of every armed decoy</span>
          </footer>
        ` : ""}
      </div>
    `;
  }
}

customElements.define("deception-grid", DeceptionGrid);
