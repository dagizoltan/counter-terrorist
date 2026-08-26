import { jsx } from "hono/jsx";
import { SidebarNav } from "./SidebarNav.tsx";
import { GlobalHeader } from "./GlobalHeader.tsx";
import { Eyebrow } from "./Tactical.tsx";

/**
 * Application shell.
 *
 * Three columns: navigation rail, operational deck, forensic aside. The rail
 * and the aside are named view-transition targets (see design/04-motion.css),
 * so a navigation animates the deck content while the chrome holds still.
 */
export const Layout = (props: {
  title: string;
  children: any;
  csrfToken?: string;
  nonce?: string;
  hostname?: string;
  islandPaths?: string[];
  userRole?: string;
}) => {
  const deckTitle = props.title.split("//")[0].trim();

  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="csrf-token" content={props.csrfToken} />
        <meta name="color-scheme" content="dark" />
        <title>{deckTitle} · {props.hostname || "Sovereign Orchestrator"}</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        <div class="app-shell">

          {/* ── Navigation rail ─────────────────────────────────────── */}
          <aside id="main-sidebar" class="shell-sidebar">
            <header>
              <span class="brand-title">CT ORCH</span>
              <button
                id="sidebar-toggle-btn"
                type="button"
                class="icon-btn"
                aria-expanded="true"
                aria-controls="main-sidebar"
                aria-label="Toggle navigation rail"
              >
                <svg id="sidebar-toggle-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
            </header>

            <SidebarNav userRole={props.userRole} />

            <footer>
              <form method="POST" action="/logout">
                <input type="hidden" name="csrfToken" value={props.csrfToken} />
                <button type="submit" class="btn danger btn--block sidebar-footer-btn" title="Terminate session">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                  <span class="sidebar-footer-text">Terminate</span>
                </button>
              </form>
            </footer>
          </aside>

          {/* ── Operational deck ────────────────────────────────────── */}
          <main class="shell-main">
            <GlobalHeader hostname={props.hostname} title={props.title} />
            <div class="shell-content">{props.children}</div>
          </main>

          {/* ── Forensic aside ──────────────────────────────────────── */}
          <aside class="shell-aside">
            <header>
              <Eyebrow tick>Forensic Audit</Eyebrow>
              <div class="tab-group" role="tablist" aria-label="Forensic panel">
                <button
                  id="btn-logs"
                  type="button"
                  class="icon-btn active"
                  role="tab"
                  aria-selected="true"
                  aria-controls="sidebar-tab-logs"
                  title="Live telemetry"
                  data-tab="logs"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M21 12H3" /><path d="M21 6H3" /><path d="M21 18H3" /><path d="M10 6v12" /></svg>
                </button>
                <button
                  id="btn-integrity"
                  type="button"
                  class="icon-btn"
                  role="tab"
                  aria-selected="false"
                  aria-controls="sidebar-tab-integrity"
                  title="System integrity"
                  data-tab="integrity"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                </button>
              </div>
            </header>

            <div class="aside-body custom-scrollbar">
              <section id="sidebar-tab-logs" class="sidebar-tab-content" role="tabpanel" aria-labelledby="btn-logs">
                <div class="aside-section-head">
                  <Eyebrow tick>Live Telemetry</Eyebrow>
                  <span class="pill" data-state="ok" data-dot="live">Live</span>
                </div>
                <mini-log id="sidebar-log"></mini-log>
              </section>

              <section id="sidebar-tab-integrity" class="sidebar-tab-content hidden" role="tabpanel" aria-labelledby="btn-integrity">
                <div class="aside-section-head">
                  <Eyebrow tick>System Health</Eyebrow>
                </div>
                <system-health></system-health>
              </section>
            </div>

            <footer>
              <div class="trust-meter">
                <div class="trust-meter__row">
                  <Eyebrow>Operational Trust</Eyebrow>
                  <span class="trust-meter__value num" id="stat-trust-score">—</span>
                </div>
                <div class="meter" id="stat-trust-meter" data-state="idle" data-value="0"></div>
              </div>
            </footer>
          </aside>

        </div>

        {/* Global orchestration components */}
        <metrics-hydrator></metrics-hydrator>
        <alert-overlay></alert-overlay>
        <toast-manager></toast-manager>

        <script type="module" src="/components/islands/SharedWebSocket.js" nonce={props.nonce}></script>
        <script type="module" src="/components/islands/MetricsHydrator.js" nonce={props.nonce}></script>
        <script type="module" src="/components/islands/AlertOverlay.js" nonce={props.nonce}></script>
        <script type="module" src="/components/islands/ToastManager.js" nonce={props.nonce}></script>
        <script type="module" src="/components/islands/SystemHealth.js" nonce={props.nonce}></script>
        <script type="module" src="/components/islands/MiniLog.js" nonce={props.nonce}></script>

        {props.islandPaths?.map((path) => (
          !["SharedWebSocket.js", "MetricsHydrator.js", "AlertOverlay.js", "ToastManager.js", "SystemHealth.js", "MiniLog.js"].some((f) => path.includes(f)) &&
          <script type="module" src={path} nonce={props.nonce}></script>
        ))}

        <script nonce={props.nonce} dangerouslySetInnerHTML={{ __html: `
          // ── Shell state ────────────────────────────────────────────────
          // CSRF lives in the meta tag, never on window (SEC-02).

          var RAIL_KEY = 'sovereign_sidebar_collapsed';
          var TAB_KEY = 'sovereign_aside_tab';

          function markActiveNav() {
            var path = window.location.pathname;
            var best = null;
            var bestLen = -1;

            // Longest-prefix wins. The previous build marked every link whose
            // href was a prefix of the path, so /agents stayed lit while
            // /agents/deception was open and two rows read as active at once.
            document.querySelectorAll('.nav-link').forEach(function (link) {
              var href = link.getAttribute('href');
              if (!href) return;
              link.classList.remove('active');
              link.removeAttribute('aria-current');
              var match = path === href || path.indexOf(href + '/') === 0;
              if (match && href.length > bestLen) { best = link; bestLen = href.length; }
            });

            if (best) {
              best.classList.add('active');
              best.setAttribute('aria-current', 'page');
            }
          }

          function tickClock() {
            var clock = document.getElementById('system-clock');
            if (clock) {
              clock.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
            }
          }

          markActiveNav();
          tickClock();

          // The previous build ran the full interface sync — including a
          // querySelectorAll over every nav link — on a 1s setInterval. Only
          // the clock is time-dependent; navigation state changes on
          // navigation.
          setInterval(tickClock, 1000);
          window.addEventListener('popstate', markActiveNav);
          window.addEventListener('pageshow', markActiveNav);

          window.escapeHTML = function (str) {
            if (str === null || str === undefined) return '';
            return String(str)
              .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
          };

          // ── Navigation rail ────────────────────────────────────────────
          function applyRailState(collapsed) {
            var rail = document.getElementById('main-sidebar');
            var shell = document.querySelector('.app-shell');
            var icon = document.getElementById('sidebar-toggle-icon');
            var btn = document.getElementById('sidebar-toggle-btn');
            if (!rail || !shell) return;

            rail.classList.toggle('collapsed', collapsed);
            shell.classList.toggle('sidebar-is-collapsed', collapsed);
            if (btn) btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            if (icon) {
              icon.innerHTML = collapsed
                ? '<polyline points="9 18 15 12 9 6"/>'
                : '<polyline points="15 18 9 12 15 6"/>';
            }
          }

          window.toggleSidebar = function () {
            var rail = document.getElementById('main-sidebar');
            if (!rail) return;
            var collapsed = !rail.classList.contains('collapsed');
            applyRailState(collapsed);
            try { localStorage.setItem(RAIL_KEY, collapsed ? 'true' : 'false'); } catch (e) {}
          };

          // ── Forensic aside tabs ────────────────────────────────────────
          window.switchSidebarTab = function (tab) {
            document.querySelectorAll('.sidebar-tab-content').forEach(function (panel) {
              panel.classList.add('hidden');
            });
            var active = document.getElementById('sidebar-tab-' + tab);
            if (active) active.classList.remove('hidden');

            ['logs', 'integrity'].forEach(function (name) {
              var btn = document.getElementById('btn-' + name);
              if (!btn) return;
              var on = name === tab;
              btn.classList.toggle('active', on);
              btn.setAttribute('aria-selected', on ? 'true' : 'false');
            });

            try { localStorage.setItem(TAB_KEY, tab); } catch (e) {}
          };

          // ── Percentage bars ────────────────────────────────────────────
          // An inline style attribute is refused under style-src 'self' — both
          // in server-rendered markup and when written through innerHTML.
          // CSSOM writes are not, so a bar carries its value as data-value and
          // the custom property is set here. applyMeters is exposed so islands
          // can call it after they re-render.
          window.applyMeters = function (root) {
            var scope = root || document;
            var all = Array.prototype.slice.call(scope.querySelectorAll('[data-value]'));
            if (scope.nodeType === 1 && scope.hasAttribute && scope.hasAttribute('data-value')) all.push(scope);
            all.forEach(function (el) {
              var v = Number(el.getAttribute('data-value'));
              if (!isFinite(v)) return;
              el.style.setProperty('--value', Math.max(0, Math.min(100, v)) + '%');
            });
          };
          window.applyMeters();

          // Islands re-render through innerHTML, so bars appear after this
          // runs. Watching the tree keeps them filled without every island
          // having to remember to call applyMeters itself.
          new MutationObserver(function (records) {
            for (var i = 0; i < records.length; i++) {
              var added = records[i].addedNodes;
              for (var j = 0; j < added.length; j++) {
                var node = added[j];
                if (node.nodeType !== 1) continue;
                if (node.hasAttribute('data-value')) window.applyMeters(node.parentNode);
                else if (node.querySelector && node.querySelector('[data-value]')) window.applyMeters(node);
              }
            }
          }).observe(document.body, { childList: true, subtree: true });

          // ── Bind shell controls ────────────────────────────────────────
          // Not inline onclick attributes: the CSP sets a nonce on script-src,
          // which makes the browser ignore 'unsafe-inline' and refuse every
          // inline event handler ("Refused to execute inline event handler").
          // This block carries the nonce, so listeners bound here do run.
          (function bindShell() {
            var toggle = document.getElementById('sidebar-toggle-btn');
            if (toggle) toggle.addEventListener('click', function () { window.toggleSidebar(); });

            document.querySelectorAll('[data-tab]').forEach(function (btn) {
              btn.addEventListener('click', function () {
                window.switchSidebarTab(btn.getAttribute('data-tab'));
              });
            });
          })();

          // ── Declarative actions ────────────────────────────────────────
          // One delegated listener for the simple button actions that used to
          // be written as inline onclick attributes — every one of which the
          // CSP refused to run. Markup declares intent:
          //
          //   data-action="reload"
          //   data-action="post"  data-url="/api/…"
          //                       [data-body='{"type":"X"}']
          //                       [data-input="element-id" data-field="ip"]
          //                       [data-confirm="Are you sure?"]
          //                       [data-reload]
          //   data-action="invoke" data-target="forensic-vault" data-method="…"
          //   data-action="call"   data-fn="globalFunctionName"
          //
          // The CSRF token is attached here, so no call site can forget it —
          // one of them already did, and would have been rejected 403.
          document.addEventListener('click', function (event) {
            var el = event.target.closest && event.target.closest('[data-action]');
            if (!el) return;

            var action = el.getAttribute('data-action');
            // Islands use data-action too, routed by their own delegated
            // listener (islands/actions.js) to a method on the element. Their
            // action names are verbs — setFilter, toggleSelect, purge, morph —
            // so an explicit whitelist keeps the two systems from overlapping.
            if (['reload', 'post', 'invoke', 'call'].indexOf(action) === -1) return;

            if (action === 'reload') {
              event.preventDefault();
              return location.reload();
            }

            if (action === 'invoke') {
              event.preventDefault();
              var target = document.querySelector(el.getAttribute('data-target') || '');
              var method = el.getAttribute('data-method');
              if (target && method && typeof target[method] === 'function') target[method]();
              return;
            }

            if (action === 'call') {
              event.preventDefault();
              var fn = window[el.getAttribute('data-fn')];
              if (typeof fn === 'function') fn();
              return;
            }

            if (action !== 'post') return;
            event.preventDefault();

            var confirmText = el.getAttribute('data-confirm');
            if (confirmText && !confirm(confirmText)) return;

            var url = el.getAttribute('data-url');
            if (!url) return;

            var body = null;
            var raw = el.getAttribute('data-body');
            if (raw) {
              try { body = JSON.parse(raw); } catch (e) { body = null; }
            }

            var inputId = el.getAttribute('data-input');
            if (inputId) {
              var input = document.getElementById(inputId);
              var field = el.getAttribute('data-field') || 'value';
              if (!input || !input.value) return;
              body = body || {};
              body[field] = input.value;
            }

            var token = document.querySelector('meta[name="csrf-token"]');
            var headers = { 'X-CT-Token': token ? token.content : '' };
            if (body) headers['Content-Type'] = 'application/json';

            el.disabled = true;
            fetch(url, {
              method: 'POST',
              headers: headers,
              body: body ? JSON.stringify(body) : undefined
            }).then(function (res) {
              if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
              if (el.hasAttribute('data-reload')) location.reload();
            }).catch(function (e) {
              console.error('[action] ' + url + ' failed:', e.message);
              if (window.showToast) window.showToast(url + ' failed: ' + e.message, 'error');
            }).finally(function () {
              el.disabled = false;
            });
          });

          // ── Restore persisted shell state ──────────────────────────────
          // Runs inline so the rail is already in its stored position before
          // first paint; the previous build restored it after the grid had
          // been laid out at full width, which flashed on every navigation.
          (function restore() {
            var collapsed = false;
            var tab = 'logs';
            try {
              collapsed = localStorage.getItem(RAIL_KEY) === 'true';
              tab = localStorage.getItem(TAB_KEY) || 'logs';
            } catch (e) {}
            applyRailState(collapsed);
            window.switchSidebarTab(tab);
          })();
        ` }} />
      </body>
    </html>
  );
};
