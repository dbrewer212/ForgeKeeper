//! Narrow native HTTPS bridge to the Python Foundry Core. Credentials stay app-private.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fs, time::Duration};
use tauri::Manager;

#[derive(Deserialize, Serialize)]
pub struct CoreConnection {
    schema: String,
    endpoint: String,
    token: String,
    certificate: String,
    client_id: String,
}

fn validate(connection: &CoreConnection) -> Result<(), String> {
    let url = reqwest::Url::parse(&connection.endpoint).map_err(|_| "Invalid desktop address")?;
    if connection.schema != "foundry-mobile/1" || url.scheme() != "https" || url.host_str().is_none()
        || !url.username().is_empty() || url.password().is_some() || url.query().is_some()
        || url.fragment().is_some() || url.path() != "/" || connection.token.len() < 24
        || connection.token.len() > 200 || connection.certificate.len() > 8000 {
        return Err("Scan a valid Foundry desktop pairing code using HTTPS.".into());
    }
    reqwest::Certificate::from_pem(connection.certificate.as_bytes()).map_err(|_| "Invalid desktop certificate")?;
    Ok(())
}

pub fn allowed(path: &str, post: bool) -> bool {
    if !post && ["/v1/me","/v1/health","/v1/state","/v1/projects","/v1/assets","/v1/machines",
        "/v1/production","/v1/persistent-alerts","/v1/service-runs","/v1/materials","/v1/spools",
        "/v1/proposals","/v1/events"].contains(&path) { return true; }
    if !post && path.starts_with("/v1/context?project_id=") {
        return identifier(&path[23..]);
    }
    if post && ["/v1/inventory/receive","/v1/inventory/read-label","/v1/proposals"].contains(&path) { return true; }
    let parts: Vec<_> = path.split('/').collect();
    post && parts.len() == 5 && parts[1] == "v1" && identifier(parts[3]) &&
        match parts[2] {
            "alerts" => ["acknowledge","resolve"].contains(&parts[4]),
            "jobs" => parts[4] == "approve",
            "proposals" => ["approve","reject","execute"].contains(&parts[4]),
            _ => false,
        }
}

fn identifier(value: &str) -> bool {
    value.len() == 36 && value.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

async fn request(connection: &CoreConnection, path: &str, body: Option<Value>) -> Result<Value, String> {
    validate(connection)?;
    if !allowed(path, body.is_some()) { return Err("Unsupported Core route.".into()); }
    let limit = if path == "/v1/inventory/read-label" { 2800100 } else { 16384 };
    if body.as_ref().is_some_and(|v| v.to_string().len() > limit) { return Err("Request exceeds size limit.".into()); }
    let certificate = reqwest::Certificate::from_pem(connection.certificate.as_bytes()).map_err(|_| "Invalid desktop certificate")?;
    let client = reqwest::Client::builder().add_root_certificate(certificate)
        .https_only(true).redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(40))
        .build().map_err(|_| "Could not initialize the verified HTTPS connection")?;
    let url = format!("{}{}", connection.endpoint.trim_end_matches('/'), path);
    let builder = if let Some(value) = body { client.post(url).json(&value) } else { client.get(url) };
    let mut response = builder.bearer_auth(&connection.token).send().await
        .map_err(|_| "Desktop unavailable or certificate verification failed. Check the private connection or pair again.")?;
    let status = response.status(); let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "Could not read desktop response")? {
        if bytes.len() + chunk.len() > 4 * 1024 * 1024 { return Err("Desktop response exceeds size limit.".into()); }
        bytes.extend_from_slice(&chunk);
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| "Desktop returned invalid JSON")?;
    if !status.is_success() { return Err(value["error"].as_str().unwrap_or("Desktop rejected this action.").into()); }
    if value["schema"] != "foundry/1" { return Err("Unsupported desktop contract.".into()); }
    Ok(value["data"].clone())
}

fn config_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let folder = app.path().app_data_dir().map_err(|_| "App-private storage is unavailable")?;
    fs::create_dir_all(&folder).map_err(|_| "Could not prepare app-private storage")?;
    Ok(folder.join("foundry-core-connection.json"))
}

#[tauri::command]
pub async fn core_pair(app: tauri::AppHandle, connection: CoreConnection) -> Result<Value, String> {
    let identity = request(&connection,"/v1/me",None).await?;
    fs::write(config_path(&app)?,serde_json::to_vec(&connection).map_err(|_| "Cannot encode connection")?)
        .map_err(|_| "Could not save the private connection")?;
    Ok(identity)
}

#[tauri::command]
pub fn core_connection_status(app: tauri::AppHandle) -> Result<Value, String> {
    let path = config_path(&app)?;
    if !path.exists() { return Ok(serde_json::json!({"paired":false})); }
    let connection: CoreConnection = serde_json::from_slice(&fs::read(path).map_err(|_| "Cannot read private connection")?)
        .map_err(|_| "Connection is damaged; pair again")?;
    Ok(serde_json::json!({"paired":true,"endpoint":connection.endpoint}))
}

#[tauri::command]
pub fn core_forget(app: tauri::AppHandle) -> Result<(), String> {
    let path = config_path(&app)?;
    if path.exists() { fs::remove_file(path).map_err(|_| "Could not forget private connection")?; }
    Ok(())
}

#[tauri::command]
pub async fn core_request(app: tauri::AppHandle, path: String, body: Option<Value>) -> Result<Value, String> {
    let connection: CoreConnection = serde_json::from_slice(&fs::read(config_path(&app)?).map_err(|_| "Pair with the desktop first")?)
        .map_err(|_| "Connection is damaged; pair again")?;
    request(&connection,&path,body).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn routes_are_bounded() {
        assert!(allowed("/v1/state",false)); assert!(allowed("/v1/inventory/receive",true));
        assert!(allowed("/v1/context?project_id=12345678-1234-1234-1234-123456789abc",false));
        assert!(!allowed("https://example.com",false)); assert!(!allowed("/v1/../state",false));
        assert!(!allowed("/v1/context?project_id=x&token=secret",false));
        assert!(!allowed("/v1/jobs/12345678-1234-1234-1234-123456789abc/start",true));
    }
}
