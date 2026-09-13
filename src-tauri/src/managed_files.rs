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
    pub scale_factor: Option<f64>,
    pub target_height_mm: Option<f64>,
}

#[tauri::command]
pub fn workbench_store_file(
    app: tauri::AppHandle,
    source_path: String,
    expected_sha256: String,
    target_height_mm: Option<f64>,
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

    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| sanitize_extension(value))
        .filter(|value| !value.is_empty());

    match target_height_mm {
        Some(target) => store_standardized_stl(&app, &source, extension.as_deref(), target),
        None => store_verified_source(&app, &source, &expected, extension.as_deref()),
    }
}

fn store_verified_source(
    app: &tauri::AppHandle,
    source: &PathBuf,
    expected: &str,
    extension: Option<&str>,
) -> Result<ManagedFileResult, String> {
    let destination = managed_destination(app, expected, extension)?;
    if let Some(result) = existing_result(source, &destination, expected, None, None)? {
        return Ok(result);
    }

    let temporary = temporary_path(&destination);
    clear_temporary(&temporary)?;
    let copy_result = copy_and_hash(source, &temporary);
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
        sha256: expected.to_string(),
        size_bytes: copied_bytes,
        reused_existing: false,
        scale_factor: None,
        target_height_mm: None,
    })
}

fn store_standardized_stl(
    app: &tauri::AppHandle,
    source: &PathBuf,
    extension: Option<&str>,
    target_height_mm: f64,
) -> Result<ManagedFileResult, String> {
    if extension != Some("stl") {
        return Err("Foundry scale standardization currently supports STL geometry only.".to_string());
    }
    if !target_height_mm.is_finite() || target_height_mm <= 0.0 {
        return Err("Scale standardization requires a positive target height in millimeters.".to_string());
    }

    let source_bytes = fs::read(source)
        .map_err(|error| format!("Could not read STL for scale standardization: {error}"))?;
    let (scaled_bytes, scale_factor) = scale_stl_to_height(&source_bytes, target_height_mm)?;
    let digest = sha256_bytes(&scaled_bytes);
    let destination = managed_destination(app, &digest, Some("stl"))?;

    if let Some(result) = existing_result(
        source,
        &destination,
        &digest,
        Some(scale_factor),
        Some(target_height_mm),
    )? {
        return Ok(result);
    }

    let temporary = temporary_path(&destination);
    clear_temporary(&temporary)?;
    fs::write(&temporary, &scaled_bytes)
        .map_err(|error| format!("Could not write standardized STL staging file: {error}"))?;
    let staged_hash = sha256_file(&temporary)?;
    if staged_hash != digest {
        let _ = fs::remove_file(&temporary);
        return Err("Standardized STL checksum changed while staging the managed file.".to_string());
    }
    fs::rename(&temporary, &destination)
        .map_err(|error| format!("Could not commit standardized Workbench geometry: {error}"))?;

    Ok(ManagedFileResult {
        source_path: source.to_string_lossy().to_string(),
        managed_path: destination.to_string_lossy().to_string(),
        sha256: digest,
        size_bytes: scaled_bytes.len() as u64,
        reused_existing: false,
        scale_factor: Some(scale_factor),
        target_height_mm: Some(target_height_mm),
    })
}

fn scale_stl_to_height(bytes: &[u8], target_height_mm: f64) -> Result<(Vec<u8>, f64), String> {
    if looks_like_binary_stl(bytes) {
        scale_binary_stl(bytes, target_height_mm)
    } else {
        scale_ascii_stl(bytes, target_height_mm)
    }
}

fn looks_like_binary_stl(bytes: &[u8]) -> bool {
    if bytes.len() < 84 {
        return false;
    }
    let count = u32::from_le_bytes([bytes[80], bytes[81], bytes[82], bytes[83]]) as usize;
    84usize.saturating_add(count.saturating_mul(50)) == bytes.len()
}

fn scale_binary_stl(bytes: &[u8], target_height_mm: f64) -> Result<(Vec<u8>, f64), String> {
    if bytes.len() < 84 {
        return Err("Binary STL header is incomplete.".to_string());
    }
    let count = u32::from_le_bytes([bytes[80], bytes[81], bytes[82], bytes[83]]) as usize;
    let expected = 84usize.saturating_add(count.saturating_mul(50));
    if expected != bytes.len() {
        return Err("Binary STL triangle table is truncated or contains trailing data.".to_string());
    }

    let mut min_z = f64::INFINITY;
    let mut max_z = f64::NEG_INFINITY;
    for index in 0..count {
        let vertex_start = 84 + index * 50 + 12;
        for vertex_index in 0..3 {
            let start = vertex_start + vertex_index * 12;
            let z = f32::from_le_bytes(bytes[start + 8..start + 12].try_into().unwrap()) as f64;
            min_z = min_z.min(z);
            max_z = max_z.max(z);
        }
    }
    let height = max_z - min_z;
    let factor = scale_factor(height, target_height_mm)?;
    let mut output = bytes.to_vec();
    for index in 0..count {
        let vertex_start = 84 + index * 50 + 12;
        for vertex_index in 0..3 {
            let start = vertex_start + vertex_index * 12;
            for axis in 0..3 {
                let offset = start + axis * 4;
                let value = f32::from_le_bytes(output[offset..offset + 4].try_into().unwrap()) as f64;
                let scaled = (value * factor) as f32;
                output[offset..offset + 4].copy_from_slice(&scaled.to_le_bytes());
            }
        }
    }
    Ok((output, factor))
}

fn scale_ascii_stl(bytes: &[u8], target_height_mm: f64) -> Result<(Vec<u8>, f64), String> {
    let text = std::str::from_utf8(bytes)
        .map_err(|_| "STL is neither a valid binary STL nor UTF-8 ASCII STL.".to_string())?;
    let mut min_z = f64::INFINITY;
    let mut max_z = f64::NEG_INFINITY;
    let mut vertex_count = 0usize;
    for line in text.lines() {
        if let Some(values) = parse_ascii_vertex(line)? {
            min_z = min_z.min(values[2]);
            max_z = max_z.max(values[2]);
            vertex_count += 1;
        }
    }
    if vertex_count < 3 {
        return Err("ASCII STL does not contain enough vertices to standardize.".to_string());
    }
    let factor = scale_factor(max_z - min_z, target_height_mm)?;
    let mut output = String::with_capacity(text.len());
    for line in text.lines() {
        if let Some(values) = parse_ascii_vertex(line)? {
            let indent_len = line.len() - line.trim_start().len();
            let indent = &line[..indent_len];
            output.push_str(&format!(
                "{indent}vertex {:.9} {:.9} {:.9}\n",
                values[0] * factor,
                values[1] * factor,
                values[2] * factor,
            ));
        } else {
            output.push_str(line);
            output.push('\n');
        }
    }
    Ok((output.into_bytes(), factor))
}

fn parse_ascii_vertex(line: &str) -> Result<Option<[f64; 3]>, String> {
    let trimmed = line.trim();
    let Some(rest) = trimmed.strip_prefix("vertex ") else {
        return Ok(None);
    };
    let values = rest
        .split_whitespace()
        .map(str::parse::<f64>)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "ASCII STL contains an invalid vertex.".to_string())?;
    if values.len() != 3 {
        return Err("ASCII STL vertex must contain exactly three coordinates.".to_string());
    }
    Ok(Some([values[0], values[1], values[2]]))
}

fn scale_factor(source_height: f64, target_height_mm: f64) -> Result<f64, String> {
    if !source_height.is_finite() || source_height <= f64::EPSILON {
        return Err("STL has no measurable Z height and cannot be standardized by height.".to_string());
    }
    let factor = target_height_mm / source_height;
    if !factor.is_finite() || factor <= 0.0 {
        return Err("Calculated scale factor is invalid.".to_string());
    }
    Ok(factor)
}

fn managed_destination(
    app: &tauri::AppHandle,
    digest: &str,
    extension: Option<&str>,
) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve Foundry application data directory: {error}"))?
        .join(WORKBENCH_FILE_DIR);
    let shard = &digest[0..2];
    let file_name = match extension {
        Some(extension) => format!("{digest}.{extension}"),
        None => digest.to_string(),
    };
    let directory = root.join(shard);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create Workbench managed-file directory: {error}"))?;
    Ok(directory.join(file_name))
}

fn existing_result(
    source: &PathBuf,
    destination: &PathBuf,
    digest: &str,
    scale_factor: Option<f64>,
    target_height_mm: Option<f64>,
) -> Result<Option<ManagedFileResult>, String> {
    if !destination.exists() {
        return Ok(None);
    }
    if !destination.is_file() {
        return Err("Managed-file destination exists but is not a regular file.".to_string());
    }
    let existing_hash = sha256_file(destination)?;
    if existing_hash != digest {
        return Err("Managed-file store contains a checksum conflict at the expected content address.".to_string());
    }
    let size = fs::metadata(destination)
        .map_err(|error| format!("Could not inspect existing managed file: {error}"))?
        .len();
    Ok(Some(ManagedFileResult {
        source_path: source.to_string_lossy().to_string(),
        managed_path: destination.to_string_lossy().to_string(),
        sha256: digest.to_string(),
        size_bytes: size,
        reused_existing: true,
        scale_factor,
        target_height_mm,
    }))
}

fn temporary_path(destination: &Path) -> PathBuf {
    destination.with_extension("foundry.tmp")
}

fn clear_temporary(path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("Could not clear incomplete managed-file staging copy: {error}"))?;
    }
    Ok(())
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

fn sha256_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
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
