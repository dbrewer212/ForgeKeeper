use crate::providers::download_generation_asset;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

const PROVIDER_STAGING_DIR: &str = "workbench/provider-staging";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedGenerationAsset {
    pub provider: String,
    pub job_id: String,
    pub format: String,
    pub staged_path: String,
}

#[tauri::command]
pub async fn workbench_stage_generation_asset(
    app: tauri::AppHandle,
    api_file_path: String,
    provider: String,
    job_id: String,
    format: String,
) -> Result<StagedGenerationAsset, String> {
    let provider = provider.trim().to_ascii_lowercase();
    if provider != "meshy" && provider != "printpal" {
        return Err("Provider must be 'meshy' or 'printpal'.".to_string());
    }
    let job_id = sanitize_component(&job_id, 120)?;
    let format = sanitize_extension(&format)?;
    if !matches!(format.as_str(), "stl" | "3mf" | "obj" | "glb" | "gltf") {
        return Err(format!("Generated provider format .{format} is not approved for Workbench staging."));
    }

    let root = staging_root(&app)?;
    fs::create_dir_all(&root)
        .map_err(|error| format!("Could not create provider staging directory: {error}"))?;
    let provider_dir = root.join(&provider);
    fs::create_dir_all(&provider_dir)
        .map_err(|error| format!("Could not create provider-specific staging directory: {error}"))?;

    let staged = provider_dir.join(format!("{job_id}.{format}"));
    if staged.exists() {
        if staged.is_file() {
            fs::remove_file(&staged)
                .map_err(|error| format!("Could not replace previous staged provider output: {error}"))?;
        } else {
            return Err("Provider staging target exists but is not a regular file.".to_string());
        }
    }

    download_generation_asset(
        api_file_path,
        provider.clone(),
        job_id.clone(),
        format.clone(),
        staged.to_string_lossy().to_string(),
    )
    .await?;

    let canonical = fs::canonicalize(&staged)
        .map_err(|error| format!("Provider download completed but staged file could not be resolved: {error}"))?;
    if !canonical.is_file() {
        return Err("Provider download completed without a regular staged file.".to_string());
    }
    ensure_inside(&canonical, &root)?;

    Ok(StagedGenerationAsset {
        provider,
        job_id,
        format,
        staged_path: canonical.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn workbench_clear_provider_staging(
    app: tauri::AppHandle,
    staged_path: String,
) -> Result<(), String> {
    let root = staging_root(&app)?;
    let candidate = fs::canonicalize(staged_path.trim())
        .map_err(|error| format!("Could not resolve provider staging cleanup target: {error}"))?;
    ensure_inside(&candidate, &root)?;
    if !candidate.is_file() {
        return Err("Provider staging cleanup target is not a regular file.".to_string());
    }
    fs::remove_file(candidate)
        .map_err(|error| format!("Could not remove provider staging file: {error}"))
}

fn staging_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve Foundry application data directory: {error}"))
        .map(|path| path.join(PROVIDER_STAGING_DIR))
}

fn ensure_inside(candidate: &Path, root: &Path) -> Result<(), String> {
    let root = fs::canonicalize(root)
        .map_err(|error| format!("Could not resolve provider staging root: {error}"))?;
    if !candidate.starts_with(&root) {
        return Err("Provider staging operation refused a path outside the Foundry staging directory.".to_string());
    }
    Ok(())
}

fn sanitize_component(value: &str, max_len: usize) -> Result<String, String> {
    let clean = value
        .trim()
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        .take(max_len)
        .collect::<String>();
    if clean.is_empty() {
        return Err("Provider job ID contains no safe filename characters.".to_string());
    }
    Ok(clean)
}

fn sanitize_extension(value: &str) -> Result<String, String> {
    let clean = value
        .trim()
        .trim_start_matches('.')
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .take(12)
        .collect::<String>()
        .to_ascii_lowercase();
    if clean.is_empty() {
        return Err("Provider output format is empty or invalid.".to_string());
    }
    Ok(clean)
}
