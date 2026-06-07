export interface SidecarConfig {
    name: string;
    description: string;
    persistent: boolean;
    privileged: boolean;
    critical?: boolean;
    binaryName?: string;
    capabilities?: string;
    resources?: {
        cpu?: string;
        memory?: string;
    };
}

export const SIDECAR_REGISTRY: Record<string, SidecarConfig> = {
    tunnel: {
        name: "tunnel",
        description: "Encrypted network tunnel management via WireGuard.",
        persistent: true,
        privileged: true,
        binaryName: "tunnel",
        capabilities: "cap_net_admin+ep"
    },
    enforcer: {
        name: "enforcer",
        description: "Active enforcement agent for process termination, quarantine, and forensic dumping.",
        persistent: true,
        privileged: true,
        critical: true,
        binaryName: "enforcer",
        capabilities: "cap_net_admin,cap_kill+ep"
    },
    mesh: {
        name: "mesh",
        description: "Autonomous peer discovery and mTLS-secured gossip protocol for collective intelligence.",
        persistent: true,
        privileged: true,
        capabilities: "cap_net_bind_service+ep"
    },
    analyzer: {
        name: "analyzer",
        description: "Threat analysis agent for malware scanning, rootkit detection, and signature-based file inspection.",
        persistent: true,
        privileged: false,
        binaryName: "analyzer",
        resources: { cpu: "40%", memory: "1024M" }
    },
    decoy: {
        name: "decoy",
        description: "Multi-vector deception service with SSH, Telnet, and HTTP traps, tarpitting, and attacker profiling.",
        persistent: true,
        privileged: true,
        binaryName: "decoy"
    },
    sentinel: {
        name: "sentinel",
        description: "eBPF-powered kernel observability and high-performance XDP firewall.",
        persistent: true,
        privileged: true,
        critical: true,
        binaryName: "sentinel",
        capabilities: "cap_sys_admin,cap_net_admin,cap_sys_resource+ep",
        resources: { cpu: "15%", memory: "256M" }
    },
    watchfile: {
        name: "watchfile",
        description: "File integrity monitor using fanotify for real-time unauthorized access detection.",
        persistent: true,
        privileged: true,
        critical: true,
        binaryName: "watchfile"
    },
    netcap: {
        name: "netcap",
        description: "Native PCAPng packet capture and deep packet inspection via raw sockets.",
        persistent: true,
        privileged: true,
        binaryName: "netcap",
        capabilities: "cap_net_raw,cap_net_admin+ep"
    },
    trustroot: {
        name: "trustroot",
        description: "Hardware Root of Trust manager for TPM seal/unseal, signing, PCR attestation, and NVRAM secrets.",
        persistent: true,
        privileged: true,
        critical: true,
        binaryName: "trustroot"
    },
    "sentinel-darwin": {
        name: "sentinel-darwin",
        description: "macOS Endpoint Security Framework agent for real-time visibility and kernel-level authorization.",
        persistent: true,
        privileged: true,
        binaryName: "sentinel-darwin"
    },
    "telemetry-win": {
        name: "telemetry-win",
        description: "Windows Event Tracing agent for high-fidelity syscall and process monitoring.",
        persistent: true,
        privileged: true,
        binaryName: "telemetry-win"
    },
    "enforcer-win": {
        name: "enforcer-win",
        description: "Windows Filtering Platform agent for Ring 0 network and file enforcement.",
        persistent: true,
        privileged: true,
        binaryName: "enforcer-win"
    }
};

export const PERSISTENT_SIDECARS = Object.values(SIDECAR_REGISTRY)
    .filter(s => s.persistent)
    .map(s => s.name);

export const PRIVILEGED_SIDECARS = Object.values(SIDECAR_REGISTRY)
    .filter(s => s.privileged)
    .map(s => s.name);
