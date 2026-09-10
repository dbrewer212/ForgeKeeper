use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

const OLLAMA_BASE_URL: &str = "http://127.0.0.1:11434";
const MAX_MODEL_NAME_BYTES: usize = 256;
const MAX_SYSTEM_BYTES: usize = 64 * 1024;
const MAX_PROMPT_BYTES: usize = 512 * 1024;
const MAX_SCHEMA_BYTES: usize = 128 * 1024;
const MAX_ERROR_BODY_BYTES: usize = 4096;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OllamaProbeResult {
    available: bool,
    detail: String,
    model_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OllamaModelSummary {
    name: String,
    model: String,
    modified_at: Option<String>,
    size: Option<u64>,
    parameter_size: Option<String>,
    quantization_level: Option<String>,
}

#[derive(Deserialize)]
struct OllamaTagsResponse {
    #[serde(default)]
    models: Vec<OllamaTagModel>,
}

#[derive(Deserialize)]
struct OllamaTagModel {
    #[serde(default)]
    name: String,
    #[serde(default)]
    model: String,
    modified_at: Option<String>,
    size: Option<u64>,
    details: Option<OllamaModelDetails>,
}

#[derive(Deserialize)]
struct OllamaModelDetails {
    parameter_size: Option<String>,
    quantization_level: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OllamaStructuredGenerationRequest {
    model: String,
    system: String,
    prompt: String,
    schema: Value,
}

#[derive(Deserialize)]
struct OllamaGenerateResponse {
    response: String,
}

#[tauri::command]
pub(crate) async fn ollama_probe() -> Result<OllamaProbeResult, String> {
    match fetch_models().await {
        Ok(models) => Ok(OllamaProbeResult {
            available: true,
            detail: format!("Ollama localhost API is reachable with {} installed model(s).", models.len()),
            model_count: models.len(),
        }),
        Err(error) => Ok(OllamaProbeResult {
            available: false,
            detail: error,
            model_count: 0,
        }),
    }
}

#[tauri::command]
pub(crate) async fn ollama_list_models() -> Result<Vec<OllamaModelSummary>, String> {
    fetch_models().await
}

#[tauri::command]
pub(crate) async fn ollama_generate_structured(
    request: OllamaStructuredGenerationRequest,
) -> Result<Value, String> {
    validate_generation_request(&request)?;

    let client = ollama_client()?;
    let response = client
        .post(format!("{OLLAMA_BASE_URL}/api/generate"))
        .json(&json!({
            "model": request.model,
            "system": request.system,
            "prompt": request.prompt,
            "format": request.schema,
            "stream": false,
            "options": { "temperature": 0 }
        }))
        .send()
        .await
        .map_err(|error| format!("Could not reach Ollama localhost API: {error}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Ollama structured generation failed with HTTP {}: {}",
            status.as_u16(),
            truncate(&body, MAX_ERROR_BODY_BYTES)
        ));
    }

    let generated = response
        .json::<OllamaGenerateResponse>()
        .await
        .map_err(|error| format!("Ollama returned an invalid generation envelope: {error}"))?;

    serde_json::from_str::<Value>(&generated.response)
        .map_err(|error| format!("Ollama structured response was not valid JSON: {error}"))
}

async fn fetch_models() -> Result<Vec<OllamaModelSummary>, String> {
    let client = ollama_client()?;
    let response = client
        .get(format!("{OLLAMA_BASE_URL}/api/tags"))
        .send()
        .await
        .map_err(|error| format!("Could not reach Ollama localhost API: {error}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Ollama model discovery failed with HTTP {}: {}",
            status.as_u16(),
            truncate(&body, MAX_ERROR_BODY_BYTES)
        ));
    }

    let tags = response
        .json::<OllamaTagsResponse>()
        .await
        .map_err(|error| format!("Ollama model discovery returned invalid JSON: {error}"))?;

    Ok(tags
        .models
        .into_iter()
        .map(|model| OllamaModelSummary {
            name: model.name,
            model: model.model,
            modified_at: model.modified_at,
            size: model.size,
            parameter_size: model.details.as_ref().and_then(|details| details.parameter_size.clone()),
            quantization_level: model.details.and_then(|details| details.quantization_level),
        })
        .collect())
}

fn ollama_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|error| format!("Could not create Ollama localhost client: {error}"))
}

fn validate_generation_request(request: &OllamaStructuredGenerationRequest) -> Result<(), String> {
    let model = request.model.trim();
    if model.is_empty() {
        return Err("Ollama model name is required.".to_string());
    }
    if model.len() > MAX_MODEL_NAME_BYTES {
        return Err("Ollama model name exceeds the Foundry transport limit.".to_string());
    }
    if request.system.len() > MAX_SYSTEM_BYTES {
        return Err("Ollama system prompt exceeds the Foundry transport limit.".to_string());
    }
    if request.prompt.len() > MAX_PROMPT_BYTES {
        return Err("Ollama request context exceeds the Foundry transport limit.".to_string());
    }
    let schema_bytes = serde_json::to_vec(&request.schema)
        .map_err(|error| format!("Could not serialize Ollama output schema: {error}"))?;
    if schema_bytes.len() > MAX_SCHEMA_BYTES {
        return Err("Ollama output schema exceeds the Foundry transport limit.".to_string());
    }
    if !request.schema.is_object() {
        return Err("Ollama output schema must be a JSON object.".to_string());
    }
    Ok(())
}

fn truncate(value: &str, max_bytes: usize) -> String {
    if value.len() <= max_bytes {
        return value.to_string();
    }
    let mut boundary = max_bytes;
    while boundary > 0 && !value.is_char_boundary(boundary) {
        boundary -= 1;
    }
    format!("{}…", &value[..boundary])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> OllamaStructuredGenerationRequest {
        OllamaStructuredGenerationRequest {
            model: "test-model".to_string(),
            system: "system".to_string(),
            prompt: "prompt".to_string(),
            schema: json!({ "type": "object" }),
        }
    }

    #[test]
    fn validates_bounded_structured_request() {
        assert!(validate_generation_request(&request()).is_ok());
    }

    #[test]
    fn rejects_empty_model_and_non_object_schema() {
        let mut missing_model = request();
        missing_model.model = "  ".to_string();
        assert!(validate_generation_request(&missing_model).is_err());

        let mut bad_schema = request();
        bad_schema.schema = json!("json");
        assert!(validate_generation_request(&bad_schema).is_err());
    }
}
