# Forgekeeper Mobile Foundry

The Mobile Foundry is the Android-first roaming console for the Fenrir Forgeworks Foundry ecosystem. It is not a separate lightweight companion product and it is not a duplicate data model. The mobile shell uses the same Forgekeeper React feature stations, domain types, state actions, Foundry mesh code, and native SQLite workspace layer as the desktop application.

## Current implementation

The `mobile-foundry` branch adds:

- Mobile runtime detection with a desktop-browser preview override.
- An Android/iOS mobile application shell with safe-area handling and touch-sized controls.
- Shared station rendering so desktop and mobile use the same operational station components.
- Mobile navigation for Command, Design Library, Production, Materials, Planning, Printer Pool, Reports, Administration, and Commissioning.
- The same `useForgekeeperState()` domain actions used on desktop, so supported station edits are real workspace edits rather than read-only cards.
- Native SQLite plugin registration in the Tauri Rust builder.
- Separate mobile Tauri capability permissions for Android and iOS.
- Android init, development, Android Studio, and APK build scripts.

## What "mobile" changes

Mobile changes the presentation and the device boundary, not the Foundry domain model.

Desktop keeps its sidebar and desktop-specific launch surfaces. Mobile replaces the sidebar with a bottom command rail and a station sheet while preserving access to the existing operational stations. The layout is designed around a narrow touch surface and device safe areas rather than attempting to squeeze the desktop UI into a phone viewport.

## What is local today

The current mobile build can maintain a native local Forgekeeper SQLite workspace. That makes the application operational as a standalone Foundry workspace on the phone.

However, a phone-local SQLite database is not automatically the same physical database file as the desktop Forgekeeper database. Live PC-to-phone synchronization must be handled through a deliberate Foundry transport rather than by pretending two independent SQLite files are one workspace.

## Foundry Link: required for the full roaming-console goal

The next architectural layer is **Foundry Link**: a secure paired transport between Forgekeeper Desktop and Forgekeeper Mobile.

Foundry Link should provide:

1. **Device pairing**
   - Pair a trusted mobile device with the desktop Foundry.
   - Use short-lived pairing material and a persistent device identity after approval.
   - Allow explicit revocation from either side.

2. **Workspace synchronization**
   - Desktop remains the authoritative home Foundry when it is reachable.
   - Mobile keeps an offline-capable cache and a journal of mutations.
   - Sync uses domain operations/events rather than copying a live SQLite database file.
   - Conflicts are surfaced and resolved explicitly instead of silently overwriting work.

3. **Action transport**
   - Remote actions pass through the existing Foundry mesh permission and approval concepts.
   - The phone may request an action; the desktop executes desktop-bound actions.
   - High-impact actions remain approval-gated.
   - Every remote action receives an audit record and result.

4. **Bastion remote console**
   - Mobile receives Bastion health, service state, worker state, approvals, and telemetry from the desktop.
   - Windows executables, local paths, slicers, and system commands execute on the desktop host, never on Android.
   - Mobile becomes the control surface, not a fake Windows runtime.

5. **Printer control boundary**
   - Preserve each printer's native operational path.
   - Foundry Link transports state and approved commands where an integration exists; it does not replace printer firmware or force a universal control stack.

6. **Notifications**
   - Production completion, material alerts, maintenance, Watcher/Bastion faults, and approval requests can be surfaced as Android notifications after the bridge exists.

## Android development

Prerequisites follow the Tauri 2 Android toolchain requirements: Rust, Node/npm, Android Studio/SDK, Android NDK, and the Java toolchain.

From the ForgeKeeper repository:

```bash
git checkout mobile-foundry
npm ci
npm run android:init
npm run android:dev
```

Open the generated Android project in Android Studio when needed:

```bash
npm run android:open
```

Build an APK:

```bash
npm run android:build
```

The first `android:init` generates the platform project under Tauri's generated Android area. It should be run on the development workstation with the Android SDK installed.

## Browser preview

The mobile shell can be inspected without an Android device:

```bash
npm run dev
```

Then open the local Vite application with:

```text
?foundry-mobile=1
```

appended to the local development URL. This preview exercises the mobile React shell but does not substitute for native Android testing.

## Validation boundary

A successful frontend build and Rust `cargo check` validate the shared application/core integration. A real Android device or emulator is still required to validate Android WebView behavior, permissions, native SQLite persistence, safe-area behavior, lifecycle/background behavior, and APK installation.

## Definition of fully operational

The mobile effort is complete when all of the following are true:

- Existing Foundry data/workflow stations operate correctly on Android.
- Native mobile SQLite persistence survives application restart.
- Foundry Link securely pairs with the desktop and synchronizes workspace operations.
- Mobile can observe and request Bastion/Foundry mesh actions without attempting desktop-only execution locally.
- Offline edits reconcile after reconnection with explicit conflict handling.
- Printer and production state respect existing native printer control paths.
- Notifications and approvals arrive on the phone where appropriate.
- The APK is installed and exercised on a physical Android device through the core production workflows.

This keeps the end goal intact: the phone is a roaming Foundry console with meaningful operational capability, while the workstation remains the host for operations that physically belong to the workstation.
