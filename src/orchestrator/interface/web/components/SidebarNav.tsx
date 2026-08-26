import { jsx } from "hono/jsx";

/**
 * Navigation rail.
 *
 * Group headings previously took a `color` prop that mapped to `!text-primary`
 * / `!text-warning` / `!text-danger` / `!text-success` plus a matching accent
 * bar — five different colours for five sibling groups in one 232px column.
 * That reads as five unrelated states rather than one ordered list, and it
 * spent the console's entire status palette on navigation, where none of it
 * means anything. Groups are numbered; colour is reserved for status.
 */

const Icon = ({ children }: { children: any }) => (
  <svg
    class="nav-icon"
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const SidebarNavGroup = ({ title, children }: { title: string; children: any; color?: string }) => (
  <div class="nav-group">
    <div class="nav-heading">
      <span class="nav-heading-text">{title}</span>
    </div>
    {children}
  </div>
);

export const SidebarNavLink = ({ href, icon, label }: { href: string; icon: any; label: string }) => (
  <a href={href} class="nav-link" data-tooltip={label}>
    {icon}
    <span class="nav-link-label">{label}</span>
  </a>
);

export const SidebarNav = ({ userRole }: { userRole?: string }) => (
  <nav class="nav-rail custom-scrollbar" aria-label="Primary">
    <SidebarNavGroup title="01 Monitor">
      <SidebarNavLink
        href="/dashboard"
        label="System Overview"
        icon={<Icon><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></Icon>}
      />
      <SidebarNavLink
        href="/network/neighbors"
        label="Network Signals"
        icon={<Icon><path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></Icon>}
      />
      <SidebarNavLink
        href="/network/active"
        label="Active Network"
        icon={<Icon><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></Icon>}
      />
      <SidebarNavLink
        href="/agents"
        label="Agent Fleet"
        icon={<Icon><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /><path d="M12 7v5l3 3" /></Icon>}
      />
    </SidebarNavGroup>

    <SidebarNavGroup title="02 Intelligence">
      <SidebarNavLink
        href="/intel/feed"
        label="Open Source Intel"
        icon={<Icon><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></Icon>}
      />
      <SidebarNavLink
        href="/intel/public-ip-collections"
        label="IP Threat Databases"
        icon={<Icon><path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" /></Icon>}
      />
      <SidebarNavLink
        href="/intel/map"
        label="Global Threat Map"
        icon={<Icon><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /><line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" /></Icon>}
      />
      <SidebarNavLink
        href="/intel/artifact-collections"
        label="Artifact Collections"
        icon={<Icon><rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></Icon>}
      />
    </SidebarNavGroup>

    <SidebarNavGroup title="03 Defense">
      <SidebarNavLink
        href="/agents/sentinel"
        label="Firewall & Perimeter"
        icon={<Icon><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></Icon>}
      />
      <SidebarNavLink
        href="/agents/deception"
        label="Deception Grid"
        icon={<Icon><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" /></Icon>}
      />
    </SidebarNavGroup>

    <SidebarNavGroup title="04 Forensics">
      <SidebarNavLink
        href="/system/ledger"
        label="Operational Ledger"
        icon={<Icon><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h8" /><path d="M10 9H8" /></Icon>}
      />
      <SidebarNavLink
        href="/forensics"
        label="Forensic Analysis"
        icon={<Icon><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Icon>}
      />
      <SidebarNavLink
        href="/forensics/compliance"
        label="Compliance Center"
        icon={<Icon><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></Icon>}
      />
    </SidebarNavGroup>

    <SidebarNavGroup title="05 System">
      <SidebarNavLink
        href="/infrastructure"
        label="Infrastructure Hub"
        icon={<Icon><rect width="20" height="8" x="2" y="2" rx="2" /><rect width="20" height="8" x="2" y="14" rx="2" /><path d="M6 6h.01" /><path d="M6 18h.01" /></Icon>}
      />
      <SidebarNavLink
        href="/infrastructure/mesh"
        label="Mesh Topology"
        icon={<Icon><circle cx="12" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" /><path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9" /><path d="M12 12v3" /></Icon>}
      />
      <SidebarNavLink
        href="/system/supply-chain"
        label="Supply Chain"
        icon={<Icon><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></Icon>}
      />
      <SidebarNavLink
        href="/system/info"
        label="Platform Status"
        icon={<Icon><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></Icon>}
      />
      {userRole === "admin" && (
        <SidebarNavLink
          href="/system/settings"
          label="Global Settings"
          icon={<Icon><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></Icon>}
        />
      )}
    </SidebarNavGroup>
  </nav>
);
