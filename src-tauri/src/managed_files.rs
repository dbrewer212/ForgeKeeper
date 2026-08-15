use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::Manager;

const WORKBENCH_FILE_DIR: &str = "workbench/files";
const COPY_BUFFER_BYTES: usize = 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedFileResult {
    pub source_path: String,
    pub managed_path: String,
    pub sha256: String,
    pub size_bytes: u64,
    pub reused_existing: bool,
}

#[tauri::command]
pub fn workbench_store_file(
    app: tauri::AppHandle,
    source_path: String,
    expected_sha256: String,
) -> Result<ManagedFileResult, String> {
    let source_text = source_path.trim();
    if source_text.is_empty() {
        return Err("No source path was provided to the Workbench managed-file store.".to_string());
    }
    let source = fs::canonicalize(source_text)
        .map_err(|error| format!("Could not resolve managed-file source: {error}"))?;
    if !source.is_file() {
        return Err("Workbench managed-file source is not a regular file.".to_string());
    }

    let expected = expected_sha256.trim().to_ascii_lowercase();
    if expected.len() != 64 || !expected.chars().all(|value| value.is_ascii_hexdigit()) {
        return Err("Workbench managed-file storage requires a valid SHA-256 digest.".to_string());
    }

    let actual_source = sha256_file(&source)?;
    if actual_source != expected {
        return Err(format!(
            "Source changed after Intake inspection. Expected SHA-256 {expected}, found {actual_source}."
        ));
    }

    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve Foundry application data directory: {error}"))?
        .join(WORKBENCH_FILE_DIR);
    let shard = &expected[0..2];
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| sanitize_extension(value))
        .filter(|value| !value.is_empty());
    let file_name = match extension {
        Some(extension) => format!("{expected}.{extension}"),
        None => expected.clone(),
    };
    let directory = root.join(shard);
    let destination = directory.join(file_name);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create Workbench managed-file directory: {error}"))?;

    if destination.exists() {
        if !destination.is_file() {
            return Err("Managed-file destination exists but is not a regular file.".to_string());
        }
        let existing_hash = sha256_file(&destination)?;
        if existing_hash != expected {
            return Err("Managed-file store contains a checksum conflict at the expected content address.".to_string());
        }
        let size = fs::metadata(&destination)
            .map_err(|error| format!("Could not inspect existing managed file: {error}"))?
            .len();
        return Ok(ManagedFileResult {
            source_path: source.to_string_lossy().to_string(),
            managed_path: destination.to_string_lossy().to_string(),
            sha256: expected,
            size_bytes: size,
            reused_existing: true,
        });
    }

    let temporary = destination.with_extension("foundry.tmp");
    if temporary.exists() {
        fs::remove_file(&temporary)
            .map_err(|error| format!("Could not clear incomplete managed-file staging copy: {error}"))?;
    }

    let copy_result = copy_and_hash(&source, &temporary);
    let (copied_hash, copied_bytes) = match copy_result {
        Ok(value) => value,
        Err(error) => {
            let _ = fs::remove_file(&temporary);
            return Err(error);
        }
    };
    if copied_hash != expected {
        let _ = fs::remove_file(&temporary);
        return Err(format!(
            "Managed-file copy checksum mismatch. Expected {expected}, copied {copied_hash}."
        ));
    }

    fs::rename(&temporary, &destination)
        .map_err(|error| format!("Could not commit Workbench managed file: {error}"))?;

    Ok(ManagedFileResult {
        source_path: source.to_string_lossy().to_string(),
        managed_path: destination.to_string_lossy().to_string(),
        sha256: expected,
        size_bytes: copied_bytes,
        reused_existing: false,
    })
}

fn sanitize_extension(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .take(16)
        .collect::<String>()
        .to_ascii_lowercase()
}

fn copy_and_hash(source: &Path, destination: &Path) -> Result<(String, u64), String> {
    let mut input = fs::File::open(source)
        .map_err(|error| format!("Could not open source for managed-file copy: {error}"))?;
    let mut output = fs::File::create(destination)
        .map_err(|error| format!("Could not create managed-file staging copy: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; COPY_BUFFER_BYTES];
    let mut total = 0_u64;

    loop {
        let count = input
            .read(&mut buffer)
            .map_err(|error| format!("Could not read source during managed-file copy: {error}"))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
        output
            .write_all(&buffer[..count])
            .map_err(|error| format!("Could not write managed-file staging copy: {error}"))?;
        total = total.saturating_add(count as u64);
    }
    output
        .flush()
        .map_err(|error| format!("Could not finish managed-file staging copy: {error}"))?;
    Ok((format!("{:x}", hasher.finalize()), total))
}

fn sha256_file(path: &PathBuf) -> Result<String, String> {
    let mut file = fs::File::open(path)
        .map_err(|error| format!("Could not open file for checksum verification: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; COPY_BUFFER_BYTES];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|error| format!("Could not read file for checksum verification: {error}"))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}
