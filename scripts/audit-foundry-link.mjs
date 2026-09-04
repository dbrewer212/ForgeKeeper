import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

const files = {
  protocol: read("src/foundry-link/protocol.ts"),
  workspace: read("src/foundry-link/workspaceSync.ts"),
  commands: read("src/foundry-link/remoteCommands.ts"),
  commandJournal: read("src/foundry-link/desktopCommandJournal.ts"),
  mobileLink: read("src/mobile/FoundryLinkMobilePanel.tsx"),
  mobileBastion: read("src/mobile/BastionMobilePanel.tsx"),
  alertBus: read("src/bastion/alertBus.ts"),
  printerExpectations: read("src/bastion/printerExpectations.ts"),
  actionGateway: read("src/mesh/actionGateway.ts"),
  app: read("src/App.tsx"),
  workstationTools: read("src/mesh/workstationTools.ts"),
  policies: read("src/mesh/defaultPolicies.ts"),
  workers: read("src/mesh/workers.ts"),
  desktopRuntime: read("src/foundry-link/DesktopFoundryLinkRuntime.tsx"),
  desktopWorkspace: read("src/ForgekeeperWorkspace.tsx"),
  rustHost: read("src-tauri/src/lib.rs"),
  rustLink: read("src-tauri/src/foundry_link.rs"),
  tauriConfig: read("src-tauri/tauri.conf.json"),
  mobileCapabilities: read("src-tauri/capabilities/mobile.json"),
};

const checks = [
  ["workspace-schema-v3", files.protocol.includes("FOUNDRY_LINK_SCHEMA_VERSION = 3")],
  ["commands-excluded-from-workspace", !files.workspace.includes("remoteCommands?: FoundryRemoteCommand[]")],
  ["results-excluded-from-workspace", !files.workspace.includes("remoteCommandResults?: FoundryRemoteCommandResult[]")],
  ["dedicated-command-routes", files.rustLink.includes('("POST", "/commands")') && files.rustLink.includes('("GET", "/results")') && files.rustLink.includes('("POST", "/results/ack")')],
  ["mobile-command-channel", files.mobileLink.includes("foundry_link_remote_submit_command") && files.mobileLink.includes("foundry_link_remote_get_results") && files.mobileLink.includes("foundry_link_remote_ack_results")],
  ["mobile-durable-hash", files.mobileLink.includes("canonicalFoundryLinkPayload")],
  ["command-expiration", files.commands.includes("DEFAULT_COMMAND_TTL_MS = 5 * 60 * 1000") && files.commands.includes("expiresAtMs")],
  ["expired-commands-denied", files.commands.includes("Remote command expired before the workstation could execute it")],
  ["command-fifo-helper", files.commands.includes("sortRemoteCommandsForExecution") && files.desktopRuntime.includes("sortRemoteCommandsForExecution(getStagedDesktopRemoteCommands())")],
  ["result-ack-after-mobile-persist", files.commands.includes("if (!writeJson(MOBILE_RESULTS_KEY, merged)) return []")],
  ["desktop-command-journal-before-execution", files.desktopRuntime.includes("stageDesktopRemoteCommands(fetched)") && files.desktopRuntime.indexOf("stageDesktopRemoteCommands(fetched)") < files.desktopRuntime.indexOf("processRemoteCommand(command)")],
  ["desktop-result-journal-before-publication", files.desktopRuntime.includes("rememberDesktopRemoteCommandResult(result)") && files.desktopRuntime.includes('await invoke("foundry_link_publish_command_result", { result });')],
  ["desktop-command-journal-retry", files.commandJournal.includes("getJournaledDesktopRemoteCommandResult") && files.desktopRuntime.includes("getJournaledDesktopRemoteCommandResult(command.id)")],
  ["mesh-governed-execution", files.commands.includes("runtime.tools.invoke") && files.commands.includes('requesterWorkerId: "forgekeeper-mobile"')],
  ["approval-round-trip", files.commands.includes("runtime.coordinator.approve") && files.commands.includes("runtime.coordinator.deny")],
  ["approval-context-on-result-channel", files.commands.includes("FoundryRemoteApprovalDetail") && files.commands.includes("requestedByWorkerId") && files.commands.includes("risk: request.risk")],
  ["approval-expiration", files.actionGateway.includes("DEFAULT_APPROVAL_TTL_MS") && files.actionGateway.includes("expiresAt:")],
  ["mobile-approval-inspection-detail", files.mobileBastion.includes("detail?.requestedByWorkerId") && files.mobileBastion.includes("detail?.reason") && files.mobileBastion.includes("detail?.expiresAt")],
  ["resolved-approval-suppression", files.mobileBastion.includes("resolvedApprovalIds") && files.mobileBastion.includes("approvalExpired")],
  ["mobile-worker-registered", files.workers.includes('id: "forgekeeper-mobile"')],
  ["workstation-requester-guard", files.workstationTools.includes('worker.id !== "forgekeeper-mobile"')],
  ["consolidated-bastion-snapshot", files.workstationTools.includes('name: "bastion.mobile_snapshot"')],
  ["protective-safe-mode-mobile-allow", files.policies.includes('id: "mobile-console-enter-safe-mode"') && files.policies.includes("effect: \"allow\"")],
  ["safe-mode-exit-still-governed", !files.policies.includes('workerId: "forgekeeper-mobile", capabilityId: MeshCapabilities.meshExitSafeMode, effect: "allow"')],
  ["service-lifecycle-not-unconditionally-allowed", !files.policies.includes('workerId: "forgekeeper-mobile", capabilityId: MeshCapabilities.systemServiceStart, effect: "allow"') && !files.policies.includes('workerId: "forgekeeper-mobile", capabilityId: MeshCapabilities.systemServiceStop, effect: "allow"')],
  ["bastion-mobile-mounted", files.app.includes("<BastionMobileOverlay />")],
  ["mobile-bastion-controls-use-queue", files.mobileBastion.includes("queueRemoteTool") && files.mobileBastion.includes("queueRemoteApproval")],
  ["alert-bus-lifecycle-contract", files.alertBus.includes("BastionAlertState") && files.alertBus.includes("dedupeKey") && files.alertBus.includes("allowedActions") && files.alertBus.includes("recommendedAction") && files.alertBus.includes('seed.state ?? "active"')],
  ["printer-expected-state-awareness", files.printerExpectations.includes('operationalDisposition: "out-of-service"') && files.printerExpectations.includes('expectedPower: "always-on"') && files.alertBus.includes("evaluatePrinterExpectedState")],
  ["printer-native-control-paths-preserved", files.printerExpectations.includes('controlPath: "Fluidd"') && files.printerExpectations.includes('controlPath: "Anycubic Next"')],
  ["desktop-link-runtime-mounted", files.desktopWorkspace.includes("<DesktopFoundryLinkRuntime")],
  ["desktop-command-processor", files.desktopRuntime.includes("foundry_link_take_pending_commands") && files.desktopRuntime.includes("foundry_link_publish_command_result")],
  ["desktop-pending-mobile-commit", files.desktopRuntime.includes("foundry_link_take_pending_workspace") && files.desktopRuntime.includes("commitLinkedWorkspace")],
  ["desktop-runtime-releases-remote-apply-lock", files.desktopRuntime.includes("applyingRemote.current = false")],
  ["bastion-startup-hides-main-host", files.rustHost.includes('get_webview_window("main")') && files.rustHost.includes("main_window") && files.rustHost.includes(".hide()")],
  ["bastion-startup-autostarts-link", files.rustHost.includes("foundry_link_start(link_state, Some(4717))")],
  ["private-link-address-policy", files.rustLink.includes("is_private_link_ip") && files.rustLink.includes("is_cgnat")],
  ["link-request-size-bounded", files.rustLink.includes("MAX_REQUEST_BYTES")],
  ["trusted-launcher-boundary", files.workstationTools.includes("launcherId") && !files.workstationTools.includes("toolPath") && files.rustHost.includes("launch_trusted_tool")],
  ["tauri-csp-enabled", !files.tauriConfig.includes('"csp": null') && files.tauriConfig.includes("default-src 'self'") && files.tauriConfig.includes("script-src 'self'")],
  ["mobile-native-sql-capability", files.mobileCapabilities.includes('"sql:default"')],
];

let failures = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"}|${name}`);
  if (!passed) failures += 1;
}

const external = [
  ["android-notification-bridge", files.mobileCapabilities.includes("notification:")],
  ["android-deep-link-bridge", files.mobileCapabilities.includes("deep-link:")],
  ["mobile-biometric-bridge", files.mobileCapabilities.includes("biometric:")],
];
for (const [name, commissioned] of external) {
  console.log(`${commissioned ? "COMMISSIONED" : "EXTERNAL-PENDING"}|${name}`);
}

console.log(`Foundry Link integration audit: ${checks.length - failures}/${checks.length} structural invariants passed.`);
if (failures > 0) process.exit(1);
