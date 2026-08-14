use serde::Serialize;
use std::process::Command;
use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

const STARTUP_VALUE_NAME: &str = "FenrirForgeworksBastion";
const STARTUP_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BastionDisplayTarget {
    name: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    portrait: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BastionStartupStatus {
    enabled: bool,
    command: Option<String>,
}

#[tauri::command]
pub fn bastion_launch_mode() -> bool {
    std::env::args().any(|arg| arg.eq_ignore_ascii_case("--bastion"))
}

fn select_bastion_display(app: &tauri::AppHandle) -> Result<BastionDisplayTarget, String> {
    let source = app
        .get_webview_window("main")
        .or_else(|| app.webview_windows().values().next().cloned())
        .ok_or_else(|| "No ForgeKeeper window is available to enumerate displays.".to_string())?;

    let monitors = source
        .available_monitors()
        .map_err(|error| format!("Failed to enumerate workstation displays: {error}"))?;
    if monitors.is_empty() {
        return Err("Windows did not report any available displays.".to_string());
    }

    let current_position = source
        .current_monitor()
        .map_err(|error| format!("Failed to identify the ForgeKeeper display: {error}"))?
        .map(|monitor| (monitor.position().x, monitor.position().y));

    let target = monitors
        .iter()
        .filter(|monitor| monitor.size().height > monitor.size().width)
        .max_by_key(|monitor| u64::from(monitor.size().width) * u64::from(monitor.size().height))
        .or_else(|| {
            monitors.iter().find(|monitor| {
                current_position
                    .map(|position| (monitor.position().x, monitor.position().y) != position)
                    .unwrap_or(false)
            })
        })
        .unwrap_or(&monitors[0]);

    Ok(BastionDisplayTarget {
        name: target.name().cloned().unwrap_or_else(|| "Portrait touch display".to_string()),
        x: target.position().x,
        y: target.position().y,
        width: target.size().width,
        height: target.size().height,
        portrait: target.size().height > target.size().width,
    })
}

pub fn open_bastion_window(app: &tauri::AppHandle) -> Result<BastionDisplayTarget, String> {
    let target = select_bastion_display(app)?;

    let window = if let Some(existing) = app.get_webview_window("bastion") {
        existing
    } else {
        WebviewWindowBuilder::new(app, "bastion", WebviewUrl::App("index.html".into()))
            .title("Bastion — Fenrir Forgeworks")
            .decorations(false)
            .resizable(false)
            .visible(false)
            .build()
            .map_err(|error| format!("Failed to create the Bastion touch surface: {error}"))?
    };

    window
        .set_position(PhysicalPosition::new(target.x, target.y))
        .map_err(|error| format!("Failed to move Bastion to the touch display: {error}"))?;
    window
        .set_size(PhysicalSize::new(target.width, target.height))
        .map_err(|error| format!("Failed to size Bastion to the touch display: {error}"))?;
    window
        .show()
        .map_err(|error| format!("Failed to show Bastion: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("Failed to focus Bastion: {error}"))?;

    Ok(target)
}

#[tauri::command]
pub async fn bastion_open_window(app: tauri::AppHandle) -> Result<BastionDisplayTarget, String> {
    open_bastion_window(&app)
}

#[tauri::command]
pub async fn bastion_close_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("bastion") {
        window
            .close()
            .map_err(|error| format!("Failed to close Bastion: {error}"))?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn bastion_startup_status() -> Result<BastionStartupStatus, String> {
    let output = Command::new("reg")
        .args(["query", STARTUP_KEY, "/v", STARTUP_VALUE_NAME])
        .output()
        .map_err(|error| format!("Failed to inspect Bastion startup registration: {error}"))?;

    if !output.status.success() {
        return Ok(BastionStartupStatus {
            enabled: false,
            command: None,
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let command = stdout
        .lines()
        .find(|line| line.contains(STARTUP_VALUE_NAME))
        .and_then(|line| line.split("REG_SZ").nth(1))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    Ok(BastionStartupStatus {
        enabled: command.is_some(),
        command,
    })
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn bastion_startup_status() -> Result<BastionStartupStatus, String> {
    Ok(BastionStartupStatus {
        enabled: false,
        command: None,
    })
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn bastion_set_startup(enabled: bool) -> Result<BastionStartupStatus, String> {
    if enabled {
        let executable = std::env::current_exe()
            .map_err(|error| format!("Failed to resolve ForgeKeeper executable: {error}"))?;
        let command = format!("\"{}\" --bastion", executable.display());
        let output = Command::new("reg")
            .args([
                "add",
                STARTUP_KEY,
                "/v",
                STARTUP_VALUE_NAME,
                "/t",
                "REG_SZ",
                "/d",
                &command,
                "/f",
            ])
            .output()
            .map_err(|error| format!("Failed to register Bastion for Windows startup: {error}"))?;

        if !output.status.success() {
            return Err(format!(
                "Windows rejected the Bastion startup registration: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
    } else {
        let output = Command::new("reg")
            .args(["delete", STARTUP_KEY, "/v", STARTUP_VALUE_NAME, "/f"])
            .output()
            .map_err(|error| format!("Failed to remove Bastion startup registration: {error}"))?;

        if !output.status.success() {
            let status = bastion_startup_status()?;
            if status.enabled {
                return Err(format!(
                    "Windows rejected removal of the Bastion startup registration: {}",
                    String::from_utf8_lossy(&output.stderr).trim()
                ));
            }
        }
    }

    bastion_startup_status()
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn bastion_set_startup(_enabled: bool) -> Result<BastionStartupStatus, String> {
    Err("Bastion startup registration is currently implemented for Windows workstations.".to_string())
}
