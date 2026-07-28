use std::path::{Path, PathBuf};
use std::process::Command;
use tauri_plugin_sql::{Migration, MigrationKind};

const DATABASE_URL: &str = "sqlite:forgekeeper.db";

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("No path was provided.".to_string());
    }

    open_path_native(&path)
}

#[tauri::command]
fn launch_external_tool(tool_path: String, asset_path: Option<String>) -> Result<(), String> {
    if tool_path.trim().is_empty() {
        return Err("Tool path is not configured.".to_string());
    }

    let resolved_tool = resolve_tool_path(&tool_path);
    launch_tool_native(&resolved_tool, asset_path.as_deref())
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
fn open_path_native(target: &str) -> Result<(), String> {
    Command::new("explorer")
        .arg(target)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Failed to open path: {error}"))
}

#[cfg(target_os = "macos")]
fn open_path_native(target: &str) -> Result<(), String> {
    let mut command = Command::new("open");
    command.arg(target);
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Failed to open path: {error}"))
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn open_path_native(target: &str) -> Result<(), String> {
    Command::new("xdg-open")
        .arg(target)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Failed to open path: {error}"))
}

fn launch_tool_native(tool: &str, asset_path: Option<&str>) -> Result<(), String> {
    let mut command = Command::new(tool);
    if let Some(asset) = asset_path.filter(|value| !value.trim().is_empty()) {
        command.arg(asset);
    }

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Failed to launch external tool: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_foundry_core",
            sql: include_str!("../migrations/0001_foundry_core.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_operational_records",
            sql: include_str!("../migrations/0002_operational_records.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DATABASE_URL, migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![open_path, launch_external_tool])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
