import { jsx } from "hono/jsx";

export const Button = ({ children, class: className, ...props }: any) => (
  <button 
    class={`px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${className}`}
    {...props}
  >
    {children}
  </button>
);

export const PrimaryButton = ({ children, class: className, ...props }: any) => (
  <Button class={`bg-white text-black hover:bg-slate-200 ${className}`} {...props}>
    {children}
  </Button>
);

export const GhostButton = ({ children, class: className, ...props }: any) => (
  <Button class={`border border-white/20 text-white hover:bg-white/5 ${className}`} {...props}>
    {children}
  </Button>
);

export const Card = ({ children, title, class: className, accentColor = "slate-700" }: any) => (
  <div class={`bg-white/5 p-6 border-l-2 border-${accentColor} ${className}`}>
    {title && <h3 class="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-2">{title}</h3>}
    {children}
  </div>
);

export const Badge = ({ children, color = "green-500" }: any) => (
  <div class={`w-2 h-2 bg-${color}`}></div>
);

export const StatRow = ({ label, value, id }: any) => (
  <div class="flex justify-between text-[9px] uppercase font-bold text-slate-500">
    <span>{label}</span>
    <span id={id} class="text-white">{value}</span>
  </div>
);
