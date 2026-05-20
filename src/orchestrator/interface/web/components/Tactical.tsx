import { jsx } from "hono/jsx";

/**
 * TacticalHeader
 * Standardized page header for tactical interfaces.
 */
export const TacticalHeader = ({ title, subtitle, children }: { title: string; subtitle?: string; children?: any }) => (
  <header class="page-header animate-in fade-in slide-in-from-top-4 duration-700">
    <div class="title-group">
      <h1 class="tactical-title text-4xl">{title}</h1>
      {subtitle && <span class="subtitle">{subtitle}</span>}
    </div>
    <div class="flex gap-6 items-center">
      {children}
    </div>
  </header>
);

/**
 * StatusPill
 * Unified status indicator.
 */
export const StatusPill = ({
  status,
  label,
  active = true,
  class: className = ""
}: {
  status: 'success' | 'warning' | 'danger' | 'primary' | 'info';
  label: string;
  active?: boolean;
  class?: string;
}) => (
  <div class={`status-pill ${status} ${active ? 'active' : ''} ${className}`}>
    {label}
  </div>
);

/**
 * TacticalPanel
 * Standardized panel with glass effect and optional border.
 */
export const TacticalPanel = ({
  children,
  title,
  class: className = "",
  borderColor = "white/5",
  paddings = "p-8"
}: {
  children: any;
  title?: string;
  class?: string;
  borderColor?: string;
  paddings?: string;
}) => (
  <div class={`t-panel glass-panel ${paddings} border-t-2 border-${borderColor} ${className}`}>
    {title && (
      <header class="flex justify-between items-center mb-6 pb-4 border-b border-white/5">
        <span class="mono-xs font-black uppercase tracking-[0.4em]">{title}</span>
      </header>
    )}
    {children}
  </div>
);

/**
 * TacticalSectionTitle
 * Labeled divider for page sections.
 */
export const TacticalSectionTitle = ({ label, color = "slate-400" }: { label: string; color?: string }) => (
  <h2 class={`mono-xs font-black text-${color} uppercase tracking-[0.5em] mb-12 pb-6 border-b border-${color}/20 flex items-center gap-4`}>
    {label}
  </h2>
);
