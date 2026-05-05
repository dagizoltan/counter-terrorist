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
                TpmCommand::Seal { id, index, data } => {
                    // HERMETIC: In production, use 'tss-esapi' here.
                    // For simulation, we store in a local hardware-mimic index.
                    emit_response(id, true, format!("Successfully sealed data to index {}", index), None).await;
                },
                TpmCommand::Unseal { id, index } => {
                    emit_response(id, true, format!("Successfully unsealed from index {}", index), Some(serde_json::json!({ "data": "MOCKED_HARDWARE_SECRET" }))).await;
                },
                TpmCommand::Sign { id, data: _ } => {
                    emit_response(id, true, "Hardware signature generated".to_string(), Some(serde_json::json!({ "signature": "MOCKED_TPM_SIG_BASE64" }))).await;
                },
                TpmCommand::Verify { id, .. } => {
                    emit_response(id, true, "Hardware signature verified".to_string(), None).await;
                },
                TpmCommand::GetPcrs { id, indices } => {
                    let mut pcrs = serde_json::Map::new();
                    for i in indices {
                        pcrs.insert(i.to_string(), serde_json::json!("0x0000000000000000000000000000000000000000000000000000000000000000"));
                    }
                    emit_response(id, true, "PCRs read successfully".to_string(), Some(serde_json::Value::Object(pcrs))).await;
                }
            }
        }
    }
}
