use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::io::Read;
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalPathInspection {
    pub path: String,
    pub exists: bool,
    pub is_file: bool,
    pub size_bytes: Option<u64>,
    pub sha256: Option<String>,
    pub error: Option<String>,
}

#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct GeometryBounds {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeGeometryInspection {
    pub path: String,
    pub format: String,
    pub bounds_mm: Option<GeometryBounds>,
    pub triangle_count: Option<u64>,
    pub shell_count: Option<u64>,
    pub open_edge_count: Option<u64>,
    pub manifold: Option<bool>,
    pub vertex_count: Option<u64>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Copy)]
struct Vertex([f64; 3]);

#[tauri::command]
pub fn inspect_local_paths(paths: Vec<String>) -> Vec<LocalPathInspection> {
    paths.into_iter().map(inspect_path).collect()
}

pub fn inspect_geometry(path: String) -> Result<NativeGeometryInspection, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("No geometry path was provided.".to_string());
    }
    let candidate = Path::new(trimmed);
    if !candidate.is_file() {
        return Err(format!("Geometry file does not exist: {trimmed}"));
    }
    let extension = candidate.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    match extension.as_str() {
        "stl" => inspect_stl(candidate),
        "obj" => inspect_obj(candidate),
        other => Err(format!("Deterministic native geometry inspection is not yet available for .{other}. Supported formats: STL, OBJ.")),
    }
}

fn inspect_path(path: String) -> LocalPathInspection {
    let candidate = Path::new(path.trim());
    if path.trim().is_empty() {
        return LocalPathInspection { path, exists: false, is_file: false, size_bytes: None, sha256: None, error: Some("Path is empty.".to_string()) };
    }
    match fs::metadata(candidate) {
        Ok(metadata) => {
            let is_file = metadata.is_file();
            let sha256 = if is_file { sha256_file(candidate).ok() } else { None };
            LocalPathInspection { path, exists: true, is_file, size_bytes: if is_file { Some(metadata.len()) } else { None }, sha256, error: if is_file { None } else { Some("Path exists but is not a file.".to_string()) } }
        }
        Err(error) => LocalPathInspection { path, exists: false, is_file: false, size_bytes: None, sha256: None, error: Some(error.to_string()) },
    }
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|error| format!("Failed to open file for hashing: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 1024 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| format!("Failed while hashing file: {error}"))?;
        if read == 0 { break; }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn inspect_stl(path: &Path) -> Result<NativeGeometryInspection, String> {
    let bytes = fs::read(path).map_err(|error| format!("Failed to read STL: {error}"))?;
    let triangles = if looks_like_binary_stl(&bytes) { parse_binary_stl(&bytes)? } else { parse_ascii_stl(&bytes)? };
    summarize_triangles(path, "stl", triangles)
}

fn looks_like_binary_stl(bytes: &[u8]) -> bool {
    if bytes.len() < 84 { return false; }
    let count = u32::from_le_bytes([bytes[80], bytes[81], bytes[82], bytes[83]]) as usize;
    84usize.saturating_add(count.saturating_mul(50)) == bytes.len()
}

fn parse_binary_stl(bytes: &[u8]) -> Result<Vec<[Vertex; 3]>, String> {
    if bytes.len() < 84 { return Err("Binary STL header is incomplete.".to_string()); }
    let count = u32::from_le_bytes([bytes[80], bytes[81], bytes[82], bytes[83]]) as usize;
    let expected = 84usize.saturating_add(count.saturating_mul(50));
    if expected > bytes.len() { return Err("Binary STL triangle table is truncated.".to_string()); }
    let mut triangles = Vec::with_capacity(count);
    for index in 0..count {
        let offset = 84 + index * 50 + 12;
        let mut vertices = [Vertex([0.0; 3]); 3];
        for (vertex_index, vertex) in vertices.iter_mut().enumerate() {
            let start = offset + vertex_index * 12;
            let x = f32::from_le_bytes(bytes[start..start + 4].try_into().unwrap()) as f64;
            let y = f32::from_le_bytes(bytes[start + 4..start + 8].try_into().unwrap()) as f64;
            let z = f32::from_le_bytes(bytes[start + 8..start + 12].try_into().unwrap()) as f64;
            *vertex = Vertex([x, y, z]);
        }
        triangles.push(vertices);
    }
    Ok(triangles)
}

fn parse_ascii_stl(bytes: &[u8]) -> Result<Vec<[Vertex; 3]>, String> {
    let text = std::str::from_utf8(bytes).map_err(|_| "ASCII STL contains invalid UTF-8 and is not a valid binary STL.".to_string())?;
    let mut points = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("vertex ") {
            let values = rest.split_whitespace().map(str::parse::<f64>).collect::<Result<Vec<_>, _>>().map_err(|_| "ASCII STL contains an invalid vertex.".to_string())?;
            if values.len() != 3 { return Err("ASCII STL vertex must contain exactly three coordinates.".to_string()); }
            points.push(Vertex([values[0], values[1], values[2]]));
        }
    }
    if points.len() < 3 || points.len() % 3 != 0 { return Err("ASCII STL does not contain a complete triangle list.".to_string()); }
    Ok(points.chunks_exact(3).map(|chunk| [chunk[0], chunk[1], chunk[2]]).collect())
}

fn inspect_obj(path: &Path) -> Result<NativeGeometryInspection, String> {
    let text = fs::read_to_string(path).map_err(|error| format!("Failed to read OBJ: {error}"))?;
    let mut vertices: Vec<Vertex> = Vec::new();
    let mut triangles: Vec<[Vertex; 3]> = Vec::new();
    let mut warnings = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("v ") {
            let values = rest.split_whitespace().take(3).map(str::parse::<f64>).collect::<Result<Vec<_>, _>>().map_err(|_| "OBJ contains an invalid vertex.".to_string())?;
            if values.len() == 3 { vertices.push(Vertex([values[0], values[1], values[2]])); }
        } else if let Some(rest) = trimmed.strip_prefix("f ") {
            let indices = rest.split_whitespace().map(|token| token.split('/').next().unwrap_or("")).map(str::parse::<isize>).collect::<Result<Vec<_>, _>>().map_err(|_| "OBJ contains an invalid face index.".to_string())?;
            if indices.len() < 3 { continue; }
            let resolved = indices.iter().map(|index| resolve_obj_index(*index, vertices.len())).collect::<Result<Vec<_>, _>>()?;
            for i in 1..resolved.len() - 1 {
                triangles.push([vertices[resolved[0]], vertices[resolved[i]], vertices[resolved[i + 1]]]);
            }
            if indices.len() > 4 { warnings.push("OBJ polygon faces were triangulated using a fan for deterministic analysis.".to_string()); }
        }
    }
    if triangles.is_empty() { return Err("OBJ does not contain any faces that could be inspected.".to_string()); }
    let mut summary = summarize_triangles(path, "obj", triangles)?;
    summary.vertex_count = Some(vertices.len() as u64);
    summary.warnings.extend(warnings);
    Ok(summary)
}

fn resolve_obj_index(index: isize, len: usize) -> Result<usize, String> {
    if index == 0 { return Err("OBJ face indices are 1-based; zero is invalid.".to_string()); }
    let resolved = if index > 0 { index - 1 } else { len as isize + index };
    if resolved < 0 || resolved as usize >= len { return Err("OBJ face index points outside the vertex table.".to_string()); }
    Ok(resolved as usize)
}

fn summarize_triangles(path: &Path, format: &str, triangles: Vec<[Vertex; 3]>) -> Result<NativeGeometryInspection, String> {
    if triangles.is_empty() { return Err("Geometry contains no triangles.".to_string()); }
    let mut min = [f64::INFINITY; 3];
    let mut max = [f64::NEG_INFINITY; 3];
    let mut vertex_ids: HashMap<(i64, i64, i64), usize> = HashMap::new();
    let mut edges: HashMap<(usize, usize), u32> = HashMap::new();
    let mut adjacency: HashMap<usize, HashSet<usize>> = HashMap::new();

    for triangle in &triangles {
        let mut ids = [0usize; 3];
        for (index, vertex) in triangle.iter().enumerate() {
            for axis in 0..3 { min[axis] = min[axis].min(vertex.0[axis]); max[axis] = max[axis].max(vertex.0[axis]); }
            let key = quantized_key(*vertex);
            let next_id = vertex_ids.len();
            ids[index] = *vertex_ids.entry(key).or_insert(next_id);
        }
        for (a, b) in [(ids[0], ids[1]), (ids[1], ids[2]), (ids[2], ids[0])] {
            let edge = if a < b { (a, b) } else { (b, a) };
            *edges.entry(edge).or_insert(0) += 1;
            adjacency.entry(a).or_default().insert(b);
            adjacency.entry(b).or_default().insert(a);
        }
    }

    let open_edge_count = edges.values().filter(|count| **count == 1).count() as u64;
    let non_manifold_edge_count = edges.values().filter(|count| **count > 2).count();
    let manifold = open_edge_count == 0 && non_manifold_edge_count == 0;
    let shell_count = connected_components(vertex_ids.len(), &adjacency) as u64;
    let mut warnings = Vec::new();
    if non_manifold_edge_count > 0 { warnings.push(format!("{non_manifold_edge_count} edge(s) are shared by more than two triangles.")); }
    if open_edge_count > 0 { warnings.push(format!("{open_edge_count} open boundary edge(s) detected.")); }
    if shell_count > 1 { warnings.push(format!("{shell_count} disconnected geometric shell(s) detected.")); }

    Ok(NativeGeometryInspection {
        path: path.to_string_lossy().to_string(),
        format: format.to_string(),
        bounds_mm: Some(GeometryBounds { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] }),
        triangle_count: Some(triangles.len() as u64),
        shell_count: Some(shell_count),
        open_edge_count: Some(open_edge_count),
        manifold: Some(manifold),
        vertex_count: Some(vertex_ids.len() as u64),
        warnings,
    })
}

fn quantized_key(vertex: Vertex) -> (i64, i64, i64) {
    const SCALE: f64 = 1_000_000.0;
    ((vertex.0[0] * SCALE).round() as i64, (vertex.0[1] * SCALE).round() as i64, (vertex.0[2] * SCALE).round() as i64)
}

fn connected_components(vertex_count: usize, adjacency: &HashMap<usize, HashSet<usize>>) -> usize {
    let mut seen = HashSet::new();
    let mut components = 0;
    for start in 0..vertex_count {
        if seen.contains(&start) { continue; }
        components += 1;
        let mut queue = VecDeque::from([start]);
        seen.insert(start);
        while let Some(node) = queue.pop_front() {
            if let Some(neighbors) = adjacency.get(&node) {
                for neighbor in neighbors {
                    if seen.insert(*neighbor) { queue.push_back(*neighbor); }
                }
            }
        }
    }
    components
}