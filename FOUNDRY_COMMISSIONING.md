# Fenrir Forgeworks Foundry Commissioning

This document is the production acceptance checklist for turning the current Forgekeeper / Bastion / Foundry Mesh / Foundry Link codebase into the daily-use Foundry ecosystem.

A feature is not considered commissioned because it renders in the UI or passes a unit test. Commissioned means the installed Windows host and installed Android client survive normal operation, disconnects, process restarts, and device restarts without losing authority state or corrupting workspace data.

## Release gates

### Gate 1 — Automated validation

Required before packaging:

- `npm ci`
- `npm test`
- `npm run audit:operational`
- `npm run audit:integration`
- `npm run build`
- `cargo check` in `src-tauri`
- Foundry Link Rust transport tests
- No new unreviewed high-severity dependency findings

### Gate 2 — Installable artifacts

Required artifacts:

- Windows NSIS setup executable
- Windows MSI package when the Windows runner supports WiX/VBSCRIPT
- Android commissioning APK

The package workflow must build these from the same commit being commissioned. Development-mode output is not an acceptable substitute.

### Gate 3 — Windows Foundry Host

On a clean or test Windows install:

- Installer completes without Node/npm being required by the installed user.
- Forgekeeper starts and creates/opens its SQLite workspace.
- Existing user data survives application upgrades.
- Bastion starts without requiring the ordinary Forgekeeper window to remain visible.
- Foundry Link starts/stops consistently and reports the correct state.
- Workbench, Mesh, recovery, approvals, production, materials, printers, reports, planning, and commissioning load without storage errors.
- Workstation-local paths remain workstation-local and are never synchronized to mobile.
- configured launchers open only their trusted workstation targets.
- A Windows reboot does not lose commissioned configuration or workspace state.

### Gate 4 — Foundry Link authority and durability

Required behavior:

- Pairing is limited to trusted/private network peers.
- Paired devices have persistent identities and can be revoked individually.
- Pairing attempts are rate-limited and pairing codes rotate safely.
- Session/token lifetime and rotation are defined.
- Pending commands, command ownership/idempotency information, results, and accepted pending workspace state survive host-process restart.
- Expired commands never execute.
- Duplicate command IDs never produce duplicate side effects.
- Result acknowledgement occurs only after mobile has durably stored the result.
- An uncertain workstation-side command outcome blocks automatic replay and is surfaced for reconciliation.
- Workspace conflicts cannot silently overwrite a newer accepted revision.

### Gate 5 — Android Mobile Foundry

On the Pixel commissioning device:

- APK installs and launches as the Mobile Foundry shell.
- Mobile SQLite initializes and survives app restart and phone reboot.
- The phone pairs with the workstation on the LAN.
- AppData, Mesh domain state, and Workbench metadata synchronize in both directions.
- Device-local filesystem/tool paths do not appear on Android.
- Command queue state survives Android process suspension/restart.
- Bastion Mobile can read health/telemetry and submit governed commands.
- Safe Mode entry works directly; leaving Safe Mode follows approval policy.
- Service-control operations follow the configured approval policy.

### Gate 6 — Android native integration

Required before calling Mobile Foundry fully commissioned:

- Android notification permission and notification channel.
- Background/wake alert delivery.
- Notification deep links to the relevant Foundry/Bastion surface.
- Biometric confirmation for selected higher-risk approvals.
- Device credentials stored using Android secure storage rather than ordinary web storage.
- Background reconnect behavior verified after Android suspends the application.

### Gate 7 — Foundry Asset Service

Metadata synchronization is not sufficient for managed production assets.

Required service behavior:

- Transfer by Foundry asset/resource ID, never by arbitrary Windows path supplied by mobile.
- Hash verification for transferred files.
- Explicit maximum file size and request limits.
- Chunked/resumable transfer for large STL/3MF assets.
- Bounded mobile cache with eviction policy.
- Clear read/write authority rules.
- STL, 3MF, images, and other approved managed assets can be retrieved on mobile.
- Corrupt/incomplete transfers are rejected and never promoted as valid assets.

### Gate 8 — Physical workstation integrations

Verify against the actual workstation installations and printer environment:

- Anycubic Slicer Next handoff.
- Fluidd handoff for the Neptune control path.
- Blender launcher when configured.
- OrcaSlicer launcher when configured.
- Foundry library and asset-root trusted locations.
- Watcher host telemetry.
- Managed service lifecycle operations.

Current printer commissioning expectations:

- Kobra S1 Max Combo: production-capable, enclosed, normally online/powered, Anycubic control path.
- Neptune 4 Max: out of service until bed leveling/calibration is completed; normally powered off when not being serviced or used.
- Kobra 3 Combo: out of service until the replacement X-axis ribbon cable is installed; normally powered off when not being serviced or used.

An expected-off printer is not a fault solely because it is offline.

### Gate 9 — Failure and recovery tests

Perform deliberately rather than waiting for failures to happen:

- Kill Forgekeeper during normal operation.
- Restart Bastion/Forgekeeper host.
- Reboot Windows.
- Kill Mobile Foundry while a sync is pending.
- Reboot Android.
- Disconnect/reconnect Wi-Fi.
- Disconnect the private overlay if configured and reconnect it.
- Submit a command, interrupt the host around execution/result publication, and verify no duplicate side effect occurs.
- Cause a workspace apply failure and verify the previously accepted baseline is not falsely advanced.
- Fill/approach command and result queue limits and verify bounded behavior.
- Verify recovery snapshots and audit records remain readable.

### Gate 10 — Daily-use acceptance

The Foundry is production-ready only when all of the following are true:

- Windows is launched from an installed package, not `npm run desktop`.
- Android is launched from an installed APK/app package, not browser preview.
- Workstation and phone reconnect without manual database copying.
- No routine operation requires editing source code or localStorage by hand.
- Device revocation, pairing, approvals, Safe Mode, service control, and recovery are usable from supported UI surfaces.
- Actual Foundry data survives upgrades and restarts.
- Remote operations remain governed by Mesh capabilities/policies.
- Printer supervision respects expected operational/power state and native control paths.
- Binary asset movement uses the Asset Service boundary.

## Commissioning rule

Do not merge the Mobile Foundry integration into the stable Foundry branch merely because automated CI is green. Keep the integration branch/draft PR available until the installed Windows host and installed Android client have passed the physical-device gates above.
