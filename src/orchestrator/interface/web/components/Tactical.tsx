import { jsx } from "hono/jsx";

/**
 * Shared page furniture for the console.
 *
 * Every component here renders a fixed class name. Nothing builds a class by
 * string concatenation: `border-${color}` and `text-${color}` produced names
 * like `border-slate-400/20` that no stylesheet ever defined, so the styling
 * silently evaporated at runtime while the source still read as if it applied.
 * Variants travel as `data-*` attributes, which the stylesheet can match and
 * the build can verify.
 */

/** The five-state vocabulary shared by pills, indicators and panels. */
export type State = "ok" | "warn" | "crit" | "info" | "idle";

/** Legacy call sites still pass success/warning/danger/primary. */
const STATE_ALIAS: Record<string, State> = {
  ok: "ok", success: "ok", active: "ok", online: "ok",
  warn: "warn", warning: "warn",
  crit: "crit", danger: "crit", error: "crit", offline: "crit",
  info: "info", primary: "info",
  idle: "idle", neutral: "idle", muted: "idle",
};

const toState = (v?: string): State => STATE_ALIAS[v ?? ""] ?? "idle";

/**
 * Eyebrow — the console's single label role.
 *
 * This replaces 40+ hand-rolled permutations of
 * `mono-xs font-black uppercase tracking-[0.2em|0.3em|0.4em|0.5em|0.8em]`
 * spread across 7 tracking values, 3 weights and 5 colours, all describing
 * the same element. One size, one weight, one tracking; tone is the only axis.
 */
export const Eyebrow = ({
  children,
  tone,
  tick = false,
  rule = false,
  class: className = "",
}: {
  children: any;
  tone?: "primary" | "success" | "warning" | "danger" | "strong";
  /** Leading accent tick. */
  tick?: boolean;
  /** Trailing hairline to the end of the row — use as a section divider. */
  rule?: boolean;
  class?: string;
}) => (
  <span
    class={`eyebrow${tick ? " eyebrow--tick" : ""}${rule ? " eyebrow--rule" : ""} ${className}`.trim()}
    data-tone={tone}
  >
    {children}
  </span>
);

/**
 * Indicator — the single status dot.
 * Replaces `.dot`, `.danger-dot`, `.status-dot` and ~20 inline
 * `w-1.5 h-1.5 bg-* rounded-full` copies at six different diameters.
 */
export const Indicator = ({
  status,
  pulse = false,
  size,
  class: className = "",
}: {
  status: State | string;
  /** Set for genuinely live signals only. */
  pulse?: boolean;
  size?: "sm" | "lg";
  class?: string;
}) => (
  <span
    class={`indicator${size ? ` indicator--${size}` : ""} ${className}`.trim()}
    data-state={toState(status)}
    data-pulse={pulse ? "" : undefined}
    aria-hidden="true"
  />
);

/**
 * StatusPill — a labelled status.
 *
 * The `active` prop no longer forces green. `.status-pill.active` and
 * `.status-pill.danger` were declared with equal specificity in two separate
 * blocks, so `class="status-pill danger active"` resolved to whichever came
 * last in the file — green. A danger pill rendering as success is the worst
 * failure mode an indicator has, so state is now explicit and singular.
 */
export const StatusPill = ({
  status,
  label,
  dot = false,
  live = false,
  class: className = "",
}: {
  status: State | string;
  label: string;
  /** Render a leading dot inside the pill. */
  dot?: boolean;
  /** Pulse that dot. Implies `dot`. */
  live?: boolean;
  class?: string;
}) => (
  <span
    class={`pill ${className}`.trim()}
    data-state={toState(status)}
    data-dot={live ? "live" : dot ? "" : undefined}
  >
    {label}
  </span>
);

/**
 * TacticalHeader — the page header.
 * Motion comes from the document-level view transition, not from a per-page
 * `animate-in ... duration-700` that never resolved to a keyframe.
 */
export const TacticalHeader = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: any;
}) => (
  <header class="page-header">
    <div class="title-group">
      <h1 class="tactical-title">{title}</h1>
      {subtitle && <span class="subtitle">{subtitle}</span>}
    </div>
    {children && <div class="actions">{children}</div>}
  </header>
);

/**
 * TacticalPanel — the standard surface.
 * `borderColor` and `paddings` are gone: they were interpolated into class
 * names, and a panel that can be any padding is not a design system.
 */
export const TacticalPanel = ({
  children,
  title,
  accent,
  flush = false,
  inset = false,
  actions,
  class: className = "",
}: {
  children: any;
  title?: string;
  /** Tints the panel's top edge to carry a status. */
  accent?: State | string;
  /** Remove padding — for panels that host their own table or chart. */
  flush?: boolean;
  /** Recessed surface, for wells and code. */
  inset?: boolean;
  actions?: any;
  class?: string;
}) => (
  <section
    class={`panel${flush ? " panel--flush" : ""}${inset ? " panel--inset" : ""} ${className}`.trim()}
    data-state={accent ? toState(accent) : undefined}
  >
    {title && (
      <header class="panel__head">
        <span class="panel__title">{title}</span>
        {actions}
      </header>
    )}
    {children}
  </section>
);

/**
 * TacticalSectionTitle — a labelled section divider.
 * Previously emitted `text-${color}` and `border-${color}/20`, neither of
 * which existed, plus `mb-12 pb-6` of dead space above every section.
 */
export const TacticalSectionTitle = ({
  label,
  tone,
}: {
  label: string;
  tone?: "primary" | "success" | "warning" | "danger" | "strong";
}) => (
  <h2 class="section-title">
    <Eyebrow tone={tone} tick rule>{label}</Eyebrow>
  </h2>
);

/**
 * Metric — a headline number.
 * The dashboard rendered these at `text-6xl font-black italic`, a size the
 * stylesheet never declared, so every headline metric fell back to inherited
 * 13px body text.
 */
export const Metric = ({
  label,
  value,
  unit,
  status,
  large = false,
  children,
}: {
  label: string;
  value: any;
  unit?: string;
  status?: State | string;
  large?: boolean;
  children?: any;
}) => (
  <div class="metric" data-state={status ? toState(status) : undefined}>
    <div class="metric__head">
      <Eyebrow>{label}</Eyebrow>
      {children}
    </div>
    <div class={`metric__value${large ? " metric__value--lg" : ""}`}>
      <span class="num">{value}</span>
      {unit && <span class="metric__unit">{unit}</span>}
    </div>
  </div>
);
