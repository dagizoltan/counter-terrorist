# Console Design System

The dashboard is a server-rendered Hono/JSX multi-page app. This document
covers how it is styled, what the rules are, and what to do when you add a
view.

---

## The problem this replaced

The markup was written in Tailwind idiom, but the project ships no Tailwind.
`style.css` was a hand-maintained subset of utility rules. An audit of every
class name used across the views and islands found:

| | |
|---|---|
| Distinct class names in use | 686 |
| **Resolving to no CSS rule at all** | **400** |

`transition-all`, `transition-colors`, every `group-hover:*`, `space-y-*`,
`flex-1`, `shrink-0`, `text-[10px]`, `duration-*`, `backdrop-blur-*`,
`sticky`, `divide-y` and every arbitrary bracket value silently did nothing.
The source read as if the styling applied; the browser dropped it.

Four other systemic faults sat on top of that:

- **Three competing palettes.** `style.css` (HSL cyan), `components/theme.css`
  (slate/`#0f172a`) and `theme.ts` (`--cyber-blue: #0ea5e9`). Only the first
  was ever loaded; the other two were dead weight guaranteeing future drift.
  `theme.ts` was additionally served as a static asset, exposing raw
  TypeScript source over HTTP.
- **Four undeclared custom properties.** `--primary-rgb`, `--danger-rgb`,
  `--success-rgb` and `--slate-800` were referenced 16 times and declared
  nowhere, so every `rgba(var(--primary-rgb), .5)` was an invalid value the
  browser discarded.
- **A remote font dependency.** `style.css` opened with an `@import` of
  `fonts.googleapis.com`, so every dashboard render on a "sovereign" appliance
  made an outbound request to Google carrying the operator's IP, User-Agent and
  Referer — and on an isolated network the type silently fell back mid-session.
- **Class names built by concatenation.** `border-${color}`, `bg-${color}`,
  `text-${color}` produced names no stylesheet defined. This is what let 400
  classes die without anyone noticing.

---

## Structure

```
src/orchestrator/interface/web/
  design/
    01-tokens.css       hand-authored — the only place values are declared
    02-base.css         hand-authored — reset, typography, app shell
    03-components.css   hand-authored — semantic components
    04-motion.css       hand-authored — transitions, view transitions
  style.css             GENERATED — do not edit

src/orchestrator/tools/build/build_css.ts   the generator
```

`style.css` is the four layers concatenated, followed by a utility layer
derived from the class names actually present in the source.

```bash
deno task build-css     # regenerate style.css
deno task check-css     # verify the committed output is current (CI)
```

**The build fails on any class it cannot resolve.** A class that styles nothing
is now a build error rather than an invisible layout bug. If you add markup
using a utility the generator does not know, you get told at build time.

---

## Rules

1. **Never build a class name by concatenation.** Variants travel as
   `data-*` attributes. This is the rule the whole system rests on — a
   concatenated class name cannot be verified by the build.
2. **Never edit `style.css`.** Edit a layer under `design/` and rebuild.
3. **Values live in `01-tokens.css`.** No raw colour, radius, duration or
   spacing value anywhere else.
4. **No webfonts.** System stacks only. An air-gapped appliance must render
   identically to a connected one.
5. **Reach for a component before a utility stack.** If you are writing the
   same six utilities twice, it is a component.

---

## State vocabulary

Every stateful component reads the same five states, so a status looks the
same wherever it appears.

| State  | Meaning               | Legacy aliases accepted            |
|--------|-----------------------|------------------------------------|
| `ok`   | nominal, operational  | `success`, `active`, `online`      |
| `warn` | degraded, attention   | `warning`                          |
| `crit` | failed, hostile       | `danger`, `error`, `offline`       |
| `info` | informational, live   | `primary`                          |
| `idle` | inert, unknown        | `neutral`, `muted`                 |

Set it as `data-state`. An unrecognised value degrades to `idle` — never to a
colour that might read as a status the system did not mean.

> **Regression guarded by test.** `.status-pill.active` and
> `.status-pill.danger` were declared in two separate blocks at equal
> specificity, so `class="status-pill danger active"` resolved to whichever
> came last in the file — **green**. The IP-collections view shipped a danger
> pill rendering as success. The `active` default now sits behind `:where()`
> (zero specificity), so an explicit state always wins. See
> `tests/ui_render_test.ts`.

---

## Components

| Component | Use for | Replaced |
|---|---|---|
| `.eyebrow` | every small uppercase label | 40+ permutations across 7 tracking values, 3 weights, 5 colours |
| `.indicator` | every status dot | `.dot`, `.danger-dot`, `.status-dot`, ~20 inline copies at 6 diameters |
| `.pill` | every labelled status | two conflicting `.status-pill` blocks |
| `.panel` | every surface | `.t-panel` + `.glass-panel` + 4 composited layers per card |
| `.btn` | every action | `.t-btn` and its escaping `::after` sheen |
| `.metric` | every headline number | `text-6xl font-black italic` — a size that never existed |
| `.meter` | every progress bar | inline `style="width:…"` |
| `.panel-stage` | chart/map/log areas | `h-[400px]` literals at 8 different values |

There is **one** eyebrow: mono, 10px, weight 600, `0.14em` tracking. Tone is
the only axis. The 0.2em–0.8em tracking spread it replaced was the single
largest source of visual inconsistency in the console.

---

## Motion

The console is a multi-page app: every nav click is a full document
navigation. There was no transition mechanism for that. What existed was
per-element entry animation across 34 call sites, of which the stylesheet
declared exactly three names — `slide-in-from-top-4`, `slide-in-from-bottom-4`,
`zoom-in`, `zoom-in-95` and every `duration-*` and `delay-*` resolved to
nothing. That mismatch is what read as broken animation on page changes.

Two mechanisms replace it:

1. **Cross-document view transitions** (`@view-transition { navigation: auto }`).
   The rail, deck header and aside are named transition targets, so they hold
   position while the content animates. Browsers without support fall through
   to (2).
2. **One entry animation.** `.enter`, with every legacy `animate-in` combination
   aliased onto it. Direction is honoured; distance and curve are shared, so a
   page reads as one movement rather than eight competing ones.

Durations are clamped to three steps (`--dur-1/2/3`, 120/200/320ms) — a
`duration-1000` cannot run for a second while its neighbours take 200ms.

`prefers-reduced-motion: reduce` is authoritative. Entry animations use `both`
fill-mode from `opacity: 0`, so the reduced-motion block **removes** them and
forces the end state rather than merely stopping them — otherwise content
would be left invisible.

`animate-pulse` was globally neutralised with `animation: none !important`,
which is why every "live" marker sat perfectly still. It is a live 2s breath
again, and only genuinely live signals should carry it.

---

## Security notes

- The stylesheet makes **no outbound requests**. `font-src` and the Google
  origins are gone from the CSP; `object-src 'none'` added.
- `style-src 'unsafe-inline'` is still required: ~95 inline `style=""`
  attributes across the islands set dynamic values. `StatusIndicator.js` shows
  the migration pattern — state as a `data-*` attribute the stylesheet matches.
  When that count reaches zero, `'unsafe-inline'` can be dropped.
- `/theme.ts` no longer serves raw TypeScript source over HTTP.

---

## Adding a view

1. Use `Layout`, `TacticalHeader`, `TacticalPanel`, `Eyebrow`, `StatusPill`,
   `Indicator`, `Metric` from `components/Tactical.tsx`.
2. Pass state via `data-state`, never by interpolating a class name.
3. Run `deno task build-css`. If it fails, it is telling you about a class
   that would have styled nothing.
4. Add render assertions to `tests/ui_render_test.ts`.
