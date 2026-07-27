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
