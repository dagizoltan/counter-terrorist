/**
 * <threat-map> — enterprise spatial & real-time threat map.
 *
 * An inline-SVG equirectangular map of inbound adversary infrastructure, built
 * entirely on real fields the threat records already carry — nothing on it is
 * invented:
 *   • category (malware / scan / eBPF / decoy / isolated), severity-weighted;
 *   • location precision (city / country / estimated) — an estimated point is a
 *     continent-level RIR guess, drawn hollow/dashed and counted apart, never
 *     dressed up as precise; a threat with no location at all is only tallied;
 *   • feed provenance (which intel source flagged the IP) and confidence;
 *   • hosting ASN (populated once an ASN database is provisioned).
 *
 * Operator tooling: a clickable legend + region/source breakdown that filter the
 * map, a search box, zoom & pan, temporal analytics (ingress sparkline, rate,
 * live freshness), and CSRF-safe isolation — single or bulk over the current
 * filter.
 */
import { unwrap, apiSend } from "./api.js";
import { COUNTRIES, project } from "./world-outline.js";

/** Faint lat/lon graticule across the cropped view (meridians/parallels 20°). */
function graticulePath(viewTop, viewBottom) {
  const seg = [];
  for (let lon = -160; lon <= 160; lon += 20) { const x = lon + 180; seg.push(`M${x} ${viewTop}V${viewBottom}`); }
  for (let lat = -60; lat <= 80; lat += 20) { const y = 90 - lat; seg.push(`M0 ${y}H360`); }
  return seg.join("");
}

const VIEW = { x: 0, y: 6, w: 360, h: 140 };
// Protected Orchestrator Node Location (e.g. Frankfurt/Central Node)
const HOME_NODE = { lat: 50.11, lon: 8.68 };
const CATEGORIES = ["malware", "scan", "ebpf", "honeypot", "isolated"];
const CATEGORY_LABEL = {
  malware: "Malware / C2",
  scan: "Probe / Scanner",
  ebpf: "eBPF Anomaly",
  honeypot: "Decoy Hit",
  isolated: "Isolated",
};
const ZOOM_MIN = 0.55, ZOOM_MAX = 6;

class ThreatMap extends HTMLElement {
  constructor() {
    super();
    this.threats = new Map();
    this.threatData = [];
    this.initialized = false;
    this.maxAgeHours = 24;
    // Threats that arrive without a resolvable location are counted, not
    // invented — see connectWS().
    this.ungeolocated = 0;
    // Unified filter state.
    this.activeCategories = new Set(CATEGORIES);
    this.showEstimated = true;
    this.activeSource = null; // feed provenance filter
    this.activeRegion = null; // region/country filter
    this.searchTerm = "";
    // Zoom / pan viewport (a mutable copy of the base view).
    this.view = { ...VIEW };
    this.pan = null;
    // Telemetry.
    this.lastEventTs = 0;
    this.wsState = "offline";
  }

  /** Isolation is an admin/operator action; the route rejects viewers. */
  get canOperate() {
    const role = this.getAttribute("role-name");
    return role === "admin" || role === "operator";
  }

  async connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;
    this.renderShell();
    await this.fetchHistorical();
    this.connectWS();
    this._telemetryTimer = setInterval(() => this.updateTelemetry(), 1000);
  }

  disconnectedCallback() {
    if (this._reconnect) clearTimeout(this._reconnect);
    if (this._playTimer) clearInterval(this._playTimer);
    if (this._telemetryTimer) clearInterval(this._telemetryTimer);
    if (this._ws) { this._ws.onclose = null; this._ws.close?.(); }
  }

  renderShell() {
    const home = project(HOME_NODE.lat, HOME_NODE.lon);
    const legendItems = CATEGORIES.map((cat) =>
      `<button type="button" class="tm-legend-btn" data-cat-toggle="${cat}" aria-pressed="true">
         <span class="indicator" data-cat="${cat}" aria-hidden="true"></span>${CATEGORY_LABEL[cat]}
       </button>`
    ).join("");
    // One path per country: filled it is the land, stroked it draws coastlines
    // and borders, and keyed by ISO it takes a threat-density tint. Geometry is
    // static generated data (numbers + a 2-letter code), not remote input.
    const countriesMarkup = COUNTRIES.map(([iso, d]) =>
      `<path class="threat-map__country" data-iso="${iso}" d="${d}"></path>`
    ).join("");
    this.innerHTML = `
      <div class="threat-map threat-map--container relative">
        <svg class="threat-map__canvas"
             viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}"
             preserveAspectRatio="xMidYMid meet" role="img"
             aria-label="Global threat indicator map">
          <defs>
            <radialGradient id="tm-ocean" cx="50%" cy="42%" r="75%">
              <stop offset="0%" stop-color="var(--tm-ocean-hi)"/>
              <stop offset="100%" stop-color="var(--tm-ocean-lo)"/>
            </radialGradient>
            <linearGradient id="tm-arc-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="var(--danger)" stop-opacity="0.9"/>
              <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.15"/>
            </linearGradient>
            <filter id="tm-land-glow" x="-4%" y="-4%" width="108%" height="108%">
              <feGaussianBlur stdDeviation="0.7" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <rect x="${VIEW.x}" y="${VIEW.y}" width="${VIEW.w}" height="${VIEW.h}" class="threat-map__ocean" fill="url(#tm-ocean)"/>
          <path d="${graticulePath(VIEW.y, VIEW.y + VIEW.h)}" class="threat-map__graticule"/>
          <g class="threat-map__countries">${countriesMarkup}</g>
          <g class="threat-map__arcs"></g>
          <g class="threat-map__home" aria-hidden="true">
            <circle class="threat-map__home-ping" r="4.5"></circle>
            <circle class="threat-map__home-ring" r="4.5"></circle>
            <circle class="threat-map__home-core" r="1.6"></circle>
            <path class="threat-map__home-tick" d="M0 -6.5 V-3.5 M0 6.5 V3.5 M-6.5 0 H-3.5 M6.5 0 H3.5"></path>
            <text class="threat-map__home-label" x="7" y="1.5">SOVEREIGN NODE</text>
          </g>
          <g class="threat-map__plots"></g>
          <g class="threat-map__clusters"></g>
        </svg>

        <div class="threat-map__legend" role="group" aria-label="Filter threats by category">
          ${legendItems}
          <button type="button" class="tm-legend-btn" data-est-toggle aria-pressed="true">
            <span class="indicator indicator--est" aria-hidden="true"></span>Estimated location
          </button>
          <button type="button" class="tm-legend-btn" id="tm-heatmap-toggle" aria-pressed="false">
            <span class="indicator indicator--heat" aria-hidden="true"></span>Density Heatmap
          </button>
        </div>

        <div class="threat-map__scrubber flex items-center gap-3 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 text-xs">
          <button type="button" id="tm-play" class="t-btn ghost !py-1 !px-2 text-[10px]" aria-label="Replay threats across the time window">Replay</button>
          <span class="eyebrow">Time_Window:</span>
          <input type="range" min="1" max="24" value="24" class="accent-primary cursor-pointer w-28 h-1" id="tm-scrubber-slider" aria-label="Time window in hours" />
          <span class="eyebrow min-w-[36px]" id="tm-scrubber-val">24h</span>
          <span class="eyebrow min-w-[36px]" id="tm-playhead" aria-live="polite"></span>
        </div>

        <div class="threat-map__count eyebrow" aria-live="polite">0 indicators</div>
        <div class="threat-map__heat-legend" hidden>
          <span class="eyebrow">Threat density</span>
          <span class="tm-heat-scale" aria-hidden="true"></span>
          <span class="eyebrow tm-heat-max" id="tm-heat-max">0</span>
        </div>
        <div class="threat-map__popover-container hidden"></div>
      </div>

      <div class="threat-map__toolbar">
        <span class="tm-search-wrap">
          <input type="search" id="tm-search" class="tm-search" placeholder="Search IP / country / source…" aria-label="Search threats" />
        </span>
        <div class="tm-filters" id="tm-active-filters"></div>
        <div class="threat-map__telemetry" aria-live="polite">
          <span class="tm-live" data-state="offline"><span class="tm-live-dot" aria-hidden="true"></span><span id="tm-live-label">offline</span></span>
          <span class="tm-rate"><b id="tm-rate-val">0</b> in last 1h</span>
          <svg class="tm-spark" id="tm-spark" viewBox="0 0 60 16" preserveAspectRatio="none" aria-hidden="true"></svg>
          <button type="button" class="tm-reset-view" id="tm-reset-view" hidden>Reset view</button>
        </div>
        <button type="button" class="tm-bulk" id="tm-bulk" hidden></button>
      </div>

      <div class="threat-map__stats" aria-live="polite"></div>
      <ul id="tm-a11y-list" class="sr-only" aria-label="Detected threats, newest first"></ul>
    `;
    // Numeric coords go through setAttribute, not innerHTML, to keep the escaping
    // guard honest.
    const s = this.getMarkerScale().toFixed(3);
    this.querySelector(".threat-map__home")?.setAttribute("transform", `translate(${home.x} ${home.y}) scale(${s})`);

    this.svg = this.querySelector(".threat-map__canvas");
    this.plots = this.querySelector(".threat-map__plots");
    this.arcs = this.querySelector(".threat-map__arcs");
    this.clusters = this.querySelector(".threat-map__clusters");
    this.counter = this.querySelector(".threat-map__count");
    // Index the country shapes by ISO for the choropleth.
    this.countryEls = new Map();
    this.querySelectorAll(".threat-map__country[data-iso]").forEach((el) => {
      if (el.dataset.iso) this.countryEls.set(el.dataset.iso, el);
    });
    this.heatedIso = new Set();
    this.heatLegend = this.querySelector(".threat-map__heat-legend");
    this.heatMaxEl = this.querySelector("#tm-heat-max");
    this.statsEl = this.querySelector(".threat-map__stats");
    this.popoverContainer = this.querySelector(".threat-map__popover-container");
    this.slider = this.querySelector("#tm-scrubber-slider");
    this.sliderVal = this.querySelector("#tm-scrubber-val");
    this.playBtn = this.querySelector("#tm-play");
    this.playhead = this.querySelector("#tm-playhead");
    this.a11yList = this.querySelector("#tm-a11y-list");
    this.searchInput = this.querySelector("#tm-search");
    this.activeFiltersEl = this.querySelector("#tm-active-filters");
    this.bulkBtn = this.querySelector("#tm-bulk");
    this.liveEl = this.querySelector(".tm-live");
    this.liveLabel = this.querySelector("#tm-live-label");
    this.rateVal = this.querySelector("#tm-rate-val");
    this.spark = this.querySelector("#tm-spark");
    this.resetViewBtn = this.querySelector("#tm-reset-view");

    this.slider?.addEventListener("input", (e) => {
      this.stopPlayback();
      this.maxAgeHours = parseInt(e.target.value, 10);
      if (this.sliderVal) this.sliderVal.textContent = `${this.maxAgeHours}h`;
      this.filterByAge();
    });
    this.playBtn?.addEventListener("click", () => this.togglePlayback());

    // Category / estimated filters & Heatmap toggle.
    this.querySelectorAll("[data-cat-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cat = btn.dataset.catToggle;
        if (this.activeCategories.has(cat)) this.activeCategories.delete(cat);
        else this.activeCategories.add(cat);
        btn.setAttribute("aria-pressed", String(this.activeCategories.has(cat)));
        btn.classList.toggle("is-off", !this.activeCategories.has(cat));
        this.applyFilters();
      });
    });

    this.querySelector("#tm-heatmap-toggle")?.addEventListener("click", (e) => {
      const active = e.currentTarget.getAttribute("aria-pressed") === "true";
      e.currentTarget.setAttribute("aria-pressed", String(!active));
      e.currentTarget.classList.toggle("is-off", active);
      this.plots?.classList.toggle("show-heatmap", !active);
    });
    this.querySelector("[data-est-toggle]")?.addEventListener("click", (e) => {
      this.showEstimated = !this.showEstimated;
      e.currentTarget.setAttribute("aria-pressed", String(this.showEstimated));
      e.currentTarget.classList.toggle("is-off", !this.showEstimated);
      this.applyFilters();
    });

    // Search.
    this.searchInput?.addEventListener("input", (e) => {
      this.searchTerm = String(e.target.value || "").trim().toLowerCase();
      this.applyFilters();
    });

    // Bulk isolation over the current filter.
    this.bulkBtn?.addEventListener("click", () => this.bulkIsolateVisible());

    // Zoom & pan.
    this.setupZoomPan();
    this.resetViewBtn?.addEventListener("click", () => this.resetView());

    // Dismiss popover on background click (but not from the a11y list or cluster badges).
    this.addEventListener("click", (e) => {
      if (!e.target.closest(".threat-map__plot") &&
          !e.target.closest(".threat-map__cluster-badge") &&
          !e.target.closest(".threat-map__popover") &&
          !e.target.closest("#tm-a11y-list")) {
        this.hidePopover();
      }
    });
    this.addEventListener("keydown", (e) => { if (e.key === "Escape") this.hidePopover(); });

    // The SVG is role="img"; the parallel list is the accessible equivalent.
    this.a11yList?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-indicator]");
      if (!btn) return;
      const t = this.threatData.find((d) => d.indicator === btn.dataset.indicator);
      if (t) this.showPopover(t, 0, 0);
    });

    this.updateStats();
    this.updateTelemetry();
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
        if (t?.geo?.lat != null && t?.geo?.lon != null) this.storeAndPlot(t);
      }
      this.updateCount();
    } catch (e) {
      console.error("[ThreatMap] historical fetch failed:", e);
    }
  }

  connectWS() {
    if (typeof SharedWebSocket !== "function") return;
    this._ws = new SharedWebSocket();
    this.wsState = "connecting";
    this._ws.onopen = () => { this.wsState = "live"; this.updateTelemetry(); };
    this._ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const processThreat = (t) => {
          if (!t) return;
          const threat = t.data || t;
          const indicator = threat.indicator || threat.source || threat.ip;
          if (!indicator) return;
          const lat = threat.geo?.lat;
          const lon = threat.geo?.lon;
          this.lastEventTs = Date.now();
          this.wsState = "live";
          // No resolved location → tallied, never invented. Server-side GeoIP
          // enrichment attaches real (or region-estimated) coordinates.
          if (lat == null || lon == null) { this.ungeolocated++; this.updateCount(); return; }
          this.storeAndPlot({
            indicator,
            geo: { ...(threat.geo || {}), lat, lon },
            threatType: threat.threatType || threat.type || "ACTIVE_THREAT",
            provider: threat.provider || "REALTIME_FEED",
            confidence: threat.confidence ?? threat.score,
            blocked: !!threat.blocked,
            lastSeen: new Date().toISOString(),
            isNew: true,
          });
          this.updateCount();
        };
        if (payload.type === "UI_BROADCAST_BATCH" && Array.isArray(payload.data)) {
          for (const item of payload.data) {
            if (item.type === "THREAT" || (item.type === "AUDIT_EVENT" && item.data?.type === "THREAT")) processThreat(item.data);
          }
        } else if (payload.type === "THREAT" || (payload.type === "AUDIT_EVENT" && payload.data?.type === "THREAT") || payload.type === "UI_BROADCAST") {
          processThreat(payload.data || payload);
        }
      } catch { /* malformed frame */ }
    };
    this._ws.onclose = () => {
      this.wsState = "reconnecting";
      this.updateTelemetry();
      this._reconnect = setTimeout(() => this.connectWS(), 5000);
    };
  }

  storeAndPlot(t) {
    const idx = this.threatData.findIndex((x) => x.indicator === t.indicator);
    if (idx !== -1) this.threatData[idx] = { ...this.threatData[idx], ...t };
    else {
      this.threatData.unshift(t);
      if (this.threatData.length > 300) this.threatData.pop();
    }
    this.plot(t);
  }

  isHidden(g) { return g.style.display === "none" || g.classList.contains("is-filtered"); }
  precisionOf(t) { return t.geo?.precision || (t.geo?.provisional ? "estimated" : "precise"); }
  sourceOf(t) { return t.provider || t.geo?.provider || "Unknown"; }
  regionKeyOf(t) {
    const geo = t.geo || {};
    return this.precisionOf(t) === "estimated" ? (geo.region || "Unknown region") : (geo.country || geo.region || "Unknown");
  }

  passesFilter(t) {
    const cat = this.categorize(t.threatType || t.provider, t.blocked);
    if (!this.activeCategories.has(cat)) return false;
    if (this.precisionOf(t) === "estimated" && !this.showEstimated) return false;
    if (this.activeSource && this.sourceOf(t) !== this.activeSource) return false;
    if (this.activeRegion && this.regionKeyOf(t) !== this.activeRegion) return false;
    if (this.searchTerm) {
      const hay = [t.indicator, t.geo?.country, t.geo?.city, t.geo?.region, t.provider, t.geo?.asn, t.geo?.isp]
        .filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(this.searchTerm)) return false;
    }
    return true;
  }

  applyFilters() {
    this.threats.forEach((g, indicator) => {
      const data = this.threatData.find((d) => d.indicator === indicator);
      if (data) g.classList.toggle("is-filtered", !this.passesFilter(data));
    });
    this.updateCount();
  }

  filterByAge() {
    const now = Date.now();
    const cutoff = now - this.maxAgeHours * 3600 * 1000;
    this.threats.forEach((g, indicator) => {
      const data = this.threatData.find((d) => d.indicator === indicator);
      g.style.display = new Date(data?.lastSeen || now).getTime() < cutoff ? "none" : "";
    });
    this.updateCount();
  }

  togglePlayback() {
    if (this._playTimer) { this.stopPlayback(); return; }
    const now = Date.now();
    const windowStart = now - this.maxAgeHours * 3600 * 1000;
    let any = false;
    this.threats.forEach((_g, indicator) => {
      const data = this.threatData.find((d) => d.indicator === indicator);
      if (new Date(data?.lastSeen || now).getTime() >= windowStart) any = true;
    });
    if (!any) return;
    const STEPS = 48, DURATION_MS = 6000;
    let step = 0;
    if (this.playBtn) this.playBtn.textContent = "Pause";
    this._playTimer = setInterval(() => {
      step++;
      const playheadTime = windowStart + ((now - windowStart) * step) / STEPS;
      this.threats.forEach((g, indicator) => {
        const data = this.threatData.find((d) => d.indicator === indicator);
        const t = new Date(data?.lastSeen || now).getTime();
        g.style.display = (t >= windowStart && t <= playheadTime) ? "" : "none";
      });
      if (this.playhead) this.playhead.textContent = new Date(playheadTime).toLocaleTimeString();
      this.updateCount();
      if (step >= STEPS) this.stopPlayback();
    }, DURATION_MS / STEPS);
  }

  stopPlayback() {
    if (this._playTimer) { clearInterval(this._playTimer); this._playTimer = null; }
    if (this.playBtn) this.playBtn.textContent = "Replay";
    if (this.playhead) this.playhead.textContent = "";
    this.filterByAge();
  }

  categorize(type, blocked) {
    if (blocked) return "isolated";
    const str = String(type || "").toLowerCase();
    if (str.includes("ebpf") || str.includes("syscall") || str.includes("shell")) return "ebpf";
    if (str.includes("decoy") || str.includes("canary") || str.includes("honeypot")) return "honeypot";
    if (str.includes("scan") || str.includes("probe") || str.includes("brute")) return "scan";
    return "malware";
  }

  plot(threat) {
    const { indicator, blocked, isNew, geo } = threat;
    const lat = geo?.lat, lon = geo?.lon, type = threat.threatType || threat.provider || "UNKNOWN";
    if (!this.plots || lat == null || lon == null) return;
    const numLat = Number(lat), numLon = Number(lon);
    if (!Number.isFinite(numLat) || !Number.isFinite(numLon)) return;
    const { x, y } = project(numLat, numLon);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (y < VIEW.y || y > VIEW.y + VIEW.h) return;

    this.threats.get(indicator)?.remove();
    const category = this.categorize(type, blocked);
    const precision = this.precisionOf(threat);
    const rawScore = Number(threat.score ?? threat.confidence ?? geo?.threatScore ?? 50);
    const sev = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) / 100 : 0.5;
    const dotR = (1.0 + sev * 1.6).toFixed(2);
    const haloR = (2.6 + sev * 3.2).toFixed(2);

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", `threat-map__plot${isNew ? " is-new" : ""}`);
    g.setAttribute("data-category", category);
    g.setAttribute("data-precision", precision);
    g.setAttribute("data-indicator", indicator);
    const s = this.getMarkerScale().toFixed(3);
    g.setAttribute("transform", `translate(${x} ${y}) scale(${s})`);
    g.dataset.x = x; g.dataset.y = y;
    g.style.cursor = "pointer";
    if (!this.passesFilter(threat)) g.classList.add("is-filtered");

    const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    halo.setAttribute("r", haloR); halo.setAttribute("class", "threat-map__halo");
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("r", dotR); dot.setAttribute("class", "threat-map__dot");

    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    const esc = globalThis.escapeHTML ?? String;
    const place = geo?.city || geo?.country || geo?.region || "";
    const placeStr = place ? ` (${place})` : "";
    const srcStr = threat.provider ? ` · ${threat.provider}` : "";
    const estStr = precision === "estimated" ? " [estimated]" : "";
    title.textContent = `${esc(indicator)}${esc(placeStr)} — ${esc(type)}${esc(srcStr)}${esc(estStr)} — ${blocked ? "isolated" : "active"}`;
    g.append(halo, dot, title);

    g.addEventListener("click", (e) => { e.stopPropagation(); this.showPopover(threat, x, y); });
    this.plots.appendChild(g);
    this.threats.set(indicator, g);
    if (!blocked && (category === "malware" || category === "ebpf")) this.drawArc(x, y);
  }

  drawArc(x, y) {
    if (!this.arcs) return;
    const SVGNS = "http://www.w3.org/2000/svg";
    const home = project(HOME_NODE.lat, HOME_NODE.lon);
    // Bow the curve away from the straight line, more for longer shots — reads
    // as a great-circle-style trajectory rather than a flat chord.
    const dist = Math.hypot(home.x - x, home.y - y);
    const midX = (x + home.x) / 2, midY = Math.min(y, home.y) - Math.min(26, 6 + dist * 0.28);
    const d = `M ${x} ${y} Q ${midX} ${midY} ${home.x} ${home.y}`;

    // Faint full route, then a bright dash that travels source → node (CSS).
    const base = document.createElementNS(SVGNS, "path");
    base.setAttribute("d", d); base.setAttribute("class", "threat-map__arc-base");
    const comet = document.createElementNS(SVGNS, "path");
    comet.setAttribute("d", d);
    comet.setAttribute("class", "threat-map__arc");
    comet.setAttribute("pathLength", "100");
    comet.setAttribute("stroke", "url(#tm-arc-grad)");

    this.arcs.append(base, comet);
    setTimeout(() => { base.remove(); comet.remove(); }, 8000);
  }

  /** Shared isolation call — used by the popover and the bulk action. */
  async isolate(indicator) {
    // apiSend carries the CSRF token the isolate route requires.
    await apiSend("/api/defense/isolate", "POST", {
      source: indicator,
      reason: "Manual isolation via Spatial Threat Map",
    });
    const t = this.threatData.find((d) => d.indicator === indicator);
    if (t) { t.blocked = true; this.plot(t); }
  }

  showPopover(threat, _x, _y) {
    if (!this.popoverContainer) return;
    const esc = globalThis.escapeHTML ?? String;
    const geo = threat.geo || {};
    const category = this.categorize(threat.threatType, threat.blocked);
    const precision = this.precisionOf(threat);
    const estimated = precision === "estimated";
    const scoreVal = threat.score ?? threat.confidence ?? geo.threatScore;
    const locLabel = estimated ? "Region (est.)" : "Location";
    const locValue = estimated
      ? `${esc(geo.region || "Unknown region")}`
      : `${esc(geo.country || "Unknown")}${geo.city ? " (" + esc(geo.city) + ")" : ""}`;
    const asnValue = geo.asn ? esc(geo.asn) : "—";
    const ispValue = geo.isp ? esc(geo.isp) : (estimated ? "—" : "Carrier");
    const source = threat.provider ? esc(threat.provider) : "—";
    const precisionBadge = estimated
      ? `<span class="pill" data-state="idle">ESTIMATED</span>`
      : `<span class="pill" data-state="info">${esc(String(precision).toUpperCase())}</span>`;

    this.popoverContainer.innerHTML = `
      <div class="threat-map__popover bg-black/90 backdrop-blur-xl border border-primary/30 p-4 rounded-xl shadow-2xl flex flex-col gap-2 max-w-xs text-left text-xs text-white z-30" tabindex="-1" role="dialog" aria-label="Threat detail">
        <div class="flex justify-between items-center border-b border-white/10 pb-2 gap-2">
          <span class="mono-xs font-bold" data-tone="primary">${esc(threat.indicator)}</span>
          <span class="flex items-center gap-1.5">${precisionBadge}<span class="pill" data-state="${threat.blocked ? 'success' : 'crit'}">${esc(category.toUpperCase())}</span></span>
        </div>
        <div class="grid grid-cols-2 gap-x-2 gap-y-1 my-1 text-[11px]">
          <span class="text-slate-400">${esc(locLabel)}:</span>
          <span class="font-mono">${locValue}</span>
          <span class="text-slate-400">Source Feed:</span>
          <span class="font-mono truncate">${source}</span>
          <span class="text-slate-400">ISP / ASN:</span>
          <span class="font-mono truncate">${ispValue} · ${asnValue}</span>
          <span class="text-slate-400">Threat Vector:</span>
          <span class="font-mono text-warning">${esc(threat.threatType || 'Generic Probe')}</span>
          <span class="text-slate-400">Confidence:</span>
          <span class="font-mono">${scoreVal == null ? '—' : esc(String(scoreVal))}</span>
        </div>
        ${estimated ? `<p class="text-[10px] text-slate-500 leading-tight">Continent-level estimate from RIR allocation — provision a local GeoIP database for precise attribution.</p>` : ""}
        <div class="flex justify-end gap-2 mt-2 pt-2 border-t border-white/10">
          ${threat.blocked
            ? `<span class="eyebrow text-success">ISOLATED_IN_KERNEL</span>`
            : this.canOperate
              ? `<button type="button" id="tm-isolate-btn" class="t-btn danger !py-1 !px-3 text-[10px] font-bold">Commit Isolation</button>`
              : `<span class="eyebrow">Operator role required to isolate</span>`}
        </div>
      </div>
    `;
    this.popoverContainer.classList.remove("hidden");
    this.popoverContainer.querySelector(".threat-map__popover")?.focus();
    const btn = this.popoverContainer.querySelector("#tm-isolate-btn");
    if (btn) {
      btn.addEventListener("click", async () => {
        btn.disabled = true; btn.textContent = "ISOLATING...";
        try { await this.isolate(threat.indicator); this.updateCount(); this.hidePopover(); }
        catch (e) { console.error("Isolation failed:", e); btn.disabled = false; btn.textContent = "Commit Isolation"; }
      });
    }
  }

  showClusterPopover(threats, _x, _y) {
    if (!this.popoverContainer) return;
    const esc = globalThis.escapeHTML ?? String;

    const itemsHtml = threats.map((threat) => {
      const geo = threat.geo || {};
      const category = this.categorize(threat.threatType, threat.blocked);
      const precision = this.precisionOf(threat);
      const estimated = precision === "estimated";
      const locValue = estimated
        ? esc(geo.region || "Unknown region")
        : `${esc(geo.country || "Unknown")}${geo.city ? " (" + esc(geo.city) + ")" : ""}`;
      const scoreVal = threat.score ?? threat.confidence ?? geo.threatScore ?? "—";
      const source = threat.provider ? esc(threat.provider) : "—";

      return `
        <div class="flex items-center justify-between gap-2 p-2 rounded bg-white/5 border border-white/10 text-[11px]" data-cluster-item="${esc(threat.indicator)}">
          <div class="flex flex-col gap-0.5 min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="font-mono font-bold text-white truncate">${esc(threat.indicator)}</span>
              <span class="pill" data-state="${threat.blocked ? 'success' : 'crit'}">${esc(category.toUpperCase())}</span>
            </div>
            <div class="text-slate-400 text-[10px] truncate">
              ${locValue} · ${source} · Score: ${esc(String(scoreVal))}
            </div>
          </div>
          <div class="flex-shrink-0">
            ${threat.blocked
              ? `<span class="eyebrow text-success text-[9px]">ISOLATED</span>`
              : this.canOperate
                ? `<button type="button" class="t-btn danger !py-0.5 !px-2 text-[9px] font-bold" data-cluster-isolate="${esc(threat.indicator)}">Isolate</button>`
                : `<span class="eyebrow text-[9px]">View only</span>`}
          </div>
        </div>
      `;
    }).join("");

    const unblockedCount = threats.filter(t => !t.blocked).length;
    const countLabel = esc(String(threats.length));

    this.popoverContainer.innerHTML = `
      <div class="threat-map__popover bg-black/90 backdrop-blur-xl border border-primary/30 p-4 rounded-xl shadow-2xl flex flex-col gap-2.5 max-w-sm text-left text-xs text-white z-30" tabindex="-1" role="dialog" aria-label="Threat cluster details">
        <div class="flex justify-between items-center border-b border-white/10 pb-2 gap-2">
          <span class="mono-xs font-bold text-primary">Cluster (${countLabel} indicators)</span>
          ${this.canOperate && unblockedCount > 0
            ? `<button type="button" id="tm-cluster-isolate-all" class="t-btn danger !py-0.5 !px-2 text-[10px] font-bold">Isolate All (${esc(String(unblockedCount))})</button>`
            : ""}
        </div>
        <div class="flex flex-col gap-1.5 max-h-60 overflow-y-auto custom-scrollbar pr-1">
          ${itemsHtml}
        </div>
      </div>
    `;

    this.popoverContainer.classList.remove("hidden");
    this.popoverContainer.querySelector(".threat-map__popover")?.focus();

    // Bind individual isolate buttons
    this.popoverContainer.querySelectorAll("[data-cluster-isolate]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ind = btn.dataset.clusterIsolate;
        btn.disabled = true;
        btn.textContent = "...";
        try {
          await this.isolate(ind);
          this.updateCount();
          const itemEl = this.popoverContainer.querySelector(`[data-cluster-item="${CSS.escape(ind)}"]`);
          if (itemEl) {
            const btnWrap = itemEl.querySelector("div:last-child");
            if (btnWrap) btnWrap.innerHTML = `<span class="eyebrow text-success text-[9px]">ISOLATED</span>`;
          }
        } catch (e) {
          console.error("Cluster isolate item failed:", e);
          btn.disabled = false;
          btn.textContent = "Isolate";
        }
      });
    });

    // Bind Isolate All button
    const isolateAllBtn = this.popoverContainer.querySelector("#tm-cluster-isolate-all");
    if (isolateAllBtn) {
      isolateAllBtn.addEventListener("click", async () => {
        isolateAllBtn.disabled = true;
        isolateAllBtn.textContent = "Isolating...";
        const unblocked = threats.filter(t => !t.blocked);
        for (const t of unblocked) {
          try {
            await this.isolate(t.indicator);
          } catch (e) {
            console.error("Cluster isolate all item failed:", t.indicator, e);
          }
        }
        this.updateCount();
        this.showClusterPopover(threats, _x, _y);
      });
    }
  }

  hidePopover() {
    if (this.popoverContainer) { this.popoverContainer.classList.add("hidden"); this.popoverContainer.innerHTML = ""; }
  }

  /** The threats currently visible (not aged out, not filtered, not clustered-away). */
  visibleThreats() {
    const out = [];
    this.threats.forEach((g, indicator) => {
      if (this.isHidden(g)) return;
      const data = this.threatData.find((d) => d.indicator === indicator);
      if (data) out.push(data);
    });
    return out;
  }

  /** Bulk-isolate every visible, not-yet-isolated indicator (operator only). */
  async bulkIsolateVisible() {
    if (!this.canOperate || !this.bulkBtn) return;
    const targets = this.visibleThreats().filter((t) => !t.blocked);
    if (targets.length === 0) return;
    if (this.bulkBtn.dataset.armed !== "1") {
      // Two-step confirm so a filtered mass-isolation is never one stray click.
      this.bulkBtn.dataset.armed = "1";
      this.bulkBtn.textContent = `Confirm: isolate ${targets.length}`;
      this.bulkBtn.classList.add("is-armed");
      clearTimeout(this._bulkArm);
      this._bulkArm = setTimeout(() => this.updateBulkButton(), 4000);
      return;
    }
    this.bulkBtn.dataset.armed = "0";
    this.bulkBtn.disabled = true;

    // Parallel isolation batching (5 requests concurrently)
    const BATCH_SIZE = 5;
    let ok = 0;
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const chunk = targets.slice(i, i + BATCH_SIZE);
      this.bulkBtn.textContent = `Isolating ${i + 1}-${Math.min(i + BATCH_SIZE, targets.length)} of ${targets.length}…`;
      await Promise.all(
        chunk.map(async (t) => {
          try {
            await this.isolate(t.indicator);
            ok++;
          } catch (e) {
            console.error("bulk isolate failed", t.indicator, e);
          }
        })
      );
    }
    this.bulkBtn.disabled = false;
    this.bulkBtn.classList.remove("is-armed");
    this.updateCount();
    console.info(`[ThreatMap] bulk isolated ${ok}/${targets.length}`);
  }

  updateBulkButton() {
    if (!this.bulkBtn) return;
    const filtered = this.activeSource || this.activeRegion || this.searchTerm ||
      this.activeCategories.size < CATEGORIES.length || !this.showEstimated;
    const targets = this.canOperate ? this.visibleThreats().filter((t) => !t.blocked) : [];
    this.bulkBtn.dataset.armed = "0";
    this.bulkBtn.classList.remove("is-armed");
    if (filtered && this.canOperate && targets.length > 0) {
      this.bulkBtn.hidden = false;
      this.bulkBtn.textContent = `Isolate all visible (${targets.length})`;
    } else {
      this.bulkBtn.hidden = true;
    }
  }

  setFilter(kind, value) {
    // Toggle a source/region filter; clicking the active one clears it.
    if (kind === "source") this.activeSource = this.activeSource === value ? null : value;
    if (kind === "region") this.activeRegion = this.activeRegion === value ? null : value;
    this.applyFilters();
  }

  clearFilter(kind) {
    if (kind === "source") this.activeSource = null;
    if (kind === "region") this.activeRegion = null;
    if (kind === "search") { this.searchTerm = ""; if (this.searchInput) this.searchInput.value = ""; }
    this.applyFilters();
  }

  updateCount() {
    if (this.counter) {
      let count = 0, estimated = 0;
      this.threats.forEach((g, indicator) => {
        if (this.isHidden(g)) return;
        count++;
        const data = this.threatData.find((d) => d.indicator === indicator);
        if (data && this.precisionOf(data) === "estimated") estimated++;
      });
      const parts = [`${count} indicator${count === 1 ? "" : "s"}`];
      if (estimated > 0) parts.push(`${estimated} est.`);
      if (this.ungeolocated > 0) parts.push(`${this.ungeolocated} ungeolocated`);
      this.counter.textContent = parts.join(" · ");
    }
    this.updateA11yList();
    this.applyClusters();
    this.updateStats();
    this.updateChoropleth();
    this.updateActiveFilters();
    this.updateBulkButton();
    this.updateTelemetry(); // keep the rate/sparkline live as data arrives
  }

  /**
   * Tint each country by how many visible threats it hosts (a choropleth).
   * Only located threats count — an estimate carries no country, so it never
   * lights a shape it can't justify. Intensity is a sqrt scale of count/max so
   * one loud country doesn't wash the rest to nothing.
   */
  updateChoropleth() {
    if (!this.countryEls) return;
    const counts = new Map();
    for (const data of this.visibleThreats()) {
      if (this.precisionOf(data) === "estimated") continue;
      const iso = String(data.geo?.country || "").toUpperCase();
      if (iso && this.countryEls.has(iso)) counts.set(iso, (counts.get(iso) || 0) + 1);
    }
    const max = Math.max(1, ...counts.values());
    // Clear countries that are no longer hot.
    for (const iso of this.heatedIso) {
      if (!counts.has(iso)) this.countryEls.get(iso)?.style.removeProperty("--heat");
    }
    this.heatedIso = new Set(counts.keys());
    for (const [iso, n] of counts) {
      const t = 0.18 + 0.82 * Math.sqrt(n / max);
      this.countryEls.get(iso)?.style.setProperty("--heat", t.toFixed(3));
    }
    if (this.heatLegend) this.heatLegend.hidden = counts.size === 0;
    if (this.heatMaxEl) this.heatMaxEl.textContent = counts.size ? String(Math.max(...counts.values())) : "0";
  }

  /** Region + source breakdown, both clickable to filter, from visible markers. */
  updateStats() {
    if (!this.statsEl) return;
    const esc = globalThis.escapeHTML ?? String;
    let located = 0, estimated = 0, anyAsn = false;
    const regions = new Map(), sources = new Map(), asns = new Map();
    for (const data of this.visibleThreats()) {
      const geo = data.geo || {};
      if (this.precisionOf(data) === "estimated") { estimated++; } else { located++; }
      bump(regions, this.regionKeyOf(data));
      bump(sources, this.sourceOf(data));
      if (geo.asn) { anyAsn = true; bump(asns, geo.asn); }
    }
    const topChips = (map, kind, active) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([name, n]) => `<button type="button" class="${kind === "region" ? "tm-region" : "tm-source"}${active === name ? " is-active" : ""}" data-filter="${kind}" data-value="${esc(name)}">${esc(name)}<b>${n}</b></button>`)
      .join("");
    const asnLine = anyAsn
      ? `<span class="tm-stat-sep" aria-hidden="true"></span><span class="tm-stat tm-stat--muted">Top ASN</span>` +
        [...asns.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, n]) => `<span class="tm-region">${esc(name)}<b>${n}</b></span>`).join("")
      : "";
    this.statsEl.innerHTML = `
      <span class="tm-stat"><b>${located}</b> located</span>
      <span class="tm-stat tm-stat--est"><b>${estimated}</b> estimated</span>
      <span class="tm-stat tm-stat--muted"><b>${this.ungeolocated}</b> ungeolocated</span>
      <span class="tm-stat-sep" aria-hidden="true"></span>
      ${topChips(regions, "region", this.activeRegion) || `<span class="tm-stat tm-stat--muted">No located indicators yet</span>`}
      ${sources.size ? `<span class="tm-stat-sep" aria-hidden="true"></span><span class="tm-stat tm-stat--muted">Sources</span>${topChips(sources, "source", this.activeSource)}` : ""}
      ${asnLine}
    `;
    this.statsEl.querySelectorAll("[data-filter]").forEach((el) => {
      el.addEventListener("click", () => this.setFilter(el.dataset.filter, el.dataset.value));
    });
  }

  /** Chips for the active source/region/search filters, each removable. */
  updateActiveFilters() {
    if (!this.activeFiltersEl) return;
    const esc = globalThis.escapeHTML ?? String;
    const chips = [];
    if (this.activeSource) chips.push(`<button type="button" class="tm-filter-chip" data-clear="source">source: ${esc(this.activeSource)} ✕</button>`);
    if (this.activeRegion) chips.push(`<button type="button" class="tm-filter-chip" data-clear="region">region: ${esc(this.activeRegion)} ✕</button>`);
    if (this.searchTerm) chips.push(`<button type="button" class="tm-filter-chip" data-clear="search">search: ${esc(this.searchTerm)} ✕</button>`);
    this.activeFiltersEl.innerHTML = chips.join("");
    this.activeFiltersEl.querySelectorAll("[data-clear]").forEach((el) => {
      el.addEventListener("click", () => this.clearFilter(el.dataset.clear));
    });
  }

  updateTelemetry() {
    // Live status + freshness.
    if (this.liveEl && this.liveLabel) {
      const since = this.lastEventTs ? Math.round((Date.now() - this.lastEventTs) / 1000) : null;
      const state = this.wsState === "live" ? "ok" : this.wsState === "reconnecting" ? "warn" : this.wsState === "connecting" ? "warn" : "idle";
      this.liveEl.setAttribute("data-state", state);
      this.liveLabel.textContent = this.wsState === "live"
        ? (since == null ? "live" : `live · ${fmtAgo(since)}`)
        : this.wsState;
    }
    // Ingress rate over the trailing hour, from real lastSeen timestamps.
    const hourAgo = Date.now() - 3600 * 1000;
    let inHour = 0;
    for (const t of this.threatData) if (new Date(t.lastSeen || 0).getTime() >= hourAgo) inHour++;
    if (this.rateVal) this.rateVal.textContent = String(inHour);
    this.renderSparkline();
  }

  /** Ingress volume across the current window, bucketed from lastSeen. */
  renderSparkline() {
    if (!this.spark) return;
    const now = Date.now();
    const windowMs = this.maxAgeHours * 3600 * 1000;
    const BUCKETS = 24;
    const counts = new Array(BUCKETS).fill(0);
    for (const t of this.threatData) {
      const age = now - new Date(t.lastSeen || now).getTime();
      if (age < 0 || age > windowMs) continue;
      const b = Math.min(BUCKETS - 1, Math.floor(((windowMs - age) / windowMs) * BUCKETS));
      counts[b]++;
    }
    const max = Math.max(1, ...counts);
    const pts = counts.map((c, i) => {
      const x = (i / (BUCKETS - 1)) * 60;
      const y = 16 - (c / max) * 15 - 0.5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    // Stroke/fill come from CSS (.tm-spark polyline) — a presentation attribute
    // cannot resolve a CSS variable, so setting stroke here would render black.
    this.spark.innerHTML = `<polyline points="${pts}"/>`;
  }

  // ── Zoom & pan ────────────────────────────────────────────────────────────
  setupZoomPan() {
    if (!this.svg) return;
    this.svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 0.85 : 1.18;
      const p = this.svgPoint(e);
      this.zoomAt(p.x, p.y, factor);
    }, { passive: false });
    this.svg.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".threat-map__plot")) return; // let a marker take the click
      this.pan = { x: e.clientX, y: e.clientY, view: { ...this.view } };
      this.svg.setPointerCapture?.(e.pointerId);
      this.svg.classList.add("is-panning");
    });
    this.svg.addEventListener("pointermove", (e) => {
      if (!this.pan) return;
      const rect = this.svg.getBoundingClientRect();
      const dx = ((e.clientX - this.pan.x) / rect.width) * this.view.w;
      const dy = ((e.clientY - this.pan.y) / rect.height) * this.view.h;
      this.view.x = this.pan.view.x - dx;
      this.view.y = this.pan.view.y - dy;
      this.clampView();
      this.applyView();
    });
    const end = (e) => { this.pan = null; this.svg.classList.remove("is-panning"); this.svg.releasePointerCapture?.(e.pointerId); };
    this.svg.addEventListener("pointerup", end);
    this.svg.addEventListener("pointercancel", end);
  }

  svgPoint(e) {
    const rect = this.svg.getBoundingClientRect();
    return {
      x: this.view.x + ((e.clientX - rect.left) / rect.width) * this.view.w,
      y: this.view.y + ((e.clientY - rect.top) / rect.height) * this.view.h,
    };
  }

  zoomAt(cx, cy, factor) {
    const newW = VIEW.w * clampZoom(this.view.w * factor / VIEW.w);
    const scale = newW / this.view.w;
    this.view.w = newW;
    this.view.h = this.view.h * scale;
    // Keep the point under the cursor stationary.
    this.view.x = cx - (cx - this.view.x) * scale;
    this.view.y = cy - (cy - this.view.y) * scale;
    this.clampView();
    this.applyView();
  }

  clampView() {
    this.view.w = Math.min(VIEW.w, Math.max(VIEW.w / ZOOM_MAX, this.view.w));
    this.view.h = Math.min(VIEW.h, Math.max(VIEW.h / ZOOM_MAX, this.view.h));
    this.view.x = Math.min(VIEW.x + VIEW.w - this.view.w, Math.max(VIEW.x, this.view.x));
    this.view.y = Math.min(VIEW.y + VIEW.h - this.view.h, Math.max(VIEW.y, this.view.y));
  }

  getMarkerScale() {
    const zoomLevel = VIEW.w / (this.view.w || VIEW.w);
    return Math.max(0.2, 1 / Math.pow(zoomLevel, 0.8));
  }

  applyView() {
    this.svg?.setAttribute("viewBox", `${this.view.x} ${this.view.y} ${this.view.w} ${this.view.h}`);
    const zoomed = this.view.w < VIEW.w - 0.5;
    if (this.resetViewBtn) this.resetViewBtn.hidden = !zoomed;
    this.applyClusters();

    const s = this.getMarkerScale().toFixed(3);
    this.plots?.querySelectorAll(".threat-map__plot").forEach((g) => {
      const x = g.dataset.x, y = g.dataset.y;
      if (x != null && y != null) g.setAttribute("transform", `translate(${x} ${y}) scale(${s})`);
    });
    const homeEl = this.querySelector(".threat-map__home");
    if (homeEl) {
      const home = project(HOME_NODE.lat, HOME_NODE.lon);
      homeEl.setAttribute("transform", `translate(${home.x} ${home.y}) scale(${s})`);
    }
  }

  resetView() {
    this.view = { ...VIEW };
    this.applyView();
  }

  applyClusters() {
    if (!this.clusters) return;
    const SVGNS = "http://www.w3.org/2000/svg";
    const zoomLevel = VIEW.w / (this.view.w || VIEW.w);
    // Dynamic cell granularity: when zoomed out (zoomLevel ~ 1), CELL is ~6.0.
    // As operator zooms in (zoomLevel up to 6), CELL shrinks smoothly to ~0.6, breaking clusters into discrete sharp markers.
    const CELL = Math.max(0.6, 6.0 / Math.pow(zoomLevel, 1.15));
    const cells = new Map();
    this.threats.forEach((g) => {
      g.classList.remove("is-clustered");
      if (this.isHidden(g)) return;
      const x = Number(g.dataset.x), y = Number(g.dataset.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const key = `${Math.round(x / CELL)}:${Math.round(y / CELL)}`;
      const bucket = cells.get(key);
      if (bucket) bucket.push(g); else cells.set(key, [g]);
    });
    this.clusters.innerHTML = "";
    const dotR = (g) => Number(g.querySelector(".threat-map__dot")?.getAttribute("r") || 0);
    for (const group of cells.values()) {
      if (group.length < 2) continue;
      group.sort((a, b) => dotR(b) - dotR(a));
      for (let i = 1; i < group.length; i++) group[i].classList.add("is-clustered");
      const x = Number(group[0].dataset.x), y = Number(group[0].dataset.y);
      const badge = document.createElementNS(SVGNS, "g");
      badge.setAttribute("class", "threat-map__cluster-badge");
      badge.dataset.x = String(x); badge.dataset.y = String(y);
      const s = this.getMarkerScale().toFixed(3);
      badge.setAttribute("transform", `translate(${x} ${y}) scale(${s})`);
      badge.style.cursor = "pointer";
      const circle = document.createElementNS(SVGNS, "circle");
      circle.setAttribute("r", "3.4"); circle.setAttribute("cx", "4"); circle.setAttribute("cy", "-4");
      const text = document.createElementNS(SVGNS, "text");
      text.setAttribute("x", "4"); text.setAttribute("y", "-4");
      text.textContent = String(group.length);
      badge.append(circle, text);

      const groupThreats = group.map((g) => this.threatData.find((d) => d.indicator === g.dataset.indicator)).filter(Boolean);
      badge.addEventListener("click", (e) => {
        e.stopPropagation();
        this.showClusterPopover(groupThreats, x, y);
      });

      this.clusters.appendChild(badge);
    }
  }

  updateA11yList() {
    if (!this.a11yList) return;
    const esc = globalThis.escapeHTML ?? String;
    const items = [];
    for (const t of this.threatData) {
      const g = this.threats.get(t.indicator);
      if (!g || this.isHidden(g)) continue;
      const cat = this.categorize(t.threatType, t.blocked);
      const est = this.precisionOf(t) === "estimated";
      const place = est ? `${t.geo?.region || "unknown region"} (estimated)` : (t.geo?.country || "unknown location");
      const src = t.provider ? `, ${t.provider}` : "";
      const score = t.score ?? t.confidence ?? t.geo?.threatScore;
      const label = `${t.indicator}, ${cat}, ${place}${src}` + (score != null ? `, severity ${score}` : "");
      items.push(`<li><button type="button" data-indicator="${esc(t.indicator)}">${esc(label)}</button></li>`);
    }
    this.a11yList.innerHTML = items.join("");
  }
}

function bump(map, key) { map.set(key, (map.get(key) || 0) + 1); }
function clampZoom(z) { return Math.min(1, Math.max(1 / ZOOM_MAX, z)); }
function fmtAgo(s) { return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`; }

customElements.define("threat-map", ThreatMap);
