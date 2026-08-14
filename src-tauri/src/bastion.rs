use serde::Serialize;
use std::process::Command;

const STARTUP_VALUE_NAME: &str = "FenrirForgeworksBastion";
const STARTUP_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";

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
