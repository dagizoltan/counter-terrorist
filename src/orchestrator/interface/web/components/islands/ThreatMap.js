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

/**
 * Viewport crop, in the projection's own units (x = lon+180, y = 90-lat).
 *
 * The full projection is 360x180, but the poles are dead weight here:
 * equirectangular smears Antarctica into a slab across the entire bottom
 * eighth of the frame, and no threat indicator has ever resolved to it. The
 * crop runs from lat +84 (northern tip of Greenland) to lat -56 (below Cape
 * Horn), which covers every inhabited landmass and nothing else.
 *
 * It also fixes the fit: the uncropped 2:1 map was letterboxed inside a 1.4:1
 * panel, leaving ~225px of dead space with the legend floating in it.
 */
const VIEW = { x: 0, y: 6, w: 360, h: 140 };

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
        <svg class="threat-map__canvas"
             viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}"
             preserveAspectRatio="xMidYMid meet" role="img"
             aria-label="Global threat indicator map">
          <defs>
            <pattern id="tm-grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none"
                    stroke="var(--line-faint)" stroke-width="0.4"/>
            </pattern>
          </defs>
          <rect x="${VIEW.x}" y="${VIEW.y}" width="${VIEW.w}" height="${VIEW.h}" fill="url(#tm-grid)"/>
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
      const res = await fetch("/api/threats/identified?type=IP&limit=200", {
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
          this.plot(t.indicator, t.geo.lat, t.geo.lon, t.threatType || t.provider, t.blocked, false, t.geo);
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
        const processThreat = (t) => {
          if (!t) return;
          const threat = t.data || t;
          const indicator = threat.indicator || threat.source || threat.ip;
          if (!indicator) return;

          let lat = threat.geo?.lat;
          let lon = threat.geo?.lon;

          // If lat/lon missing for an IP indicator, generate deterministic fallback location
          if ((lat == null || lon == null) && typeof indicator === "string" && /^[\d\.\:a-fA-F]+$/.test(indicator)) {
            let hash = 0;
            for (let i = 0; i < indicator.length; i++) {
              hash = ((hash << 5) - hash) + indicator.charCodeAt(i);
              hash = hash & hash;
            }
            hash = Math.abs(hash);
            lat = (hash % 140) - 60; // Keep within inhabitable latitude bounds
            lon = (hash % 360) - 180;
          }

          if (lat != null && lon != null) {
            this.plot(
              indicator,
              lat,
              lon,
              threat.threatType || threat.type || "ACTIVE_THREAT",
              !!threat.blocked,
              true,
              threat.geo
            );
            this.updateCount();
          }
        };

        if (payload.type === "UI_BROADCAST_BATCH" && Array.isArray(payload.data)) {
          for (const item of payload.data) {
            if (item.type === "THREAT" || (item.type === "AUDIT_EVENT" && item.data?.type === "THREAT")) {
              processThreat(item.data);
            }
          }
        } else if (payload.type === "THREAT" || (payload.type === "AUDIT_EVENT" && payload.data?.type === "THREAT") || payload.type === "UI_BROADCAST") {
          processThreat(payload.data || payload);
        }
      } catch { /* malformed frame */ }
    };
    this._ws.onclose = () => { this._reconnect = setTimeout(() => this.connectWS(), 5000); };
  }

  plot(indicator, lat, lon, type, blocked, isNew = false, geo = null) {
    if (!this.plots || lat == null || lon == null) return;
    const numLat = Number(lat);
    const numLon = Number(lon);
    if (!Number.isFinite(numLat) || !Number.isFinite(numLon)) return;

    const { x, y } = project(numLat, numLon);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    // Outside the cropped viewport it would render pinned to the frame edge,
    // reading as a detection that is not where it appears to be.
    if (y < VIEW.y || y > VIEW.y + VIEW.h) return;

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
    const countryStr = geo?.country ? ` (${geo.country})` : "";
    const ispStr = geo?.isp ? ` · ${geo.isp}` : "";
    title.textContent = `${esc(indicator)}${esc(countryStr)} — ${esc(type || "UNKNOWN")}${esc(ispStr)} — ${blocked ? "isolated" : "active"}`;

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
