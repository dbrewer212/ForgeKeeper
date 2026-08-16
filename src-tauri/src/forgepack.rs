use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::Manager;
use zip::write::FileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const MAX_ENTRIES: usize = 500;
const MAX_PACKET_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_ASSET_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_MANIFEST_BYTES: u64 = 4 * 1024 * 1024;
const MANAGED_FILE_DIR: &str = "workbench/files";
const FORGEPACK_DIR: &str = "workbench/forgepacks";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForgepackExportFile {
    pub file_id: String,
    pub file_name: String,
    pub storage_path: String,
    pub sha256: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForgepackExportResult {
    pub output_path: String,
    pub file_count: usize,
    pub total_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForgepackImportedFile {
    pub file_id: String,
    pub archive_path: String,
    pub managed_path: String,
    pub sha256: String,
    pub size_bytes: u64,
    pub reused_existing: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForgepackImportResult {
    pub manifest_json: String,
    pub package_path: String,
    pub files: Vec<ForgepackImportedFile>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransportManifest {
    format: String,
    format_version: u32,
    files: Vec<TransportManifestFile>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransportManifestFile {
    file_id: String,
    archive_path: String,
    sha256: String,
}

#[tauri::command]
pub fn workbench_export_forgepack(
    app: tauri::AppHandle,
    manifest_json: String,
    files: Vec<ForgepackExportFile>,
    output_name: String,
) -> Result<ForgepackExportResult, String> {
    if manifest_json.len() as u64 > MAX_MANIFEST_BYTES {
        return Err("Forgepack manifest exceeds the 4 MiB limit.".to_string());
    }
    let manifest = parse_transport_manifest(&manifest_json)?;
    if manifest.files.len() != files.len() {
        return Err("Forgepack manifest file list does not match export file list.".to_string());
    }

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve Foundry application data directory: {error}"))?;
    let managed_root = canonical_or_create(app_data.join(MANAGED_FILE_DIR))?;
    let export_root = app_data.join(FORGEPACK_DIR);
    fs::create_dir_all(&export_root)
        .map_err(|error| format!("Could not create Forgepack export directory: {error}"))?;

    let safe_name = safe_segment(output_name.trim().trim_end_matches(".forgepack"), "Forgepack name")?;
    let output_path = export_root.join(format!("{safe_name}.forgepack"));
    let temp_path = export_root.join(format!(".{safe_name}.forgepack.tmp"));
    if temp_path.exists() {
        fs::remove_file(&temp_path)
            .map_err(|error| format!("Could not clear incomplete Forgepack export: {error}"))?;
    }

    let declared = manifest
        .files
        .iter()
        .map(|file| (&file.file_id, file))
        .collect::<std::collections::HashMap<_, _>>();
    let mut prepared = Vec::with_capacity(files.len());
    let mut total_bytes = 0_u64;
    for file in &files {
        let expected = validate_digest(&file.sha256)?;
        let declaration = declared
            .get(&file.file_id)
            .ok_or_else(|| format!("Manifest does not declare file {}.", file.file_id))?;
        if validate_digest(&declaration.sha256)? != expected {
            return Err(format!(
                "Manifest checksum does not match export record for {}.",
                file.file_id
            ));
        }
        let expected_archive = safe_archive_path(&declaration.archive_path)?;
        let source = fs::canonicalize(file.storage_path.trim())
            .map_err(|error| format!("Could not resolve managed file {}: {error}", file.file_id))?;
        if !source.is_file() || !source.starts_with(&managed_root) {
            return Err(format!(
                "Forgepack export only permits Foundry-managed files: {}.",
                file.file_id
            ));
        }
        let metadata = fs::metadata(&source)
            .map_err(|error| format!("Could not inspect managed file {}: {error}", file.file_id))?;
        if metadata.len() > MAX_ASSET_BYTES {
            return Err(format!(
                "Managed file {} exceeds the 1 GiB per-file Forgepack limit.",
                file.file_id
            ));
        }
        total_bytes = total_bytes.saturating_add(metadata.len());
        if total_bytes > MAX_PACKET_BYTES {
            return Err("Forgepack assets exceed the 2 GiB packet limit.".to_string());
        }
        let actual = sha256_file(&source)?;
        if actual != expected {
            return Err(format!(
                "Managed file {} failed checksum verification before export.",
                file.file_id
            ));
        }
        prepared.push((source, expected_archive, metadata.len()));
    }

    let export_result = (|| -> Result<(), String> {
        let output = File::create(&temp_path)
            .map_err(|error| format!("Could not create Forgepack staging file: {error}"))?;
        let mut writer = ZipWriter::new(output);
        let options = FileOptions::default()
            .compression_method(CompressionMethod::Deflated)
            .unix_permissions(0o644);
        writer
            .start_file("manifest.json", options)
            .map_err(|error| format!("Could not write Forgepack manifest entry: {error}"))?;
        writer
            .write_all(manifest_json.as_bytes())
            .map_err(|error| format!("Could not write Forgepack manifest: {error}"))?;

        for (source, archive_path, _) in &prepared {
            writer
                .start_file(archive_path, options)
                .map_err(|error| format!("Could not create Forgepack asset entry: {error}"))?;
            let mut input = File::open(source)
                .map_err(|error| format!("Could not open managed asset during export: {error}"))?;
            std::io::copy(&mut input, &mut writer)
                .map_err(|error| format!("Could not write managed asset into Forgepack: {error}"))?;
        }
        writer
            .finish()
            .map_err(|error| format!("Could not finalize Forgepack archive: {error}"))?;
        Ok(())
    })();

    if let Err(error) = export_result {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }
    if output_path.exists() {
        fs::remove_file(&output_path)
            .map_err(|error| format!("Could not replace previous Forgepack export: {error}"))?;
    }
    fs::rename(&temp_path, &output_path)
        .map_err(|error| format!("Could not commit Forgepack export: {error}"))?;

    Ok(ForgepackExportResult {
        output_path: output_path.to_string_lossy().to_string(),
        file_count: prepared.len(),
        total_bytes,
    })
}

#[tauri::command]
pub fn workbench_import_forgepack(
    app: tauri::AppHandle,
    package_path: String,
) -> Result<ForgepackImportResult, String> {
    let package = fs::canonicalize(package_path.trim())
        .map_err(|error| format!("Could not resolve Forgepack: {error}"))?;
    if !package.is_file()
        || !package
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("forgepack"))
    {
        return Err("Select a valid .forgepack file.".to_string());
    }

    let source = File::open(&package)
        .map_err(|error| format!("Could not open Forgepack: {error}"))?;
    let mut archive = ZipArchive::new(source)
        .map_err(|error| format!("Forgepack is not a readable ZIP archive: {error}"))?;
    if archive.len() == 0 || archive.len() > MAX_ENTRIES {
        return Err(format!(
            "Forgepack must contain between 1 and {MAX_ENTRIES} entries."
        ));
    }

    // zip 0.6 does not expose aggregate decompressed-size or overlap helpers. Enforce the
    // same practical intake boundary by validating every central-directory entry up front,
    // rejecting duplicate names, unsafe paths, directory/symlink entries, and an aggregate
    // uncompressed size above the packet limit before any extraction occurs.
    let mut seen_entry_names = HashSet::new();
    let mut total_uncompressed_bytes = 0_u64;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("Could not inspect Forgepack entry: {error}"))?;
        let name = normalize_archive_path(entry.name());
        if !seen_entry_names.insert(name.clone()) {
            return Err(format!("Forgepack contains duplicate ZIP entry: {name}"));
        }
        if entry.enclosed_name().is_none() || entry.is_dir() || zip_entry_is_symlink(&entry) {
            return Err(format!(
                "Forgepack contains an unsafe or unsupported ZIP entry: {}",
                entry.name()
            ));
        }
        total_uncompressed_bytes = total_uncompressed_bytes.saturating_add(entry.size());
        if total_uncompressed_bytes > MAX_PACKET_BYTES {
            return Err("Forgepack exceeds the 2 GiB extraction limit.".to_string());
        }
    }

    let manifest_json = {
        let mut manifest_entry = archive
            .by_name("manifest.json")
            .map_err(|_| "Forgepack is missing manifest.json.".to_string())?;
        if manifest_entry.size() > MAX_MANIFEST_BYTES {
            return Err("Forgepack manifest exceeds the 4 MiB limit.".to_string());
        }
        let mut value = String::new();
        manifest_entry
            .read_to_string(&mut value)
            .map_err(|error| format!("Could not read Forgepack manifest: {error}"))?;
        value
    };
    let manifest = parse_transport_manifest(&manifest_json)?;
    if manifest.files.len() + 1 != archive.len() {
        return Err("Forgepack contains undeclared files or directories.".to_string());
    }

    let mut declared_paths = HashSet::new();
    for file in &manifest.files {
        let normalized = safe_archive_path(&file.archive_path)?;
        if !declared_paths.insert(normalized) {
            return Err("Forgepack file archive paths must be unique.".to_string());
        }
    }
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("Could not inspect Forgepack entry: {error}"))?;
        let name = normalize_archive_path(entry.name());
        if name != "manifest.json" && !declared_paths.contains(&name) {
            return Err(format!("Forgepack contains undeclared file: {name}"));
        }
    }

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve Foundry application data directory: {error}"))?;
    let managed_root = app_data.join(MANAGED_FILE_DIR);
    fs::create_dir_all(&managed_root)
        .map_err(|error| format!("Could not create Workbench managed-file directory: {error}"))?;

    let mut imported = Vec::with_capacity(manifest.files.len());
    for file in &manifest.files {
        let digest = validate_digest(&file.sha256)?;
        let archive_path = safe_archive_path(&file.archive_path)?;
        let mut entry = archive
            .by_name(&archive_path)
            .map_err(|_| format!("Forgepack is missing declared file {archive_path}."))?;
        if entry.size() > MAX_ASSET_BYTES {
            return Err(format!(
                "Forgepack file {archive_path} exceeds the 1 GiB per-file limit."
            ));
        }

        let original_name = Path::new(&archive_path)
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("asset");
        let extension = Path::new(original_name)
            .extension()
            .and_then(|value| value.to_str())
            .map(sanitize_extension)
            .filter(|value| !value.is_empty());
        let shard = &digest[0..2];
        let directory = managed_root.join(shard);
        fs::create_dir_all(&directory)
            .map_err(|error| format!("Could not create managed-file shard directory: {error}"))?;
        let destination = match extension {
            Some(extension) => directory.join(format!("{digest}.{extension}")),
            None => directory.join(&digest),
        };

        let reused_existing = if destination.exists() {
            if !destination.is_file() || sha256_file(&destination)? != digest {
                return Err(format!(
                    "Managed-file checksum conflict for imported file {}.",
                    file.file_id
                ));
            }
            true
        } else {
            let temporary = destination.with_extension("forgepack.tmp");
            if temporary.exists() {
                fs::remove_file(&temporary)
                    .map_err(|error| format!("Could not clear incomplete Forgepack extraction: {error}"))?;
            }
            let extraction = extract_entry_with_hash(&mut entry, &temporary);
            let (actual, _) = match extraction {
                Ok(value) => value,
                Err(error) => {
                    let _ = fs::remove_file(&temporary);
                    return Err(error);
                }
            };
            if actual != digest {
                let _ = fs::remove_file(&temporary);
                return Err(format!(
                    "Checksum verification failed for Forgepack file {}.",
                    file.file_id
                ));
            }
            fs::rename(&temporary, &destination)
                .map_err(|error| format!("Could not commit imported managed file: {error}"))?;
            false
        };

        let size = fs::metadata(&destination)
            .map_err(|error| format!("Could not inspect imported managed file: {error}"))?
            .len();
        imported.push(ForgepackImportedFile {
            file_id: file.file_id.clone(),
            archive_path,
            managed_path: destination.to_string_lossy().to_string(),
            sha256: digest,
            size_bytes: size,
            reused_existing,
        });
    }

    Ok(ForgepackImportResult {
        manifest_json,
        package_path: package.to_string_lossy().to_string(),
        files: imported,
    })
}

fn parse_transport_manifest(json: &str) -> Result<TransportManifest, String> {
    let manifest: TransportManifest = serde_json::from_str(json)
        .map_err(|error| format!("Forgepack manifest is invalid JSON: {error}"))?;
    if manifest.format != "fenrir-foundry-workbench-forgepack" || manifest.format_version != 1 {
        return Err("Unsupported Forgepack format or version.".to_string());
    }
    if manifest.files.len() + 1 > MAX_ENTRIES {
        return Err("Forgepack manifest declares too many files.".to_string());
    }
    Ok(manifest)
}

fn safe_archive_path(value: &str) -> Result<String, String> {
    let normalized = normalize_archive_path(value.trim());
    if !normalized.starts_with("assets/") || normalized.len() > 512 {
        return Err(format!("Unsafe Forgepack asset path: {value}"));
    }
    let path = Path::new(&normalized);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        })
    {
        return Err(format!("Forgepack asset path escapes the archive: {value}"));
    }
    Ok(normalized)
}

fn normalize_archive_path(value: &str) -> String {
    value.replace('\\', "/")
}

fn safe_segment(value: &str, label: &str) -> Result<String, String> {
    let sanitized: String = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '_'
            }
        })
        .collect();
    let sanitized = sanitized.trim_matches('.').trim_matches('_').to_string();
    if sanitized.is_empty() || sanitized.len() > 120 {
        return Err(format!("{label} is not a safe Foundry identifier."));
    }
    Ok(sanitized)
}

fn sanitize_extension(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .take(16)
        .collect::<String>()
        .to_ascii_lowercase()
}

fn validate_digest(value: &str) -> Result<String, String> {
    let digest = value.trim().to_ascii_lowercase();
    if digest.len() != 64 || !digest.chars().all(|value| value.is_ascii_hexdigit()) {
        return Err("Forgepack file contains an invalid SHA-256 digest.".to_string());
    }
    Ok(digest)
}

fn zip_entry_is_symlink(entry: &zip::read::ZipFile<'_>) -> bool {
    entry
        .unix_mode()
        .is_some_and(|mode| (mode & 0o170000) == 0o120000)
}

fn canonical_or_create(path: PathBuf) -> Result<PathBuf, String> {
    fs::create_dir_all(&path)
        .map_err(|error| format!("Could not create Foundry directory: {error}"))?;
    fs::canonicalize(path)
        .map_err(|error| format!("Could not canonicalize Foundry directory: {error}"))
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path)
        .map_err(|error| format!("Could not open file for checksum verification: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 1024 * 1024];
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

fn extract_entry_with_hash<R: Read>(
    input: &mut R,
    destination: &Path,
) -> Result<(String, u64), String> {
    let mut output = File::create(destination)
        .map_err(|error| format!("Could not create Forgepack extraction staging file: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 1024 * 1024];
    let mut total = 0_u64;
    loop {
        let count = input
            .read(&mut buffer)
            .map_err(|error| format!("Could not read Forgepack asset: {error}"))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
        output
            .write_all(&buffer[..count])
            .map_err(|error| format!("Could not write Forgepack asset: {error}"))?;
        total = total.saturating_add(count as u64);
    }
    output
        .flush()
        .map_err(|error| format!("Could not finish Forgepack extraction: {error}"))?;
    Ok((format!("{:x}", hasher.finalize()), total))
}
