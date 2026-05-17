/**
 * TacticalConstants
 * Centralized governance for magic numbers and operational thresholds.
 */
export const TACTICAL_CONSTANTS = {
    MESH: {
        DISCOVERY_INTERVAL_MS: 300000, // 5 minutes
        MTLS_HANDSHAKE_TIMEOUT_MS: 5000,
        PEER_LAST_SEEN_THRESHOLD_MS: 600000, // 10 minutes
        MAX_PARALLEL_PROBES: 20
    },
    METRICS: {
        COLLECTION_INTERVAL_MS: 5000,
        STAGGER_AUDIT_CYCLES: 10,
        STAGGER_KERNEL_CYCLES: 20
    },
    AUTOPILOT: {
        GHOST_SCAN_INTERVAL_MS: 60000, // 1 minute
        REMEDIATION_DWELL_TIME_MS: 5000, // Time to wait for forensics before purge
        MAX_THREAT_SOURCES: 500
    },
    SESSION: {
        DEFAULT_TTL_HOURS: 24
    },
    NETWORK: {
        MDNS_PORT: 5353,
        DEFAULT_PORT: 8000
    },
    CORRELATION: {
        CRITICAL_RISK_THRESHOLD: 80,
        WARNING_RISK_THRESHOLD: 50,
        MIN_SYSCALL_SCORE: 2,
        MAX_NODES_PER_SUBJECT: 100,
        RISK_DECAY_HALFLIFE_MS: 3600000 // 1 hour
    }
};
