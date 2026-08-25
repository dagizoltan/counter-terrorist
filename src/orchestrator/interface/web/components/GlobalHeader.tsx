import { jsx } from "hono/jsx";
import { Eyebrow } from "./Tactical.tsx";

/**
 * Operational deck header.
 *
 * Breadcrumb, perimeter state, clock. The perimeter chip previously read
 * "Grid Armed" in danger red with a pulsing dot on every page — a permanent
 * red alarm that carried no information and desensitised the operator to the
 * colour. It now reflects perimeter state and only pulses when live.
 */
export const GlobalHeader = ({ hostname, title }: { hostname?: string; title: string }) => {
  const segments = title.split("//").map((s) => s.trim()).filter(Boolean);
  const deck = segments[0] || "Overview";
  const context = segments[1];

  return (
    <header class="shell-header">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <span class="breadcrumb__node">
          <span class="indicator" data-state="ok" aria-hidden="true"></span>
          <Eyebrow tone="primary">{hostname || "Sovereign"}</Eyebrow>
        </span>
        <span class="breadcrumb__sep" aria-hidden="true">/</span>
        <Eyebrow tone="strong" class="breadcrumb__current">{deck}</Eyebrow>
        {context && (
          <>
            <span class="breadcrumb__sep" aria-hidden="true">/</span>
            <Eyebrow>{context}</Eyebrow>
          </>
        )}
      </nav>

      <div class="deck-status">
        <span id="stat-fw-grid" class="pill" data-state="ok" data-dot="live">Perimeter Armed</span>
        <time id="system-clock" class="deck-clock num" aria-label="System time">00:00:00</time>
      </div>
    </header>
  );
};
