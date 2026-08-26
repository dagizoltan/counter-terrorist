/**
 * <ledger-summary> — the audit ledger's integrity, size, compliance and rule
 * count, from the services that actually know.
 *
 * All four tiles on the Governance Ledger page were literals:
 *
 *   Ledger_Integrity   "Verified" + "0.00% Tamper_Prob"
 *   Historical_Records "1.4K Enforcement_Blocks"
 *   Compliance_Status  "STRICT" + "PASS GDPR/SOV"
 *   Active_Policies    "12 Live_Rules"
 *
 * Nothing wrote to any of them. A forensic ledger page asserting a 0.00%
 * tamper probability next to a green dot is the worst version of this: it is
 * a verification claim the page never made. Every figure below has a real
 * source and has had one all along.
 */
import { apiGet } from "./api.js";

const REFRESH_MS = 30000;

class LedgerSummary extends HTMLElement {
  constructor() {
    super();
    this.chain = null;      // /api/audit/status  -> { lastHash, count, lastVerifiedHash }
    this.verify = null;     // /api/audit/verify  -> { valid, eventsChecked, brokenAt? }
    this.metrics = null;    // /api/metrics       -> { firewall: { rules, blockedCount } }
    this.compliance = null; // /api/compliance/report
    this.error = null;
  }

  connectedCallback() {
    this.render();
    this.load();
    this.timer = setInterval(() => this.load(), REFRESH_MS);
  }

  disconnectedCallback() {
    if (this.timer) clearInterval(this.timer);
  }

  async load() {
    // Independent tiles: one endpoint being down should not blank the rest.
    const [chain, verify, metrics, compliance] = await Promise.all([
      apiGet("/api/audit/status").catch(() => null),
      // A broken chain answers 409, which apiGet treats as an error — that is
      // itself the finding, so keep it rather than discarding it.
      apiGet("/api/audit/verify?limit=500").catch((e) => (e.status === 409 ? { valid: false } : null)),
      apiGet("/api/metrics").catch(() => null),
      apiGet("/api/compliance/report").catch(() => null),
    ]);

    this.chain = chain;
    this.verify = verify;
    this.metrics = metrics;
    this.compliance = compliance;
    this.error = (!chain && !verify && !metrics && !compliance) ? "Ledger services unreachable" : null;
    this.render();
  }

  /** 1432 -> "1.4K"; the tile has room for four characters, not seven. */
  static compact(n) {
    if (typeof n !== "number" || !Number.isFinite(n)) return "—";
    if (n < 1000) return String(n);
    if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
    return `${(n / 1_000_000).toFixed(1)}M`;
  }

  get integrity() {
    if (!this.verify) return { state: "idle", label: "Unknown", value: "—", unit: "Not verified" };
    if (this.verify.valid === false) {
      return { state: "crit", label: "Tampered", value: "BROKEN", unit: "Chain verification failed" };
    }
    // A chain whose head has not been re-verified yet is verified-as-of, not
    // verified-now. Saying so is the difference between this and the literal.
    const current = this.chain && this.chain.lastHash === this.chain.lastVerifiedHash;
    return current
      ? { state: "ok", label: "Verified", value: "INTACT", unit: `${this.verify.eventsChecked ?? 0} events checked` }
      : { state: "warn", label: "Pending", value: "INTACT", unit: "Head awaiting re-verification" };
  }

  get complianceTile() {
    const results = this.compliance?.results;
    if (!Array.isArray(results) || results.length === 0) {
      return { state: "idle", label: "Unmapped", value: "—", unit: "No controls mapped" };
    }
    const failing = results.filter((c) => c.status === "FAIL").length;
    const passing = results.filter((c) => c.status === "PASS").length;
    return failing > 0
      ? { state: "crit", label: `${failing} failing`, value: `${passing}/${results.length}`, unit: "Controls passing" }
      : { state: "ok", label: "No failures", value: `${passing}/${results.length}`, unit: "Controls passing" };
  }

  render() {
    const esc = globalThis.escapeHTML ?? ((v) => String(v));

    if (this.error) {
      this.innerHTML = `<div class="error-box" role="alert"><span class="danger-dot" aria-hidden="true"></span>${esc(this.error)}</div>`;
      return;
    }

    const integrity = this.integrity;
    const compliance = this.complianceTile;
    const rules = this.metrics?.firewall?.rules;
    const records = this.chain?.count;

    const tiles = [
      { head: "Ledger Integrity", ...integrity },
      {
        head: "Historical Records",
        state: typeof records === "number" ? "info" : "idle",
        label: this.chain ? "Ledger" : "—",
        value: LedgerSummary.compact(records),
        unit: "Audit events on chain",
      },
      { head: "Compliance", ...compliance },
      {
        head: "Active Policies",
        state: typeof rules === "number" ? "info" : "idle",
        label: this.metrics ? "Firewall" : "—",
        value: typeof rules === "number" ? String(rules) : "—",
        unit: "Live rules",
      },
    ];

    this.innerHTML = `
      <div class="stat-grid">
        ${tiles.map((t) => `
          <div class="stat-cell" data-state="${esc(t.state)}">
            <div class="stat-cell__head">
              <span class="eyebrow">${esc(t.head)}</span>
              <span class="pill" data-state="${esc(t.state)}">${esc(t.label)}</span>
            </div>
            <span class="stat-cell__value">${esc(t.value)}</span>
            <span class="eyebrow">${esc(t.unit)}</span>
          </div>
        `).join("")}
      </div>
    `;
  }
}

customElements.define("ledger-summary", LedgerSummary);
