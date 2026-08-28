use serde::Serialize;
use std::process::Command;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

const STARTUP_VALUE_NAME: &str = "FenrirForgeworksBastion";
const STARTUP_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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
    let standalone = bastion_launch_mode();

    // In --bastion startup mode the normal Forgekeeper surface is only a temporary
    // monitor-enumeration host. Hide it before showing Bastion so the user never has
    // to keep the full workspace open on the desktop.
    if standalone {
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.hide();
        }
    }

    let target = select_bastion_display(app)?;

    let window = if let Some(existing) = app.get_webview_window("bastion") {
        existing
    } else {
        WebviewWindowBuilder::new(app, "bastion", WebviewUrl::App("index.html".into()))
            .title("Bastion — Fenrir Forgeworks")
            .decorations(false)
            .resizable(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible(false)
            .build()
            .map_err(|error| format!("Failed to create the Bastion touch surface: {error}"))?
    };

    window
        .set_always_on_top(true)
        .map_err(|error| format!("Failed to keep Bastion above the Y70 display layer: {error}"))?;
    window
        .set_skip_taskbar(true)
        .map_err(|error| format!("Failed to keep Bastion out of the taskbar: {error}"))?;
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

    // Once the standalone Bastion webview exists it keeps the Tauri process alive.
    // The regular Forgekeeper window can therefore be closed completely.
    if standalone {
        if let Some(main) = app.get_webview_window("main") {
            main.close()
                .map_err(|error| format!("Failed to close the hidden Forgekeeper startup window: {error}"))?;
        }
    }

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
    let mut command = Command::new("reg");
    command.creation_flags(CREATE_NO_WINDOW);
    let output = command
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
        let mut process = Command::new("reg");
        process.creation_flags(CREATE_NO_WINDOW);
        let output = process
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
        let mut process = Command::new("reg");
        process.creation_flags(CREATE_NO_WINDOW);
        let output = process
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
