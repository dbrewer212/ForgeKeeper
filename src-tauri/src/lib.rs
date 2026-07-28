use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};
use zip::ZipArchive;

const DATABASE_URL: &str = "sqlite:forgekeeper.db";
const MAX_FORGEPACK_ENTRIES: usize = 200;
const MAX_FORGEPACK_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_FORGEPACK_ASSET_BYTES: u64 = 512 * 1024 * 1024;
const MAX_MANIFEST_BYTES: u64 = 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForgepackProduct {
    id: String,
    stage: String,
}

#[derive(Deserialize)]
struct ForgepackGate {
    status: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForgepackPipeline {
    physical_test_status: String,
}

#[derive(Deserialize)]
struct ForgepackAssetManifest {
    path: String,
    sha256: String,
    kind: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForgepackManifest {
    format: String,
    format_version: u32,
    packet_id: String,
    product: ForgepackProduct,
    canon_gate: ForgepackGate,
    forgeability: ForgepackGate,
    pipeline: ForgepackPipeline,
    assets: Vec<ForgepackAssetManifest>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportedForgepackAsset {
    archive_path: String,
    imported_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportedForgepack {
    manifest_json: String,
    package_path: String,
    asset_root: String,
    already_extracted: bool,
    assets: Vec<ImportedForgepackAsset>,
}

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

fn normalize_archive_path(value: &str) -> String {
    value.replace('\\', "/")
}

fn validate_asset_path(value: &str) -> Result<PathBuf, String> {
    let normalized = normalize_archive_path(value);
    if !normalized.starts_with("assets/") || normalized.len() > 260 {
        return Err(format!("Forgepack asset path is invalid: {value}"));
    }
    let path = PathBuf::from(&normalized);
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
        return Err(format!("Forgepack asset path escapes the packet: {value}"));
    }
    Ok(path)
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path)
        .map_err(|error| format!("Could not read {}: {error}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|error| format!("Could not read {}: {error}", path.display()))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

#[tauri::command]
fn import_forgepack(
    app: tauri::AppHandle,
    package_path: String,
    asset_root_path: Option<String>,
) -> Result<ImportedForgepack, String> {
    let source_path = PathBuf::from(package_path.trim());
    if !source_path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("forgepack"))
    {
        return Err("Select a .forgepack file.".to_string());
    }
    let source = File::open(&source_path)
        .map_err(|error| format!("Could not open the Foundry packet: {error}"))?;
    let mut archive = ZipArchive::new(source)
        .map_err(|error| format!("The Foundry packet is not a readable ZIP archive: {error}"))?;
    if archive.len() == 0 || archive.len() > MAX_FORGEPACK_ENTRIES {
        return Err(format!(
            "Foundry packets must contain between 1 and {MAX_FORGEPACK_ENTRIES} entries."
        ));
    }
    if archive.has_overlapping_files().map_err(|error| error.to_string())? {
        return Err("Foundry packets cannot contain overlapping ZIP entries.".to_string());
    }
    if archive.decompressed_size().unwrap_or(u128::MAX) > MAX_FORGEPACK_BYTES as u128 {
        return Err("The Foundry packet exceeds the 1 GiB extraction limit.".to_string());
    }

    let manifest_json = {
        let mut manifest_file = archive
            .by_name("manifest.json")
            .map_err(|_| "The Foundry packet is missing manifest.json.".to_string())?;
        if manifest_file.size() > MAX_MANIFEST_BYTES {
            return Err("manifest.json exceeds the 1 MiB limit.".to_string());
        }
        let mut json = String::new();
        manifest_file
            .read_to_string(&mut json)
            .map_err(|error| format!("Could not read manifest.json: {error}"))?;
        json
    };
    let manifest: ForgepackManifest = serde_json::from_str(&manifest_json)
        .map_err(|error| format!("manifest.json is invalid: {error}"))?;
    if manifest.format != "fenrir-forgepack" || manifest.format_version != 1 {
        return Err("This Forgekeeper build supports fenrir-forgepack version 1 only.".to_string());
    }
    let stage_rank = match manifest.product.stage.as_str() {
        "Planning" => 0,
        "Concept Approved" => 1,
        "Engineering" => 2,
        "Prototype" => 3,
        "Print Trial" => 4,
        "Production Approved" => 5,
        "Released" => 6,
        _ => return Err("The Foundry packet contains an unsupported product stage.".to_string()),
    };
    if stage_rank >= 1 && manifest.canon_gate.status != "Approved" {
        return Err("Concept Approved and later packets require Canon Gate Approved.".to_string());
    }
    if stage_rank >= 5 {
        if manifest.forgeability.status != "Approved" {
            return Err("Production Approved and Released packets require Forgeability Approved.".to_string());
        }
        if manifest.pipeline.physical_test_status != "Passed" {
            return Err("Production Approved and Released packets require Physical Trial Passed.".to_string());
        }
        if !manifest
            .assets
            .iter()
            .any(|asset| matches!(asset.kind.as_str(), "stl" | "3mf"))
        {
            return Err("Production Approved and Released packets require an STL or 3MF asset.".to_string());
        }
    }

    let product_id = safe_segment(&manifest.product.id, "product.id")?;
    let packet_id = safe_segment(&manifest.packet_id, "packetId")?;
    let base_root = match asset_root_path.filter(|value| !value.trim().is_empty()) {
        Some(value) => PathBuf::from(value),
        None => app
            .path()
            .app_data_dir()
            .map_err(|error| format!("Could not resolve Forgekeeper's data directory: {error}"))?
            .join("library"),
    };
    let intake_root = base_root.join("Intake").join(product_id);
    let final_root = intake_root.join(&packet_id);
    let staging_root = intake_root.join(format!(".{packet_id}.staging"));
    fs::create_dir_all(&intake_root)
        .map_err(|error| format!("Could not create the Foundry intake directory: {error}"))?;

    let expected_assets: Vec<(String, PathBuf, String)> = manifest
        .assets
        .iter()
        .map(|asset| {
            let path = validate_asset_path(&asset.path)?;
            let digest = asset.sha256.trim().to_ascii_lowercase();
            if digest.len() != 64 || !digest.chars().all(|value| value.is_ascii_hexdigit()) {
                return Err(format!("Invalid SHA-256 digest for {}.", asset.path));
            }
            Ok((normalize_archive_path(&asset.path), path, digest))
        })
        .collect::<Result<_, String>>()?;
    let declared_paths: HashSet<String> = expected_assets
        .iter()
        .map(|(archive_path, _, _)| archive_path.clone())
        .collect();
    if declared_paths.len() != expected_assets.len() {
        return Err("Foundry packet asset paths must be unique.".to_string());
    }
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("Could not inspect ZIP entry {index}: {error}"))?;
        if entry.enclosed_name().is_none() || entry.is_symlink() {
            return Err(format!("The packet contains an unsafe ZIP entry: {}", entry.name()));
        }
        if entry.is_dir() {
            continue;
        }
        let name = normalize_archive_path(entry.name());
        if name != "manifest.json" && !declared_paths.contains(&name) {
            return Err(format!("The packet contains an undeclared file: {name}"));
        }
    }

    if final_root.exists() {
        let assets = expected_assets
            .iter()
            .map(|(archive_path, relative_path, expected_digest)| {
                let imported_path = final_root.join(relative_path);
                if !imported_path.is_file() {
                    return Err(format!(
                        "The existing intake is incomplete. Missing {}.",
                        imported_path.display()
                    ));
                }
                let actual_digest = sha256_file(&imported_path)?;
                if &actual_digest != expected_digest {
                    return Err(format!(
                        "The existing intake failed checksum verification: {}.",
                        imported_path.display()
                    ));
                }
                Ok(ImportedForgepackAsset {
                    archive_path: archive_path.clone(),
                    imported_path: imported_path.to_string_lossy().to_string(),
                })
            })
            .collect::<Result<Vec<_>, String>>()?;
        return Ok(ImportedForgepack {
            manifest_json,
            package_path: source_path.to_string_lossy().to_string(),
            asset_root: final_root.to_string_lossy().to_string(),
            already_extracted: true,
            assets,
        });
    }

    if staging_root.exists() {
        fs::remove_dir_all(&staging_root)
            .map_err(|error| format!("Could not clear an incomplete intake staging directory: {error}"))?;
    }
    fs::create_dir_all(&staging_root)
        .map_err(|error| format!("Could not create an intake staging directory: {error}"))?;

    let extraction_result = (|| -> Result<Vec<ImportedForgepackAsset>, String> {
        let mut imported_assets = Vec::with_capacity(expected_assets.len());
        let mut extracted_bytes = 0_u64;
        for (archive_path, relative_path, expected_digest) in &expected_assets {
            let mut asset = archive
                .by_name(archive_path)
                .map_err(|_| format!("The packet is missing declared asset {archive_path}."))?;
            if asset.is_dir() || asset.is_symlink() || !asset.is_file() {
                return Err(format!("{archive_path} must be a regular file."));
            }
            if asset.enclosed_name().is_none() {
                return Err(format!("{archive_path} is not a safe archive path."));
            }
            if asset.size() > MAX_FORGEPACK_ASSET_BYTES {
                return Err(format!("{archive_path} exceeds the 512 MiB per-asset limit."));
            }
            extracted_bytes = extracted_bytes.saturating_add(asset.size());
            if extracted_bytes > MAX_FORGEPACK_BYTES {
                return Err("The Foundry packet exceeds the 1 GiB extraction limit.".to_string());
            }

            let output_path = staging_root.join(relative_path);
            if let Some(parent) = output_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("Could not create an asset directory: {error}"))?;
            }
            let mut output = File::create(&output_path)
                .map_err(|error| format!("Could not create {}: {error}", output_path.display()))?;
            let mut hasher = Sha256::new();
            let mut buffer = [0_u8; 64 * 1024];
            loop {
                let count = asset
                    .read(&mut buffer)
                    .map_err(|error| format!("Could not read {archive_path}: {error}"))?;
                if count == 0 {
                    break;
                }
                hasher.update(&buffer[..count]);
                output
                    .write_all(&buffer[..count])
                    .map_err(|error| format!("Could not write {archive_path}: {error}"))?;
            }
            output
                .flush()
                .map_err(|error| format!("Could not finish writing {archive_path}: {error}"))?;
            let actual_digest = format!("{:x}", hasher.finalize());
            if &actual_digest != expected_digest {
                return Err(format!("Checksum verification failed for {archive_path}."));
            }
            imported_assets.push(ImportedForgepackAsset {
                archive_path: archive_path.clone(),
                imported_path: final_root.join(relative_path).to_string_lossy().to_string(),
            });
        }
        Ok(imported_assets)
    })();

    let imported_assets = match extraction_result {
        Ok(assets) => assets,
        Err(error) => {
            let _ = fs::remove_dir_all(&staging_root);
            return Err(error);
        }
    };
    fs::write(staging_root.join("manifest.json"), manifest_json.as_bytes())
        .map_err(|error| format!("Could not preserve the packet manifest: {error}"))?;
    fs::rename(&staging_root, &final_root)
        .map_err(|error| format!("Could not finalize the Foundry intake: {error}"))?;

    Ok(ImportedForgepack {
        manifest_json,
        package_path: source_path.to_string_lossy().to_string(),
        asset_root: final_root.to_string_lossy().to_string(),
        already_extracted: false,
        assets: imported_assets,
    })
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
        Migration {
            version: 3,
            description: "create_forgepack_intake",
            sql: include_str!("../migrations/0003_forgepack_intake.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DATABASE_URL, migrations)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_path,
            launch_external_tool,
            import_forgepack
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
