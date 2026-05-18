import { jsx } from "hono/jsx";

export const SidebarNavGroup = ({ title, color, children }: { title: string, color: string, children: any }) => (
  <div class="nav-group mb-6">
    <div class={`nav-heading !text-${color} flex items-center gap-3`}>
       <div class={`w-1 h-3 bg-${color} rounded-full`}></div>
       {title}
    </div>
    {children}
  </div>
);

export const SidebarNavLink = ({ href, icon, label }: { href: string, icon: any, label: string }) => (
  <a href={href} class="nav-link flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group">
     {icon}
     {label}
  </a>
);

export const SidebarNav = ({ userRole }: { userRole?: string }) => {
  return (
    <nav class="flex-grow overflow-y-auto custom-scrollbar p-4 space-y-1">
      {/* 01 MONITOR (System Awareness) */}
      <SidebarNavGroup title="01 // MONITOR" color="primary">
        <SidebarNavLink
          href="/dashboard"
          label="System Overview"
          icon={<svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>}
        />
        <SidebarNavLink
          href="/network/neighbors"
          label="Network Signals"
          icon={<svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>}
        />
        <SidebarNavLink
          href="/agents"
          label="Agent Fleet Status"
          icon={<svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><path d="M12 7v5l3 3"/></svg>}
        />
      </SidebarNavGroup>

      {/* 02 INTELLIGENCE (Threat Intel) */}
      <SidebarNavGroup title="02 // INTELLIGENCE" color="warning">
        <SidebarNavLink
          href="/intel/feed"
          label="Open Source Intel"
          icon={<svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>}
        />
        <SidebarNavLink
          href="/intel/public-ip-collections"
          label="IP Threat Databases"
          icon={<svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>}
        />
        <SidebarNavLink
          href="/intel/map"
          label="Global Threat Map"
          icon={<svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>}
        />
      </SidebarNavGroup>

      {/* 03 DEFENSE (Active Protection) */}
      <SidebarNavGroup title="03 // DEFENSE" color="danger">
        <SidebarNavLink
          href="/agents/sentinel"
          label="Firewall & Perimeter"
          icon={<svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>}
        />
        <SidebarNavLink
          href="/agents/deception"
          label="Deception Grid"
          icon={<svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>}
        />
      </SidebarNavGroup>

      {/* 04 FORENSICS (Audit & Ledger) */}
      <SidebarNavGroup title="04 // FORENSICS" color="success">
        <SidebarNavLink
          href="/system/ledger"
          label="Operational Ledger"
          icon={<svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/><path d="M10 9H8"/></svg>}
        />
        <SidebarNavLink
          href="/forensics"
          label="Forensic Analysis"
          icon={<svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>}
        />
        <SidebarNavLink
          href="/compliance"
          label="Compliance Center"
          icon={<svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>}
        />
      </SidebarNavGroup>

      {/* 05 SYSTEM (Administration) */}
      <div class="nav-group pt-4 border-t border-white/5 mt-4 mb-8">
        <div class="nav-heading !text-slate-500 flex items-center gap-3 mb-2">
           <div class="w-1 h-3 bg-slate-700 rounded-full"></div>
           05 // SYSTEM
        </div>
        <SidebarNavLink
          href="/system/info"
          label="Platform Status"
          icon={<svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>}
        />
        {userRole === "admin" && (
        <SidebarNavLink
          href="/system/settings"
          label="Global Settings"
          icon={<svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1-2 2 2 2 0 0 1 2-2v-.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>}
        />
        )}
      </div>
    </nav>
  );
};
