use reqwest::Client;
use serde_json::Value;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

const MESHY_BASE_URL: &str = "https://api.meshy.ai";
const PRINTPAL_BASE_URL: &str = "https://printpal.io";
const MAX_PROVIDER_DOWNLOAD_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Default)]
struct ProviderCredentials {
    meshy: Option<String>,
    printpal: Option<String>,
}

pub(crate) async fn download_provider_asset_safely(
    api_file_path: String,
    provider: String,
    job_id: String,
    format: String,
    output_path: PathBuf,
) -> Result<(), String> {
    validate_target_extension(&output_path, &format)?;
    let credentials = read_provider_credentials(&api_file_path)?;
    let client = Client::new();

    let download_url = match provider.as_str() {
        "meshy" => {
            let key = credentials
                .meshy
                .ok_or("No Meshy key was found in the credential file or MESHY_API_KEY environment variable.")?;
            let response = client
                .get(format!("{MESHY_BASE_URL}/openapi/v1/image-to-3d/{job_id}"))
                .bearer_auth(key)
                .send()
                .await
                .map_err(|error| format!("Could not query Meshy generation job {job_id}: {error}"))?;
            let value = read_json_response("Meshy", response).await?;
            value
                .get("model_urls")
                .and_then(|urls| urls.get(&format))
                .and_then(Value::as_str)
                .map(str::to_string)
                .ok_or_else(|| format!("Meshy job {job_id} does not expose a .{format} output."))?
        }
        "printpal" => {
            let key = credentials
                .printpal
                .ok_or("No PrintPal key was found in the credential file.")?;
            let response = client
                .get(format!("{PRINTPAL_BASE_URL}/api/generate/{job_id}/download"))
                .header("X-API-Key", key)
                .send()
                .await
                .map_err(|error| format!("Could not query PrintPal generation job {job_id}: {error}"))?;
            let value = read_json_response("PrintPal", response).await?;
            value
                .get("download_url")
                .and_then(Value::as_str)
                .map(str::to_string)
                .ok_or("PrintPal did not return a download URL.")?
        }
        _ => return Err("Provider must be 'meshy' or 'printpal'.".to_string()),
    };

    let mut response = client
        .get(&download_url)
        .send()
        .await
        .map_err(|error| format!("Could not start provider asset download: {error}"))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Provider asset host returned {status}: {}",
            body.chars().take(240).collect::<String>()
        ));
    }
    if let Some(length) = response.content_length() {
        if length == 0 {
            return Err("Provider returned an empty model download.".to_string());
        }
        if length > MAX_PROVIDER_DOWNLOAD_BYTES {
            return Err(format!(
                "Provider model download is {} MiB, above the Foundry staging limit of 512 MiB.",
                length / (1024 * 1024)
            ));
        }
    }

    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create provider staging directory: {error}"))?;
    }

    let part_path = part_path_for(&output_path);
    if part_path.exists() {
        fs::remove_file(&part_path)
            .map_err(|error| format!("Could not remove stale partial provider download: {error}"))?;
    }

    let download_result = async {
        let mut file = File::create(&part_path)
            .map_err(|error| format!("Could not create provider staging file: {error}"))?;
        let mut written = 0_u64;
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("Provider model download was interrupted: {error}"))?
        {
            written = written.saturating_add(chunk.len() as u64);
            if written > MAX_PROVIDER_DOWNLOAD_BYTES {
                return Err("Provider model download exceeded the 512 MiB Foundry staging limit.".to_string());
            }
            file.write_all(&chunk)
                .map_err(|error| format!("Could not write provider model staging data: {error}"))?;
        }
        file.flush()
            .map_err(|error| format!("Could not flush provider staging file: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("Could not commit provider staging bytes: {error}"))?;
        if written == 0 {
            return Err("Provider returned a zero-byte model.".to_string());
        }
        Ok::<u64, String>(written)
    }
    .await;

    if let Err(error) = download_result {
        let _ = fs::remove_file(&part_path);
        return Err(error);
    }

    if output_path.exists() {
        if !output_path.is_file() {
            let _ = fs::remove_file(&part_path);
            return Err("Provider staging target exists but is not a regular file.".to_string());
        }
        fs::remove_file(&output_path)
            .map_err(|error| format!("Could not replace previous provider staging file: {error}"))?;
    }
    fs::rename(&part_path, &output_path)
        .map_err(|error| format!("Could not atomically commit provider staging file: {error}"))?;

    let metadata = fs::metadata(&output_path)
        .map_err(|error| format!("Could not verify staged provider file: {error}"))?;
    if !metadata.is_file() || metadata.len() == 0 {
        return Err("Provider staging completed without a non-empty regular file.".to_string());
    }
    validate_target_extension(&output_path, &format)?;
    Ok(())
}

async fn read_json_response(provider: &str, response: reqwest::Response) -> Result<Value, String> {
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("Could not read {provider} response: {error}"))?;
    if !status.is_success() {
        return Err(format!(
            "{provider} returned {status}: {}",
            body.chars().take(240).collect::<String>()
        ));
    }
    serde_json::from_str(&body)
        .map_err(|error| format!("{provider} returned unreadable JSON: {error}"))
}

fn read_provider_credentials(api_file_path: &str) -> Result<ProviderCredentials, String> {
    let mut credentials = ProviderCredentials::default();
    if let Ok(value) = std::env::var("MESHY_API_KEY") {
        let value = value.trim();
        if !value.is_empty() {
            credentials.meshy = Some(value.to_string());
        }
    }

    if !api_file_path.trim().is_empty() {
        let contents = fs::read_to_string(api_file_path)
            .map_err(|error| format!("Could not read the API credential file: {error}"))?;
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
    }
    Ok(credentials)
}

fn validate_target_extension(path: &Path, format: &str) -> Result<(), String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if extension != format.to_ascii_lowercase() {
        return Err(format!(
            "Provider staging refused extension mismatch: requested .{format}, target path is .{}.",
            if extension.is_empty() { "unknown" } else { &extension }
        ));
    }
    Ok(())
}

fn part_path_for(path: &Path) -> PathBuf {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("provider-output");
    path.with_file_name(format!(".{name}.part"))
}
