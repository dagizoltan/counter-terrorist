/**
 * <threat-map> — enterprise spatial & real-time threat map.
 * Renders an inline SVG equirectangular map with multi-spectral threat
 * categories, ingress vector arcs, interactive spatial popover cards, a 24h
 * temporal scrubber, a clickable category filter, and a live region breakdown.
 *
 * Location trust is first-class: a threat's geo carries a `precision`
 * ("city" | "country" | "estimated"). Estimated points — continent-level RIR
 * guesses from the server when no GeoIP database is provisioned — are drawn
 * hollow and dashed, counted separately, and never dressed up as precise. A
 * threat with no location at all is tallied, never invented.
 */
import { unwrap, apiSend } from "./api.js";
import { WORLD_PATH, project } from "./world-outline.js";

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

class ThreatMap extends HTMLElement {
  constructor() {
    super();
    this.threats = new Map();
    this.threatData = [];
    this.initialized = false;
    this.activePopover = null;
    this.maxAgeHours = 24;
    // Threats that arrive without a resolvable location. They used to be hashed
    // to a random region and plotted as if real; now they are counted, not
    // invented — see connectWS().
    this.ungeolocated = 0;
    // Filter state: every category on, estimated points shown.
    this.activeCategories = new Set(CATEGORIES);
    this.showEstimated = true;
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
  }

  disconnectedCallback() {
    if (this._reconnect) clearTimeout(this._reconnect);
    if (this._playTimer) clearInterval(this._playTimer);
    if (this._ws) { this._ws.onclose = null; this._ws.close?.(); }
  }

  renderShell() {
    // The protected node has been the origin of every ingress arc but was never
    // drawn — the arcs flew to an invisible point. Marked now, so the picture
    // has a centre.
    const home = project(HOME_NODE.lat, HOME_NODE.lon);
    const legendItems = CATEGORIES.map((cat) =>
      `<button type="button" class="tm-legend-btn" data-cat-toggle="${cat}" aria-pressed="true">
         <span class="indicator" data-cat="${cat}" aria-hidden="true"></span>${CATEGORY_LABEL[cat]}
       </button>`
    ).join("");
    this.innerHTML = `
      <div class="threat-map threat-map--container relative">
        <svg class="threat-map__canvas"
             viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}"
             preserveAspectRatio="xMidYMid meet" role="img"
             aria-label="Global threat indicator map">
          <defs>
            <pattern id="tm-grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="var(--line-faint)" stroke-width="0.4"/>
            </pattern>
            <linearGradient id="tm-arc-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="var(--danger)" stop-opacity="0.8"/>
              <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.1"/>
            </linearGradient>
          </defs>
          <rect x="${VIEW.x}" y="${VIEW.y}" width="${VIEW.w}" height="${VIEW.h}" fill="url(#tm-grid)"/>
          <path d="${WORLD_PATH}" class="threat-map__land"/>
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
        </div>

        <div class="threat-map__scrubber flex items-center gap-3 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 text-xs">
          <button type="button" id="tm-play" class="t-btn ghost !py-1 !px-2 text-[10px]" aria-label="Replay threats across the time window">Replay</button>
          <span class="eyebrow">Time_Window:</span>
          <input type="range" min="1" max="24" value="24" class="accent-primary cursor-pointer w-28 h-1" id="tm-scrubber-slider" />
          <span class="eyebrow min-w-[36px]" id="tm-scrubber-val">24h</span>
          <span class="eyebrow min-w-[36px]" id="tm-playhead" aria-live="polite"></span>
        </div>

        <div class="threat-map__count eyebrow" aria-live="polite">0 indicators</div>
        <div class="threat-map__popover-container hidden"></div>
      </div>
      <div class="threat-map__stats" aria-live="polite"></div>
      <ul id="tm-a11y-list" class="sr-only" aria-label="Detected threats, newest first"></ul>
    `;
    // Position the home marker through the attribute, not the markup: the
    // coordinates are numeric, but interpolating them into innerHTML trips the
    // escaping guard, and setAttribute is how every other plot is placed.
    this.querySelector(".threat-map__home")?.setAttribute("transform", `translate(${home.x} ${home.y})`);

    this.plots = this.querySelector(".threat-map__plots");
    this.arcs = this.querySelector(".threat-map__arcs");
    this.clusters = this.querySelector(".threat-map__clusters");
    this.counter = this.querySelector(".threat-map__count");
    this.statsEl = this.querySelector(".threat-map__stats");
    this.popoverContainer = this.querySelector(".threat-map__popover-container");
    this.slider = this.querySelector("#tm-scrubber-slider");
    this.sliderVal = this.querySelector("#tm-scrubber-val");
    this.playBtn = this.querySelector("#tm-play");
    this.playhead = this.querySelector("#tm-playhead");
    this.a11yList = this.querySelector("#tm-a11y-list");

    if (this.slider) {
      this.slider.addEventListener("input", (e) => {
        this.stopPlayback(); // a manual scrub ends any replay in progress
        this.maxAgeHours = parseInt(e.target.value, 10);
        if (this.sliderVal) this.sliderVal.textContent = `${this.maxAgeHours}h`;
        this.filterByAge();
      });
    }
    if (this.playBtn) {
      this.playBtn.addEventListener("click", () => this.togglePlayback());
    }

    // Category / estimated filter — the legend is a live control, not a key.
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
    const estBtn = this.querySelector("[data-est-toggle]");
    if (estBtn) {
      estBtn.addEventListener("click", () => {
        this.showEstimated = !this.showEstimated;
        estBtn.setAttribute("aria-pressed", String(this.showEstimated));
        estBtn.classList.toggle("is-off", !this.showEstimated);
        this.applyFilters();
      });
    }

    // Dismiss popover on background click
    this.addEventListener("click", (e) => {
      // The a11y list opens the popover; without excluding it here the same
      // bubbling click would reach this handler and dismiss it right back.
      if (!e.target.closest(".threat-map__plot") &&
          !e.target.closest(".threat-map__popover") &&
          !e.target.closest("#tm-a11y-list")) {
        this.hidePopover();
      }
    });

    // Keyboard: Escape closes the popover.
    this.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.hidePopover();
    });

    // The SVG is role="img", so its plots are invisible to assistive tech and
    // unreachable by keyboard. The parallel list is the accessible equivalent:
    // each threat is a real button that opens the same detail popover.
    if (this.a11yList) {
      this.a11yList.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-indicator]");
        if (!btn) return;
        const t = this.threatData.find((d) => d.indicator === btn.dataset.indicator);
        if (t) this.showPopover(t, 0, 0);
      });
    }
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
          this.storeAndPlot(t);
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

          const lat = threat.geo?.lat;
          const lon = threat.geo?.lon;

          // A threat with no resolved location is not placed on the map. It used
          // to be hashed to one of a dozen hard-coded regions and jittered, so a
          // dot on Kansas could be an adversary the feed never located — the
          // operator could not tell a real geolocation from an invented one.
          // The server's GeoIP enrichment now attaches real (or region-level
          // estimated) coordinates; anything still unresolved is tallied.
          if (lat == null || lon == null) {
            this.ungeolocated++;
            this.updateCount();
            return;
          }

          const enriched = {
            indicator,
            geo: { ...(threat.geo || {}), lat, lon },
            threatType: threat.threatType || threat.type || "ACTIVE_THREAT",
            blocked: !!threat.blocked,
            provider: threat.provider || "REALTIME_FEED",
            lastSeen: new Date().toISOString(),
            isNew: true
          };
          this.storeAndPlot(enriched);
          this.updateCount();
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

  storeAndPlot(t) {
    const idx = this.threatData.findIndex(x => x.indicator === t.indicator);
    if (idx !== -1) {
      this.threatData[idx] = { ...this.threatData[idx], ...t };
    } else {
      this.threatData.unshift(t);
      if (this.threatData.length > 300) this.threatData.pop();
    }
    this.plot(t);
  }

  /** A plot is hidden if it aged out (inline display) or a filter excludes it. */
  isHidden(g) {
    return g.style.display === "none" || g.classList.contains("is-filtered");
  }

  precisionOf(threat) {
    return threat.geo?.precision || (threat.geo?.provisional ? "estimated" : "precise");
  }

  passesFilter(threat) {
    const cat = this.categorize(threat.threatType || threat.provider, threat.blocked);
    if (!this.activeCategories.has(cat)) return false;
    if (this.precisionOf(threat) === "estimated" && !this.showEstimated) return false;
    return true;
  }

  /** Re-apply category / estimated filters to every plotted marker. */
  applyFilters() {
    this.threats.forEach((g, indicator) => {
      const data = this.threatData.find((d) => d.indicator === indicator);
      if (!data) return;
      g.classList.toggle("is-filtered", !this.passesFilter(data));
    });
    this.updateCount();
  }

  filterByAge() {
    const now = Date.now();
    const cutoff = now - (this.maxAgeHours * 60 * 60 * 1000);
    this.threats.forEach((g, indicator) => {
      const data = this.threatData.find(d => d.indicator === indicator);
      const time = new Date(data?.lastSeen || now).getTime();
      g.style.display = time < cutoff ? "none" : "";
    });
    this.updateCount();
  }

  /** Replay the threats appearing across the current window, oldest to newest. */
  togglePlayback() {
    if (this._playTimer) { this.stopPlayback(); return; }

    const now = Date.now();
    const windowStart = now - (this.maxAgeHours * 60 * 60 * 1000);
    const times = [];
    this.threats.forEach((_g, indicator) => {
      const data = this.threatData.find((d) => d.indicator === indicator);
      const t = new Date(data?.lastSeen || now).getTime();
      if (t >= windowStart) times.push(t);
    });
    if (times.length === 0) return; // nothing to replay

    const STEPS = 48;
    const DURATION_MS = 6000;
    let step = 0;
    if (this.playBtn) this.playBtn.textContent = "Pause";

    this._playTimer = setInterval(() => {
      step++;
      const playheadTime = windowStart + ((now - windowStart) * step) / STEPS;
      this.threats.forEach((g, indicator) => {
        const data = this.threatData.find((d) => d.indicator === indicator);
        const t = new Date(data?.lastSeen || now).getTime();
        // Shown once it has "appeared" by the playhead, within the window.
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
    this.filterByAge(); // restore the full window
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
    const lat = geo?.lat;
    const lon = geo?.lon;
    const type = threat.threatType || threat.provider || "UNKNOWN";

    if (!this.plots || lat == null || lon == null) return;
    const numLat = Number(lat);
    const numLon = Number(lon);
    if (!Number.isFinite(numLat) || !Number.isFinite(numLon)) return;

    const { x, y } = project(numLat, numLon);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (y < VIEW.y || y > VIEW.y + VIEW.h) return;

    this.threats.get(indicator)?.remove();

    const category = this.categorize(type, blocked);
    const precision = this.precisionOf(threat);

    // Weight the marker by severity so the eye lands on the worst actors. The
    // score arrives under any of these depending on the source; missing means
    // mid.
    const rawScore = Number(threat.score ?? threat.confidence ?? geo?.threatScore ?? 50);
    const sev = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) / 100 : 0.5;
    const dotR = (1.0 + sev * 1.6).toFixed(2);
    const haloR = (2.6 + sev * 3.2).toFixed(2);

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", `threat-map__plot${isNew ? " is-new" : ""}`);
    g.setAttribute("data-category", category);
    g.setAttribute("data-precision", precision);
    g.setAttribute("data-indicator", indicator);
    g.setAttribute("transform", `translate(${x} ${y})`);
    g.dataset.x = x;
    g.dataset.y = y;
    g.style.cursor = "pointer";
    if (!this.passesFilter(threat)) g.classList.add("is-filtered");

    const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    halo.setAttribute("r", haloR);
    halo.setAttribute("class", "threat-map__halo");

    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("r", dotR);
    dot.setAttribute("class", "threat-map__dot");

    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    const esc = globalThis.escapeHTML ?? String;
    const place = geo?.city || geo?.country || geo?.region || "";
    const placeStr = place ? ` (${place})` : "";
    const ispStr = geo?.isp ? ` · ${geo.isp}` : "";
    const estStr = precision === "estimated" ? " [estimated]" : "";
    title.textContent = `${esc(indicator)}${esc(placeStr)} — ${esc(type)}${esc(ispStr)}${esc(estStr)} — ${blocked ? "isolated" : "active"}`;

    g.append(halo, dot, title);

    g.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showPopover(threat, x, y);
    });

    this.plots.appendChild(g);
    this.threats.set(indicator, g);

    // Draw ingress arc if active critical malware/ebpf threat
    if (!blocked && (category === "malware" || category === "ebpf")) {
      this.drawArc(x, y);
    }
  }

  drawArc(x, y) {
    if (!this.arcs) return;
    const home = project(HOME_NODE.lat, HOME_NODE.lon);
    const midX = (x + home.x) / 2;
    const midY = Math.min(y, home.y) - 12;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${x} ${y} Q ${midX} ${midY} ${home.x} ${home.y}`);
    path.setAttribute("class", "threat-map__arc");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "url(#tm-arc-grad)");
    path.setAttribute("stroke-width", "0.6");
    path.setAttribute("stroke-dasharray", "3 2");

    this.arcs.appendChild(path);
    setTimeout(() => path.remove(), 8000);
  }

  showPopover(threat, x, y) {
    if (!this.popoverContainer) return;
    const esc = globalThis.escapeHTML ?? String;
    const geo = threat.geo || {};
    const category = this.categorize(threat.threatType, threat.blocked);
    const precision = this.precisionOf(threat);
    const estimated = precision === "estimated";
    // Shown as-is; the marker's size is derived from it, so a defaulted value is
    // rendered "—" rather than a number the feed never supplied.
    const scoreVal = threat.score ?? threat.confidence ?? geo.threatScore;

    // Honest location line: an estimate reports its region and says so; a real
    // lookup reports country/city. Nothing invents a country it does not have.
    const locLabel = estimated ? "Region (est.)" : "Location";
    const locValue = estimated
      ? `${esc(geo.region || "Unknown region")}`
      : `${esc(geo.country || "Unknown")}${geo.city ? " (" + esc(geo.city) + ")" : ""}`;
    const ispValue = geo.isp ? esc(geo.isp) : (estimated ? "—" : "Carrier");
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
          <span class="text-slate-400">ISP / ASN:</span>
          <span class="font-mono truncate">${ispValue}${geo.asn ? " · " + esc(geo.asn) : ""}</span>
          <span class="text-slate-400">Threat Vector:</span>
          <span class="font-mono text-warning">${esc(threat.threatType || 'Generic Probe')}</span>
          <span class="text-slate-400">Severity:</span>
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
    // Move focus into the popover so a keyboard user who opened it from the
    // parallel list lands on it, and Escape (handled on the host) dismisses it.
    this.popoverContainer.querySelector(".threat-map__popover")?.focus();
    const btn = this.popoverContainer.querySelector("#tm-isolate-btn");
    if (btn) {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "ISOLATING...";
        try {
          // apiSend carries the CSRF token the isolate route requires; a raw
          // fetch here omitted X-CT-Token and the POST was rejected 403.
          await apiSend("/api/defense/isolate", "POST", {
            source: threat.indicator,
            reason: "Manual isolation via Spatial Threat Map",
          });
          threat.blocked = true;
          this.storeAndPlot(threat);
          this.hidePopover();
        } catch (e) {
          console.error("Isolation failed:", e);
          btn.disabled = false;
          btn.textContent = "Commit Isolation";
        }
      });
    }
  }

  hidePopover() {
    if (this.popoverContainer) {
      this.popoverContainer.classList.add("hidden");
      this.popoverContainer.innerHTML = "";
    }
  }

  updateCount() {
    if (this.counter) {
      let count = 0;
      let estimated = 0;
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
  }

  /**
   * Live region breakdown from what is actually plotted and visible — the panel
   * that replaced three hard-coded "12% / 64% / 31%" cards the page used to ship.
   * A precise point counts under its country; an estimate under its region.
   */
  updateStats() {
    if (!this.statsEl) return;
    const esc = globalThis.escapeHTML ?? String;
    let located = 0, estimated = 0;
    const regions = new Map();
    this.threats.forEach((g, indicator) => {
      if (this.isHidden(g)) return;
      const data = this.threatData.find((d) => d.indicator === indicator);
      if (!data) return;
      const geo = data.geo || {};
      if (this.precisionOf(data) === "estimated") {
        estimated++;
        bump(regions, geo.region || "Unknown region");
      } else {
        located++;
        bump(regions, geo.country || geo.region || "Unknown");
      }
    });
    const top = [...regions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const chips = top
      .map(([name, n]) => `<span class="tm-region">${esc(name)}<b>${n}</b></span>`)
      .join("");
    this.statsEl.innerHTML = `
      <span class="tm-stat"><b>${located}</b> located</span>
      <span class="tm-stat tm-stat--est"><b>${estimated}</b> estimated</span>
      <span class="tm-stat tm-stat--muted"><b>${this.ungeolocated}</b> ungeolocated</span>
      <span class="tm-stat-sep" aria-hidden="true"></span>
      ${chips || `<span class="tm-stat tm-stat--muted">No located indicators yet</span>`}
    `;
  }

  /**
   * Collapse markers that land in the same map cell into one, with a count
   * badge, so a busy metro reads as "7 here" instead of an unreadable blob.
   * Layered on top: it only toggles an is-clustered class (CSS-hidden) and
   * draws badges, leaving the age filter, playback and per-indicator popovers
   * untouched. Hidden markers (aged out or filtered) are not eligible.
   */
  applyClusters() {
    if (!this.clusters) return;
    const SVGNS = "http://www.w3.org/2000/svg";
    const CELL = 7; // viewBox units
    const cells = new Map();

    this.threats.forEach((g) => {
      g.classList.remove("is-clustered"); // reset every pass, then re-decide
      if (this.isHidden(g)) return; // aged out or filtered — not eligible
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
      // Representative = the largest marker (i.e. highest severity) in the cell.
      group.sort((a, b) => dotR(b) - dotR(a));
      for (let i = 1; i < group.length; i++) group[i].classList.add("is-clustered");

      const x = Number(group[0].dataset.x), y = Number(group[0].dataset.y);
      const badge = document.createElementNS(SVGNS, "g");
      badge.setAttribute("class", "threat-map__cluster-badge");
      badge.setAttribute("transform", `translate(${x} ${y})`);
      const circle = document.createElementNS(SVGNS, "circle");
      circle.setAttribute("r", "3.4"); circle.setAttribute("cx", "4"); circle.setAttribute("cy", "-4");
      const text = document.createElementNS(SVGNS, "text");
      text.setAttribute("x", "4"); text.setAttribute("y", "-4");
      text.textContent = String(group.length);
      badge.append(circle, text);
      this.clusters.appendChild(badge);
    }
  }

  /** Keep the screen-reader list in step with what is plotted and visible. */
  updateA11yList() {
    if (!this.a11yList) return;
    const esc = globalThis.escapeHTML ?? String;
    const items = [];
    for (const t of this.threatData) {
      const g = this.threats.get(t.indicator);
      if (!g || this.isHidden(g)) continue;
      // categorize() already returns "isolated" for a blocked threat, so no
      // separate isolation suffix is needed.
      const cat = this.categorize(t.threatType, t.blocked);
      const est = this.precisionOf(t) === "estimated";
      const place = est
        ? `${t.geo?.region || "unknown region"} (estimated)`
        : (t.geo?.country || "unknown location");
      const score = t.score ?? t.confidence ?? t.geo?.threatScore;
      const label = `${t.indicator}, ${cat}, ${place}` +
        (score != null ? `, severity ${score}` : "");
      items.push(`<li><button type="button" data-indicator="${esc(t.indicator)}">${esc(label)}</button></li>`);
    }
    this.a11yList.innerHTML = items.join("");
  }
}

function bump(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

customElements.define("threat-map", ThreatMap);
