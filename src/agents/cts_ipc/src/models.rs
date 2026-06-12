use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LandlockPathRule {
    pub path: String,
    pub syscalls: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type")]
pub enum AgentCommand {
    #[serde(rename = "GET_STATUS")]
    GetStatus { id: Option<String> },
    #[serde(rename = "SHUTDOWN")]
    Shutdown,

    // Scanner Specific
    #[serde(rename = "MEM_SCAN")]
    MemScan { id: String },
    ScanPath { id: String, path: String },
    Quarantine { id: String, path: String },
    SyncSignatures { id: String },
    EnforceLandlock { id: String, rules: Vec<LandlockPathRule> },
    #[serde(rename = "RKH_SCAN")]
    RkhScan { id: String },
    #[serde(rename = "ATTEST_KERNEL")]
    AttestKernel { id: String },

    // Sentinel Specific
    #[serde(rename = "BLOCK_IP")]
    BlockIp { id: Option<String>, ip: String },
    #[serde(rename = "UNBLOCK_IP")]
    UnblockIp { id: Option<String>, ip: String },
    #[serde(rename = "SHADOW_BAN")]
    ShadowBan { id: Option<String>, ip: String },
    #[serde(rename = "ALLOW_PORT")]
    AllowPort { id: Option<String>, port: u16 },
    #[serde(rename = "DENY_PORT")]
    DenyPort { id: Option<String>, port: u16 },
    #[serde(rename = "ENFORCE_PID")]
    EnforcePid { id: Option<String>, pid: u32, path: Option<String> },
    #[serde(rename = "UNENFORCE_PID")]
    UnenforcePid { id: Option<String>, pid: u32 },
    #[serde(rename = "LOCKDOWN")]
    Lockdown { id: Option<String> },
    #[serde(rename = "FLUSH_RULES")]
    FlushRules { id: Option<String> },
    #[serde(rename = "HIDE_PID")]
    HidePid { id: Option<String>, pid: u32 },
    #[serde(rename = "TRUST_COMM")]
    TrustComm { id: Option<String>, comm: String },
    KillProcess { id: Option<String>, pid: u32 },
    QuarantineProcess { id: Option<String>, pid: u32 },
    DumpProcess { id: Option<String>, pid: u32, path: String },
    #[serde(rename = "RESTRICT_EGRESS")]
    RestrictEgress { id: Option<String>, pid: u32, allowed_ips: Vec<String> },
    #[serde(rename = "LSM_SYSCALL_ALLOWLIST")]
    LsmSyscallAllowlist { id: Option<String>, pid: u32, allowed_syscalls: Vec<String> },
    #[serde(rename = "UPDATE_HOOK_CONTROL")]
    UpdateHookControl { id: Option<String>, hook_id: u32, enabled: bool },
    #[serde(rename = "ADD_REDIRECTION")]
    AddRedirection { id: Option<String>, ip: String, port: u16, new_ip: String, new_port: u16 },
    #[serde(rename = "REMOVE_REDIRECTION")]
    RemoveRedirection { id: Option<String>, ip: String, port: u16 },
    #[serde(rename = "SET_LEARNING_MODE")]
    SetLearningMode { id: Option<String>, learning_mode: bool },
    #[serde(rename = "TRUST_PID")]
    TrustPid { id: Option<String>, pid: u32 },
    #[serde(rename = "UNTRUST_PID")]
    UntrustPid { id: Option<String>, pid: u32 },
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AgentResponse {
    pub id: Option<String>,
    pub success: bool,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,

    // Scanner Specific
    #[serde(skip_serializing_if = "Option::is_none")]
    pub threats_found: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memory_anomalies: Option<Vec<serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
}
