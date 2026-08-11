use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;

const MESH_DIR: &str = "mesh";
const SNAPSHOT_FILE: &str = "snapshot.json";
const EVENT_JOURNAL_FILE: &str = "events.jsonl";

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("No path was provided.".to_string());
    }

    open_with_windows_shell(&path, None)
}

#[tauri::command]
fn launch_external_tool(tool_path: String, asset_path: Option<String>) -> Result<(), String> {
    if tool_path.trim().is_empty() {
        return Err("Tool path is not configured.".to_string());
    }

    let resolved_tool = resolve_tool_path(&tool_path);
    open_with_windows_shell(&resolved_tool, asset_path.as_deref())
}

#[tauri::command]
fn mesh_load_snapshot(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = mesh_file_path(&app, SNAPSHOT_FILE)?;
    if !path.exists() {
        return Ok(None);
    }

    fs::read_to_string(path)
        .map(Some)
        .map_err(|error| format!("Failed to read Foundry mesh snapshot: {error}"))
}

#[tauri::command]
fn mesh_save_snapshot(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let path = mesh_file_path(&app, SNAPSHOT_FILE)?;
    let temp_path = path.with_extension("json.tmp");

    fs::write(&temp_path, content)
        .map_err(|error| format!("Failed to write temporary Foundry mesh snapshot: {error}"))?;

    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("Failed to replace previous Foundry mesh snapshot: {error}"))?;
    }

    fs::rename(&temp_path, &path)
        .map_err(|error| format!("Failed to commit Foundry mesh snapshot: {error}"))
}

#[tauri::command]
fn mesh_append_event(app: tauri::AppHandle, content: String) -> Result<(), String> {
    if content.contains('\n') || content.contains('\r') {
        return Err("Mesh journal events must be a single JSON line.".to_string());
    }

    let path = mesh_file_path(&app, EVENT_JOURNAL_FILE)?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| format!("Failed to open Foundry mesh event journal: {error}"))?;

    writeln!(file, "{content}")
        .map_err(|error| format!("Failed to append Foundry mesh event: {error}"))
}

#[tauri::command]
fn mesh_read_events(app: tauri::AppHandle, limit: Option<usize>) -> Result<Vec<String>, String> {
    let path = mesh_file_path(&app, EVENT_JOURNAL_FILE)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let file = fs::File::open(path)
        .map_err(|error| format!("Failed to open Foundry mesh event journal: {error}"))?;
    let reader = BufReader::new(file);
    let mut lines = reader
        .lines()
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to read Foundry mesh event journal: {error}"))?;

    let limit = limit.unwrap_or(250).min(10_000);
    if lines.len() > limit {
        lines.drain(0..lines.len() - limit);
    }

    Ok(lines)
}

fn mesh_file_path(app: &tauri::AppHandle, file_name: &str) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve Foundry application data directory: {error}"))?
        .join(MESH_DIR);

    fs::create_dir_all(&directory)
        .map_err(|error| format!("Failed to create Foundry mesh data directory: {error}"))?;

    Ok(directory.join(file_name))
}

fn resolve_tool_path(tool_path: &str) -> String {
    let candidate = Path::new(tool_path);

    if candidate.is_file() {
        return tool_path.to_string();
    }

    if candidate.is_dir() {
        let known_exes = [
            "OrcaSlicer.exe",
            "orca-slicer.exe",
            "AnycubicSlicerNext.exe",
            "Anycubic Slicer Next.exe",
            "blender.exe",
        ];

        for exe in known_exes {
            let possible: PathBuf = candidate.join(exe);
            if possible.is_file() {
                return possible.to_string_lossy().to_string();
            }
        }
    }

    tool_path.to_string()
}

#[cfg(target_os = "windows")]
fn open_with_windows_shell(target: &str, asset_path: Option<&str>) -> Result<(), String> {
    let mut command = Command::new("cmd");
    command.arg("/C").arg("start").arg("").arg(target);

    if let Some(asset) = asset_path {
        if !asset.trim().is_empty() {
            command.arg(asset);
        }
    }

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Failed to open launch target: {error}"))
}

#[cfg(not(target_os = "windows"))]
fn open_with_windows_shell(target: &str, asset_path: Option<&str>) -> Result<(), String> {
    let mut command = Command::new("open");
    command.arg(target);

    if let Some(asset) = asset_path {
        if !asset.trim().is_empty() {
            command.arg(asset);
        }
    }

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Failed to open launch target: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_path,
            launch_external_tool,
            mesh_load_snapshot,
            mesh_save_snapshot,
            mesh_append_event,
            mesh_read_events
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
