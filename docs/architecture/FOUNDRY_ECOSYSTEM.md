# Foundry Ecosystem Architecture

**Status:** Active implementation foundation

## Objective

ForgeKeeper is being restructured from a single prototype that owns every workflow into the
single-user administrative and production station within the wider Foundry ecosystem.

The ecosystem is a local-first modular application. All stations use one authoritative data core.
Each station owns its workflow and business rules while consuming shared records through explicit
interfaces.

## Current Scope

The active build is an internal, single-user workshop system.

Included:

- workspace setup and administration;
- design projects and their linked assets;
- planning and production readiness;
- production jobs and batches;
- printer pool and maintenance;
- filament and material inventory;
- costing, operational reporting, alerts, and suggested actions;
- local backup and migration.

Excluded from the active build:

- customer browsing;
- customer catalog or kiosk mode;
- customer records;
- order intake and sales processing;
- event terminals;
- mobile companion;
- remote synchronization;
- unattended automation.

The excluded capabilities are not deleted from project history. They are separate future
workstreams and may not drive the current data model.

## Source of Truth

The authoritative store will be a versioned SQLite database owned by the desktop application.
The current browser localStorage implementation is a temporary compatibility adapter used only
while the SQLite repository and legacy-data importer are completed.

The data core owns identity, relationships, migration, validation, and persistence. No view or
station may maintain a competing copy of operational truth.

## Station Ownership

| Station | Owns | May Consume |
|---|---|---|
| Command | dashboard, alerts, suggested actions, system health | summaries from every station |
| Design Library | user-defined projects, variants, concepts, STL and reference links | production-readiness and cost summaries |
| Planning | prototypes, requirements, dependencies, readiness gates | designs, printers, materials |
| Production | internal jobs, batches, outcomes, queue state, actual consumption | designs, printers, materials, cost settings |
| Materials | filament spools, stock movements, thresholds, purchasing state | production demand |
| Printer Pool | printers, capabilities, status, maintenance, assignments | production jobs |
| Reports | derived operational and cost reporting | read-only data from all stations |
| Administration | workspace profile, paths, tools, rates, backups, migrations | system metadata |

Every record has one owning station. Other stations reference the record by stable identifier.

## Core Records

- `WorkspaceProfile`
- `DesignProject`
- `AssetRecord`
- `DesignVariant`
- `PrototypePlan`
- `ProductionJob`
- `ProductionBatch`
- `Printer`
- `MaintenanceEvent`
- `MaterialSpool`
- `MaterialMovement`
- `CostProfile`
- `CostSnapshot`
- `SystemAlert`

The prototype names `Product`, `OrderRecord`, and `Catalog` are migration sources, not the final
domain language. Product records become user-owned design projects. Order records that contain
useful production data become internal production jobs. Customer and sales-only fields are not
carried into the operational core.

## Implemented Data Core

The desktop application now loads one versioned SQLite database through a repository interface.
React views never open or query the database directly.

Current authoritative record:

- database: `forgekeeper.db` in the Tauri application configuration directory;
- workspace identifier: `local-foundry`;
- schema version: `3`;
- authoritative payload: `workspace_state`;
- schema history: Tauri SQL migrations registered in Rust;
- compatibility path: browser storage is limited to web preview and legacy import.

The initial migration also establishes indexed tables for design projects, production jobs,
materials, and printers. The versioned workspace snapshot remains authoritative during the
station-by-station repository transition so a partial station conversion cannot split operational
truth.

On first desktop launch:

1. SQLite migrations run atomically.
2. ForgeKeeper checks the authoritative workspace record.
3. If no workspace exists, it checks for the prototype `forgekeeper.app.v1` payload.
4. Legacy products become `DesignProject` records.
5. Legacy orders become internal `ProductionJob` records.
6. Customer, contact, payment, tracking, and quoted-sale fields are discarded.
7. The original legacy JSON is archived locally only after the SQLite save succeeds.
8. A new installation opens the first-run workspace setup with no demonstration records.

The first-run setup establishes workspace identity, owner/operator, asset root, cost inputs, and
production capacity. Printers and materials are created in their owning stations so the workspace
contains only user-defined operational records.

## Application Boundaries

```text
React station views
        |
Application services and commands
        |
Domain records and validation
        |
Repository interfaces
        |
SQLite / asset filesystem adapters
```

React components do not read or write SQLite directly. Tauri plugins and Rust commands are
infrastructure adapters behind repository interfaces. This keeps the stations testable and allows
future interfaces to reuse the same data rules without owning the database.

## Migration Rules

1. Preserve existing user data before changing its representation.
2. Import the current localStorage JSON through an explicit legacy migration.
3. Assign stable identifiers before establishing cross-station relationships.
4. Translate useful catalog/product data into design projects and assets.
5. Translate useful order production data into internal jobs or batches.
6. Drop customer-only, sales-only, and kiosk-only fields from the active schema.
7. Record the schema version and apply migrations atomically.
8. Never silently reset the workspace when a migration fails.

## Repository Direction

`main` is the recovery base for the Foundry core.

The `ForgeKeeperUI` branch is a capability source, not a merge target. Its batch logic, backup
ideas, and design-package experiments may be selectively reimplemented. Its customer catalog is
excluded. The Jotunn WPF application and its generated assets are a separate workstream and must
not be blended into ForgeKeeper.
