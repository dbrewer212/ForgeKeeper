use serde::Serialize;
use std::collections::HashMap;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::State;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Default)]
pub struct ManagedProcesses {
    children: Mutex<HashMap<String, Child>>,
}

#[derive(Serialize)]
pub struct ManagedProcessStatus {
    pub service_id: String,
    pub running: bool,
    pub pid: Option<u32>,
}

#[tauri::command]
pub fn managed_service_start(
    state: State<'_, ManagedProcesses>,
    service_id: String,
    executable: String,
    args: Option<Vec<String>>,
    working_directory: Option<String>,
) -> Result<ManagedProcessStatus, String> {
    validate_service_id(&service_id)?;
    if executable.trim().is_empty() {
        return Err("Managed service executable is not configured.".to_string());
    }

    let mut children = state
        .children
        .lock()
        .map_err(|_| "Managed service process registry is unavailable.".to_string())?;

    if let Some(child) = children.get_mut(&service_id) {
        match child
            .try_wait()
            .map_err(|error| format!("Failed to inspect managed service {service_id}: {error}"))?
        {
            None => {
                return Ok(ManagedProcessStatus {
                    service_id,
                    running: true,
                    pid: Some(child.id()),
                });
            }
            Some(_) => {}
        }
    }
    children.remove(&service_id);

    let mut command = Command::new(executable.trim());
    if let Some(args) = args {
        command.args(args);
    }
    if let Some(directory) = working_directory {
        let trimmed = directory.trim();
        if !trimmed.is_empty() {
            command.current_dir(trimmed);
        }
    }

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let child = command
        .spawn()
        .map_err(|error| format!("Failed to start managed service {service_id}: {error}"))?;
    let pid = child.id();
    children.insert(service_id.clone(), child);

    Ok(ManagedProcessStatus {
        service_id,
        running: true,
        pid: Some(pid),
    })
}

#[tauri::command]
pub fn managed_service_stop(
    state: State<'_, ManagedProcesses>,
    service_id: String,
) -> Result<ManagedProcessStatus, String> {
    validate_service_id(&service_id)?;
    let mut children = state
        .children
        .lock()
        .map_err(|_| "Managed service process registry is unavailable.".to_string())?;

    let Some(mut child) = children.remove(&service_id) else {
        return Ok(ManagedProcessStatus {
            service_id,
            running: false,
            pid: None,
        });
    };

    let pid = child.id();
    match child
        .try_wait()
        .map_err(|error| format!("Failed to inspect managed service {service_id}: {error}"))?
    {
        Some(_) => {}
        None => {
            child
                .kill()
                .map_err(|error| format!("Failed to stop managed service {service_id}: {error}"))?;
            let _ = child.wait();
        }
    }

    Ok(ManagedProcessStatus {
        service_id,
        running: false,
        pid: Some(pid),
    })
}

#[tauri::command]
pub fn managed_service_status(
    state: State<'_, ManagedProcesses>,
    service_id: String,
) -> Result<ManagedProcessStatus, String> {
    validate_service_id(&service_id)?;
    let mut children = state
        .children
        .lock()
        .map_err(|_| "Managed service process registry is unavailable.".to_string())?;

    let mut remove = false;
    let status = if let Some(child) = children.get_mut(&service_id) {
        let pid = child.id();
        match child
            .try_wait()
            .map_err(|error| format!("Failed to inspect managed service {service_id}: {error}"))?
        {
            None => ManagedProcessStatus {
                service_id: service_id.clone(),
                running: true,
                pid: Some(pid),
            },
            Some(_) => {
                remove = true;
                ManagedProcessStatus {
                    service_id: service_id.clone(),
                    running: false,
                    pid: Some(pid),
                }
            }
        }
    } else {
        ManagedProcessStatus {
            service_id: service_id.clone(),
            running: false,
            pid: None,
        }
    };

    if remove {
        children.remove(&service_id);
    }

    Ok(status)
}

fn validate_service_id(service_id: &str) -> Result<(), String> {
    let trimmed = service_id.trim();
    if trimmed.is_empty() {
        return Err("Managed service id is required.".to_string());
    }
    if !trimmed
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
    {
        return Err("Managed service id contains unsupported characters.".to_string());
    }
    Ok(())
}
