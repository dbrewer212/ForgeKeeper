use crate::workbench_files::{GeometryBounds, NativeGeometryInspection};
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs::File;
use std::io::Read;
use std::path::Path;
use zip::ZipArchive;

#[derive(Clone, Copy)]
struct Transform([[f64; 4]; 4]);

impl Transform {
    fn identity() -> Self {
        Self([
            [1.0, 0.0, 0.0, 0.0],
            [0.0, 1.0, 0.0, 0.0],
            [0.0, 0.0, 1.0, 0.0],
            [0.0, 0.0, 0.0, 1.0],
        ])
    }

    fn from_3mf(value: Option<&str>) -> Result<Self, String> {
        let Some(value) = value else { return Ok(Self::identity()); };
        let values = value
            .split_whitespace()
            .map(str::parse::<f64>)
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "3MF transform contains a non-numeric value.".to_string())?;
        if values.len() != 12 {
            return Err("3MF transform must contain exactly 12 numbers.".to_string());
        }
        Ok(Self([
            [values[0], values[3], values[6], values[9]],
            [values[1], values[4], values[7], values[10]],
            [values[2], values[5], values[8], values[11]],
            [0.0, 0.0, 0.0, 1.0],
        ]))
    }

    fn then(self, child: Self) -> Self {
        let mut result = [[0.0; 4]; 4];
        for (row, result_row) in result.iter_mut().enumerate() {
            for (column, value) in result_row.iter_mut().enumerate() {
                *value = (0..4).map(|index| self.0[row][index] * child.0[index][column]).sum();
            }
        }
        Self(result)
    }

    fn apply(self, point: [f64; 3]) -> [f64; 3] {
        [
            self.0[0][0] * point[0] + self.0[0][1] * point[1] + self.0[0][2] * point[2] + self.0[0][3],
            self.0[1][0] * point[0] + self.0[1][1] * point[1] + self.0[1][2] * point[2] + self.0[1][3],
            self.0[2][0] * point[0] + self.0[2][1] * point[1] + self.0[2][2] * point[2] + self.0[2][3],
        ]
    }
}

#[derive(Default)]
struct ObjectDef {
    vertices: Vec<[f64; 3]>,
    triangles: Vec<[usize; 3]>,
    components: Vec<ComponentRef>,
}

struct ComponentRef {
    object_id: u32,
    transform: Transform,
}

struct BuildItem {
    object_id: u32,
    transform: Transform,
}

pub fn inspect_3mf(path: &Path) -> Result<NativeGeometryInspection, String> {
    let file = File::open(path).map_err(|error| format!("Failed to open 3MF: {error}"))?;
    let mut archive = ZipArchive::new(file).map_err(|error| format!("3MF is not a valid ZIP package: {error}"))?;
    let model_index = find_model_entry(&mut archive)?;
    let mut model_file = archive.by_index(model_index).map_err(|error| format!("Failed to open 3MF model XML: {error}"))?;
    if model_file.size() > 64 * 1024 * 1024 {
        return Err("3MF model XML exceeds the 64 MiB deterministic inspection limit.".to_string());
    }
    let mut xml = String::new();
    model_file.read_to_string(&mut xml).map_err(|error| format!("Failed to read 3MF model XML as UTF-8: {error}"))?;

    let parsed = parse_model(&xml)?;
    let mut warnings = parsed.warnings;
    let roots = if parsed.build_items.is_empty() {
        warnings.push("3MF contains no build items; Inspector analyzed every standalone mesh object as a fallback.".to_string());
        parsed.objects.iter()
            .filter(|(_, object)| !object.vertices.is_empty() && !object.triangles.is_empty())
            .map(|(object_id, _)| BuildItem { object_id: *object_id, transform: Transform::identity() })
            .collect::<Vec<_>>()
    } else {
        parsed.build_items
    };

    if roots.is_empty() {
        return Err("3MF contains no inspectable mesh objects or build items.".to_string());
    }

    let mut triangles = Vec::new();
    for root in roots {
        let mut stack = HashSet::new();
        flatten_object(root.object_id, root.transform, &parsed.objects, &mut stack, &mut triangles)?;
    }
    if triangles.is_empty() {
        return Err("3MF build resolves to no triangles.".to_string());
    }

    for triangle in &mut triangles {
        for point in triangle {
            for coordinate in point {
                *coordinate *= parsed.unit_scale_mm;
            }
        }
    }

    summarize(path, triangles, warnings)
}

fn find_model_entry(archive: &mut ZipArchive<File>) -> Result<usize, String> {
    let mut candidates = Vec::new();
    for index in 0..archive.len() {
        let name = archive.by_index(index).map_err(|error| format!("Failed to inspect 3MF entry: {error}"))?.name().replace('\\', "/");
        if name.to_ascii_lowercase().ends_with(".model") {
            let preferred = name.eq_ignore_ascii_case("3D/3dmodel.model");
            candidates.push((preferred, index));
        }
    }
    candidates.sort_by_key(|(preferred, _)| !*preferred);
    candidates.first().map(|(_, index)| *index).ok_or_else(|| "3MF package does not contain a .model document.".to_string())
}

struct ParsedModel {
    unit_scale_mm: f64,
    objects: HashMap<u32, ObjectDef>,
    build_items: Vec<BuildItem>,
    warnings: Vec<String>,
}

fn parse_model(xml: &str) -> Result<ParsedModel, String> {
    let mut unit_scale_mm = 1.0;
    let mut objects: HashMap<u32, ObjectDef> = HashMap::new();
    let mut build_items = Vec::new();
    let mut warnings = Vec::new();
    let mut current_object: Option<u32> = None;
    let mut cursor = 0usize;

    while let Some(relative_start) = xml[cursor..].find('<') {
        let start = cursor + relative_start;
        let Some(relative_end) = xml[start + 1..].find('>') else {
            return Err("3MF model XML contains an unterminated tag.".to_string());
        };
        let end = start + 1 + relative_end;
        let raw = xml[start + 1..end].trim();
        cursor = end + 1;

        if raw.is_empty() || raw.starts_with('?') || raw.starts_with('!') {
            continue;
        }
        let closing = raw.starts_with('/');
        let body = raw.trim_start_matches('/').trim_end_matches('/').trim();
        let (name, attrs) = parse_tag(body)?;
        let local_name = name.rsplit(':').next().unwrap_or(name.as_str());

        if closing {
            if local_name == "object" {
                current_object = None;
            }
            continue;
        }

        match local_name {
            "model" => {
                if let Some(unit) = attrs.get("unit") {
                    unit_scale_mm = unit_scale(unit)?;
                }
            }
            "object" => {
                let object_id = parse_required_u32(&attrs, "id", "3MF object")?;
                objects.entry(object_id).or_default();
                current_object = Some(object_id);
            }
            "vertex" => {
                let object_id = current_object.ok_or_else(|| "3MF vertex appears outside an object.".to_string())?;
                let point = [
                    parse_required_f64(&attrs, "x", "3MF vertex")?,
                    parse_required_f64(&attrs, "y", "3MF vertex")?,
                    parse_required_f64(&attrs, "z", "3MF vertex")?,
                ];
                objects.get_mut(&object_id).expect("object exists").vertices.push(point);
            }
            "triangle" => {
                let object_id = current_object.ok_or_else(|| "3MF triangle appears outside an object.".to_string())?;
                let triangle = [
                    parse_required_usize(&attrs, "v1", "3MF triangle")?,
                    parse_required_usize(&attrs, "v2", "3MF triangle")?,
                    parse_required_usize(&attrs, "v3", "3MF triangle")?,
                ];
                objects.get_mut(&object_id).expect("object exists").triangles.push(triangle);
            }
            "component" => {
                let object_id = current_object.ok_or_else(|| "3MF component appears outside an object.".to_string())?;
                let target_id = parse_required_u32(&attrs, "objectid", "3MF component")?;
                let transform = Transform::from_3mf(attrs.get("transform").map(String::as_str))?;
                objects.get_mut(&object_id).expect("object exists").components.push(ComponentRef { object_id: target_id, transform });
            }
            "item" => {
                let object_id = parse_required_u32(&attrs, "objectid", "3MF build item")?;
                let transform = Transform::from_3mf(attrs.get("transform").map(String::as_str))?;
                build_items.push(BuildItem { object_id, transform });
            }
            "beamlattice" | "slices" | "volumetric" => warnings.push(format!("3MF extension element <{local_name}> is present; deterministic mesh inspection ignores that extension geometry.")),
            _ => {}
        }
    }

    for (object_id, object) in &objects {
        for triangle in &object.triangles {
            if triangle.iter().any(|index| *index >= object.vertices.len()) {
                return Err(format!("3MF object {object_id} contains a triangle that references a missing vertex."));
            }
        }
    }

    Ok(ParsedModel { unit_scale_mm, objects, build_items, warnings })
}

fn parse_tag(body: &str) -> Result<(String, HashMap<String, String>), String> {
    let mut chars = body.char_indices().peekable();
    while matches!(chars.peek(), Some((_, character)) if character.is_whitespace()) { chars.next(); }
    let name_start = chars.peek().map(|(index, _)| *index).unwrap_or(0);
    let mut name_end = body.len();
    while let Some((index, character)) = chars.peek().copied() {
        if character.is_whitespace() {
            name_end = index;
            break;
        }
        chars.next();
    }
    let name = body[name_start..name_end].to_string();
    let mut attrs = HashMap::new();
    let mut index = name_end;
    let bytes = body.as_bytes();

    while index < body.len() {
        while index < body.len() && bytes[index].is_ascii_whitespace() { index += 1; }
        if index >= body.len() { break; }
        let key_start = index;
        while index < body.len() && !bytes[index].is_ascii_whitespace() && bytes[index] != b'=' { index += 1; }
        let key = body[key_start..index].rsplit(':').next().unwrap_or(&body[key_start..index]).to_string();
        while index < body.len() && bytes[index].is_ascii_whitespace() { index += 1; }
        if index >= body.len() || bytes[index] != b'=' {
            return Err(format!("Malformed 3MF XML attribute {key}."));
        }
        index += 1;
        while index < body.len() && bytes[index].is_ascii_whitespace() { index += 1; }
        if index >= body.len() || (bytes[index] != b'\"' && bytes[index] != b'\'') {
            return Err(format!("3MF XML attribute {key} is not quoted."));
        }
        let quote = bytes[index];
        index += 1;
        let value_start = index;
        while index < body.len() && bytes[index] != quote { index += 1; }
        if index >= body.len() {
            return Err(format!("3MF XML attribute {key} has an unterminated value."));
        }
        attrs.insert(key, body[value_start..index].to_string());
        index += 1;
    }
    Ok((name, attrs))
}

fn unit_scale(unit: &str) -> Result<f64, String> {
    match unit.to_ascii_lowercase().as_str() {
        "micron" => Ok(0.001),
        "millimeter" => Ok(1.0),
        "centimeter" => Ok(10.0),
        "inch" => Ok(25.4),
        "foot" => Ok(304.8),
        "meter" => Ok(1000.0),
        other => Err(format!("Unsupported 3MF model unit: {other}")),
    }
}

fn parse_required_u32(attrs: &HashMap<String, String>, key: &str, context: &str) -> Result<u32, String> {
    attrs.get(key).ok_or_else(|| format!("{context} is missing required attribute {key}."))?.parse::<u32>().map_err(|_| format!("{context} attribute {key} is invalid."))
}

fn parse_required_usize(attrs: &HashMap<String, String>, key: &str, context: &str) -> Result<usize, String> {
    attrs.get(key).ok_or_else(|| format!("{context} is missing required attribute {key}."))?.parse::<usize>().map_err(|_| format!("{context} attribute {key} is invalid."))
}

fn parse_required_f64(attrs: &HashMap<String, String>, key: &str, context: &str) -> Result<f64, String> {
    attrs.get(key).ok_or_else(|| format!("{context} is missing required attribute {key}."))?.parse::<f64>().map_err(|_| format!("{context} attribute {key} is invalid."))
}

fn flatten_object(
    object_id: u32,
    transform: Transform,
    objects: &HashMap<u32, ObjectDef>,
    stack: &mut HashSet<u32>,
    output: &mut Vec<[[f64; 3]; 3]>,
) -> Result<(), String> {
    if !stack.insert(object_id) {
        return Err(format!("3MF component graph contains a cycle at object {object_id}."));
    }
    let object = objects.get(&object_id).ok_or_else(|| format!("3MF references missing object {object_id}."))?;

    for triangle in &object.triangles {
        output.push([
            transform.apply(object.vertices[triangle[0]]),
            transform.apply(object.vertices[triangle[1]]),
            transform.apply(object.vertices[triangle[2]]),
        ]);
    }
    for component in &object.components {
        flatten_object(component.object_id, transform.then(component.transform), objects, stack, output)?;
    }
    stack.remove(&object_id);
    Ok(())
}

fn summarize(path: &Path, triangles: Vec<[[f64; 3]; 3]>, mut warnings: Vec<String>) -> Result<NativeGeometryInspection, String> {
    let mut min = [f64::INFINITY; 3];
    let mut max = [f64::NEG_INFINITY; 3];
    let mut vertex_ids: HashMap<(i64, i64, i64), usize> = HashMap::new();
    let mut edges: HashMap<(usize, usize), u32> = HashMap::new();
    let mut adjacency: HashMap<usize, HashSet<usize>> = HashMap::new();

    for triangle in &triangles {
        let mut ids = [0usize; 3];
        for (index, point) in triangle.iter().enumerate() {
            for axis in 0..3 {
                min[axis] = min[axis].min(point[axis]);
                max[axis] = max[axis].max(point[axis]);
            }
            let key = quantized_key(*point);
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
    if non_manifold_edge_count > 0 { warnings.push(format!("{non_manifold_edge_count} edge(s) are shared by more than two triangles.")); }
    if open_edge_count > 0 { warnings.push(format!("{open_edge_count} open boundary edge(s) detected.")); }
    if shell_count > 1 { warnings.push(format!("{shell_count} disconnected geometric shell(s) detected.")); }

    Ok(NativeGeometryInspection {
        path: path.to_string_lossy().to_string(),
        format: "3mf".to_string(),
        bounds_mm: Some(GeometryBounds { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] }),
        triangle_count: Some(triangles.len() as u64),
        shell_count: Some(shell_count),
        open_edge_count: Some(open_edge_count),
        manifold: Some(manifold),
        vertex_count: Some(vertex_ids.len() as u64),
        warnings,
    })
}

fn quantized_key(point: [f64; 3]) -> (i64, i64, i64) {
    const SCALE: f64 = 1_000_000.0;
    ((point[0] * SCALE).round() as i64, (point[1] * SCALE).round() as i64, (point[2] * SCALE).round() as i64)
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
