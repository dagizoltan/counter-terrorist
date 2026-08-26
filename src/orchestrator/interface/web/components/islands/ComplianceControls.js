/**
 * <compliance-controls> — the control matrix derived from the audit ledger.
 *
 * This panel used to be an inline <script> that parsed the response body
 * itself and then branched on `data.results`.
 *
 * apiConsistencyMiddleware wraps every /api/* response as
 * `{ success, data }`, so `data.results` was always undefined, the `if` never
 * ran, and the loading spinner stayed on screen forever. The page has been
 * showing a permanent spinner rather than the compliance posture.
 *
 * The "Generate Audit Bundle" button next to it called `alert()` and claimed
 * a hardware-signed bundle had been written to ./volume/reports/. Nothing was
 * generated. It calls /api/compliance/export now — which really does sign a
 * snapshot — and hands the operator the signature it got back.
 */
import { apiGet } from "./api.js";
import { bindActions } from "./actions.js";

const TONE = { PASS: "ok", FAIL: "crit", NOT_APPLICABLE: "idle" };

class ComplianceControls extends HTMLElement {
  constructor() {
    super();
    this.report = null;
    this.error = null;
    this.bundle = null;
    this.exporting = false;
  }

  get canExport() {
    const role = this.getAttribute("role-name");
    return role === "admin" || role === "operator";
  }

  connectedCallback() {
    bindActions(this, { exportBundle: () => this.exportBundle() });
    this.render();
    this.load();
  }

  async load() {
    try {
      this.report = await apiGet("/api/compliance/report");
      this.error = null;
    } catch (e) {
      this.error = e.message;
    }
    this.render();
  }

  async exportBundle() {
    if (this.exporting) return;
    this.exporting = true;
    this.render();
    try {
      this.bundle = await apiGet("/api/compliance/export");
      this.error = null;
    } catch (e) {
      this.error = `Export failed: ${e.message}`;
    } finally {
      this.exporting = false;
      this.render();
    }
  }

  render() {
    const esc = globalThis.escapeHTML ?? ((v) => String(v));
    const controls = this.report?.results ?? [];

    let body;
    if (this.error) {
      body = `<div class="error-box" role="alert"><span class="danger-dot" aria-hidden="true"></span>${esc(this.error)}</div>`;
    } else if (!this.report) {
      body = `
        <div class="control-list">
          ${"<div class=\"skeleton skeleton--block\"></div>".repeat(3)}
        </div>`;
    } else if (controls.length === 0) {
      body = `<div class="empty-state"><span class="eyebrow">No controls mapped from the ledger</span></div>`;
    } else {
      body = `<div class="control-list">${controls.map((c) => this.renderControl(c, esc)).join("")}</div>`;
    }

    const passing = controls.filter((c) => c.status === "PASS").length;

    this.innerHTML = `
      <div class="control-panel">
        <header class="control-panel__head">
          <span class="eyebrow eyebrow--tick">Active Frameworks</span>
          <div class="control-panel__meta">
            ${this.report ? `<span class="eyebrow"><span class="num">${passing}</span>&nbsp;of&nbsp;<span class="num">${esc(controls.length)}</span>&nbsp;passing</span>` : ""}
            ${this.canExport ? `
              <button type="button" class="btn btn--sm" data-action="exportBundle" ${this.exporting ? "disabled" : ""}>
                ${this.exporting ? "Signing…" : "Generate Audit Bundle"}
              </button>` : ""}
          </div>
        </header>

        ${this.report?.generator ? `
          <p class="control-panel__origin">
            ${esc(this.report.generator)}
            ${this.report.integrity_assurance ? ` · ${esc(this.report.integrity_assurance)}` : ""}
            ${this.report.timestamp ? ` · ${esc(new Date(this.report.timestamp).toLocaleString())}` : ""}
          </p>` : ""}

        ${this.bundle ? `
          <div class="control-panel__bundle">
            <span class="eyebrow" data-tone="success">Bundle signed</span>
            <code class="mono-xs">${esc(this.bundle.signature ?? "unsigned")}</code>
          </div>` : ""}

        ${body}
      </div>
    `;
  }

  renderControl(c, esc) {
    const evidence = Array.isArray(c.evidence) ? c.evidence : [];
    return `
      <article class="control-card" data-state="${TONE[c.status] ?? "idle"}">
        <header class="control-card__head">
          <div class="control-card__id">
            <span class="eyebrow" data-tone="primary">${esc(c.framework)}</span>
            <h3 class="control-card__title">${esc(c.id)}: ${esc(c.name)}</h3>
          </div>
          <span class="pill" data-state="${TONE[c.status] ?? "idle"}">${esc(String(c.status).replace(/_/g, " "))}</span>
        </header>

        <p class="control-card__desc">${esc(c.description ?? "")}</p>

        ${evidence.length === 0 ? "" : `
          <ul class="control-card__evidence">
            ${evidence.slice(0, 6).map((e) => `
              <li><span class="indicator indicator--sm idle" aria-hidden="true"></span>${esc(e)}</li>
            `).join("")}
            ${evidence.length > 6 ? `<li class="control-card__more">+${evidence.length - 6} more entries in the ledger</li>` : ""}
          </ul>`}
      </article>
    `;
  }
}

customElements.define("compliance-controls", ComplianceControls);
