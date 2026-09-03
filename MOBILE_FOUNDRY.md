# Forgekeeper Mobile Foundry

The Mobile Foundry is the Android-first roaming console for the Fenrir Forgeworks Foundry ecosystem. It is not a separate lightweight companion product and it does not maintain a competing domain model. Desktop and mobile share Forgekeeper feature stations, domain types, Foundry Mesh concepts, and native SQLite-backed workspace data while preserving platform-specific execution boundaries.

## Operational architecture

The `mobile-foundry` branch currently provides:

- Mobile runtime detection plus browser preview mode.
- Android/iOS-oriented mobile shell with safe-area and touch-sized controls.
- Shared station rendering for Command, Design Library, Production, Materials, Printer Pool, Reports, Administration, Planning, and Commissioning.
- Native SQLite mobile workspace support.
- Foundry Link pairing and private/trusted-network transport.
- Conflict-aware AppData synchronization.
- Shared Mesh-domain synchronization while preserving device-local worker/runtime health.
- Shared Workbench metadata/state synchronization with recovery snapshots.
- A schema-v4 transient command/result control plane that is explicitly excluded from durable workspace conflict identity.
- Governed mobile-to-workstation Mesh tool execution through the `forgekeeper-mobile` worker identity.
- Short-lived remote commands with five-minute expiry so stale offline actions do not execute unexpectedly after reconnection.
- Remote approval/denial round trips through the existing Mesh coordinator.
- Bastion Mobile supervisory UI with workstation health, Watcher telemetry, services, approvals, Safe Mode controls, service controls, Launch Bay, and remote activity results.
- A consolidated `bastion.mobile_snapshot` tool to minimize remote polling traffic.
- Bastion Windows startup mode that hides the ordinary main window, starts Foundry Link, and leaves the Forgekeeper host process available behind the Bastion touch surface.

## Authority and execution boundaries

Mobile is a control surface. The Windows workstation remains execution authority for Windows-bound operations.

Remote operations are never an arbitrary PowerShell/CMD tunnel. Requests are registered Mesh tools with a capability, requester identity, risk level, permission evaluation, audit/result path, and approval policy.

Current examples include:

- `bastion.mobile_snapshot`
- `workstation.telemetry`
- `workstation.launch_tool`
- `workstation.open_path`
- `system.service.probe`
- `system.service.start`
- `system.service.stop`
- `system.service.restart`
- `mesh.enter_safe_mode`
- `mesh.exit_safe_mode`

The paired human mobile console may enter protective Safe Mode directly because doing so reduces autonomous authority. Leaving Safe Mode remains governed. Service lifecycle changes are also approval-governed by default rather than receiving a blanket mobile allow rule.

## Foundry Link data plane

Foundry Link currently synchronizes three authoritative data layers:

1. **Forgekeeper AppData** — products, models, materials, printers, maintenance, generation jobs, planning, settings, and related workspace records.
2. **Foundry Mesh domain state** — projects, production items, assets, inventory, canon, decisions, sessions, and parked thoughts. Device-local service/worker/runtime health remains local.
3. **Workbench state** — assets, files, revisions, relationships, variants, assemblies, manufacturing specifications, inspections, preparations, and print records.

The system does **not** copy a live SQLite database file between devices.

Workbench managed-file metadata can synchronize, but Windows file paths do not become Android files. STL/3MF/image binary transfer still requires the planned bounded/hash-verified Foundry Asset Service.

## Foundry Link control plane

Schema v4 carries optional transient `remoteCommands` and `remoteCommandResults` beside durable workspace data.

Those records are removed before durable workspace hashing and conflict comparison. This prevents a telemetry refresh, approval request, or command result from looking like a product/material/production edit.

The communication lifecycle is:

1. Mobile queues a short-lived command.
2. The command is published through the authenticated Foundry Link revision stream.
3. Desktop receives the revision and processes the command as `forgekeeper-mobile` through the Mesh Tool Gateway.
4. Mesh permissions either execute it, deny it, or return an approval request.
5. Desktop publishes the result.
6. Mobile absorbs the result and removes the fulfilled command from its queue.
7. Command-only/result-only revisions do not replace AppData/Mesh/Workbench state and do not trigger workspace reloads.

If a command expires before the workstation can execute it, it is denied rather than replayed later.

## Printer boundary

Foundry continues to preserve native printer operation:

- Anycubic Kobra family → Anycubic control path / Anycubic Slicer Next.
- Elegoo Neptune 4 Max → Fluidd.

Bastion and Forgekeeper supervise state and coordinate Foundry work rather than replacing printer firmware or forcing a universal control stack.

Expected-off printers must not be treated as faults merely because they are offline.

## Remote networking boundary

The current Foundry Link server accepts private LAN, loopback/link-local, private IPv6, and CGNAT/trusted-overlay style addresses. It is not intended to be port-forwarded directly to the public Internet.

For away-from-home operation, the intended deployment is an encrypted private overlay such as Tailscale/WireGuard between the phone and workstation. Foundry Link authentication remains an additional application-level boundary.

## Notifications and Android native bridge

The in-app Bastion control/approval path is operational in the shared application code, but reliable Android wake/push notification delivery is a separate native deployment boundary.

Still to commission on a physical Android environment:

- Tauri/native notification permission and channels.
- Notification action/deep-link handling.
- Biometric confirmation for higher-risk approvals.
- Firebase Cloud Messaging or equivalent minimal-data wake/push channel for alerts while Android has suspended the app.
- Secure device-key storage and stronger persistent device revocation/trust management.

Push notifications should carry only minimal alert identity/severity. Full Foundry details and approvals should be retrieved through the private Foundry connection after the app wakes.

## Android development

Prerequisites follow the Tauri 2 Android toolchain requirements: Rust, Node/npm, Android Studio/SDK, Android NDK, and Java toolchain.

```bash
git checkout mobile-foundry
npm ci
npm test
npm run audit:operational
npm run audit:integration
npm run android:init
npm run android:dev
```

Open Android Studio when needed:

```bash
npm run android:open
```

Build an APK:

```bash
npm run android:build
```

## Browser preview

```bash
npm run dev
```

Append this query to the local Vite URL:

```text
?foundry-mobile=1
```

Browser preview validates React layout and shared application logic. It does not substitute for Android lifecycle, network, native notification, biometric, storage, or APK testing.

## Automated validation

The validation workflow runs:

- `npm ci`
- Vitest test suite, including Foundry Link durable/control-plane protocol tests.
- Operational surface discovery audit.
- Hard Foundry Link integration invariant audit.
- TypeScript/Vite production build.
- Rust/Tauri core `cargo check`.

The integration audit fails CI when required cross-platform communication invariants disappear.

## Remaining physical commissioning

Automated CI cannot certify the following without the actual Windows workstation and Pixel/Android environment:

- Real LAN pairing and bidirectional revision traffic.
- Cellular/remote private-overlay access.
- Android process suspension/background reconnect behavior.
- Native notification delivery and notification actions.
- Biometric approval flow.
- APK installation/restart persistence.
- Actual Anycubic Slicer/Blender/Fluidd launch/control handoff on the user's workstation.
- Managed model/image file transfer once the Asset Service is built.

The intended end state remains: Mobile Foundry is the roaming workspace, Bastion Mobile is the roaming supervisory console, and the workstation remains the authoritative host for operations that physically belong to it.
