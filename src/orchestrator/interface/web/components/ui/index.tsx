import { jsx } from "hono/jsx";

/**
 * Primitive controls.
 *
 * Every component in this file previously built its class names by
 * interpolation — `border-${accentColor}`, `bg-${color}` — against a
 * stylesheet with no such rules. `Card` defaulted to `border-slate-700`,
 * `Badge` to `bg-green-500`; neither existed, so the accent border and the
 * badge itself rendered as nothing. Variants are attributes now.
 */

type State = "ok" | "warn" | "crit" | "info" | "idle";

const STATE_ALIAS: Record<string, State> = {
  ok: "ok", success: "ok", active: "ok", online: "ok",
  warn: "warn", warning: "warn",
  crit: "crit", danger: "crit", error: "crit", offline: "crit",
  info: "info", primary: "info",
  idle: "idle", neutral: "idle", muted: "idle",
};

const toState = (v?: string): State | undefined =>
  v === undefined ? undefined : (STATE_ALIAS[v] ?? "idle");

export const Button = ({
  children,
  variant = "outline",
  status,
  size,
  block = false,
  class: className = "",
  ...props
}: {
  children?: any;
  variant?: "outline" | "solid" | "ghost";
  status?: string;
  size?: "sm" | "lg";
  block?: boolean;
  class?: string;
  [key: string]: any;
}) => (
  <button
    type="button"
    class={`btn${variant === "solid" ? " solid" : variant === "ghost" ? " ghost" : ""}${
      size ? ` btn--${size}` : ""
    }${block ? " btn--block" : ""} ${className}`.trim()}
    data-state={toState(status)}
    {...props}
  >
    {children}
  </button>
);

export const PrimaryButton = ({ children, class: className = "", ...props }: any) => (
  <Button variant="solid" status="info" class={className} {...props}>{children}</Button>
);

export const GhostButton = ({ children, class: className = "", ...props }: any) => (
  <Button variant="ghost" class={className} {...props}>{children}</Button>
);

export const Card = ({
  children,
  title,
  accent,
  class: className = "",
}: {
  children?: any;
  title?: string;
  accent?: string;
  class?: string;
}) => (
  <div class={`panel ${className}`.trim()} data-state={toState(accent)}>
    {title && (
      <header class="panel__head">
        <span class="eyebrow">{title}</span>
      </header>
    )}
    {children}
  </div>
);

export const Badge = ({ status = "ok", pulse = false }: { status?: string; pulse?: boolean }) => (
  <span class="indicator" data-state={toState(status)} data-pulse={pulse ? "" : undefined} aria-hidden="true" />
);

/** A label/value row. Dense by default — this is the console's densest unit. */
export const StatRow = ({ label, value, id, status }: { label: string; value?: any; id?: string; status?: string }) => (
  <div class="stat-row" data-state={toState(status)}>
    <span class="eyebrow">{label}</span>
    <span id={id} class="stat-row__value num">{value}</span>
  </div>
);
