export interface SidecarConfig {
    name: string;
    description: string;
    persistent: boolean;
    privileged: boolean;
    binaryName?: string;
}

export const SIDECAR_REGISTRY: Record<string, SidecarConfig> = {
    scanner: {
        name: "scanner",
        description: "Vulnerability and port scanner for local network assessment.",
        persistent: false, // Runs on demand
        privileged: false
    },
    honeypot: {
        name: "honeypot",
        description: "Multi-vector deception service with SSH, Telnet, and HTTP decoys.",
        persistent: true,
        privileged: true
    },
    blocker: {
        name: "blocker",
        description: "Active enforcement agent for IP blocking and process termination.",
        persistent: false,
        privileged: true
    },
    ebpf: {
        name: "ebpf",
        description: "Kernel-level observer and LSM enforcer for zero-trust access control.",
        persistent: true,
        privileged: true
    },
    fim: {
        name: "fim",
        description: "File Integrity Monitor for tracking unauthorized access to canary breadcrumbs.",
        persistent: true,
        privileged: true
    },
    pcap: {
        name: "pcap",
        description: "Packet capture and deep packet inspection for mesh traffic.",
        persistent: true,
        privileged: true
    }
};

export const PERSISTENT_SIDECARS = Object.values(SIDECAR_REGISTRY)
    .filter(s => s.persistent)
    .map(s => s.name);

export const PRIVILEGED_SIDECARS = Object.values(SIDECAR_REGISTRY)
    .filter(s => s.privileged)
    .map(s => s.name);
