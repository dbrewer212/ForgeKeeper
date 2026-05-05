use std::path::{Path, PathBuf};
use std::process::Command;

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
        .invoke_handler(tauri::generate_handler![open_path, launch_external_tool])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
