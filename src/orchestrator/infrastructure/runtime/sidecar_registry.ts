export interface SidecarConfig {
    name: string;
    description: string;
    persistent: boolean;
    privileged: boolean;
    binaryName?: string;
}

export const SIDECAR_REGISTRY: Record<string, SidecarConfig> = {
    tunnel: {
        name: "tunnel",
        description: "Encrypted network tunnel management via WireGuard.",
        persistent: true,
        privileged: true,
        binaryName: "tunnel"
    },
    enforcer: {
        name: "enforcer",
        description: "Active enforcement agent for process termination, quarantine, and forensic dumping.",
        persistent: true,
        privileged: true,
        binaryName: "enforcer"
    },
    mesh: {
        name: "mesh",
        description: "Autonomous peer discovery and mTLS-secured gossip protocol for collective intelligence.",
        persistent: true,
        privileged: true
    },
    analyzer: {
        name: "analyzer",
        description: "Threat analysis agent for malware scanning, rootkit detection, and signature-based file inspection.",
        persistent: true,
        privileged: false,
        binaryName: "analyzer"
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
        description: "Kernel-level XDP/TC firewall, LSM policy enforcer, and syscall tracer for zero-trust access control.",
        persistent: true,
        privileged: true,
        binaryName: "sentinel"
    },
    watchfile: {
        name: "watchfile",
        description: "File integrity monitor using fanotify for real-time unauthorized access detection.",
        persistent: true,
        privileged: true,
        binaryName: "watchfile"
    },
    netcap: {
        name: "netcap",
        description: "Native PCAPng packet capture and deep packet inspection via raw sockets.",
        persistent: true,
        privileged: true,
        binaryName: "netcap"
    },
    trustroot: {
        name: "trustroot",
        description: "Hardware Root of Trust manager for TPM seal/unseal, signing, PCR attestation, and NVRAM secrets.",
        persistent: true,
        privileged: true,
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
