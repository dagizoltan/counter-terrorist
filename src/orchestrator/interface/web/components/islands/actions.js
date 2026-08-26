/**
 * Event delegation for the islands.
 *
 * WHY THIS EXISTS
 * ---------------
 * The console's CSP is `script-src 'self' 'nonce-…' 'strict-dynamic'`. A nonce
 * makes the browser ignore 'unsafe-inline', so an inline `onclick` is refused
 * outright. Twenty-four of them lived inside island template strings — the
 * filter tabs on the threat and artifact explorers, the scanner's mode
 * buttons, "Terminate" on the process tree, "Unblock" on the agent detail —
 * and every one was dead.
 *
 * They were invisible to a page-load sweep because Chromium reports the
 * refusal when the handler would run, not when the attribute is parsed. The
 * page looked fine; nothing happened when you clicked.
 *
 * Islands render their markup as strings, so a listener per button is not
 * practical. One delegated listener on the host is:
 *
 *     bindActions(this, {
 *       setFilter: (el) => this.setFilter(el.dataset.value),
 *       toggleSelect: (el) => this.toggleSelect(el.dataset.indicator),
 *     });
 *
 *     `<button data-action="setFilter" data-value="WIFI">…`
 *     `<input type="checkbox" data-action="toggleSelect" data-on="change" …>`
 *
 * The markup survives a re-render because the listener is on the host, not on
 * anything innerHTML replaces.
 */

const BOUND = new WeakMap();

/**
 * Route `[data-action]` elements inside `host` to `handlers`.
 *
 * An element runs `handlers[data-action]` on click, or on the event named by
 * `data-on` (`change` and `input` for form controls). Call once per element,
 * in connectedCallback — a second call for the same host replaces the map
 * rather than stacking another listener.
 *
 * @param {HTMLElement} host
 * @param {Record<string, (el: HTMLElement, event: Event) => void>} handlers
 */
export function bindActions(host, handlers) {
  const existing = BOUND.get(host);
  if (existing) {
    existing.handlers = handlers;
    return;
  }

  const state = { handlers };
  BOUND.set(host, state);

  const dispatch = (event) => {
    const el = event.target.closest?.("[data-action]");
    // Nested islands: only claim elements this host actually owns.
    if (!el || !host.contains(el)) return;
    if ((el.dataset.on || "click") !== event.type) return;

    const fn = state.handlers[el.dataset.action];
    if (!fn) return;

    // Buttons inside a form would submit; links would navigate.
    if (event.type === "click") event.preventDefault();
    fn(el, event);
  };

  for (const type of ["click", "change", "input"]) {
    host.addEventListener(type, dispatch);
  }
}

/**
 * Run a re-render that replaces `host.innerHTML`, keeping the focused field
 * focused and the caret where the user left it.
 *
 * Islands re-render by rewriting innerHTML wholesale, which destroys the
 * focused element. That never mattered while the search inputs were wired to
 * an inline `oninput` the CSP refused — they did nothing, so nothing
 * re-rendered. Now that they fire, typing into a debounced search box would
 * drop focus mid-word on the first result.
 *
 * The field is matched back by its `data-action`, which survives the rewrite.
 *
 * @param {HTMLElement} host
 * @param {() => void} render
 */
export function preserveFocus(host, render) {
  const active = document.activeElement;
  const keep = active && host.contains(active) && active.dataset?.action
    ? { action: active.dataset.action, start: active.selectionStart, end: active.selectionEnd }
    : null;

  render();
  if (!keep) return;

  const next = host.querySelector(`[data-action="${CSS.escape(keep.action)}"]`);
  if (!next) return;
  next.focus();
  // Only text-ish inputs expose a selection range; setting it elsewhere throws.
  try {
    if (keep.start !== null) next.setSelectionRange(keep.start, keep.end);
  } catch { /* not a text input */ }
}
