use rand::{rngs::OsRng, RngCore};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::State;

const DEFAULT_PORT: u16 = 4717;
const MAX_REQUEST_BYTES: usize = 16 * 1024 * 1024;
const IO_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryLinkWorkspaceEnvelope {
    pub revision: u64,
    pub payload: String,
    pub updated_at_ms: u64,
    pub source_device_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryLinkDevice {
    pub id: String,
    pub name: String,
    pub paired_at_ms: u64,
    pub last_seen_at_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryLinkStatus {
    pub running: bool,
    pub port: u16,
    pub local_address: String,
    pub endpoint: String,
    pub pairing_code: String,
    pub revision: u64,
    pub has_workspace: bool,
    pub connected_devices: Vec<FoundryLinkDevice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryLinkPairResponse {
    pub token: String,
    pub device_id: String,
    pub revision: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairRequest {
    code: String,
    device_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PushWorkspaceRequest {
    base_revision: u64,
    payload: String,
    force: Option<bool>,
}

#[derive(Debug, Clone)]
struct Session {
    token: String,
    device: FoundryLinkDevice,
}

struct SharedState {
    running: bool,
    port: u16,
    local_address: String,
    pairing_code: String,
    revision: u64,
    workspace: Option<FoundryLinkWorkspaceEnvelope>,
    pending_workspace: Option<FoundryLinkWorkspaceEnvelope>,
    sessions: HashMap<String, Session>,
}

impl Default for SharedState {
    fn default() -> Self {
        Self {
            running: false,
            port: DEFAULT_PORT,
            local_address: local_ipv4_address(),
            pairing_code: generate_pairing_code(),
            revision: 0,
            workspace: None,
            pending_workspace: None,
            sessions: HashMap::new(),
        }
    }
}

struct ServerHandle {
    stop: Arc<AtomicBool>,
    thread: JoinHandle<()>,
}

pub struct FoundryLinkRuntime {
    shared: Arc<Mutex<SharedState>>,
    server: Mutex<Option<ServerHandle>>,
}

impl Default for FoundryLinkRuntime {
    fn default() -> Self {
        Self {
            shared: Arc::new(Mutex::new(SharedState::default())),
            server: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub fn foundry_link_start(
    state: State<'_, FoundryLinkRuntime>,
    port: Option<u16>,
) -> Result<FoundryLinkStatus, String> {
    let requested_port = port.unwrap_or(DEFAULT_PORT);
    if requested_port == 0 {
        return Err("Foundry Link port must be greater than zero.".to_string());
    }

    {
        let shared = state
            .shared
            .lock()
            .map_err(|_| "Foundry Link state is unavailable.".to_string())?;
        if shared.running {
            return Ok(status_from_shared(&shared));
        }
    }

    let listener = TcpListener::bind(("0.0.0.0", requested_port))
        .map_err(|error| format!("Foundry Link could not bind port {requested_port}: {error}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("Foundry Link could not configure its listener: {error}"))?;

    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);
    let thread_shared = Arc::clone(&state.shared);
    let thread = thread::Builder::new()
        .name("foundry-link".to_string())
        .spawn(move || run_server(listener, thread_shared, thread_stop))
        .map_err(|error| format!("Foundry Link server could not start: {error}"))?;

    {
        let mut shared = state
            .shared
            .lock()
            .map_err(|_| "Foundry Link state is unavailable.".to_string())?;
        shared.running = true;
        shared.port = requested_port;
        shared.local_address = local_ipv4_address();
        shared.pairing_code = generate_pairing_code();
    }

    *state
        .server
        .lock()
        .map_err(|_| "Foundry Link server registry is unavailable.".to_string())? = Some(ServerHandle { stop, thread });

    foundry_link_status(state)
}

#[tauri::command]
pub fn foundry_link_stop(state: State<'_, FoundryLinkRuntime>) -> Result<FoundryLinkStatus, String> {
    let handle = state
        .server
        .lock()
        .map_err(|_| "Foundry Link server registry is unavailable.".to_string())?
        .take();

    if let Some(handle) = handle {
        handle.stop.store(true, Ordering::SeqCst);
        let _ = handle.thread.join();
    }

    let mut shared = state
        .shared
        .lock()
        .map_err(|_| "Foundry Link state is unavailable.".to_string())?;
    shared.running = false;
    shared.sessions.clear();
    shared.pairing_code = generate_pairing_code();
    Ok(status_from_shared(&shared))
}

#[tauri::command]
pub fn foundry_link_status(state: State<'_, FoundryLinkRuntime>) -> Result<FoundryLinkStatus, String> {
    let shared = state
        .shared
        .lock()
        .map_err(|_| "Foundry Link state is unavailable.".to_string())?;
    Ok(status_from_shared(&shared))
}

#[tauri::command]
pub fn foundry_link_rotate_pairing_code(
    state: State<'_, FoundryLinkRuntime>,
) -> Result<FoundryLinkStatus, String> {
    let mut shared = state
        .shared
        .lock()
        .map_err(|_| "Foundry Link state is unavailable.".to_string())?;
    shared.pairing_code = generate_pairing_code();
    Ok(status_from_shared(&shared))
}

#[tauri::command]
pub fn foundry_link_publish_workspace(
    state: State<'_, FoundryLinkRuntime>,
    payload: String,
    base_revision: Option<u64>,
) -> Result<FoundryLinkWorkspaceEnvelope, String> {
    validate_workspace_payload(&payload)?;
    let mut shared = state
        .shared
        .lock()
        .map_err(|_| "Foundry Link state is unavailable.".to_string())?;

    if let Some(existing) = &shared.workspace {
        if existing.payload == payload {
            return Ok(existing.clone());
        }
    }

    if let Some(base) = base_revision {
        if base != shared.revision {
            return Err(format!("FOUNDRY_LINK_CONFLICT:{}", shared.revision));
        }
    }

    shared.revision = shared.revision.saturating_add(1);
    let envelope = FoundryLinkWorkspaceEnvelope {
        revision: shared.revision,
        payload,
        updated_at_ms: now_ms(),
        source_device_id: None,
    };
    shared.workspace = Some(envelope.clone());
    Ok(envelope)
}

#[tauri::command]
pub fn foundry_link_take_pending_workspace(
    state: State<'_, FoundryLinkRuntime>,
) -> Result<Option<FoundryLinkWorkspaceEnvelope>, String> {
    let mut shared = state
        .shared
        .lock()
        .map_err(|_| "Foundry Link state is unavailable.".to_string())?;
    Ok(shared.pending_workspace.take())
}

#[tauri::command]
pub async fn foundry_link_remote_pair(
    endpoint: String,
    code: String,
    device_name: String,
) -> Result<FoundryLinkPairResponse, String> {
    let endpoint = validate_private_endpoint(&endpoint)?;
    let response = reqwest::Client::new()
        .post(format!("{endpoint}/pair"))
        .json(&json!({ "code": code, "deviceName": device_name }))
        .send()
        .await
        .map_err(|error| format!("Could not reach Foundry Link: {error}"))?;

    parse_remote_response(response).await
}

#[tauri::command]
pub async fn foundry_link_remote_get_workspace(
    endpoint: String,
    token: String,
) -> Result<FoundryLinkWorkspaceEnvelope, String> {
    let endpoint = validate_private_endpoint(&endpoint)?;
    let response = reqwest::Client::new()
        .get(format!("{endpoint}/workspace"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|error| format!("Could not reach Foundry Link: {error}"))?;

    parse_remote_response(response).await
}

#[tauri::command]
pub async fn foundry_link_remote_push_workspace(
    endpoint: String,
    token: String,
    base_revision: u64,
    payload: String,
    force: Option<bool>,
) -> Result<FoundryLinkWorkspaceEnvelope, String> {
    validate_workspace_payload(&payload)?;
    let endpoint = validate_private_endpoint(&endpoint)?;
    let response = reqwest::Client::new()
        .post(format!("{endpoint}/workspace"))
        .bearer_auth(token)
        .json(&json!({
            "baseRevision": base_revision,
            "payload": payload,
            "force": force.unwrap_or(false)
        }))
        .send()
        .await
        .map_err(|error| format!("Could not reach Foundry Link: {error}"))?;

    parse_remote_response(response).await
}

async fn parse_remote_response<T>(response: reqwest::Response) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("Foundry Link returned an unreadable response: {error}"))?;

    if !status.is_success() {
        if status == StatusCode::CONFLICT {
            return Err(format!("FOUNDRY_LINK_CONFLICT:{body}"));
        }
        return Err(format!("Foundry Link returned HTTP {}: {}", status.as_u16(), body));
    }

    serde_json::from_str(&body).map_err(|error| format!("Foundry Link returned invalid JSON: {error}"))
}

fn run_server(listener: TcpListener, shared: Arc<Mutex<SharedState>>, stop: Arc<AtomicBool>) {
    while !stop.load(Ordering::SeqCst) {
        match listener.accept() {
            Ok((stream, peer)) => {
                let request_shared = Arc::clone(&shared);
                let _ = thread::Builder::new()
                    .name("foundry-link-request".to_string())
                    .spawn(move || handle_connection(stream, peer, request_shared));
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(80));
            }
            Err(error) => {
                eprintln!("Foundry Link accept failure: {error}");
                thread::sleep(Duration::from_millis(200));
            }
        }
    }

    if let Ok(mut state) = shared.lock() {
        state.running = false;
    }
}

fn handle_connection(mut stream: TcpStream, peer: SocketAddr, shared: Arc<Mutex<SharedState>>) {
    let _ = stream.set_read_timeout(Some(IO_TIMEOUT));
    let _ = stream.set_write_timeout(Some(IO_TIMEOUT));

    let response = match read_http_request(&mut stream) {
        Ok(request) => route_request(request, peer, &shared),
        Err(error) => HttpResponse::json(400, json!({ "error": error })),
    };

    let _ = write_http_response(&mut stream, response);
}

#[derive(Debug)]
struct HttpRequest {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: String,
}

struct HttpResponse {
    status: u16,
    body: String,
}

impl HttpResponse {
    fn json(status: u16, value: serde_json::Value) -> Self {
        Self {
            status,
            body: value.to_string(),
        }
    }

    fn serializable<T: Serialize>(status: u16, value: &T) -> Self {
        match serde_json::to_string(value) {
            Ok(body) => Self { status, body },
            Err(error) => Self::json(500, json!({ "error": format!("Serialization failure: {error}") })),
        }
    }
}

fn read_http_request(stream: &mut TcpStream) -> Result<HttpRequest, String> {
    let mut buffer = Vec::with_capacity(4096);
    let mut temp = [0u8; 4096];
    let header_end = loop {
        let read = stream
            .read(&mut temp)
            .map_err(|error| format!("Could not read request: {error}"))?;
        if read == 0 {
            return Err("Connection closed before request headers completed.".to_string());
        }
        buffer.extend_from_slice(&temp[..read]);
        if buffer.len() > MAX_REQUEST_BYTES {
            return Err("Foundry Link request exceeded the size limit.".to_string());
        }
        if let Some(position) = find_subsequence(&buffer, b"\r\n\r\n") {
            break position + 4;
        }
    };

    let header_text = std::str::from_utf8(&buffer[..header_end])
        .map_err(|_| "Foundry Link request headers were not UTF-8.".to_string())?;
    let mut lines = header_text.split("\r\n");
    let request_line = lines.next().ok_or_else(|| "Request line is missing.".to_string())?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts.next().unwrap_or_default().to_uppercase();
    let path = request_parts.next().unwrap_or_default().to_string();
    if method.is_empty() || path.is_empty() {
        return Err("Request line is invalid.".to_string());
    }

    let mut headers = HashMap::new();
    for line in lines {
        if line.is_empty() {
            continue;
        }
        if let Some((name, value)) = line.split_once(':') {
            headers.insert(name.trim().to_lowercase(), value.trim().to_string());
        }
    }

    let content_length = headers
        .get("content-length")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    if content_length > MAX_REQUEST_BYTES {
        return Err("Foundry Link request body exceeded the size limit.".to_string());
    }

    let body_already = buffer.len().saturating_sub(header_end);
    while buffer.len().saturating_sub(header_end) < content_length {
        let read = stream
            .read(&mut temp)
            .map_err(|error| format!("Could not read request body: {error}"))?;
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&temp[..read]);
        if buffer.len() > MAX_REQUEST_BYTES + header_end {
            return Err("Foundry Link request exceeded the size limit.".to_string());
        }
    }

    let available = buffer.len().saturating_sub(header_end);
    if available < content_length && body_already < content_length {
        return Err("Foundry Link request body was incomplete.".to_string());
    }
    let body = String::from_utf8(buffer[header_end..header_end + content_length].to_vec())
        .map_err(|_| "Foundry Link request body was not UTF-8.".to_string())?;

    Ok(HttpRequest {
        method,
        path: path.split('?').next().unwrap_or(&path).to_string(),
        headers,
        body,
    })
}

fn route_request(request: HttpRequest, _peer: SocketAddr, shared: &Arc<Mutex<SharedState>>) -> HttpResponse {
    match (request.method.as_str(), request.path.as_str()) {
        ("GET", "/health") => {
            let state = match shared.lock() {
                Ok(state) => state,
                Err(_) => return HttpResponse::json(500, json!({ "error": "Foundry Link state unavailable." })),
            };
            HttpResponse::json(
                200,
                json!({
                    "service": "foundry-link",
                    "running": state.running,
                    "revision": state.revision,
                    "hasWorkspace": state.workspace.is_some()
                }),
            )
        }
        ("POST", "/pair") => pair_device(&request.body, shared),
        ("GET", "/workspace") => {
            let token = match bearer_token(&request.headers) {
                Some(token) => token,
                None => return HttpResponse::json(401, json!({ "error": "Bearer token required." })),
            };
            let mut state = match shared.lock() {
                Ok(state) => state,
                Err(_) => return HttpResponse::json(500, json!({ "error": "Foundry Link state unavailable." })),
            };
            if !touch_session(&mut state, &token) {
                return HttpResponse::json(401, json!({ "error": "Unknown Foundry Link device token." }));
            }
            match &state.workspace {
                Some(workspace) => HttpResponse::serializable(200, workspace),
                None => HttpResponse::json(404, json!({ "error": "Desktop workspace has not been published yet." })),
            }
        }
        ("POST", "/workspace") => {
            let token = match bearer_token(&request.headers) {
                Some(token) => token,
                None => return HttpResponse::json(401, json!({ "error": "Bearer token required." })),
            };
            push_workspace(&request.body, &token, shared)
        }
        _ => HttpResponse::json(404, json!({ "error": "Foundry Link route not found." })),
    }
}

fn pair_device(body: &str, shared: &Arc<Mutex<SharedState>>) -> HttpResponse {
    let request: PairRequest = match serde_json::from_str(body) {
        Ok(request) => request,
        Err(error) => return HttpResponse::json(400, json!({ "error": format!("Invalid pairing request: {error}") })),
    };

    let mut state = match shared.lock() {
        Ok(state) => state,
        Err(_) => return HttpResponse::json(500, json!({ "error": "Foundry Link state unavailable." })),
    };
    if request.code.trim() != state.pairing_code {
        return HttpResponse::json(403, json!({ "error": "Pairing code is invalid or has already rotated." }));
    }

    let token = generate_token();
    let device_id = format!("mobile-{}", &token[..12]);
    let now = now_ms();
    let device = FoundryLinkDevice {
        id: device_id.clone(),
        name: request.device_name.trim().chars().take(80).collect::<String>(),
        paired_at_ms: now,
        last_seen_at_ms: now,
    };
    state.sessions.insert(
        token.clone(),
        Session {
            token: token.clone(),
            device,
        },
    );
    state.pairing_code = generate_pairing_code();

    HttpResponse::serializable(
        200,
        &FoundryLinkPairResponse {
            token,
            device_id,
            revision: state.revision,
        },
    )
}

fn push_workspace(body: &str, token: &str, shared: &Arc<Mutex<SharedState>>) -> HttpResponse {
    let request: PushWorkspaceRequest = match serde_json::from_str(body) {
        Ok(request) => request,
        Err(error) => return HttpResponse::json(400, json!({ "error": format!("Invalid workspace request: {error}") })),
    };
    if let Err(error) = validate_workspace_payload(&request.payload) {
        return HttpResponse::json(400, json!({ "error": error }));
    }

    let mut state = match shared.lock() {
        Ok(state) => state,
        Err(_) => return HttpResponse::json(500, json!({ "error": "Foundry Link state unavailable." })),
    };
    if !touch_session(&mut state, token) {
        return HttpResponse::json(401, json!({ "error": "Unknown Foundry Link device token." }));
    }

    if !request.force.unwrap_or(false) && request.base_revision != state.revision {
        return HttpResponse::json(
            409,
            json!({
                "error": "Workspace revision conflict.",
                "currentRevision": state.revision
            }),
        );
    }

    if let Some(existing) = &state.workspace {
        if existing.payload == request.payload {
            return HttpResponse::serializable(200, existing);
        }
    }

    let source_device_id = state
        .sessions
        .get(token)
        .map(|session| session.device.id.clone());
    state.revision = state.revision.saturating_add(1);
    let envelope = FoundryLinkWorkspaceEnvelope {
        revision: state.revision,
        payload: request.payload,
        updated_at_ms: now_ms(),
        source_device_id,
    };
    state.workspace = Some(envelope.clone());
    state.pending_workspace = Some(envelope.clone());
    HttpResponse::serializable(200, &envelope)
}

fn touch_session(state: &mut SharedState, token: &str) -> bool {
    let Some(session) = state.sessions.get_mut(token) else {
        return false;
    };
    if session.token != token {
        return false;
    }
    session.device.last_seen_at_ms = now_ms();
    true
}

fn bearer_token(headers: &HashMap<String, String>) -> Option<String> {
    headers
        .get("authorization")
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn write_http_response(stream: &mut TcpStream, response: HttpResponse) -> Result<(), String> {
    let reason = match response.status {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        409 => "Conflict",
        413 => "Payload Too Large",
        _ => "Internal Server Error",
    };
    let body = response.body.as_bytes();
    let headers = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        response.status,
        reason,
        body.len()
    );
    stream
        .write_all(headers.as_bytes())
        .and_then(|_| stream.write_all(body))
        .map_err(|error| format!("Could not write Foundry Link response: {error}"))
}

fn validate_workspace_payload(payload: &str) -> Result<(), String> {
    if payload.len() > MAX_REQUEST_BYTES {
        return Err("Workspace payload exceeds the Foundry Link size limit.".to_string());
    }
    let value: serde_json::Value = serde_json::from_str(payload)
        .map_err(|error| format!("Workspace payload is not valid JSON: {error}"))?;
    if !value.is_object() {
        return Err("Workspace payload must be a JSON object.".to_string());
    }
    Ok(())
}

fn validate_private_endpoint(endpoint: &str) -> Result<String, String> {
    let trimmed = endpoint.trim().trim_end_matches('/');
    let url = reqwest::Url::parse(trimmed)
        .map_err(|error| format!("Foundry Link address is invalid: {error}"))?;
    if url.scheme() != "http" {
        return Err("Foundry Link currently accepts private-LAN http:// endpoints only.".to_string());
    }
    if url.username() != "" || url.password().is_some() || url.query().is_some() || url.fragment().is_some() {
        return Err("Foundry Link address must not contain credentials, query parameters, or fragments.".to_string());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "Foundry Link address is missing a host.".to_string())?;
    let ip: IpAddr = host
        .parse()
        .map_err(|_| "Use a literal private-LAN IP address for Foundry Link.".to_string())?;
    if !is_private_link_ip(ip) {
        return Err("Foundry Link refuses public Internet addresses. Use the workstation's private LAN or trusted overlay-network IP.".to_string());
    }
    Ok(trimmed.to_string())
}

fn is_private_link_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || is_cgnat(ip)
        }
        IpAddr::V6(ip) => ip.is_loopback() || ip.is_unique_local() || ip.is_unicast_link_local(),
    }
}

fn is_cgnat(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    octets[0] == 100 && (64..=127).contains(&octets[1])
}

fn status_from_shared(shared: &SharedState) -> FoundryLinkStatus {
    let endpoint = if shared.local_address.contains(':') {
        format!("http://[{}]:{}", shared.local_address, shared.port)
    } else {
        format!("http://{}:{}", shared.local_address, shared.port)
    };
    FoundryLinkStatus {
        running: shared.running,
        port: shared.port,
        local_address: shared.local_address.clone(),
        endpoint,
        pairing_code: shared.pairing_code.clone(),
        revision: shared.revision,
        has_workspace: shared.workspace.is_some(),
        connected_devices: shared
            .sessions
            .values()
            .map(|session| session.device.clone())
            .collect(),
    }
}

fn local_ipv4_address() -> String {
    let socket = UdpSocket::bind("0.0.0.0:0");
    if let Ok(socket) = socket {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(address) = socket.local_addr() {
                return address.ip().to_string();
            }
        }
    }
    "127.0.0.1".to_string()
}

fn generate_pairing_code() -> String {
    let mut bytes = [0u8; 4];
    OsRng.fill_bytes(&mut bytes);
    let value = u32::from_le_bytes(bytes) % 1_000_000;
    format!("{value:06}")
}

fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u128::from(u64::MAX)) as u64
}

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|window| window == needle)
}
