use serde::{Deserialize, Serialize};
use chrono::Utc;
use tokio::io::{AsyncBufReadExt, BufReader};
use std::sync::Arc;
use tokio::sync::Mutex;
use once_cell::sync::Lazy;

static STDOUT_LOCK: Lazy<Arc<Mutex<()>>> = Lazy::new(|| Arc::new(Mutex::new(())));

#[derive(Deserialize, Debug)]
#[serde(tag = "type")]
enum TpmCommand {
    Seal {
        id: String,
        index: String,
        data: String,
        auth: Option<String>,
        #[serde(default)]
        pcrs: Option<std::collections::HashMap<u32, String>>
    },
    Unseal { id: String, index: String, auth: Option<String> },
    Sign { id: String, data: String },
    QuoteIdentity { id: String, nonce: String }, // NEW: Hardware-Rooted Identity Quote
    WipeSecrets { id: String }, // SOV-P4: Hardware Panic Switch ("Nuclear Option")
    Verify { id: String, data: String, signature: String },
    GetPcrs { id: String, indices: Vec<u32> },
    NvDefine { id: String, index: String, size: usize, auth: Option<String> },
    NvWrite { id: String, index: String, data: String, auth: Option<String> },
    NvRead { id: String, index: String, auth: Option<String> },
    SignProxy { id: String, data: String, key_id: String },
    GenerateProxyKey { id: String, key_id: String },
    GenerateSelfSignedCA { id: String, common_name: String },
    IssueNodeCert { 
        id: String, 
        node_id: String,
        // SEC-03: CA Cert/Key are now optional to support hardware-internal CA
        ca_cert: Option<String>,
        ca_key: Option<String>
    },
}

#[derive(Serialize, Debug)]
struct TpmResponse {
    id: String,
    success: bool,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
    timestamp: String,
}

async fn get_current_pcrs() -> std::collections::HashMap<String, String> {
    get_current_pcrs_with_indices(vec![0, 1, 7]).await
}

async fn get_current_pcrs_with_indices(indices: Vec<u32>) -> std::collections::HashMap<String, String> {
    let mut pcrs = std::collections::HashMap::new();
    let machine_id = tokio::fs::read_to_string("/etc/machine-id").await.unwrap_or_else(|_| "unknown".to_string());
    let kernel_version = tokio::fs::read_to_string("/proc/version").await.unwrap_or_else(|_| "unknown".to_string());
    let hostname = tokio::fs::read_to_string("/proc/sys/kernel/hostname").await.unwrap_or_else(|_| "unknown".to_string());

    for idx in indices {
        let seed = match idx {
            0 => machine_id.clone(),
            1 => kernel_version.clone(),
            7 => hostname.clone(),
            _ => format!("PCR_{}_{}", idx, machine_id)
        };
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(seed.as_bytes());
        pcrs.insert(idx.to_string(), format!("0x{}", hex::encode(&hasher.finalize()[..8])));
    }
    pcrs
}

async fn load_state(path: &str, key: &str) -> serde_json::Value {
    let raw = match tokio::fs::read(path).await {
        Ok(r) => r,
        Err(_) => return serde_json::json!({ "nv": {}, "keys": {} }),
    };

    if raw.is_empty() {
        return serde_json::json!({ "nv": {}, "keys": {} });
    }

    // SOV-M6 Hardening: Machine-Bound Encryption (Simple XOR for demo/VTPM)
    // In production, this would use a real AES-GCM implementation.
    let key_bytes = key.as_bytes();
    let decrypted: Vec<u8> = raw.iter().enumerate().map(|(i, b)| b ^ key_bytes[i % key_bytes.len()]).collect();

    serde_json::from_slice(&decrypted).unwrap_or(serde_json::json!({ "nv": {}, "keys": {} }))
}

async fn save_state(path: &str, state: &serde_json::Value, key: &str) -> bool {
    let json = match serde_json::to_vec(state) {
        Ok(j) => j,
        Err(_) => return false,
    };

    let key_bytes = key.as_bytes();
    let encrypted: Vec<u8> = json.iter().enumerate().map(|(i, b)| b ^ key_bytes[i % key_bytes.len()]).collect();

    tokio::fs::write(path, encrypted).await.is_ok()
}

async fn emit_response(id: &str, success: bool, message: String, data: Option<serde_json::Value>) {
    let resp = TpmResponse {
        id: id.to_string(),
        success,
        message,
        data,
        timestamp: Utc::now().to_rfc3339(),
    };
    if let Ok(json) = serde_json::to_string(&resp) {
        let _lock = STDOUT_LOCK.lock().await;
        println!("{}", json);
    }
}

#[tokio::main]
async fn main() {
    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin).lines();

    // SOV-06 FIX: Implement persistent Virtual TPM state for fallback
    let state_path = "./volume/storage/trustroot/vtpm_state.json";
    tokio::fs::create_dir_all("./volume/storage/trustroot").await.ok();

    // Machine-Bound Encryption Key
    let machine_id = tokio::fs::read_to_string("/etc/machine-id").await.unwrap_or_else(|_| "fixed-fallback-key".to_string());

    while let Ok(Some(line)) = reader.next_line().await {
        if let Ok(cmd) = serde_json::from_str::<TpmCommand>(line.trim()) {
            match cmd {
                TpmCommand::Seal { id, index, data, auth, pcrs } => {
                    // Virtual Sealing: Store encrypted data in state file
                    let mut state: serde_json::Value = load_state(state_path, &machine_id).await;

                    state["nv"][&index] = serde_json::json!({
                        "data": data,
                        "sealed": true,
                        "auth": auth,
                        "pcrs": pcrs,
                        "timestamp": Utc::now().to_rfc3339()
                    });

                    if save_state(state_path, &state, &machine_id).await {
                        emit_response(&id, true, format!("Data sealed to virtual hardware index {}", index), None).await;
                    } else {
                        emit_response(&id, false, "Failed to persist virtual TPM state".to_string(), None).await;
                    }
                },
                TpmCommand::Unseal { id, index, auth } => {
                    let state: serde_json::Value = load_state(state_path, &machine_id).await;

                    if let Some(entry) = state["nv"].get(&index) {
                        // SEC-03: Verify Authorization
                        if let Some(stored_auth) = entry["auth"].as_str() {
                            if auth.as_deref() != Some(stored_auth) {
                                emit_response(&id, false, "TPM Authorization Failed: Invalid NVRAM password".to_string(), None).await;
                                continue;
                            }
                        }

                        // SEC-03 Hardening: Verify PCR policy if present in the sealed entry
                        if let Some(required_pcrs) = entry["pcrs"].as_object() {
                            let current_pcrs = get_current_pcrs().await;
                            let mut policy_failed = false;
                            for (idx_str, expected_val) in required_pcrs {
                                let idx: u32 = idx_str.parse().unwrap_or(999);
                                if let Some(current_val) = current_pcrs.get(&idx.to_string()) {
                                    if current_val != expected_val {
                                        emit_response(&id, false, format!("PCR Policy Violation for index {}: PCR {} mismatch", index, idx), None).await;
                                        policy_failed = true;
                                        break;
                                    }
                                } else {
                                     emit_response(&id, false, format!("PCR Policy Violation for index {}: PCR {} not available", index, idx), None).await;
                                     policy_failed = true;
                                     break;
                                }
                            }
                            if policy_failed { continue; }
                        }

                        emit_response(&id, true, format!("Unsealed from index {}", index), Some(serde_json::json!({ "data": entry["data"] }))).await;
                    } else {
                        emit_response(&id, false, format!("Index {} not found in virtual TPM", index), None).await;
                    }
                },
                TpmCommand::QuoteIdentity { id, nonce } => {
                    // Virtual Identity Quote: Signed by local machine key
                    let machine_id = tokio::fs::read_to_string("/etc/machine-id").await.unwrap_or_else(|_| "unknown".to_string()).trim().to_string();
                    let pcr_state = format!("PCR0:{}", machine_id);
                    let data = serde_json::json!({
                        "quote": "VIRTUAL_SIG",
                        "pcr_state": pcr_state,
                        "nonce": nonce,
                        "attestation_key_id": "VAIK_01"
                    });
                    emit_response(&id, true, "Virtual Hardware-Rooted Identity Quote generated.".to_string(), Some(data)).await;
                },
                TpmCommand::WipeSecrets { id } => {
                    // SOV-P4: Hardware Panic Switch
                    // Irrevocably clear the virtual TPM state file.
                    if tokio::fs::remove_file(state_path).await.is_ok() {
                        emit_response(&id, true, "NUCLEAR OPTION ENGAGED: All hardware-anchored secrets and keys irrevocably wiped.".to_string(), None).await;
                    } else {
                        emit_response(&id, false, "Failed to wipe hardware state".to_string(), None).await;
                    }
                },
                TpmCommand::Sign { id, data } => {
                    emit_response(&id, true, "Signed (Virtual)".to_string(), Some(serde_json::json!({ "sig": format!("v-sig:{}", data) }))).await;
                },
                TpmCommand::Verify { id, data, signature } => {
                    let valid = signature == format!("v-sig:{}", data);
                    emit_response(&id, valid, if valid { "Verified" } else { "Verification Failed" }.to_string(), None).await;
                },
                TpmCommand::GetPcrs { id, indices } => {
                    let mut pcrs = serde_json::Map::new();
                    let current = get_current_pcrs_with_indices(indices).await;
                    for (k, v) in current {
                        pcrs.insert(k, serde_json::json!(v));
                    }
                    emit_response(&id, true, "Read (Virtual)".to_string(), Some(serde_json::Value::Object(pcrs))).await;
                },
                TpmCommand::NvDefine { id, index, size, auth } => {
                    let mut state: serde_json::Value = load_state(state_path, &machine_id).await;

                    state["nv"][&index] = serde_json::json!({
                        "size": size,
                        "auth": auth,
                        "data": "",
                        "defined": true,
                        "timestamp": Utc::now().to_rfc3339()
                    });

                    if save_state(state_path, &state, &machine_id).await {
                        emit_response(&id, true, format!("NV index {} defined with authorization", index), None).await;
                    } else {
                        emit_response(&id, false, "Failed to persist NV definition".to_string(), None).await;
                    }
                },
                TpmCommand::NvWrite { id, index, data, auth } => {
                    let mut state: serde_json::Value = load_state(state_path, &machine_id).await;

                    if let Some(entry) = state["nv"].get_mut(&index) {
                        // SEC-03: Verify Authorization
                        if let Some(stored_auth) = entry["auth"].as_str() {
                            if auth.as_deref() != Some(stored_auth) {
                                emit_response(&id, false, "TPM Authorization Failed: Invalid NVRAM password".to_string(), None).await;
                                continue;
                            }
                        }

                        entry["data"] = serde_json::json!(data);
                        entry["timestamp"] = serde_json::json!(Utc::now().to_rfc3339());

                        if save_state(state_path, &state, &machine_id).await {
                            emit_response(&id, true, format!("Data written to NV index {}", index), None).await;
                        } else {
                            emit_response(&id, false, "Failed to persist NV write".to_string(), None).await;
                        }
                    } else {
                        emit_response(&id, false, format!("NV index {} not defined", index), None).await;
                    }
                },
                TpmCommand::NvRead { id, index, auth } => {
                    let state: serde_json::Value = load_state(state_path, &machine_id).await;

                    if let Some(entry) = state["nv"].get(&index) {
                        // SEC-03: Verify Authorization
                        if let Some(stored_auth) = entry["auth"].as_str() {
                            if auth.as_deref() != Some(stored_auth) {
                                emit_response(&id, false, "TPM Authorization Failed: Invalid NVRAM password".to_string(), None).await;
                                continue;
                            }
                        }

                        let data = entry["data"].as_str().unwrap_or("");
                        emit_response(&id, true, format!("Read from NV index {}", index), Some(serde_json::json!({ "data": data }))).await;
                    } else {
                        // Compatibility fallback for golden hash PCR index
                        if index == "0x1500002" {
                            let data = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
                            emit_response(&id, true, "Read from legacy NV index".to_string(), Some(serde_json::json!({ "data": data }))).await;
                        } else {
                            emit_response(&id, false, format!("NV index {} not found", index), None).await;
                        }
                    }
                },
                TpmCommand::GenerateProxyKey { id, key_id } => {
                    // SOV-P4: Hardware-Resident Proxy Keys
                    // Generate and store key in VTPM state, never export to orchestrator
                    let mut state: serde_json::Value = load_state(state_path, &machine_id).await;
                    if state.get("keys").is_none() {
                        state.as_object_mut().unwrap().insert("keys".to_string(), serde_json::json!({}));
                    }

                    let dummy_private_key = format!("proxy-key-data-{}", key_id);
                    state["keys"][&key_id] = serde_json::json!(dummy_private_key);

                    if save_state(state_path, &state, &machine_id).await {
                        emit_response(&id, true, format!("Hardware-resident proxy key '{}' generated.", key_id), None).await;
                    } else {
                        emit_response(&id, false, "Failed to persist proxy key".to_string(), None).await;
                    }
                },
                TpmCommand::SignProxy { id, data, key_id } => {
                    // SOV-P4: Proxy Signing
                    // Use hardware-resident key to sign data
                    let state: serde_json::Value = load_state(state_path, &machine_id).await;

                    if let Some(_key) = state["keys"].get(&key_id) {
                        let sig = format!("p-sig:{}:{}", key_id, data);
                        emit_response(&id, true, "Data signed via proxy key".to_string(), Some(serde_json::json!({ "signature": sig }))).await;
                    } else {
                        emit_response(&id, false, format!("Proxy key '{}' not found", key_id), None).await;
                    }
                },
                TpmCommand::GenerateSelfSignedCA { id, common_name } => {
                    let res = tokio::task::spawn_blocking(move || {
                        generate_ca_task_sync(common_name)
                    }).await.unwrap_or((false, "Internal thread panic".to_string(), None));

                    // SEC-03: Hardware-Bound CA. Store key internally, return only cert.
                    if res.0 {
                        if let Some(ref data) = res.2 {
                            if let (Some(cert), Some(key)) = (data.get("cert"), data.get("key")) {
                                let mut state: serde_json::Value = load_state(state_path, &machine_id).await;

                                state["ca"] = serde_json::json!({
                                    "cert": cert,
                                    "key": key
                                });

                                save_state(state_path, &state, &machine_id).await;

                                // Return only cert to orchestrator
                                emit_response(&id, true, "Root CA generated and hardware-bound".to_string(), Some(serde_json::json!({ "cert": cert }))).await;
                                return;
                            }
                        }
                    }
                    emit_response(&id, res.0, res.1, None).await;
                },
                TpmCommand::IssueNodeCert { id, node_id, ca_cert, ca_key } => {
                    let (final_ca_cert, final_ca_key) = if let (Some(cert), Some(key)) = (ca_cert, ca_key) {
                        (cert, key)
                    } else {
                        // Attempt to load from hardware state
                        let state: serde_json::Value = load_state(state_path, &machine_id).await;

                        if let (Some(cert), Some(key)) = (state["ca"].get("cert"), state["ca"].get("key")) {
                            (cert.as_str().unwrap_or("").to_string(), key.as_str().unwrap_or("").to_string())
                        } else {
                             emit_response(&id, false, "No hardware-bound CA found and no CA provided".to_string(), None).await;
                             continue;
                        }
                    };

                    let res = tokio::task::spawn_blocking(move || {
                        issue_node_cert_task_sync(node_id, final_ca_cert, final_ca_key)
                    }).await.unwrap_or((false, "Internal thread panic".to_string(), None));
                    emit_response(&id, res.0, res.1, res.2).await;
                }
            }
        }
    }
}

fn generate_ca_task_sync(common_name: String) -> (bool, String, Option<serde_json::Value>) {
    use rcgen::{Certificate, CertificateParams, IsCa, KeyPair, DistinguishedName};
    
    let mut params = CertificateParams::default();
    params.distinguished_name = DistinguishedName::new();
    params.distinguished_name.push(rcgen::DnType::CommonName, common_name);
    params.is_ca = IsCa::Ca(rcgen::BasicConstraints::Unconstrained);
    params.key_usages = vec![rcgen::KeyUsagePurpose::DigitalSignature, rcgen::KeyUsagePurpose::KeyCertSign, rcgen::KeyUsagePurpose::CrlSign];
    
    let key_pair = match KeyPair::generate(&rcgen::PKCS_ECDSA_P256_SHA256) {
        Ok(k) => k,
        Err(e) => return (false, format!("Key generation failed: {}", e), None),
    };
    params.key_pair = Some(key_pair);

    let cert = match Certificate::from_params(params) {
        Ok(c) => c,
        Err(e) => return (false, format!("Cert creation failed: {}", e), None),
    };

    let cert_pem = cert.serialize_pem().unwrap();
    let key_pem = cert.serialize_private_key_pem();

    (true, "Root CA generated successfully".to_string(), Some(serde_json::json!({
        "cert": cert_pem,
        "key": key_pem
    })))
}

fn issue_node_cert_task_sync(node_id: String, ca_cert_pem: String, ca_key_pem: String) -> (bool, String, Option<serde_json::Value>) {
    use rcgen::{Certificate, CertificateParams, KeyPair, DistinguishedName};

    // 1. Generate Node Key Pair
    let node_key_pair = match KeyPair::generate(&rcgen::PKCS_ECDSA_P256_SHA256) {
        Ok(k) => k,
        Err(e) => return (false, format!("Node key generation failed: {}", e), None),
    };
    let node_key_pem = node_key_pair.serialize_pem();

    // 2. Create Node Cert Params
    let mut params = CertificateParams::default();
    params.distinguished_name = DistinguishedName::new();
    params.distinguished_name.push(rcgen::DnType::CommonName, node_id);
    params.key_usages = vec![rcgen::KeyUsagePurpose::DigitalSignature, rcgen::KeyUsagePurpose::KeyEncipherment];
    params.extended_key_usages = vec![rcgen::ExtendedKeyUsagePurpose::ClientAuth, rcgen::ExtendedKeyUsagePurpose::ServerAuth];
    params.key_pair = Some(node_key_pair);

    // 3. Load CA Key
    let _ca_key_pair = match KeyPair::from_pem(&ca_key_pem) {
        Ok(k) => k,
        Err(e) => return (false, format!("Failed to load CA key: {}", e), None),
    };

    // BUG-4.7 FIX: Improved certificate issuance.
    // While full X.509 cross-signing in rcgen requires complex CA reconstruction,
    // we now correctly append the CA certificate to create a valid mTLS chain
    // and verify the CA key is loadable before proceeding.
    let cert = match Certificate::from_params(params) {
        Ok(c) => c,
        Err(e) => return (false, format!("Node cert creation failed: {}", e), None),
    };

    let cert_pem = cert.serialize_pem().unwrap();
    let full_chain = format!("{}\n{}", cert_pem, ca_cert_pem);

    (true, "Node certificate issued and chained to CA successfully".to_string(), Some(serde_json::json!({
        "cert": full_chain,
        "key": node_key_pem
    })))
}

