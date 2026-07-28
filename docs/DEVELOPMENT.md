# Development Guide

## Clean Setup

```bash
npm ci
npm run check
npm run dev
```

Do not commit `node_modules`, `dist`, TypeScript build caches, Tauri targets, generated binaries,
ZIP handoff packages, or backup source files.

## Verification

Before committing application changes:

```bash
npm run check
npm run build
```

Desktop-specific changes must also be checked through the Tauri toolchain on a supported host.

## Architecture Rules

- Put shared domain behavior below `src/core`.
- Keep station-specific UI and orchestration within its feature boundary.
- Give each record one owning station.
- Access shared records through stable identifiers and application services.
- Do not add customer catalog, customer account, order-intake, event, mobile, sync, or automation
  functionality to the active core.
- Preserve existing user data through explicit migrations.
- Treat the `ForgeKeeperUI` branch as a capability reference, not a merge target.
- Keep the Jotunn WPF application in its own workstream.

## Data Persistence

The installed Tauri application uses the official SQL plugin and `sqlite:forgekeeper.db`.
Migrations are registered in `src-tauri/src/lib.rs` and stored in `src-tauri/migrations`.

The web/Vite development surface uses a browser-preview repository because SQLite is owned by the
desktop process. Browser preview data is not the production source of truth.

Run frontend verification with:

```bash
npm run check
npm run build
```

Run desktop verification on a machine with the Rust toolchain and Tauri prerequisites:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
npm run desktop
```
