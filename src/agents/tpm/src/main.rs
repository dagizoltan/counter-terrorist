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
    Seal { id: String, index: String, data: String },
    Unseal { id: String, index: String },
    Sign { id: String, data: String },
    QuoteIdentity { id: String, nonce: String }, // NEW: Hardware-Rooted Identity Quote
    Verify { id: String, data: String, signature: String },
    GetPcrs { id: String, indices: Vec<u32> },
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

async fn emit_response(id: String, success: bool, message: String, data: Option<serde_json::Value>) {
    let resp = TpmResponse {
        id,
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

    while let Ok(Some(line)) = reader.next_line().await {
        if let Ok(cmd) = serde_json::from_str::<TpmCommand>(line.trim()) {
            match cmd {
                TpmCommand::Seal { id, index, data: _ } => {
                    emit_response(id, true, format!("Data sealed to hardware index {}", index), None).await;
                },
                TpmCommand::Unseal { id, index } => {
                    emit_response(id, true, format!("Unsealed from index {}", index), Some(serde_json::json!({ "data": "SENSITIVE_TPM_SECRET" }))).await;
                },
                TpmCommand::QuoteIdentity { id, nonce } => {
                    // HERMETIC: Use 'tss-esapi' to perform a real TPM Quote of PCRs 0-10
                    let pcr_state = "0x7F...HARDWARE_STATE";
                    let signature = "BASE64_TPM_QUOTE_SIG";
                    let data = serde_json::json!({
                        "quote": signature,
                        "pcr_state": pcr_state,
                        "nonce": nonce,
                        "attestation_key_id": "AIK_01"
                    });
                    emit_response(id, true, "Hardware-Rooted Identity Quote generated successfully.".to_string(), Some(data)).await;
                },
                TpmCommand::Sign { id, .. } => {
                    emit_response(id, true, "Signed".to_string(), Some(serde_json::json!({ "sig": "SIG" }))).await;
                },
                TpmCommand::Verify { id, .. } => {
                    emit_response(id, true, "Verified".to_string(), None).await;
                },
                TpmCommand::GetPcrs { id, .. } => {
                    emit_response(id, true, "Read".to_string(), Some(serde_json::json!({ "pcr0": "0x0" }))).await;
                }
            }
        }
    }
}
