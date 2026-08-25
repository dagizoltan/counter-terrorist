/**
 * build_css.ts — Sovereign console stylesheet builder.
 *
 * WHY THIS EXISTS
 * ---------------
 * The console markup is written in Tailwind idiom but the project ships no
 * Tailwind. `style.css` was a hand-maintained subset, and an audit of the
 * 686 distinct class names used across the views and islands found that
 * 400 of them matched no rule in the stylesheet at all — `transition-all`,
 * `group-hover:*`, `space-y-*`, `flex-1`, `shrink-0`, `text-[10px]`,
 * `duration-*`, `backdrop-blur-*`, `sticky`, `divide-y` and every arbitrary
 * bracket value silently did nothing.
 *
 * Hand-adding 400 rules would fix today and rot by the next page. Instead
 * this tool derives the utility layer from the source that uses it, and
 * fails the build on any class it cannot resolve. A dead class is now a
 * build error rather than an invisible layout bug.
 *
 *   deno task build-css          # regenerate web/style.css
 *   deno task build-css --check  # verify committed output is current (CI)
 *
 * Layers 01-04 under web/design are authored by hand and concatenated
 * ahead of the generated utilities, so semantic components always win the
 * cascade over a utility of equal specificity.
 */

const WEB_ROOT = new URL("../../interface/web/", import.meta.url).pathname;
const DESIGN_DIR = `${WEB_ROOT}design/`;
const OUT = `${WEB_ROOT}style.css`;

/* ── Scale tables ──────────────────────────────────────────────────────── */

const SPACE: Record<string, string> = {
  "0": "0", "px": "1px", "0.5": "0.125rem", "1": "0.25rem", "1.5": "0.375rem",
  "2": "0.5rem", "2.5": "0.625rem", "3": "0.75rem", "3.5": "0.875rem",
  "4": "1rem", "5": "1.25rem", "6": "1.5rem", "7": "1.75rem", "8": "2rem",
  "9": "2.25rem", "10": "2.5rem", "11": "2.75rem", "12": "3rem", "14": "3.5rem",
  "16": "4rem", "20": "5rem", "24": "6rem", "28": "7rem", "32": "8rem",
  "36": "9rem", "40": "10rem", "48": "12rem", "56": "14rem", "64": "16rem",
  "auto": "auto", "full": "100%", "screen": "100vh",
  "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%",
  "3/4": "75%", "1/6": "16.666667%", "5/6": "83.333333%",
};

/** Type ramp. Legacy `text-Nxl` sizes are pulled onto the token scale so a
 *  page cannot introduce a ninth heading size by accident. */
const FONT_SIZE: Record<string, string> = {
  "xs": "var(--t-micro)", "sm": "var(--t-xs)", "base": "var(--t-sm)",
  "lg": "var(--t-base)", "xl": "var(--t-md)", "2xl": "var(--t-lg)",
  "3xl": "var(--t-lg)", "4xl": "var(--t-xl)", "5xl": "var(--t-xl)",
  "6xl": "var(--t-2xl)", "7xl": "var(--t-2xl)",
};

const RADIUS: Record<string, string> = {
  "": "var(--r-sm)", "none": "0", "sm": "var(--r-sm)", "md": "var(--r-md)",
  "lg": "var(--r-lg)", "xl": "var(--r-xl)", "2xl": "var(--r-xl)",
  "3xl": "var(--r-xl)", "full": "var(--r-pill)",
};

const WEIGHT: Record<string, string> = {
  thin: "200", light: "300", normal: "400", medium: "500",
  semibold: "600", bold: "650", extrabold: "700", black: "750",
};

const TRACKING: Record<string, string> = {
  tighter: "-0.03em", tight: "var(--track-tight)", normal: "0",
  wide: "0.02em", wider: "0.06em", widest: "var(--track-label)",
};

const LEADING: Record<string, string> = {
  none: "1", tight: "1.2", snug: "1.32", normal: "1.45",
  relaxed: "1.6", loose: "1.9",
};

/** Accent + neutral palette. Everything resolves to a token; the slate/blue/
 *  green/red ladders left over from the pre-token markup are folded onto the
 *  text ramp and accents so no fourth palette can re-enter through markup. */
const COLOR: Record<string, string> = {
  primary: "var(--primary)", success: "var(--success)",
  warning: "var(--warning)", danger: "var(--danger)",
  white: "var(--text-1)", black: "var(--surface-0)",
  transparent: "transparent", current: "currentColor",
  "panel-bg": "var(--surface-2)", muted: "var(--muted)",
  "slate-100": "var(--text-1)", "slate-200": "var(--text-1)",
  "slate-300": "var(--text-2)", "slate-400": "var(--text-2)",
  "slate-500": "var(--text-3)", "slate-600": "var(--text-3)",
  "slate-700": "var(--text-4)", "slate-800": "var(--surface-3)",
  "slate-900": "var(--surface-1)", "slate-950": "var(--surface-0)",
  "blue-400": "var(--primary)", "blue-500": "var(--primary)", "blue-600": "var(--primary)",
  "green-400": "var(--success)", "green-500": "var(--success)",
  "red-400": "var(--danger)", "red-500": "var(--danger)",
  "yellow-400": "var(--warning)", "yellow-500": "var(--warning)",
};

/** HSL triplets for the accents, so `bg-primary/20` can be emitted as a real
 *  alpha blend instead of an opaque approximation. */
const COLOR_HSL: Record<string, string> = {
  primary: "var(--primary-hsl)", success: "var(--success-hsl)",
  warning: "var(--warning-hsl)", danger: "var(--danger-hsl)",
  muted: "var(--muted-hsl)",
};

/* ── Helpers ───────────────────────────────────────────────────────────── */

/** Escape a class name for use in a selector: `w-1/2` -> `w-1\/2`. */
function esc(cls: string): string {
  return cls.replace(/[^a-zA-Z0-9_-]/g, (ch) => "\\" + ch);
}

/** Unwrap `[...]`: Tailwind encodes spaces as underscores. */
function arb(v: string): string {
  return v.slice(1, -1).replace(/_/g, " ");
}

function isArb(v: string): boolean {
  return v.startsWith("[") && v.endsWith("]");
}

/** Resolve a colour token, with optional `/NN` alpha. */
function color(token: string): string | null {
  const m = token.match(/^(.+?)\/(\[[^\]]+\]|[\d.]+)$/);
  if (!m) {
    if (isArb(token)) return arb(token);
    return COLOR[token] ?? null;
  }
  const [, name, rawAlpha] = m;
  const alpha = isArb(rawAlpha) ? arb(rawAlpha) : String(Number(rawAlpha) / 100);
  if (isArb(name)) return `color-mix(in srgb, ${arb(name)} ${Number(alpha) * 100}%, transparent)`;
  if (COLOR_HSL[name]) return `hsl(${COLOR_HSL[name]} / ${alpha})`;
  const base = COLOR[name];
  if (!base) return null;
  if (name === "white") return `hsl(0 0% 100% / ${alpha})`;
  if (name === "black") return `hsl(225 40% 2% / ${alpha})`;
  return `color-mix(in srgb, ${base} ${Number(alpha) * 100}%, transparent)`;
}

/** Resolve a length: scale key, or arbitrary bracket value. */
function len(v: string): string | null {
  if (isArb(v)) return arb(v);
  return SPACE[v] ?? null;
}

/* ── Utility resolution ────────────────────────────────────────────────── */

type Decl = string | null;

const STATIC: Record<string, string> = {
  // display
  block: "display:block", "inline-block": "display:inline-block",
  inline: "display:inline", flex: "display:flex", "inline-flex": "display:inline-flex",
  grid: "display:grid", "inline-grid": "display:inline-grid",
  contents: "display:contents", table: "display:table", hidden: "display:none",
  // flex
  "flex-row": "flex-direction:row", "flex-col": "flex-direction:column",
  "flex-wrap": "flex-wrap:wrap", "flex-nowrap": "flex-wrap:nowrap",
  "flex-grow": "flex-grow:1", "flex-shrink-0": "flex-shrink:0",
  grow: "flex-grow:1", "grow-0": "flex-grow:0",
  shrink: "flex-shrink:1", "shrink-0": "flex-shrink:0",
  // alignment
  "items-start": "align-items:flex-start", "items-center": "align-items:center",
  "items-end": "align-items:flex-end", "items-baseline": "align-items:baseline",
  "items-stretch": "align-items:stretch",
  "justify-start": "justify-content:flex-start", "justify-center": "justify-content:center",
  "justify-end": "justify-content:flex-end", "justify-between": "justify-content:space-between",
  "justify-around": "justify-content:space-around", "justify-evenly": "justify-content:space-evenly",
  "self-start": "align-self:flex-start", "self-center": "align-self:center",
  "self-end": "align-self:flex-end", "self-stretch": "align-self:stretch",
  "content-center": "align-content:center",
  // position
  static: "position:static", relative: "position:relative", absolute: "position:absolute",
  fixed: "position:fixed", sticky: "position:sticky",
  "inset-0": "inset:0", "inset-x-0": "left:0;right:0", "inset-y-0": "top:0;bottom:0",
  // sizing
  "w-full": "width:100%", "h-full": "height:100%", "w-px": "width:1px", "h-px": "height:1px",
  "w-auto": "width:auto", "h-auto": "height:auto",
  "h-screen": "height:100vh", "w-screen": "width:100vw",
  "min-w-0": "min-width:0", "min-h-0": "min-height:0",
  "min-h-screen": "min-height:100vh", "max-w-full": "max-width:100%",
  "mx-auto": "margin-left:auto;margin-right:auto",
  // typography
  uppercase: "text-transform:uppercase", lowercase: "text-transform:lowercase",
  capitalize: "text-transform:capitalize", "normal-case": "text-transform:none",
  italic: "font-style:italic", "not-italic": "font-style:normal",
  "font-sans": "font-family:var(--font-sans)", "font-mono": "font-family:var(--font-mono)",
  "text-left": "text-align:left", "text-center": "text-align:center",
  "text-right": "text-align:right",
  underline: "text-decoration:underline", "no-underline": "text-decoration:none",
  "line-through": "text-decoration:line-through",
  truncate: "overflow:hidden;text-overflow:ellipsis;white-space:nowrap",
  "break-all": "word-break:break-all", "break-words": "overflow-wrap:break-word",
  "whitespace-nowrap": "white-space:nowrap", "whitespace-pre-wrap": "white-space:pre-wrap",
  "tabular-nums": "font-variant-numeric:tabular-nums",
  // borders
  border: "border:1px solid var(--line-faint)",
  "border-t": "border-top:1px solid var(--line-faint)",
  "border-r": "border-right:1px solid var(--line-faint)",
  "border-b": "border-bottom:1px solid var(--line-faint)",
  "border-l": "border-left:1px solid var(--line-faint)",
  "border-y": "border-top:1px solid var(--line-faint);border-bottom:1px solid var(--line-faint)",
  "border-x": "border-left:1px solid var(--line-faint);border-right:1px solid var(--line-faint)",
  "border-none": "border:none", "border-solid": "border-style:solid",
  "border-dashed": "border-style:dashed", "border-dotted": "border-style:dotted",
  "border-collapse": "border-collapse:collapse",
  "border-t-transparent": "border-top-color:transparent",
  "border-transparent": "border-color:transparent",
  "divide-y": "@child border-top:1px solid var(--line-faint)",
  "divide-x": "@child border-left:1px solid var(--line-faint)",
  // effects
  "shadow-none": "box-shadow:none",
  "shadow-sm": "box-shadow:var(--elev-1)",
  shadow: "box-shadow:var(--elev-1)",
  "shadow-md": "box-shadow:var(--elev-2)",
  "shadow-lg": "box-shadow:var(--elev-2)",
  "shadow-xl": "box-shadow:var(--elev-3)",
  "shadow-2xl": "box-shadow:var(--elev-3)",
  "shadow-inner": "box-shadow:inset 0 1px 2px hsl(225 40% 2% / 0.4)",
  "shadow-primary": "box-shadow:var(--shadow-primary)",
  "shadow-success": "box-shadow:var(--shadow-success)",
  "shadow-warning": "box-shadow:var(--shadow-warning)",
  "shadow-danger": "box-shadow:var(--shadow-danger)",
  "mix-blend-overlay": "mix-blend-mode:overlay",
  "mix-blend-screen": "mix-blend-mode:screen",
  // interaction
  "pointer-events-none": "pointer-events:none", "pointer-events-auto": "pointer-events:auto",
  "cursor-pointer": "cursor:pointer", "cursor-default": "cursor:default",
  "cursor-not-allowed": "cursor:not-allowed",
  "select-none": "user-select:none", "select-all": "user-select:all",
  "select-text": "user-select:text",
  "appearance-none": "appearance:none", "outline-none": "outline:none",
  "resize-none": "resize:none",
  // overflow
  "overflow-hidden": "overflow:hidden", "overflow-visible": "overflow:visible",
  "overflow-auto": "overflow:auto", "overflow-scroll": "overflow:scroll",
  "overflow-x-auto": "overflow-x:auto", "overflow-y-auto": "overflow-y:auto",
  "overflow-x-hidden": "overflow-x:hidden", "overflow-y-hidden": "overflow-y:hidden",
  // table
  "table-fixed": "table-layout:fixed", "table-auto": "table-layout:auto",
  // transform
  transform: "transform:translateZ(0)",
  "transform-none": "transform:none",
  // misc
  container: "width:100%;max-width:var(--content-max);margin-inline:auto",
  "sr-only": "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0",
  "col-span-full": "grid-column:1/-1",
  "group": "@marker",
};

/** Pattern-matched utilities. Order matters: first match wins. */
function resolve(cls: string): Decl {
  if (cls in STATIC) return STATIC[cls] || null;

  let m: RegExpMatchArray | null;

  // Named group hooks (`group/item`) carry no style of their own; they are
  // the anchor that `group-hover/item:*` resolves against.
  if (/^group\/[A-Za-z0-9_-]+$/.test(cls)) return "@marker";

  // ── spacing ──
  if ((m = cls.match(/^-?(p|m)([xytrbl])?-(.+)$/))) {
    const neg = cls.startsWith("-") ? "-" : "";
    const [, prop, axis, raw] = m;
    const v = len(raw);
    if (!v) return null;
    const val = neg && v !== "auto" ? `-${v}` : v;
    const base = prop === "p" ? "padding" : "margin";
    const map: Record<string, string[]> = {
      x: [`${base}-left`, `${base}-right`], y: [`${base}-top`, `${base}-bottom`],
      t: [`${base}-top`], r: [`${base}-right`], b: [`${base}-bottom`], l: [`${base}-left`],
    };
    const props = axis ? map[axis] : [base];
    return props.map((p) => `${p}:${val}`).join(";");
  }

  // ── space-y / space-x (child-gap) ──
  if ((m = cls.match(/^space-(y|x)-(.+)$/))) {
    const v = len(m[2]);
    if (!v) return null;
    return m[1] === "y" ? `@child margin-top:${v}` : `@child margin-left:${v}`;
  }

  // ── gap ──
  if ((m = cls.match(/^gap(-[xy])?-(.+)$/))) {
    const v = len(m[2]);
    if (!v) return null;
    if (m[1] === "-x") return `column-gap:${v}`;
    if (m[1] === "-y") return `row-gap:${v}`;
    return `gap:${v}`;
  }

  // ── sizing ──
  if ((m = cls.match(/^(w|h)-(.+)$/))) {
    const v = len(m[2]);
    if (!v) return null;
    return `${m[1] === "w" ? "width" : "height"}:${v}`;
  }
  if ((m = cls.match(/^(min|max)-(w|h)-(.+)$/))) {
    const v = len(m[3]) ?? (isArb(m[3]) ? arb(m[3]) : null) ??
      ({ xs: "20rem", sm: "24rem", md: "28rem", lg: "32rem", xl: "36rem", "2xl": "42rem" } as Record<string, string>)[m[3]];
    if (!v) return null;
    return `${m[1]}-${m[2] === "w" ? "width" : "height"}:${v}`;
  }

  // ── position offsets ──
  if ((m = cls.match(/^-?(top|right|bottom|left)-(.+)$/))) {
    const neg = cls.startsWith("-") ? "-" : "";
    const v = len(m[2]);
    if (!v) return null;
    return `${m[1]}:${neg && v !== "auto" ? `-${v}` : v}`;
  }

  // ── z-index ──
  if ((m = cls.match(/^z-(.+)$/))) {
    const v = isArb(m[1]) ? arb(m[1]) : m[1];
    return /^-?\d+$|^auto$/.test(v) ? `z-index:${v}` : null;
  }

  // ── grid ──
  if ((m = cls.match(/^grid-cols-(\d+)$/))) return `grid-template-columns:repeat(${m[1]},minmax(0,1fr))`;
  if ((m = cls.match(/^grid-rows-(\d+)$/))) return `grid-template-rows:repeat(${m[1]},minmax(0,1fr))`;
  if ((m = cls.match(/^col-span-(\d+)$/))) return `grid-column:span ${m[1]}/span ${m[1]}`;
  if ((m = cls.match(/^row-span-(\d+)$/))) return `grid-row:span ${m[1]}/span ${m[1]}`;
  if ((m = cls.match(/^col-start-(\d+)$/))) return `grid-column-start:${m[1]}`;

  // ── flex shorthand ──
  if ((m = cls.match(/^flex-(\d+|\[[^\]]+\]|auto|initial|none)$/))) {
    const v = isArb(m[1]) ? arb(m[1]) : m[1];
    return `flex:${v === "auto" ? "1 1 auto" : v === "none" ? "none" : v === "initial" ? "0 1 auto" : `${v} ${v} 0%`}`;
  }

  // ── typography ──
  if ((m = cls.match(/^text-(\[.+\])$/))) return `font-size:${arb(m[1])}`;
  if ((m = cls.match(/^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl)$/))) return `font-size:${FONT_SIZE[m[1]]}`;
  if ((m = cls.match(/^font-(\d+|thin|light|normal|medium|semibold|bold|extrabold|black)$/))) {
    return `font-weight:${WEIGHT[m[1]] ?? m[1]}`;
  }
  if ((m = cls.match(/^tracking-(.+)$/))) {
    const v = isArb(m[1]) ? arb(m[1]) : TRACKING[m[1]];
    return v ? `letter-spacing:${v}` : null;
  }
  if ((m = cls.match(/^leading-(.+)$/))) {
    const v = isArb(m[1]) ? arb(m[1]) : LEADING[m[1]];
    return v ? `line-height:${v}` : null;
  }
  if ((m = cls.match(/^line-clamp-(\d+)$/))) {
    return `display:-webkit-box;-webkit-line-clamp:${m[1]};-webkit-box-orient:vertical;overflow:hidden`;
  }
  if ((m = cls.match(/^decoration-(.+)$/))) {
    const c = color(m[1]);
    return c ? `text-decoration-color:${c}` : null;
  }

  // ── gradients ──
  if (cls === "bg-gradient-to-r") return "background-image:linear-gradient(to right,var(--g-from,transparent),var(--g-via,transparent),var(--g-to,transparent))";
  if (cls === "bg-gradient-to-l") return "background-image:linear-gradient(to left,var(--g-from,transparent),var(--g-via,transparent),var(--g-to,transparent))";
  if (cls === "bg-gradient-to-b") return "background-image:linear-gradient(to bottom,var(--g-from,transparent),var(--g-via,transparent),var(--g-to,transparent))";
  if (cls === "bg-gradient-to-t") return "background-image:linear-gradient(to top,var(--g-from,transparent),var(--g-via,transparent),var(--g-to,transparent))";

  // ── colour ──
  if ((m = cls.match(/^text-(.+)$/))) {
    const c = color(m[1]);
    return c ? `color:${c}` : null;
  }
  if ((m = cls.match(/^bg-(.+)$/))) {
    const raw = m[1];
    if (isArb(raw)) {
      const v = arb(raw);
      if (v.startsWith("length:")) return `background-size:${v.slice(7)}`;
      if (/^(linear|radial|conic)-gradient|^url\(/.test(v)) return `background-image:${v}`;
      return `background-color:${v}`;
    }
    const c = color(raw);
    return c ? `background-color:${c}` : null;
  }
  if ((m = cls.match(/^(?:border|divide)-(.+)$/))) {
    const raw = m[1];
    if (/^\d+$/.test(raw)) return `border-width:${raw}px`;
    if ((m = raw.match(/^([trbl])-(\d+)$/))) {
      const side = { t: "top", r: "right", b: "bottom", l: "left" }[m[1]]!;
      return `border-${side}-width:${m[2]}px`;
    }
    if ((m = raw.match(/^([xy])-(\d+)$/))) {
      const sides = m[1] === "x" ? ["left", "right"] : ["top", "bottom"];
      return sides.map((sd) => `border-${sd}-width:${m![2]}px`).join(";");
    }
    const c = color(raw);
    if (!c) return null;
    return cls.startsWith("divide-") ? `@child border-top-color:${c}` : `border-color:${c}`;
  }

  // ── radius ──
  if ((m = cls.match(/^rounded(?:-(.+))?$/))) {
    const k = m[1] ?? "";
    if (isArb(k)) return `border-radius:${arb(k)}`;
    if (k in RADIUS) return `border-radius:${RADIUS[k]}`;
    if ((m = k.match(/^(t|r|b|l|tl|tr|bl|br)(?:-(.+))?$/))) {
      const r = RADIUS[m[2] ?? ""] ?? "var(--r-sm)";
      const corners: Record<string, string[]> = {
        t: ["top-left", "top-right"], b: ["bottom-left", "bottom-right"],
        l: ["top-left", "bottom-left"], r: ["top-right", "bottom-right"],
        tl: ["top-left"], tr: ["top-right"], bl: ["bottom-left"], br: ["bottom-right"],
      };
      return corners[m[1]].map((c) => `border-${c}-radius:${r}`).join(";");
    }
    return null;
  }

  // ── opacity ──
  if ((m = cls.match(/^opacity-(.+)$/))) {
    const v = isArb(m[1]) ? arb(m[1]) : String(Number(m[1]) / 100);
    return Number.isNaN(Number(v)) ? null : `opacity:${v}`;
  }

  // ── filters ──
  if ((m = cls.match(/^blur(?:-(.+))?$/))) {
    const k = m[1] ?? "";
    const v = isArb(k) ? arb(k)
      : ({ "": "8px", sm: "4px", md: "12px", lg: "16px", xl: "24px", "2xl": "40px", "3xl": "64px", none: "0" } as Record<string, string>)[k];
    return v ? `filter:blur(${v})` : null;
  }
  if ((m = cls.match(/^backdrop-blur(?:-(.+))?$/))) {
    const k = m[1] ?? "";
    const v = isArb(k) ? arb(k)
      : ({ "": "8px", sm: "4px", md: "12px", lg: "16px", xl: "20px", "2xl": "28px", none: "0" } as Record<string, string>)[k];
    return v ? `backdrop-filter:blur(${v});-webkit-backdrop-filter:blur(${v})` : null;
  }

  // ── shadows (arbitrary) ──
  if ((m = cls.match(/^shadow-(\[.+\])$/))) return `box-shadow:${arb(m[1])}`;
  if ((m = cls.match(/^shadow-(.+)$/))) {
    const c = color(m[1]);
    return c ? `box-shadow:0 0 0 1px ${c}` : null;
  }

  // ── transforms ──
  if ((m = cls.match(/^-?scale-(\d+)$/))) {
    const s = Number(m[1]) / 100;
    return `transform:scale(${cls.startsWith("-") ? -s : s})`;
  }
  if ((m = cls.match(/^-?rotate-(\d+)$/))) {
    return `transform:rotate(${cls.startsWith("-") ? "-" : ""}${m[1]}deg)`;
  }
  if ((m = cls.match(/^-?translate-(x|y)-(.+)$/))) {
    const v = len(m[2]);
    if (!v) return null;
    const val = cls.startsWith("-") ? `-${v}` : v;
    return `transform:translate${m[1].toUpperCase()}(${val})`;
  }

  if ((m = cls.match(/^from-(.+)$/))) { const c = color(m[1]); return c ? `--g-from:${c}` : null; }
  if ((m = cls.match(/^via-(.+)$/)))  { const c = color(m[1]); return c ? `--g-via:${c}` : null; }
  if ((m = cls.match(/^to-(.+)$/)))   { const c = color(m[1]); return c ? `--g-to:${c}` : null; }

  // ── accent (form controls) ──
  if ((m = cls.match(/^accent-(.+)$/))) { const c = color(m[1]); return c ? `accent-color:${c}` : null; }

  return null;
}

/* ── Variants ──────────────────────────────────────────────────────────── */

/** Map a variant prefix to a selector transform. */
function variantSelector(variant: string, sel: string): string | null {
  if (variant === "hover") return `${sel}:hover`;
  if (variant === "focus") return `${sel}:focus`;
  if (variant === "focus-visible") return `${sel}:focus-visible`;
  if (variant === "active") return `${sel}:active`;
  if (variant === "disabled") return `${sel}:disabled,${sel}[aria-disabled="true"]`;
  if (variant === "first") return `${sel}:first-child`;
  if (variant === "last") return `${sel}:last-child`;
  if (variant === "odd") return `${sel}:nth-child(odd)`;
  if (variant === "even") return `${sel}:nth-child(even)`;
  if (variant === "selection") return `${sel}::selection`;
  if (variant === "placeholder") return `${sel}::placeholder`;
  if (variant === "before") return `${sel}::before`;
  if (variant === "after") return `${sel}::after`;
  if (variant === "group-hover") return `.group:hover ${sel}`;
  if (variant === "group-focus") return `.group:focus ${sel}`;
  if (variant === "group-focus-within") return `.group:focus-within ${sel}`;
  if (variant === "focus-within") return `${sel}:focus-within`;
  // Named groups: group-hover/item -> .group\/item:hover
  let m: RegExpMatchArray | null;
  if ((m = variant.match(/^group-(hover|focus|focus-within)\/(.+)$/))) {
    const pseudo = m[1] === "focus-within" ? ":focus-within" : `:${m[1]}`;
    return `.group\\/${m[2]}${pseudo} ${sel}`;
  }
  if ((m = variant.match(/^peer-(hover|focus|checked)$/))) return `.peer:${m[1]} ~ ${sel}`;
  return null;
}

const BREAKPOINTS: Record<string, string> = {
  sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px",
};

/* ── Emit ──────────────────────────────────────────────────────────────── */

/** Wrap a declaration body into a rule, honouring the `@child` marker used
 *  by space-y/space-x/divide-* which target children rather than self. */
function rule(sel: string, decls: string): string {
  if (decls === "@marker") return `${sel} { }`;
  if (decls.startsWith("@child ")) {
    return `${sel} > * + * { ${decls.slice(7)}; }`;
  }
  return `${sel} { ${decls.split(";").filter(Boolean).join("; ")}; }`;
}

/** Split on ":" only outside [...] — arbitrary values may contain colons,
 *  e.g. `bg-[length:100%_2px]` is one token, not a `bg-[length` variant. */
function splitVariants(cls: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of cls) {
    if (ch === "[") depth++;
    else if (ch === "]") depth--;
    if (ch === ":" && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function emit(cls: string): string | null {
  const parts = splitVariants(cls);
  const base = parts.pop()!;
  const variants = parts;

  const decls = resolve(base);
  if (decls === null) return null;

  let sel = `.${esc(cls)}`;
  const media: string[] = [];

  for (const v of variants) {
    if (v in BREAKPOINTS) { media.push(`@media (min-width:${BREAKPOINTS[v]})`); continue; }
    const next = variantSelector(v, sel);
    if (next === null) return null;
    sel = next;
  }

  let out = rule(sel, decls);
  for (const mq of media.reverse()) out = `${mq} { ${out} }`;
  return out;
}

/* ── Source scan ───────────────────────────────────────────────────────── */

async function* walk(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const p = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      if (entry.name === "design" || entry.name === "vendor") continue;
      yield* walk(p);
    } else if (/\.(tsx|jsx|js|ts)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      yield p;
    }
  }
}

const CLASS_ATTR = /class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|`([^`]*)`)/g;
const CLASS_LIST = /classList\.(?:add|remove|toggle)\(([^)]*)\)/g;

async function collect(): Promise<Set<string>> {
  const found = new Set<string>();
  const add = (raw: string) => {
    for (let c of raw.replace(/\$\{[^}]*\}/g, " ").split(/\s+/)) {
      c = c.trim().replace(/^!/, "");
      if (c && /^[A-Za-z]/.test(c)) found.add(c);
    }
  };
  for await (const file of walk(WEB_ROOT.replace(/\/$/, ""))) {
    const src = await Deno.readTextFile(file);
    for (const m of src.matchAll(CLASS_ATTR)) add(m[1] ?? m[2] ?? m[3] ?? m[4] ?? "");
    for (const m of src.matchAll(CLASS_LIST)) {
      // Only the first argument is a class list; later arguments are the
      // force flag and would otherwise contribute phantom class names.
      const first = m[1].match(/^\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)/);
      if (first) add(first[1] ?? first[2] ?? first[3] ?? "");
    }
  }
  return found;
}

/** Class names owned by the hand-authored layers (components, base, motion). */
async function authoredClasses(): Promise<Set<string>> {
  const owned = new Set<string>();
  for await (const entry of Deno.readDir(DESIGN_DIR)) {
    if (!entry.name.endsWith(".css")) continue;
    const css = await Deno.readTextFile(`${DESIGN_DIR}${entry.name}`);
    for (const m of css.matchAll(/\.((?:[A-Za-z0-9_-]|\\.)+)/g)) {
      owned.add(m[1].replace(/\\(.)/g, "$1"));
    }
  }
  return owned;
}

/* ── Main ──────────────────────────────────────────────────────────────── */

async function main() {
  const check = Deno.args.includes("--check");

  const used = await collect();
  const owned = await authoredClasses();

  const rules: string[] = [];
  const unresolved: string[] = [];

  for (const cls of [...used].sort()) {
    if (owned.has(cls)) continue;      // semantic layer already defines it
    const css = emit(cls);
    if (css) rules.push(css);
    else unresolved.push(cls);
  }

  const layers: string[] = [];
  const files = [...Deno.readDirSync(DESIGN_DIR)]
    .filter((e) => e.name.endsWith(".css"))
    .map((e) => e.name)
    .sort();
  for (const f of files) layers.push(await Deno.readTextFile(`${DESIGN_DIR}${f}`));

  const banner = `/* ----------------------------------------------------------------------------
 * GENERATED FILE — do not edit.
 *
 *   Source layers : src/orchestrator/interface/web/design/*.css
 *   Generator     : src/orchestrator/tools/build/build_css.ts
 *   Regenerate    : deno task build-css
 *
 * ${rules.length} utilities derived from ${used.size} class names in use.
 * -------------------------------------------------------------------------- */\n\n`;

  const utilityLayer =
    `\n/* ============================================================================\n` +
    ` * 05 // UTILITIES (generated)\n` +
    ` * Derived from the class names actually present in the views and islands.\n` +
    ` * Every one of these resolves; the build fails if a class cannot be mapped.\n` +
    ` * ==========================================================================*/\n\n` +
    rules.join("\n") + "\n";

  const out = banner + layers.join("\n") + utilityLayer;

  if (unresolved.length) {
    console.error(`\n✗ ${unresolved.length} class name(s) could not be resolved:\n`);
    for (const c of unresolved) console.error(`    ${c}`);
    console.error(
      `\n  Either add the pattern to build_css.ts, define it in web/design/,\n` +
      `  or remove it from the markup. A class that resolves to nothing is a\n` +
      `  silent layout bug.\n`,
    );
    Deno.exit(1);
  }

  if (check) {
    const current = await Deno.readTextFile(OUT).catch(() => "");
    if (current !== out) {
      console.error("✗ style.css is stale — run `deno task build-css`.");
      Deno.exit(1);
    }
    console.log(`✓ style.css current (${rules.length} utilities, ${used.size} classes in use).`);
    return;
  }

  await Deno.writeTextFile(OUT, out);
  console.log(
    `✓ style.css written\n` +
    `    ${used.size} class names in use\n` +
    `    ${owned.size} owned by design layers\n` +
    `    ${rules.length} utilities generated\n` +
    `    0 unresolved`,
  );
}

if (import.meta.main) await main();
