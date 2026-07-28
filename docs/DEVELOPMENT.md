# Development Guide

## Clean Setup

```bash
npm ci
npm test
npm run check
npm run dev
```

Do not commit `node_modules`, `dist`, TypeScript build caches, Tauri targets, generated binaries,
ZIP handoff packages, or backup source files.

## Verification

Before committing application changes:

```bash
npm run check
npm test
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
npm run desktop:build
```

## Desktop Acceptance Gate

A desktop checkpoint is accepted only after all of the following pass on Windows:

1. A fresh launch opens Establish Your Foundry with no demonstration operational records.
2. Workspace identity, first printer, and first material can be created.
3. Closing and reopening preserves the workspace through SQLite.
4. A Design Project can be created and promoted from Planning.
5. A Production Job can be assigned to a printer, spool, and batch.
6. Material consumption creates one negative movement and cannot exceed available stock.
7. Completing a job records actual outcome fields and one cost snapshot.
8. Reports show zero integrity issues.
9. JSON backup export, restore, and post-restore restart preserve all records.
10. The platform installer produced by `npm run desktop:build` installs and launches normally.

Do not merge the rollout branch until this native gate is complete.

## Continuous Verification

`.github/workflows/verify.yml` runs the complete frontend gate on Linux and the Rust/Tauri build on
Windows for rollout-branch pushes and pull requests. The Windows job uploads the generated bundle
directory as the `ForgeKeeper-Windows` workflow artifact. A green workflow proves compilation and
installer generation; the interactive persistence and workflow checks above remain the final
operator acceptance gate.
