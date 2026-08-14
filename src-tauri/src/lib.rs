mod bastion;
mod managed_services;

use bastion::{
    bastion_close_window, bastion_launch_mode, bastion_open_window, bastion_set_startup,
    bastion_startup_status, open_bastion_window,
};
use managed_services::{
    managed_service_start, managed_service_status, managed_service_stop, ManagedProcesses,
};
use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::Manager;

const MESH_DIR: &str = "mesh";
const SNAPSHOT_FILE: &str = "snapshot.json";
const EVENT_JOURNAL_FILE: &str = "events.jsonl";

#[derive(Serialize)]
struct LocalHttpResponse {
    status: u16,
    body: String,
}

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
async fn local_http_get(url: String, timeout_ms: Option<u64>) -> Result<LocalHttpResponse, String> {
    tauri::async_runtime::spawn_blocking(move || local_http_get_blocking(&url, timeout_ms.unwrap_or(1500)))
        .await
        .map_err(|error| format!("Local service probe task failed: {error}"))?
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn watcher_system_snapshot() -> Result<serde_json::Value, String> {
    let script = r#"
$ErrorActionPreference = 'Stop'
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$os = Get-CimInstance Win32_OperatingSystem
$disks = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
  [pscustomobject]@{
    name = [string]$_.DeviceID
    totalBytes = [uint64]($_.Size)
    freeBytes = [uint64]($_.FreeSpace)
  }
})
$gpu = Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch 'Microsoft Basic' } | Select-Object -First 1
$totalMemoryBytes = [uint64]$os.TotalVisibleMemorySize * 1024
$availableMemoryBytes = [uint64]$os.FreePhysicalMemory * 1024
$gpuObject = $null
if ($null -ne $gpu) {
  $gpuObject = [pscustomobject]@{
    name = [string]$gpu.Name
    adapterRamBytes = if ($null -ne $gpu.AdapterRAM) { [uint64]$gpu.AdapterRAM } else { $null }
    utilizationPercent = $null
    temperatureC = $null
    provider = 'windows-cim'
    detail = 'Adapter identity available. AMD utilization and temperature provider not yet bound.'
  }
}
[pscustomobject]@{
  sampledAt = (Get-Date).ToUniversalTime().ToString('o')
  cpuUsagePercent = if ($null -ne $cpu.LoadPercentage) { [double]$cpu.LoadPercentage } else { $null }
  totalMemoryBytes = $totalMemoryBytes
  availableMemoryBytes = $availableMemoryBytes
  usedMemoryBytes = $totalMemoryBytes - $availableMemoryBytes
  processCount = @(Get-Process).Count
  disks = $disks
  gpu = $gpuObject
} | ConvertTo-Json -Depth 6 -Compress
"#;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .map_err(|error| format!("Failed to launch Windows telemetry provider: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Windows telemetry provider returned a failure status.".to_string()
        } else {
            format!("Windows telemetry provider failed: {stderr}")
        });
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|error| format!("Windows telemetry provider returned invalid UTF-8: {error}"))?;
    serde_json::from_str(stdout.trim())
        .map_err(|error| format!("Windows telemetry provider returned invalid JSON: {error}"))
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn watcher_system_snapshot() -> Result<serde_json::Value, String> {
    Err("Watcher native host telemetry is currently implemented for Windows Foundry workstations.".to_string())
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
    let backup_path = path.with_extension("json.bak");

    fs::write(&temp_path, content)
        .map_err(|error| format!("Failed to write temporary Foundry mesh snapshot: {error}"))?;

    if path.exists() {
        let _ = fs::copy(&path, &backup_path);
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

fn local_http_get_blocking(url: &str, timeout_ms: u64) -> Result<LocalHttpResponse, String> {
    let (host, port, path) = parse_loopback_http_url(url)?;
    let timeout = Duration::from_millis(timeout_ms.clamp(100, 10_000));
    let mut stream = TcpStream::connect((host.as_str(), port))
        .map_err(|error| format!("Could not connect to local service {host}:{port}: {error}"))?;
    stream
        .set_read_timeout(Some(timeout))
        .map_err(|error| format!("Could not set local service read timeout: {error}"))?;
    stream
        .set_write_timeout(Some(timeout))
        .map_err(|error| format!("Could not set local service write timeout: {error}"))?;

    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nAccept: application/json\r\nConnection: close\r\n\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| format!("Could not write local service probe: {error}"))?;

    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| format!("Could not read local service response: {error}"))?;

    let (headers, body) = response
        .split_once("\r\n\r\n")
        .ok_or_else(|| "Local service returned an invalid HTTP response.".to_string())?;
    let status = headers
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|value| value.parse::<u16>().ok())
        .ok_or_else(|| "Local service response did not contain a valid HTTP status.".to_string())?;

    Ok(LocalHttpResponse {
        status,
        body: body.to_string(),
    })
}

fn parse_loopback_http_url(url: &str) -> Result<(String, u16, String), String> {
    let remainder = url
        .trim()
        .strip_prefix("http://")
        .ok_or_else(|| "Only loopback http:// service probes are permitted.".to_string())?;
    let (authority, path) = match remainder.split_once('/') {
        Some((authority, path)) => (authority, format!("/{path}")),
        None => (remainder, "/".to_string()),
    };

    if authority.contains('@') {
        return Err("Credentials are not permitted in local service probe URLs.".to_string());
    }

    let (host, port) = match authority.rsplit_once(':') {
        Some((host, port)) => {
            let parsed = port
                .parse::<u16>()
                .map_err(|_| "Local service probe port is invalid.".to_string())?;
            (host.to_string(), parsed)
        }
        None => (authority.to_string(), 80),
    };

    if host != "127.0.0.1" && host != "localhost" {
        return Err("Local service probes are restricted to localhost/127.0.0.1.".to_string());
    }

    Ok((host, port, path))
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
        .manage(ManagedProcesses::default())
        .setup(|app| {
            if bastion_launch_mode() {
                open_bastion_window(app.handle())
                    .map_err(|error| -> Box<dyn std::error::Error> { error.into() })?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_path,
            launch_external_tool,
            local_http_get,
            watcher_system_snapshot,
            bastion_launch_mode,
            bastion_open_window,
            bastion_close_window,
            bastion_startup_status,
            bastion_set_startup,
            managed_service_start,
            managed_service_stop,
            managed_service_status,
            mesh_load_snapshot,
            mesh_save_snapshot,
            mesh_append_event,
            mesh_read_events
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
