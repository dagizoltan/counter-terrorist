/**
 * <threat-map> — geospatial plot of identified threat indicators.
 *
 * Rewritten to be self-contained. It previously injected Leaflet from
 * unpkg.com and pulled basemap tiles from cartocdn.com, which meant:
 *
 *   - The CSP (`default-src 'self'`, `script-src 'self' 'nonce-…'`) blocked
 *     both, so the map never loaded on a correctly configured node.
 *   - On an air-gapped appliance — the product's stated target — it could
 *     never have worked regardless of CSP.
 *   - `loadDependencies()` resolved only from `script.onload` with no error
 *     path, so when the fetch failed the promise never settled,
 *     `connectedCallback` hung forever and the element stayed permanently
 *     blank with no indication why.
 *
 * It now renders an inline SVG equirectangular map with no external
 * dependency of any kind. Same public behaviour: historical indicators on
 * connect, live ones over the shared socket.
 */
import { unwrap } from "./api.js";
import { WORLD_PATH, project } from "./world-outline.js";

const VIEW_W = 360;
const VIEW_H = 180;

class ThreatMap extends HTMLElement {
  constructor() {
    super();
    this.threats = new Map();
    this.initialized = false;
  }

  async connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;
    this.renderShell();
    await this.fetchHistorical();
    this.connectWS();
  }

  disconnectedCallback() {
    if (this._reconnect) clearTimeout(this._reconnect);
    if (this._ws) { this._ws.onclose = null; this._ws.close?.(); }
  }

  renderShell() {
    this.innerHTML = `
      <div class="threat-map">
        <svg class="threat-map__canvas" viewBox="0 0 ${VIEW_W} ${VIEW_H}"
             preserveAspectRatio="xMidYMid meet" role="img"
             aria-label="Global threat indicator map">
          <defs>
            <pattern id="tm-grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none"
                    stroke="var(--line-faint)" stroke-width="0.4"/>
            </pattern>
          </defs>
          <rect width="${VIEW_W}" height="${VIEW_H}" fill="url(#tm-grid)"/>
          <path d="${WORLD_PATH}" class="threat-map__land"/>
          <g class="threat-map__plots"></g>
        </svg>
        <div class="threat-map__legend">
          <span class="eyebrow"><span class="indicator" data-state="crit" aria-hidden="true"></span>Active</span>
          <span class="eyebrow"><span class="indicator" data-state="idle" aria-hidden="true"></span>Isolated</span>
        </div>
        <div class="threat-map__count eyebrow" aria-live="polite">0 indicators</div>
      </div>
    `;
    this.plots = this.querySelector(".threat-map__plots");
    this.counter = this.querySelector(".threat-map__count");
  }

  async fetchHistorical() {
    try {
      const res = await fetch("/api/threats/identified?limit=200", {
        headers: (() => {
          const t = document.querySelector('meta[name="csrf-token"]')?.content;
          return t ? { "X-CT-Token": t } : {};
        })(),
      });
      if (!res.ok) return;
      const payload = await unwrap(res);
      const threats = Array.isArray(payload) ? payload : (payload?.threats ?? []);
      for (const t of threats) {
        if (t?.geo?.lat != null && t?.geo?.lon != null) {
          this.plot(t.indicator, t.geo.lat, t.geo.lon, t.threatType, t.blocked);
        }
      }
      this.updateCount();
    } catch (e) {
      console.error("[ThreatMap] historical fetch failed:", e);
    }
  }

  connectWS() {
    if (typeof SharedWebSocket !== "function") return;
    this._ws = new SharedWebSocket();
    this._ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type !== "AUDIT_EVENT" || payload.data?.type !== "THREAT") return;
        const threat = payload.data.data;
        if (threat?.geo?.lat != null) {
          this.plot(threat.indicator, threat.geo.lat, threat.geo.lon, threat.threatType, false, true);
          this.updateCount();
        }
      } catch { /* malformed frame */ }
    };
    this._ws.onclose = () => { this._reconnect = setTimeout(() => this.connectWS(), 5000); };
  }

  plot(indicator, lat, lon, type, blocked, isNew = false) {
    if (!this.plots || lat == null || lon == null) return;
    const { x, y } = project(lat, lon);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    this.threats.get(indicator)?.remove();

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", `threat-map__plot${isNew ? " is-new" : ""}`);
    g.setAttribute("data-state", blocked ? "idle" : "crit");
    g.setAttribute("transform", `translate(${x} ${y})`);

    const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    halo.setAttribute("r", "3.5");
    halo.setAttribute("class", "threat-map__halo");

    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("r", "1.4");
    dot.setAttribute("class", "threat-map__dot");

    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    const esc = globalThis.escapeHTML ?? String;
    title.textContent = `${esc(indicator)} — ${esc(type || "UNKNOWN")} — ${blocked ? "isolated" : "active"}`;

    g.append(halo, dot, title);
    this.plots.appendChild(g);
    this.threats.set(indicator, g);
  }

  updateCount() {
    if (this.counter) {
      const n = this.threats.size;
      this.counter.textContent = `${n} indicator${n === 1 ? "" : "s"}`;
    }
  }
}

customElements.define("threat-map", ThreatMap);
