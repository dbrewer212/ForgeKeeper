# ForgeKeeper

ForgeKeeper is the local-first administrative and production command center for the Fenrir
Forgeworks Foundry ecosystem.

The active application is a private, single-user workshop system. Customer catalogs, customer
accounts, sales-order intake, event terminals, and mobile interfaces are intentionally outside
this application.

## Operational Stations

- Command: workshop health, alerts, suggested actions, forecasts, and recent activity.
- Design Library: projects, concepts, STL links, variants, collections, and releases.
- Planning: prototypes, material planning, design architecture, verified `.forgepack` intake, and promotion into the library.
- Production: internal jobs, batches, assignments, material consumption, and completion outcomes.
- Materials: spool inventory, thresholds, costs, demand forecasts, and movement history.
- Printer Pool: capabilities, availability, workload, and maintenance records.
- Reports: operational metrics, cost snapshots, integrity checks, exports, and recovery.
- Administration: workspace identity, cost defaults, external tools, paths, backup, and reset.

## Data Safety

The installed desktop application owns one versioned SQLite database, `forgekeeper.db`. Every save
updates the authoritative workspace snapshot and the indexed station tables inside one serialized
transaction. Invalid cross-station references are rejected before persistence.

Browser development uses a separate preview repository. It is not the desktop source of truth.

Foundry product packets are validated before import, checksum-verified, copied into a managed local
intake directory, and routed to Planning or the Design Library according to explicit canon,
forgeability, and physical-test gates.

Legacy `forgekeeper.app.v1` data is imported once. Product records become user-owned Design
Projects; useful order-production fields become internal Production Jobs. Customer, contact,
payment, tracking, and quoted-sale data are deliberately discarded.

## Development

Requirements:

- Node.js 20 or newer
- Rust stable MSVC toolchain on Windows
- Microsoft C++ Build Tools with Desktop development with C++
- WebView2 Runtime

```bash
npm ci
npm test
npm run check
npm run build
```

Desktop development and packaging:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
npm run desktop
npm run desktop:build
```

See `docs/DEVELOPMENT.md` for the complete release gate and
`docs/architecture/FOUNDRY_ECOSYSTEM.md` for record ownership and migration rules. The packet
contract and native safety boundary are documented in
`docs/architecture/FOUNDRY_INTAKE_BRIDGE.md`.
