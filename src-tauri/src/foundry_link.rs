use rand::{rngs::OsRng, RngCore};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

const DEFAULT_PORT: u16 = 4717;
const MAX_REQUEST_BYTES: usize = 16 * 1024 * 1024;
const IO_TIMEOUT: Duration = Duration::from_secs(8);
const COMMAND_TTL_LIMIT_MS: u64 = 15 * 60 * 1000;
const MAX_COMMAND_QUEUE: usize = 256;
const MAX_RESULTS_PER_DEVICE: usize = 256;
const MAX_COMMAND_OWNERS: usize = 4096;
const COMMAND_OWNER_RETENTION_MS: u64 = 7 * 24 * 60 * 60 * 1000;
const SESSION_TTL_MS: u64 = 30 * 24 * 60 * 60 * 1000;
const PAIR_WINDOW_MS: u64 = 5 * 60 * 1000;
const PAIR_LOCKOUT_MS: u64 = 10 * 60 * 1000;
const MAX_PAIR_FAILURES: u32 = 5;
const PERSISTENCE_DIR: &str = "foundry-link";
const PERSISTENCE_FILE: &str = "state.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryLinkWorkspaceEnvelope {
    pub revision: u64,
    pub payload: String,
    pub updated_at_ms: u64,
    pub source_device_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryLinkDevice {
    pub id: String,
    pub name: String,
    pub paired_at_ms: u64,
    pub last_seen_at_ms: u64,
    pub expires_at_ms: u64,
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
    pub expires_at_ms: u64,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryLinkCommand {
    pub id: String,
    pub requesting_device_id: String,
    pub requested_at_ms: u64,
    pub expires_at_ms: u64,
    pub operation: String,
    pub payload: serde_json::Value,
    pub correlation_id: String,
    pub sequence: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryLinkCommandResult {
    pub command_id: String,
    pub requesting_device_id: String,
    pub correlation_id: String,
    pub completed_at_ms: u64,
    pub state: String,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub approval_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubmitCommandRequest {
    id: String,
    requested_at_ms: u64,
    expires_at_ms: u64,
    operation: String,
    payload: serde_json::Value,
    correlation_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AcknowledgeResultsRequest {
    command_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Session {
    device: FoundryLinkDevice,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandOwner {
    device_id: String,
    recorded_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PairAttempt {
    window_started_ms: u64,
    failures: u32,
    locked_until_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedState {
    revision: u64,
    workspace: Option<FoundryLinkWorkspaceEnvelope>,
    pending_workspace: Option<FoundryLinkWorkspaceEnvelope>,
    sessions: HashMap<String, Session>,
    next_command_sequence: u64,
    commands: VecDeque<FoundryLinkCommand>,
    command_owners: HashMap<String, CommandOwner>,
    results: HashMap<String, VecDeque<FoundryLinkCommandResult>>,
    pair_attempts: HashMap<String, PairAttempt>,
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
    next_command_sequence: u64,
    commands: VecDeque<FoundryLinkCommand>,
    command_owners: HashMap<String, CommandOwner>,
    results: HashMap<String, VecDeque<FoundryLinkCommandResult>>,
    pair_attempts: HashMap<String, PairAttempt>,
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
            next_command_sequence: 1,
            commands: VecDeque::new(),
            command_owners: HashMap::new(),
            results: HashMap::new(),
            pair_attempts: HashMap::new(),
        }
    }
}

#[derive(Clone)]
struct PersistenceHandle {
    path: Arc<Mutex<Option<PathBuf>>>,
    write_lock: Arc<Mutex<()>>,
}

impl Default for PersistenceHandle {
    fn default() -> Self {
        Self {
            path: Arc::new(Mutex::new(None)),
            write_lock: Arc::new(Mutex::new(())),
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
    persistence: PersistenceHandle,
    hydrated: AtomicBool,
    hydration_lock: Mutex<()>,
}

impl Default for FoundryLinkRuntime {
    fn default() -> Self {
        Self {
            shared: Arc::new(Mutex::new(SharedState::default())),
            server: Mutex::new(None),
            persistence: PersistenceHandle::default(),
            hydrated: AtomicBool::new(false),
            hydration_lock: Mutex::new(()),
        }
    }
}

impl FoundryLinkRuntime {
    fn ensure_hydrated(&self, app: &AppHandle) -> Result<(), String> {
        if self.hydrated.load(Ordering::Acquire) {
            return Ok(());
        }
        let _guard = self
            .hydration_lock
            .lock()
            .map_err(|_| "Foundry Link hydration lock is unavailable.".to_string())?;
        if self.hydrated.load(Ordering::Acquire) {
            return Ok(());
        }

        let directory = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("Could not resolve Foundry Link data directory: {error}"))?
            .join(PERSISTENCE_DIR);
        fs::create_dir_all(&directory)
            .map_err(|error| format!("Could not create Foundry Link data directory: {error}"))?;
        let path = directory.join(PERSISTENCE_FILE);
        *self
            .persistence
            .path
            .lock()
            .map_err(|_| "Foundry Link persistence path is unavailable.".to_string())? = Some(path.clone());

        if path.exists() {
            let raw = fs::read_to_string(&path)
                .map_err(|error| format!("Could not read Foundry Link host ledger: {error}"))?;
            let persisted: PersistedState = serde_json::from_str(&raw)
                .map_err(|error| format!("Foundry Link host ledger is invalid JSON: {error}"))?;
            let mut shared = self
                .shared
                .lock()
                .map_err(|_| "Foundry Link state is unavailable.".to_string())?;
            shared.revision = persisted.revision;
            shared.workspace = persisted.workspace;
            shared.pending_workspace = persisted.pending_workspace;
            shared.sessions = persisted.sessions;
            shared.next_command_sequence = persisted.next_command_sequence.max(1);
            shared.commands = persisted.commands;
            shared.command_owners = persisted.command_owners;
            shared.results = persisted.results;
            shared.pair_attempts = persisted.pair_attempts;
            prune_state(&mut shared);
        }

        self.hydrated.store(true, Ordering::Release);
        Ok(())
    }

    fn persist(&self) -> Result<(), String> {
        persist_state(&self.shared, &self.persistence)
    }
}

#[tauri::command]
pub fn foundry_link_start(
    app: AppHandle,
    state: State<'_, FoundryLinkRuntime>,
    port: Option<u16>,
) -> Result<FoundryLinkStatus, String> {
    state.ensure_hydrated(&app)?;
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
    let thread_persistence = state.persistence.clone();
    let thread = thread::Builder::new()
        .name("foundry-link".to_string())
        .spawn(move || run_server(listener, thread_shared, thread_persistence, thread_stop))
        .map_err(|error| format!("Foundry Link server could not start: {error}"))?;

    {
        let mut shared = state
            .shared
            .lock()
            .map_err(|_| "Foundry Link state is unavailable.".to_string())?;
        prune_state(&mut shared);
        shared.running = true;
        shared.port = requested_port;
        shared.local_address = local_ipv4_address();
        shared.pairing_code = generate_pairing_code();
    }

    *state
        .server
        .lock()
        .map_err(|_| "Foundry Link server registry is unavailable.".to_string())? = Some(ServerHandle { stop, thread });
    state.persist()?;
    foundry_link_status(app, state)
}

#[tauri::command]
pub fn foundry_link_stop(
    app: AppHandle,
    state: State<'_, FoundryLinkRuntime>,
) -> Result<FoundryLinkStatus, String> {
    state.ensure_hydrated(&app)?;
    let handle = state
        .server
        .lock()
        .map_err(|_| "Foundry Link server registry is unavailable.".to_string())?
        .take();

    if let Some(handle) = handle {
        handle.stop.store(true, Ordering::SeqCst);
        let _ = handle.thread.join();
    }

    {
        let mut shared = state
            .shared
            .lock()
            .map_err(|_| "Foundry Link state is unavailable.".to_string())?;
        shared.running = false;
        shared.pairing_code = generate_pairing_code();
        prune_state(&mut shared);
    }
    state.persist()?;
    foundry_link_status(app, state)
}

#[tauri::command]
pub fn foundry_link_status(
    app: AppHandle,
    state: State<'_, FoundryLinkRuntime>,
) -> Result<FoundryLinkStatus, String> {
    state.ensure_hydrated(&app)?;
    let shared = state
        .shared
        .lock()
        .map_err(|_| "Foundry Link state is unavailable.".to_string())?;
    Ok(status_from_shared(&shared))
}

#[tauri::command]
pub fn foundry_link_rotate_pairing_code(
    app: AppHandle,
    state: State<'_, FoundryLinkRuntime>,
) -> Result<FoundryLinkStatus, String> {
    state.ensure_hydrated(&app)?;
    {
        let mut shared = state
            .shared
            .lock()
            .map_err(|_| "Foundry Link state is unavailable.".to_string())?;
        shared.pairing_code = generate_pairing_code();
        shared.pair_attempts.clear();
    }
    state.persist()?;
    foundry_link_status(app, state)
}

#[tauri::command]
pub fn foundry_link_revoke_device(
    app: AppHandle,
    state: State<'_, FoundryLinkRuntime>,
    device_id: String,
) -> Result<FoundryLinkStatus, String> {
    state.ensure_hydrated(&app)?;
    let device_id = device_id.trim().to_string();
    if device_id.is_empty() {
        return Err("Foundry Link device id is required.".to_string());
    }
    {
        let mut shared = state
            .shared
            .lock()
            .map_err(|_| "Foundry Link state is unavailable.".to_string())?;
        shared.sessions.retain(|_, session| session.device.id != device_id);
        shared.commands.retain(|command| command.requesting_device_id != device_id);
        shared.results.remove(&device_id);
        prune_state(&mut shared);
    }
    state.persist()?;
    foundry_link_status(app, state)
}

#[tauri::command]
pub fn foundry_link_publish_workspace(
    app: AppHandle,
    state: State<'_, FoundryLinkRuntime>,
    payload: String,
    base_revision: Option<u64>,
) -> Result<FoundryLinkWorkspaceEnvelope, String> {
    state.ensure_hydrated(&app)?;
    validate_workspace_payload(&payload)?;
    let envelope = {
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
        envelope
    };
    state.persist()?;
    Ok(envelope)
}

#[tauri::command]
pub fn foundry_link_take_pending_workspace(
    app: AppHandle,
    state: State<'_, FoundryLinkRuntime>,
) -> Result<Option<FoundryLinkWorkspaceEnvelope>, String> {
    state.ensure_hydrated(&app)?;
    let pending = state
        .shared
        .lock()
        .map_err(|_| "Foundry Link state is unavailable.".to_string())?
        .pending_workspace
        .take();
    if pending.is_some() {
        state.persist()?;
    }
    Ok(pending)
}

#[tauri::command]
pub fn foundry_link_take_pending_commands(
    app: AppHandle,
    state: State<'_, FoundryLinkRuntime>,
) -> Result<Vec<FoundryLinkCommand>, String> {
    state.ensure_hydrated(&app)?;
    let pending = {
        let mut shared = state
            .shared
            .lock()
            .map_err(|_| "Foundry Link state is unavailable.".to_string())?;
        let now = now_ms();
        let mut pending = Vec::new();
        while let Some(command) = shared.commands.pop_front() {
            if command.expires_at_ms <= now {
                let result = FoundryLinkCommandResult {
                    command_id: command.id.clone(),
                    requesting_device_id: command.requesting_device_id.clone(),
                    correlation_id: command.correlation_id.clone(),
                    completed_at_ms: now,
                    state: "denied".to_string(),
                    result: None,
                    error: Some("Remote command expired before the workstation could execute it.".to_string()),
                    approval_id: None,
                };
                store_result(&mut shared, result);
            } else {
                pending.push(command);
            }
        }
        prune_state(&mut shared);
        pending
    };
    state.persist()?;
    Ok(pending)
}

#[tauri::command]
pub fn foundry_link_publish_command_result(
    app: AppHandle,
    state: State<'_, FoundryLinkRuntime>,
    result: FoundryLinkCommandResult,
) -> Result<(), String> {
    state.ensure_hydrated(&app)?;
    {
        let mut shared = state
            .shared
            .lock()
            .map_err(|_| "Foundry Link state is unavailable.".to_string())?;
        let owner = shared
            .command_owners
            .get(&result.command_id)
            .ok_or_else(|| "Command is not known to this Foundry Link host.".to_string())?;
        if owner.device_id != result.requesting_device_id {
            return Err("Command result device does not match the requesting device.".to_string());
        }
        store_result(&mut shared, result);
        prune_state(&mut shared);
    }
    state.persist()
}

#[tauri::command]
pub async fn foundry_link_remote_pair(
    endpoint: String,
    code: String,
    device_name: String,
) -> Result<FoundryLinkPairResponse, String> {
    let endpoint = validate_private_endpoint(&endpoint)?;
    let response = remote_client()?
        .post(format!("{endpoint}/pair"))
        .json(&json!({ "code": code, "deviceName": device_name }))
        .send()
        .await
        .map_err(|error| format!("Could not reach Foundry Link: {error}"))?;
    parse_remote_response(response).await
}

#[tauri::command]
pub async fn foundry_link_remote_rotate_session(
    endpoint: String,
    token: String,
) -> Result<FoundryLinkPairResponse, String> {
    let endpoint = validate_private_endpoint(&endpoint)?;
    let response = remote_client()?
        .post(format!("{endpoint}/session/rotate"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|error| format!("Could not rotate Foundry Link session: {error}"))?;
    parse_remote_response(response).await
}

#[tauri::command]
pub async fn foundry_link_remote_revoke_session(
    endpoint: String,
    token: String,
) -> Result<serde_json::Value, String> {
    let endpoint = validate_private_endpoint(&endpoint)?;
    let response = remote_client()?
        .post(format!("{endpoint}/session/revoke"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|error| format!("Could not revoke Foundry Link session: {error}"))?;
    parse_remote_response(response).await
}

#[tauri::command]
pub async fn foundry_link_remote_get_workspace(
    endpoint: String,
    token: String,
) -> Result<FoundryLinkWorkspaceEnvelope, String> {
    let endpoint = validate_private_endpoint(&endpoint)?;
    let response = remote_client()?
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
    let response = remote_client()?
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

fn remote_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|error| format!("Could not configure Foundry Link client: {error}"))
}

#[tauri::command]
pub async fn foundry_link_remote_submit_command(
    endpoint: String,
    token: String,
    command: serde_json::Value,
) -> Result<FoundryLinkCommand, String> {
    let endpoint = validate_private_endpoint(&endpoint)?;
    let response = remote_client()?
        .post(format!("{endpoint}/commands"))
        .bearer_auth(token)
        .json(&command)
        .send()
        .await
        .map_err(|error| format!("Could not submit Foundry Link command: {error}"))?;
    parse_remote_response(response).await
}

#[tauri::command]
pub async fn foundry_link_remote_get_results(
    endpoint: String,
    token: String,
) -> Result<Vec<FoundryLinkCommandResult>, String> {
    let endpoint = validate_private_endpoint(&endpoint)?;
    let response = remote_client()?
        .get(format!("{endpoint}/results"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|error| format!("Could not fetch Foundry Link results: {error}"))?;
    parse_remote_response(response).await
}

#[tauri::command]
pub async fn foundry_link_remote_ack_results(
    endpoint: String,
    token: String,
    command_ids: Vec<String>,
) -> Result<serde_json::Value, String> {
    let endpoint = validate_private_endpoint(&endpoint)?;
    let response = remote_client()?
        .post(format!("{endpoint}/results/ack"))
        .bearer_auth(token)
        .json(&json!({ "commandIds": command_ids }))
        .send()
        .await
        .map_err(|error| format!("Could not acknowledge Foundry Link results: {error}"))?;
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

fn run_server(
    listener: TcpListener,
    shared: Arc<Mutex<SharedState>>,
    persistence: PersistenceHandle,
    stop: Arc<AtomicBool>,
) {
    while !stop.load(Ordering::SeqCst) {
        match listener.accept() {
            Ok((stream, peer)) => {
                let request_shared = Arc::clone(&shared);
                let request_persistence = persistence.clone();
                let _ = thread::Builder::new()
                    .name("foundry-link-request".to_string())
                    .spawn(move || handle_connection(stream, peer, request_shared, request_persistence));
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

fn handle_connection(
    mut stream: TcpStream,
    peer: SocketAddr,
    shared: Arc<Mutex<SharedState>>,
    persistence: PersistenceHandle,
) {
    let _ = stream.set_read_timeout(Some(IO_TIMEOUT));
    let _ = stream.set_write_timeout(Some(IO_TIMEOUT));
    let response = match read_http_request(&mut stream) {
        Ok(request) => route_request(request, peer, &shared, &persistence),
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
        Self { status, body: value.to_string() }
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

    if buffer.len().saturating_sub(header_end) < content_length {
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

fn route_request(
    request: HttpRequest,
    peer: SocketAddr,
    shared: &Arc<Mutex<SharedState>>,
    persistence: &PersistenceHandle,
) -> HttpResponse {
    if !is_private_link_ip(peer.ip()) {
        return HttpResponse::json(403, json!({ "error": "Foundry Link refuses peers outside private LAN or trusted overlay address space." }));
    }

    match (request.method.as_str(), request.path.as_str()) {
        ("GET", "/health") => HttpResponse::json(200, json!({ "service": "foundry-link", "running": true })),
        ("POST", "/pair") => pair_device(&request.body, peer.ip(), shared, persistence),
        ("POST", "/session/rotate") => {
            let token = match bearer_token(&request.headers) {
                Some(token) => token,
                None => return HttpResponse::json(401, json!({ "error": "Bearer token required." })),
            };
            rotate_session(&token, shared, persistence)
        }
        ("POST", "/session/revoke") => {
            let token = match bearer_token(&request.headers) {
                Some(token) => token,
                None => return HttpResponse::json(401, json!({ "error": "Bearer token required." })),
            };
            revoke_session(&token, shared, persistence)
        }
        ("GET", "/workspace") => {
            let token = match bearer_token(&request.headers) {
                Some(token) => token,
                None => return HttpResponse::json(401, json!({ "error": "Bearer token required." })),
            };
            get_workspace(&token, shared, persistence)
        }
        ("POST", "/workspace") => {
            let token = match bearer_token(&request.headers) {
                Some(token) => token,
                None => return HttpResponse::json(401, json!({ "error": "Bearer token required." })),
            };
            push_workspace(&request.body, &token, shared, persistence)
        }
        ("POST", "/commands") => {
            let token = match bearer_token(&request.headers) {
                Some(token) => token,
                None => return HttpResponse::json(401, json!({ "error": "Bearer token required." })),
            };
            submit_command(&request.body, &token, shared, persistence)
        }
        ("GET", "/results") => {
            let token = match bearer_token(&request.headers) {
                Some(token) => token,
                None => return HttpResponse::json(401, json!({ "error": "Bearer token required." })),
            };
            get_results(&token, shared, persistence)
        }
        ("POST", "/results/ack") => {
            let token = match bearer_token(&request.headers) {
                Some(token) => token,
                None => return HttpResponse::json(401, json!({ "error": "Bearer token required." })),
            };
            acknowledge_results(&request.body, &token, shared, persistence)
        }
        _ => HttpResponse::json(404, json!({ "error": "Foundry Link route not found." })),
    }
}

fn pair_device(
    body: &str,
    peer_ip: IpAddr,
    shared: &Arc<Mutex<SharedState>>,
    persistence: &PersistenceHandle,
) -> HttpResponse {
    let request: PairRequest = match serde_json::from_str(body) {
        Ok(request) => request,
        Err(error) => return HttpResponse::json(400, json!({ "error": format!("Invalid pairing request: {error}") })),
    };
    let peer_key = peer_ip.to_string();
    let now = now_ms();

    let response = {
        let mut state = match shared.lock() {
            Ok(state) => state,
            Err(_) => return HttpResponse::json(500, json!({ "error": "Foundry Link state unavailable." })),
        };
        prune_state(&mut state);
        let pairing_code_matches = request.code.trim() == state.pairing_code;
        let attempt = state.pair_attempts.entry(peer_key.clone()).or_insert_with(|| PairAttempt {
            window_started_ms: now,
            failures: 0,
            locked_until_ms: 0,
        });
        if attempt.locked_until_ms > now {
            return HttpResponse::json(429, json!({
                "error": "Pairing is temporarily locked after repeated invalid codes.",
                "retryAfterMs": attempt.locked_until_ms.saturating_sub(now)
            }));
        }
        if now.saturating_sub(attempt.window_started_ms) > PAIR_WINDOW_MS {
            *attempt = PairAttempt { window_started_ms: now, failures: 0, locked_until_ms: 0 };
        }
        if !pairing_code_matches {
            attempt.failures = attempt.failures.saturating_add(1);
            if attempt.failures >= MAX_PAIR_FAILURES {
                attempt.locked_until_ms = now.saturating_add(PAIR_LOCKOUT_MS);
            }
            let locked = attempt.locked_until_ms > now;
            drop(state);
            let _ = persist_state(shared, persistence);
            return HttpResponse::json(
                if locked { 429 } else { 403 },
                json!({ "error": if locked { "Pairing locked after repeated invalid codes." } else { "Pairing code is invalid or has already rotated." } }),
            );
        }

        let token = generate_token();
        let token_hash = hash_token(&token);
        let device_id = format!("mobile-{}", &token[..12]);
        let expires_at_ms = now.saturating_add(SESSION_TTL_MS);
        let name = {
            let trimmed = request.device_name.trim();
            if trimmed.is_empty() { "Mobile Foundry".to_string() } else { trimmed.chars().take(80).collect::<String>() }
        };
        let device = FoundryLinkDevice {
            id: device_id.clone(),
            name,
            paired_at_ms: now,
            last_seen_at_ms: now,
            expires_at_ms,
        };
        state.sessions.insert(token_hash, Session { device });
        state.pair_attempts.remove(&peer_key);
        state.pairing_code = generate_pairing_code();
        FoundryLinkPairResponse { token, device_id, revision: state.revision, expires_at_ms }
    };

    if let Err(error) = persist_state(shared, persistence) {
        return HttpResponse::json(500, json!({ "error": error }));
    }
    HttpResponse::serializable(200, &response)
}

fn rotate_session(
    token: &str,
    shared: &Arc<Mutex<SharedState>>,
    persistence: &PersistenceHandle,
) -> HttpResponse {
    let response = {
        let mut state = match shared.lock() {
            Ok(state) => state,
            Err(_) => return HttpResponse::json(500, json!({ "error": "Foundry Link state unavailable." })),
        };
        let old_hash = hash_token(token);
        let Some(mut session) = state.sessions.remove(&old_hash) else {
            return HttpResponse::json(401, json!({ "error": "Unknown Foundry Link device token." }));
        };
        let now = now_ms();
        if session.device.expires_at_ms <= now {
            return HttpResponse::json(401, json!({ "error": "Foundry Link device token has expired. Pair the device again." }));
        }
        let new_token = generate_token();
        let new_hash = hash_token(&new_token);
        session.device.last_seen_at_ms = now;
        session.device.expires_at_ms = now.saturating_add(SESSION_TTL_MS);
        let response = FoundryLinkPairResponse {
            token: new_token,
            device_id: session.device.id.clone(),
            revision: state.revision,
            expires_at_ms: session.device.expires_at_ms,
        };
        state.sessions.insert(new_hash, session);
        response
    };
    if let Err(error) = persist_state(shared, persistence) {
        return HttpResponse::json(500, json!({ "error": error }));
    }
    HttpResponse::serializable(200, &response)
}

fn revoke_session(
    token: &str,
    shared: &Arc<Mutex<SharedState>>,
    persistence: &PersistenceHandle,
) -> HttpResponse {
    let removed_device = {
        let mut state = match shared.lock() {
            Ok(state) => state,
            Err(_) => return HttpResponse::json(500, json!({ "error": "Foundry Link state unavailable." })),
        };
        let token_hash = hash_token(token);
        let Some(session) = state.sessions.remove(&token_hash) else {
            return HttpResponse::json(401, json!({ "error": "Unknown Foundry Link device token." }));
        };
        let device_id = session.device.id;
        state.commands.retain(|command| command.requesting_device_id != device_id);
        state.results.remove(&device_id);
        device_id
    };
    if let Err(error) = persist_state(shared, persistence) {
        return HttpResponse::json(500, json!({ "error": error }));
    }
    HttpResponse::json(200, json!({ "revoked": true, "deviceId": removed_device }))
}

fn get_workspace(
    token: &str,
    shared: &Arc<Mutex<SharedState>>,
    persistence: &PersistenceHandle,
) -> HttpResponse {
    let workspace = {
        let mut state = match shared.lock() {
            Ok(state) => state,
            Err(_) => return HttpResponse::json(500, json!({ "error": "Foundry Link state unavailable." })),
        };
        if authenticate_session(&mut state, token).is_none() {
            return HttpResponse::json(401, json!({ "error": "Unknown or expired Foundry Link device token." }));
        }
        state.workspace.clone()
    };
    let _ = persist_state(shared, persistence);
    match workspace {
        Some(workspace) => HttpResponse::serializable(200, &workspace),
        None => HttpResponse::json(404, json!({ "error": "Desktop workspace has not been published yet." })),
    }
}

fn submit_command(
    body: &str,
    token: &str,
    shared: &Arc<Mutex<SharedState>>,
    persistence: &PersistenceHandle,
) -> HttpResponse {
    let request: SubmitCommandRequest = match serde_json::from_str(body) {
        Ok(request) => request,
        Err(error) => return HttpResponse::json(400, json!({ "error": format!("Invalid command request: {error}") })),
    };

    let response = {
        let mut state = match shared.lock() {
            Ok(state) => state,
            Err(_) => return HttpResponse::json(500, json!({ "error": "Foundry Link state unavailable." })),
        };
        prune_state(&mut state);
        let Some(device_id) = authenticate_session(&mut state, token) else {
            return HttpResponse::json(401, json!({ "error": "Unknown or expired Foundry Link device token." }));
        };
        if request.id.trim().is_empty() || request.correlation_id.trim().is_empty() || request.operation.trim().is_empty() {
            return HttpResponse::json(400, json!({ "error": "Command id, correlationId, and operation are required." }));
        }
        let now = now_ms();
        if request.expires_at_ms <= now || request.expires_at_ms <= request.requested_at_ms {
            return HttpResponse::json(400, json!({ "error": "Command is expired or has an invalid expiry." }));
        }
        if request.expires_at_ms.saturating_sub(now) > COMMAND_TTL_LIMIT_MS {
            return HttpResponse::json(400, json!({ "error": "Command expiry exceeds the host TTL limit." }));
        }
        if let Some(owner) = state.command_owners.get(&request.id) {
            if owner.device_id != device_id {
                return HttpResponse::json(409, json!({ "error": "Command id already belongs to another device." }));
            }
            if let Some(existing) = state.commands.iter().find(|command| command.id == request.id) {
                return HttpResponse::serializable(200, existing);
            }
            return HttpResponse::json(200, json!({
                "id": request.id,
                "requestingDeviceId": device_id,
                "requestedAtMs": request.requested_at_ms,
                "expiresAtMs": request.expires_at_ms,
                "operation": request.operation,
                "payload": request.payload,
                "correlationId": request.correlation_id,
                "sequence": 0
            }));
        }
        if state.commands.len() >= MAX_COMMAND_QUEUE {
            return HttpResponse::json(429, json!({ "error": "Foundry Link command queue is full." }));
        }
        let sequence = state.next_command_sequence;
        state.next_command_sequence = state.next_command_sequence.saturating_add(1);
        let command = FoundryLinkCommand {
            id: request.id,
            requesting_device_id: device_id.clone(),
            requested_at_ms: request.requested_at_ms,
            expires_at_ms: request.expires_at_ms,
            operation: request.operation,
            payload: request.payload,
            correlation_id: request.correlation_id,
            sequence,
        };
        state.command_owners.insert(
            command.id.clone(),
            CommandOwner { device_id, recorded_at_ms: now },
        );
        state.commands.push_back(command.clone());
        command
    };

    if let Err(error) = persist_state(shared, persistence) {
        return HttpResponse::json(500, json!({ "error": error }));
    }
    HttpResponse::serializable(200, &response)
}

fn get_results(
    token: &str,
    shared: &Arc<Mutex<SharedState>>,
    persistence: &PersistenceHandle,
) -> HttpResponse {
    let results = {
        let mut state = match shared.lock() {
            Ok(state) => state,
            Err(_) => return HttpResponse::json(500, json!({ "error": "Foundry Link state unavailable." })),
        };
        let Some(device_id) = authenticate_session(&mut state, token) else {
            return HttpResponse::json(401, json!({ "error": "Unknown or expired Foundry Link device token." }));
        };
        state.results.get(&device_id).cloned().unwrap_or_default()
    };
    let _ = persist_state(shared, persistence);
    HttpResponse::serializable(200, &results)
}

fn acknowledge_results(
    body: &str,
    token: &str,
    shared: &Arc<Mutex<SharedState>>,
    persistence: &PersistenceHandle,
) -> HttpResponse {
    let request: AcknowledgeResultsRequest = match serde_json::from_str(body) {
        Ok(request) => request,
        Err(error) => return HttpResponse::json(400, json!({ "error": format!("Invalid result acknowledgement: {error}") })),
    };
    {
        let mut state = match shared.lock() {
            Ok(state) => state,
            Err(_) => return HttpResponse::json(500, json!({ "error": "Foundry Link state unavailable." })),
        };
        let Some(device_id) = authenticate_session(&mut state, token) else {
            return HttpResponse::json(401, json!({ "error": "Unknown or expired Foundry Link device token." }));
        };
        let acknowledged: HashSet<_> = request.command_ids.iter().collect();
        if let Some(results) = state.results.get_mut(&device_id) {
            results.retain(|item| !acknowledged.contains(&item.command_id));
        }
        prune_state(&mut state);
    }
    if let Err(error) = persist_state(shared, persistence) {
        return HttpResponse::json(500, json!({ "error": error }));
    }
    HttpResponse::json(200, json!({ "acknowledged": request.command_ids.len() }))
}

fn store_result(state: &mut SharedState, result: FoundryLinkCommandResult) {
    if let Some(owner) = state.command_owners.get_mut(&result.command_id) {
        owner.recorded_at_ms = result.completed_at_ms.max(now_ms());
    }
    let results = state.results.entry(result.requesting_device_id.clone()).or_default();
    if let Some(existing) = results.iter_mut().find(|item| item.command_id == result.command_id) {
        *existing = result;
        return;
    }
    results.push_back(result);
    while results.len() > MAX_RESULTS_PER_DEVICE {
        results.pop_front();
    }
}

fn push_workspace(
    body: &str,
    token: &str,
    shared: &Arc<Mutex<SharedState>>,
    persistence: &PersistenceHandle,
) -> HttpResponse {
    let request: PushWorkspaceRequest = match serde_json::from_str(body) {
        Ok(request) => request,
        Err(error) => return HttpResponse::json(400, json!({ "error": format!("Invalid workspace request: {error}") })),
    };
    if let Err(error) = validate_workspace_payload(&request.payload) {
        return HttpResponse::json(400, json!({ "error": error }));
    }

    let envelope = {
        let mut state = match shared.lock() {
            Ok(state) => state,
            Err(_) => return HttpResponse::json(500, json!({ "error": "Foundry Link state unavailable." })),
        };
        let Some(device_id) = authenticate_session(&mut state, token) else {
            return HttpResponse::json(401, json!({ "error": "Unknown or expired Foundry Link device token." }));
        };
        if !request.force.unwrap_or(false) && request.base_revision != state.revision {
            return HttpResponse::json(409, json!({
                "error": "Workspace revision conflict.",
                "currentRevision": state.revision
            }));
        }
        if let Some(existing) = &state.workspace {
            if existing.payload == request.payload {
                return HttpResponse::serializable(200, existing);
            }
        }

        state.revision = state.revision.saturating_add(1);
        let envelope = FoundryLinkWorkspaceEnvelope {
            revision: state.revision,
            payload: request.payload,
            updated_at_ms: now_ms(),
            source_device_id: Some(device_id),
        };
        state.workspace = Some(envelope.clone());
        state.pending_workspace = Some(envelope.clone());
        envelope
    };

    if let Err(error) = persist_state(shared, persistence) {
        return HttpResponse::json(500, json!({ "error": error }));
    }
    HttpResponse::serializable(200, &envelope)
}

fn authenticate_session(state: &mut SharedState, token: &str) -> Option<String> {
    let token_hash = hash_token(token);
    let now = now_ms();
    let expired = state
        .sessions
        .get(&token_hash)
        .map(|session| session.device.expires_at_ms <= now)
        .unwrap_or(false);
    if expired {
        state.sessions.remove(&token_hash);
        return None;
    }
    let session = state.sessions.get_mut(&token_hash)?;
    session.device.last_seen_at_ms = now;
    Some(session.device.id.clone())
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
        429 => "Too Many Requests",
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
    let host = url.host_str().ok_or_else(|| "Foundry Link address is missing a host.".to_string())?;
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
        IpAddr::V4(ip) => ip.is_private() || ip.is_loopback() || ip.is_link_local() || is_cgnat(ip),
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
    let now = now_ms();
    let mut connected_devices = shared
        .sessions
        .values()
        .filter(|session| session.device.expires_at_ms > now)
        .map(|session| session.device.clone())
        .collect::<Vec<_>>();
    connected_devices.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.id.cmp(&b.id)));
    FoundryLinkStatus {
        running: shared.running,
        port: shared.port,
        local_address: shared.local_address.clone(),
        endpoint,
        pairing_code: shared.pairing_code.clone(),
        revision: shared.revision,
        has_workspace: shared.workspace.is_some(),
        connected_devices,
    }
}

fn persisted_snapshot(shared: &SharedState) -> PersistedState {
    PersistedState {
        revision: shared.revision,
        workspace: shared.workspace.clone(),
        pending_workspace: shared.pending_workspace.clone(),
        sessions: shared.sessions.clone(),
        next_command_sequence: shared.next_command_sequence,
        commands: shared.commands.clone(),
        command_owners: shared.command_owners.clone(),
        results: shared.results.clone(),
        pair_attempts: shared.pair_attempts.clone(),
    }
}

fn persist_state(shared: &Arc<Mutex<SharedState>>, persistence: &PersistenceHandle) -> Result<(), String> {
    let _write_guard = persistence
        .write_lock
        .lock()
        .map_err(|_| "Foundry Link persistence writer is unavailable.".to_string())?;
    let path = persistence
        .path
        .lock()
        .map_err(|_| "Foundry Link persistence path is unavailable.".to_string())?
        .clone();
    let Some(path) = path else {
        return Ok(());
    };
    let snapshot = {
        let state = shared
            .lock()
            .map_err(|_| "Foundry Link state is unavailable.".to_string())?;
        persisted_snapshot(&state)
    };
    let content = serde_json::to_string_pretty(&snapshot)
        .map_err(|error| format!("Could not serialize Foundry Link host ledger: {error}"))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create Foundry Link persistence directory: {error}"))?;
    }
    let temp_path = path.with_extension("json.tmp");
    let backup_path = path.with_extension("json.bak");
    fs::write(&temp_path, content)
        .map_err(|error| format!("Could not write temporary Foundry Link host ledger: {error}"))?;
    if path.exists() {
        let _ = fs::copy(&path, &backup_path);
        fs::remove_file(&path)
            .map_err(|error| format!("Could not replace previous Foundry Link host ledger: {error}"))?;
    }
    fs::rename(&temp_path, &path)
        .map_err(|error| format!("Could not commit Foundry Link host ledger: {error}"))
}

fn prune_state(state: &mut SharedState) {
    let now = now_ms();
    state.sessions.retain(|_, session| session.device.expires_at_ms > now);
    state.pair_attempts.retain(|_, attempt| {
        attempt.locked_until_ms > now || now.saturating_sub(attempt.window_started_ms) <= PAIR_WINDOW_MS
    });

    let active_ids = state.commands.iter().map(|command| command.id.clone()).collect::<HashSet<_>>();
    let result_ids = state
        .results
        .values()
        .flat_map(|items| items.iter().map(|result| result.command_id.clone()))
        .collect::<HashSet<_>>();
    state.command_owners.retain(|id, owner| {
        active_ids.contains(id)
            || result_ids.contains(id)
            || now.saturating_sub(owner.recorded_at_ms) <= COMMAND_OWNER_RETENTION_MS
    });

    if state.command_owners.len() > MAX_COMMAND_OWNERS {
        let mut removable = state
            .command_owners
            .iter()
            .filter(|(id, _)| !active_ids.contains(*id) && !result_ids.contains(*id))
            .map(|(id, owner)| (id.clone(), owner.recorded_at_ms))
            .collect::<Vec<_>>();
        removable.sort_by_key(|(_, recorded_at_ms)| *recorded_at_ms);
        let overflow = state.command_owners.len().saturating_sub(MAX_COMMAND_OWNERS);
        for (id, _) in removable.into_iter().take(overflow) {
            state.command_owners.remove(&id);
        }
    }

    for results in state.results.values_mut() {
        while results.len() > MAX_RESULTS_PER_DEVICE {
            results.pop_front();
        }
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

fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hasher.finalize().iter().map(|byte| format!("{byte:02x}")).collect()
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

#[cfg(test)]
mod command_tests {
    use super::*;

    fn linked_state() -> Arc<Mutex<SharedState>> {
        let mut state = SharedState::default();
        let now = now_ms();
        for (token, device_id, name) in [("token-a", "device-a", "A"), ("token-b", "device-b", "B")] {
            state.sessions.insert(
                hash_token(token),
                Session {
                    device: FoundryLinkDevice {
                        id: device_id.into(),
                        name: name.into(),
                        paired_at_ms: now,
                        last_seen_at_ms: now,
                        expires_at_ms: now + SESSION_TTL_MS,
                    },
                },
            );
        }
        Arc::new(Mutex::new(state))
    }

    fn persistence() -> PersistenceHandle {
        PersistenceHandle::default()
    }

    fn body(id: &str, expiry_offset: i64) -> String {
        let now = now_ms();
        let expires = if expiry_offset < 0 {
            now.saturating_sub((-expiry_offset) as u64)
        } else {
            now + expiry_offset as u64
        };
        json!({
            "id": id,
            "requestedAtMs": now.saturating_sub(1),
            "expiresAtMs": expires,
            "operation": "mesh.tool",
            "payload": { "toolName": "bastion.mobile_snapshot" },
            "correlationId": id
        })
        .to_string()
    }

    #[test]
    fn fifo_and_duplicate_protection_are_independent_of_workspace_revision() {
        let shared = linked_state();
        let persistence = persistence();
        assert_eq!(submit_command(&body("one", 60_000), "token-a", &shared, &persistence).status, 200);
        assert_eq!(submit_command(&body("two", 60_000), "token-a", &shared, &persistence).status, 200);
        assert_eq!(submit_command(&body("one", 60_000), "token-a", &shared, &persistence).status, 200);
        let state = shared.lock().unwrap();
        assert_eq!(state.commands.len(), 2);
        assert_eq!(state.commands[0].id, "one");
        assert_eq!(state.commands[1].id, "two");
        assert_eq!(state.revision, 0);
    }

    #[test]
    fn rejects_expired_commands_and_cross_device_id_reuse() {
        let shared = linked_state();
        let persistence = persistence();
        assert_eq!(submit_command(&body("expired", -1), "token-a", &shared, &persistence).status, 400);
        assert_eq!(submit_command(&body("owned", 60_000), "token-a", &shared, &persistence).status, 200);
        assert_eq!(submit_command(&body("owned", 60_000), "token-b", &shared, &persistence).status, 409);
    }

    #[test]
    fn results_redeliver_until_ack_and_remain_device_isolated() {
        let shared = linked_state();
        let persistence = persistence();
        assert_eq!(submit_command(&body("result-1", 60_000), "token-a", &shared, &persistence).status, 200);
        {
            let mut state = shared.lock().unwrap();
            store_result(
                &mut state,
                FoundryLinkCommandResult {
                    command_id: "result-1".into(),
                    requesting_device_id: "device-a".into(),
                    correlation_id: "result-1".into(),
                    completed_at_ms: now_ms(),
                    state: "completed".into(),
                    result: None,
                    error: None,
                    approval_id: None,
                },
            );
        }
        let first = get_results("token-a", &shared, &persistence);
        let again = get_results("token-a", &shared, &persistence);
        assert_eq!(first.body, again.body);
        assert_eq!(get_results("token-b", &shared, &persistence).body, "[]");
        assert_eq!(
            acknowledge_results(
                &json!({ "commandIds": ["result-1"] }).to_string(),
                "token-a",
                &shared,
                &persistence,
            )
            .status,
            200
        );
        assert_eq!(get_results("token-a", &shared, &persistence).body, "[]");
    }

    #[test]
    fn pairing_rate_limit_locks_repeated_invalid_codes() {
        let shared = linked_state();
        let persistence = persistence();
        let ip = "192.168.1.50".parse::<IpAddr>().unwrap();
        for _ in 0..(MAX_PAIR_FAILURES - 1) {
            let response = pair_device(
                &json!({ "code": "000000", "deviceName": "Pixel" }).to_string(),
                ip,
                &shared,
                &persistence,
            );
            assert_eq!(response.status, 403);
        }
        let response = pair_device(
            &json!({ "code": "000000", "deviceName": "Pixel" }).to_string(),
            ip,
            &shared,
            &persistence,
        );
        assert_eq!(response.status, 429);
    }

    #[test]
    fn raw_bearer_tokens_are_not_persisted() {
        let shared = linked_state();
        let state = shared.lock().unwrap();
        let snapshot = serde_json::to_string(&persisted_snapshot(&state)).unwrap();
        assert!(!snapshot.contains("token-a"));
        assert!(!snapshot.contains("token-b"));
    }
}
