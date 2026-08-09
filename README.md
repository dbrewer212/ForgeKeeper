# Forgekeeper

Fenrir Forgeworks local-first workshop management app.

## Run locally

```bash
npm install
npm run dev
```

Then open the localhost URL printed by Vite.

## Included

- Vite + React + TypeScript
- Tailwind setup
- Fenrir logo asset in `public/assets/fenrir-logo.png`
- Modular app structure
- Dashboard, Catalog, Collections, Releases, Orders, Filament, Printers, Reports, Settings
- CSV exports
- Seed data matching the current prototype

## Filament inventory

The desktop app stores the operational workspace in a local SQLite database and migrates the earlier browser-storage workspace on first launch. Filament is tracked as reusable material profiles plus individually identified physical spools.

Open **Filament → Filament Inventory Census** to receive sealed, measured, estimated, unknown, or empty spools. Repeated materials can be added in batches, the initial collection can be imported from CSV, and every physical spool receives a printable `FF-SP-######` QR label. Retired demonstration spools and their demonstration orders are removed only when their original seed fingerprints match exactly.

## Meshy and PrintPal

The desktop app can connect to Meshy and PrintPal without copying API keys into browser storage or the repository.

1. Keep both keys in a local text file outside the ForgeKeeper repository. Unlabeled keys are supported when the Meshy key is first and the `pp_live_...` PrintPal key is second. Labeled `MESHY_API_KEY=...` and `PRINTPAL_API_KEY=...` entries are also supported.
2. Open **Settings → Model Generation Providers** in the desktop app.
3. Link the local credential file and run **Test Meshy & PrintPal**.
4. Open a Catalog concept to submit its linked image to either provider. Every paid submission requires confirmation and creates a local provenance record containing the provider, source image, external job ID, status, and reported credit use.

Credentials are read by the Tauri backend only when a provider action runs. They are not included in ForgeKeeper JSON backups, local browser data, generation records, or Git commits.

## Next recommended build steps

1. Add native file pickers for credential, STL, and concept paths.
2. Add product image previews and generated-model inspection.
3. Add stronger printability validation and printer conflict checks.
