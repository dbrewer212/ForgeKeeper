use reqwest::StatusCode;
use serde::Serialize;
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::path::Path;

const MESHY_BASE_URL: &str = "https://api.meshy.ai";
const REPAIR_CREDIT_COST: f64 = 10.0;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MeshyPrintTaskSubmission {
    task_id: String,
    task_type: String,
    status: String,
    expected_credits: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MeshyDownloadedPrintAsset {
    task_id: String,
    format: String,
    output_path: String,
}

fn response_error(status: StatusCode, body: &str) -> String {
    let detail = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| {
            value
                .get("message")
                .or_else(|| value.get("error"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| body.chars().take(240).collect());
    format!("Meshy returned {status}: {detail}")
}

async fn meshy_json(request: reqwest::RequestBuilder) -> Result<Value, String> {
    let response = request
        .send()
        .await
        .map_err(|error| format!("Could not reach Meshy: {error}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("Could not read Meshy's response: {error}"))?;
    if !status.is_success() {
        return Err(response_error(status, &body));
    }
    serde_json::from_str(&body)
        .map_err(|error| format!("Meshy returned an unreadable response: {error}"))
}

fn key_from_file(path: &str) -> Result<Option<String>, String> {
    if path.trim().is_empty() {
        return Ok(None);
    }
    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Could not read the Meshy credential file: {error}"))?;

    for raw_line in contents.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        if let Some((label, value)) = line.split_once('=') {
            if label.trim().to_ascii_lowercase().contains("meshy") && !value.trim().is_empty() {
                return Ok(Some(value.trim().to_string()));
            }
        }
        if let Some((label, value)) = line.split_once(':') {
            if label.trim().to_ascii_lowercase().contains("meshy") && !value.trim().is_empty() {
                return Ok(Some(value.trim().to_string()));
            }
        }
        if line.starts_with("msy_") {
            return Ok(Some(line.to_string()));
        }
    }

    Ok(None)
}

fn meshy_key(api_file_path: Option<&str>) -> Result<String, String> {
    if let Ok(key) = env::var("MESHY_API_KEY") {
        let key = key.trim();
        if !key.is_empty() {
            return Ok(key.to_string());
        }
    }

    if let Some(path) = api_file_path {
        if let Some(key) = key_from_file(path)? {
            return Ok(key);
        }
    }

    Err("Meshy is not configured. Set MESHY_API_KEY in the Foundry runtime environment or provide the existing credential-file path.".to_string())
}

fn source_payload(input_task_id: Option<String>, model_url: Option<String>) -> Result<Value, String> {
    if let Some(task_id) = input_task_id.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()) {
        return Ok(json!({ "input_task_id": task_id }));
    }
    if let Some(url) = model_url.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()) {
        if !(url.starts_with("https://") || url.starts_with("http://") || url.starts_with("data:")) {
            return Err("Meshy model_url must use http://, https://, or data:.".to_string());
        }
        return Ok(json!({ "model_url": url }));
    }
    Err("Provide either a succeeded Meshy inputTaskId or a modelUrl.".to_string())
}

fn require_repair_authorization(authorized_credits: f64) -> Result<(), String> {
    if !authorized_credits.is_finite() || authorized_credits < REPAIR_CREDIT_COST {
        return Err(format!(
            "Meshy print repair costs {:.0} credits. Authorize at least {:.0} credits before repair.",
            REPAIR_CREDIT_COST, REPAIR_CREDIT_COST
        ));
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn meshy_analyze_printability(
    api_file_path: Option<String>,
    input_task_id: Option<String>,
    model_url: Option<String>,
) -> Result<MeshyPrintTaskSubmission, String> {
    let key = meshy_key(api_file_path.as_deref())?;
    let payload = source_payload(input_task_id, model_url)?;
    let client = reqwest::Client::new();
    let response = meshy_json(
        client
            .post(format!("{MESHY_BASE_URL}/openapi/v1/print/analyze"))
            .bearer_auth(key)
            .json(&payload),
    )
    .await?;
    let task_id = response
        .get("result")
        .and_then(Value::as_str)
        .ok_or("Meshy did not return a printability-analysis task ID.")?;

    Ok(MeshyPrintTaskSubmission {
        task_id: task_id.to_string(),
        task_type: "print-analyze".to_string(),
        status: "PENDING".to_string(),
        expected_credits: 0.0,
    })
}

#[tauri::command]
pub(crate) async fn meshy_get_printability_analysis(
    api_file_path: Option<String>,
    task_id: String,
) -> Result<Value, String> {
    let task_id = task_id.trim();
    if task_id.is_empty() {
        return Err("Meshy analysis task ID is required.".to_string());
    }
    let key = meshy_key(api_file_path.as_deref())?;
    let client = reqwest::Client::new();
    meshy_json(
        client
            .get(format!("{MESHY_BASE_URL}/openapi/v1/print/analyze/{task_id}"))
            .bearer_auth(key),
    )
    .await
}

#[tauri::command]
pub(crate) async fn meshy_repair_printability(
    api_file_path: Option<String>,
    input_task_id: Option<String>,
    model_url: Option<String>,
    authorized_credits: f64,
) -> Result<MeshyPrintTaskSubmission, String> {
    require_repair_authorization(authorized_credits)?;
    let key = meshy_key(api_file_path.as_deref())?;
    let payload = source_payload(input_task_id, model_url)?;
    let client = reqwest::Client::new();
    let response = meshy_json(
        client
            .post(format!("{MESHY_BASE_URL}/openapi/v1/print/repair"))
            .bearer_auth(key)
            .json(&payload),
    )
    .await?;
    let task_id = response
        .get("result")
        .and_then(Value::as_str)
        .ok_or("Meshy did not return a print-repair task ID.")?;

    Ok(MeshyPrintTaskSubmission {
        task_id: task_id.to_string(),
        task_type: "print-repair".to_string(),
        status: "PENDING".to_string(),
        expected_credits: REPAIR_CREDIT_COST,
    })
}

#[tauri::command]
pub(crate) async fn meshy_get_printability_repair(
    api_file_path: Option<String>,
    task_id: String,
) -> Result<Value, String> {
    let task_id = task_id.trim();
    if task_id.is_empty() {
        return Err("Meshy repair task ID is required.".to_string());
    }
    let key = meshy_key(api_file_path.as_deref())?;
    let client = reqwest::Client::new();
    meshy_json(
        client
            .get(format!("{MESHY_BASE_URL}/openapi/v1/print/repair/{task_id}"))
            .bearer_auth(key),
    )
    .await
}

#[tauri::command]
pub(crate) async fn meshy_download_repaired_asset(
    api_file_path: Option<String>,
    task_id: String,
    format: String,
    output_path: String,
) -> Result<MeshyDownloadedPrintAsset, String> {
    let task_id = task_id.trim().to_string();
    if task_id.is_empty() {
        return Err("Meshy repair task ID is required.".to_string());
    }
    let format = format.trim().trim_start_matches('.').to_ascii_lowercase();
    if !matches!(format.as_str(), "glb" | "gltf" | "fbx" | "obj" | "stl") {
        return Err("Repaired Meshy assets may be downloaded as GLB, GLTF, FBX, OBJ, or STL.".to_string());
    }
    let output = Path::new(output_path.trim());
    if output_path.trim().is_empty() {
        return Err("An output path is required for the repaired asset.".to_string());
    }

    let key = meshy_key(api_file_path.as_deref())?;
    let client = reqwest::Client::new();
    let task = meshy_json(
        client
            .get(format!("{MESHY_BASE_URL}/openapi/v1/print/repair/{task_id}"))
            .bearer_auth(key),
    )
    .await?;
    if task.get("status").and_then(Value::as_str) != Some("SUCCEEDED") {
        return Err("Meshy repair has not succeeded yet.".to_string());
    }
    let url = task
        .get("model_urls")
        .and_then(|urls| urls.get(&format))
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("Meshy repair did not produce a .{format} output."))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("Could not download repaired Meshy asset: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(response_error(status, &body));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Could not read repaired Meshy asset: {error}"))?;
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create repaired-asset output directory: {error}"))?;
    }
    fs::write(output, bytes)
        .map_err(|error| format!("Could not save repaired Meshy asset: {error}"))?;

    Ok(MeshyDownloadedPrintAsset {
        task_id,
        format,
        output_path,
    })
}
