use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use reqwest::multipart::{Form, Part};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

const MESHY_BASE_URL: &str = "https://api.meshy.ai";
const PRINTPAL_BASE_URL: &str = "https://printpal.io";

#[derive(Default)]
struct ProviderCredentials {
    meshy: Option<String>,
    printpal: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderConnection {
    provider: String,
    configured: bool,
    connected: bool,
    credits: Option<f64>,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderConnectionReport {
    meshy: ProviderConnection,
    printpal: ProviderConnection,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GenerationSubmission {
    provider: String,
    job_id: String,
    status: String,
    credits_used: Option<f64>,
    credits_remaining: Option<f64>,
    status_url: Option<String>,
    download_url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GenerationStatus {
    provider: String,
    job_id: String,
    status: String,
    progress: Option<f64>,
    credits_used: Option<f64>,
    output_urls: Value,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DownloadedGenerationAsset {
    provider: String,
    job_id: String,
    format: String,
    output_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MeshyGenerationOptions {
    should_texture: Option<bool>,
    enable_pbr: Option<bool>,
    target_polycount: Option<u64>,
    authorized_credits: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PrintPalGenerationOptions {
    quality: Option<String>,
    format: Option<String>,
    authorized_credits: f64,
}

fn printpal_credit_cost(quality: &str) -> Option<f64> {
    match quality {
        "default" => Some(4.0),
        "high" => Some(6.0),
        "ultra" => Some(8.0),
        "super" => Some(20.0),
        "superplus" => Some(30.0),
        _ => None,
    }
}

fn require_credit_authorization(provider: &str, expected: f64, authorized: f64) -> Result<(), String> {
    if !authorized.is_finite() || authorized < expected {
        return Err(format!(
            "{provider} requires {expected:.0} credits for these settings, but only {authorized:.0} were authorized. Review the Generation Budget Gate before submitting."
        ));
    }
    Ok(())
}

fn read_provider_credentials(api_file_path: &str) -> Result<ProviderCredentials, String> {
    let contents = fs::read_to_string(api_file_path)
        .map_err(|error| format!("Could not read the API credential file: {error}"))?;
    let mut credentials = ProviderCredentials::default();

    for raw_line in contents.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let (label, value) = match line.split_once('=') {
            Some((label, value)) => (Some(label.trim().to_ascii_lowercase()), value.trim()),
            None => match line.split_once(':') {
                Some((label, value)) if label.to_ascii_lowercase().contains("key") => {
                    (Some(label.trim().to_ascii_lowercase()), value.trim())
                }
                _ => (None, line),
            },
        };

        if value.is_empty() {
            continue;
        }

        if value.starts_with("pp_live_") || label.as_deref().is_some_and(|item| item.contains("printpal")) {
            credentials.printpal = Some(value.to_string());
        } else if label.as_deref().is_some_and(|item| item.contains("meshy")) || credentials.meshy.is_none() {
            credentials.meshy = Some(value.to_string());
        }
    }

    Ok(credentials)
}

fn value_number(value: &Value, names: &[&str]) -> Option<f64> {
    names.iter().find_map(|name| value.get(*name)?.as_f64())
}

fn response_error(provider: &str, status: reqwest::StatusCode, body: &str) -> String {
    let detail = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| {
            value.get("message")
                .or_else(|| value.get("error"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| body.chars().take(240).collect());
    format!("{provider} returned {status}: {detail}")
}

async fn get_json(
    client: &reqwest::Client,
    provider: &str,
    request: reqwest::RequestBuilder,
) -> Result<Value, String> {
    let response = request
        .send()
        .await
        .map_err(|error| format!("Could not reach {provider}: {error}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("Could not read {provider}'s response: {error}"))?;
    if !status.is_success() {
        return Err(response_error(provider, status, &body));
    }
    serde_json::from_str(&body)
        .map_err(|error| format!("{provider} returned an unreadable response: {error}"))
}

#[tauri::command]
pub(crate) async fn test_provider_connections(
    api_file_path: String,
) -> Result<ProviderConnectionReport, String> {
    let credentials = read_provider_credentials(&api_file_path)?;
    let client = reqwest::Client::new();

    let meshy = match credentials.meshy {
        Some(key) => match get_json(
            &client,
            "Meshy",
            client
                .get(format!("{MESHY_BASE_URL}/openapi/v1/balance"))
                .bearer_auth(key),
        )
        .await
        {
            Ok(value) => ProviderConnection {
                provider: "meshy".into(),
                configured: true,
                connected: true,
                credits: value_number(&value, &["balance", "credits"]),
                message: "Connected to Meshy.".into(),
            },
            Err(message) => ProviderConnection {
                provider: "meshy".into(),
                configured: true,
                connected: false,
                credits: None,
                message,
            },
        },
        None => ProviderConnection {
            provider: "meshy".into(),
            configured: false,
            connected: false,
            credits: None,
            message: "No Meshy key was found in the credential file.".into(),
        },
    };

    let printpal = match credentials.printpal {
        Some(key) => match get_json(
            &client,
            "PrintPal",
            client
                .get(format!("{PRINTPAL_BASE_URL}/api/credits"))
                .header("X-API-Key", key),
        )
        .await
        {
            Ok(value) => ProviderConnection {
                provider: "printpal".into(),
                configured: true,
                connected: true,
                credits: value_number(&value, &["credits"]),
                message: "Connected to PrintPal.".into(),
            },
            Err(message) => ProviderConnection {
                provider: "printpal".into(),
                configured: true,
                connected: false,
                credits: None,
                message,
            },
        },
        None => ProviderConnection {
            provider: "printpal".into(),
            configured: false,
            connected: false,
            credits: None,
            message: "No PrintPal key was found in the credential file.".into(),
        },
    };

    Ok(ProviderConnectionReport { meshy, printpal })
}

#[tauri::command]
pub(crate) async fn submit_meshy_image_generation(
    api_file_path: String,
    image_path: String,
    options: MeshyGenerationOptions,
) -> Result<GenerationSubmission, String> {
    let expected_credits = if options.should_texture.unwrap_or(false) { 30.0 } else { 20.0 };
    require_credit_authorization("Meshy", expected_credits, options.authorized_credits)?;
    let credentials = read_provider_credentials(&api_file_path)?;
    let api_key = credentials
        .meshy
        .ok_or("No Meshy key was found in the credential file.")?;
    let image = fs::read(&image_path)
        .map_err(|error| format!("Could not read the source image: {error}"))?;
    let extension = Path::new(&image_path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("png")
        .to_ascii_lowercase();
    let mime = if extension == "jpg" || extension == "jpeg" {
        "image/jpeg"
    } else {
        "image/png"
    };
    let image_url = format!("data:{mime};base64,{}", BASE64.encode(image));
    let payload = json!({
        "image_url": image_url,
        "ai_model": "latest",
        "model_type": "standard",
        "should_texture": options.should_texture.unwrap_or(false),
        "enable_pbr": options.enable_pbr.unwrap_or(false),
        "should_remesh": true,
        "target_polycount": options.target_polycount.unwrap_or(100000),
        "target_formats": ["glb", "stl"]
    });
    let client = reqwest::Client::new();
    let value = get_json(
        &client,
        "Meshy",
        client
            .post(format!("{MESHY_BASE_URL}/openapi/v1/image-to-3d"))
            .bearer_auth(api_key)
            .json(&payload),
    )
    .await?;
    let job_id = value
        .get("result")
        .and_then(Value::as_str)
        .ok_or("Meshy did not return a task ID.")?;
    Ok(GenerationSubmission {
        provider: "meshy".into(),
        job_id: job_id.into(),
        status: "PENDING".into(),
        credits_used: None,
        credits_remaining: None,
        status_url: Some(format!("{MESHY_BASE_URL}/openapi/v1/image-to-3d/{job_id}")),
        download_url: None,
    })
}

#[tauri::command]
pub(crate) async fn submit_printpal_image_generation(
    api_file_path: String,
    image_path: String,
    options: PrintPalGenerationOptions,
) -> Result<GenerationSubmission, String> {
    let quality = options.quality.as_deref().unwrap_or("superplus");
    let expected_credits = printpal_credit_cost(quality)
        .ok_or_else(|| format!("Unsupported PrintPal quality setting: {quality}"))?;
    require_credit_authorization("PrintPal", expected_credits, options.authorized_credits)?;
    let credentials = read_provider_credentials(&api_file_path)?;
    let api_key = credentials
        .printpal
        .ok_or("No PrintPal key was found in the credential file.")?;
    let image = fs::read(&image_path)
        .map_err(|error| format!("Could not read the source image: {error}"))?;
    let file_name = Path::new(&image_path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("concept.png")
        .to_string();
    let part = Part::bytes(image).file_name(file_name);
    let form = Form::new()
        .part("image", part)
        .text("quality", quality.to_string())
        .text("format", options.format.unwrap_or_else(|| "stl".into()));
    let client = reqwest::Client::new();
    let value = get_json(
        &client,
        "PrintPal",
        client
            .post(format!("{PRINTPAL_BASE_URL}/api/generate"))
            .header("X-API-Key", api_key)
            .multipart(form),
    )
    .await?;
    let job_id = value
        .get("generation_uid")
        .and_then(Value::as_str)
        .ok_or("PrintPal did not return a generation ID.")?;
    Ok(GenerationSubmission {
        provider: "printpal".into(),
        job_id: job_id.into(),
        status: value
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("pending")
            .into(),
        credits_used: value_number(&value, &["credits_used"]),
        credits_remaining: value_number(&value, &["credits_remaining"]),
        status_url: value
            .get("status_url")
            .and_then(Value::as_str)
            .map(str::to_string),
        download_url: value
            .get("download_url")
            .and_then(Value::as_str)
            .map(str::to_string),
    })
}

#[tauri::command]
pub(crate) async fn get_generation_status(
    api_file_path: String,
    provider: String,
    job_id: String,
) -> Result<GenerationStatus, String> {
    let credentials = read_provider_credentials(&api_file_path)?;
    let client = reqwest::Client::new();
    let (provider_name, request) = match provider.as_str() {
        "meshy" => {
            let key = credentials
                .meshy
                .ok_or("No Meshy key was found in the credential file.")?;
            (
                "Meshy",
                client
                    .get(format!("{MESHY_BASE_URL}/openapi/v1/image-to-3d/{job_id}"))
                    .bearer_auth(key),
            )
        }
        "printpal" => {
            let key = credentials
                .printpal
                .ok_or("No PrintPal key was found in the credential file.")?;
            (
                "PrintPal",
                client
                    .get(format!("{PRINTPAL_BASE_URL}/api/generate/{job_id}/status"))
                    .header("X-API-Key", key),
            )
        }
        _ => return Err("Provider must be 'meshy' or 'printpal'.".into()),
    };
    let value = get_json(&client, provider_name, request).await?;
    let status = value
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("UNKNOWN")
        .to_string();
    let output_urls = if provider == "meshy" {
        value
            .get("model_urls")
            .cloned()
            .unwrap_or_else(|| json!({}))
    } else {
        value
            .get("download_url")
            .and_then(Value::as_str)
            .map(|url| json!({ "download": url }))
            .unwrap_or_else(|| json!({}))
    };
    let error = value
        .get("task_error")
        .and_then(|item| item.get("message"))
        .or_else(|| value.get("error"))
        .and_then(Value::as_str)
        .filter(|message| !message.is_empty())
        .map(str::to_string);
    Ok(GenerationStatus {
        provider,
        job_id,
        status,
        progress: value_number(&value, &["progress"]),
        credits_used: value_number(&value, &["consumed_credits", "credits_used"]),
        output_urls,
        error,
    })
}

#[tauri::command]
pub(crate) async fn download_generation_asset(
    api_file_path: String,
    provider: String,
    job_id: String,
    format: String,
    output_path: String,
) -> Result<DownloadedGenerationAsset, String> {
    let credentials = read_provider_credentials(&api_file_path)?;
    let client = reqwest::Client::new();
    let download_url = match provider.as_str() {
        "meshy" => {
            let key = credentials
                .meshy
                .ok_or("No Meshy key was found in the credential file.")?;
            let value = get_json(
                &client,
                "Meshy",
                client
                    .get(format!("{MESHY_BASE_URL}/openapi/v1/image-to-3d/{job_id}"))
                    .bearer_auth(key),
            )
            .await?;
            value
                .get("model_urls")
                .and_then(|urls| urls.get(&format))
                .and_then(Value::as_str)
                .map(str::to_string)
                .ok_or_else(|| format!("Meshy has no {format} output for this job yet."))?
        }
        "printpal" => {
            let key = credentials
                .printpal
                .ok_or("No PrintPal key was found in the credential file.")?;
            let value = get_json(
                &client,
                "PrintPal",
                client
                    .get(format!("{PRINTPAL_BASE_URL}/api/generate/{job_id}/download"))
                    .header("X-API-Key", key),
            )
            .await?;
            value
                .get("download_url")
                .and_then(Value::as_str)
                .map(str::to_string)
                .ok_or("PrintPal did not return a download URL.")?
        }
        _ => return Err("Provider must be 'meshy' or 'printpal'.".into()),
    };

    let response = client
        .get(download_url)
        .send()
        .await
        .map_err(|error| format!("Could not download the generated model: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(response_error("Generated asset host", status, &body));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Could not read the generated model: {error}"))?;
    let output = Path::new(&output_path);
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create the output folder: {error}"))?;
    }
    fs::write(output, bytes)
        .map_err(|error| format!("Could not save the generated model: {error}"))?;

    Ok(DownloadedGenerationAsset {
        provider,
        job_id,
        format,
        output_path,
    })
}
