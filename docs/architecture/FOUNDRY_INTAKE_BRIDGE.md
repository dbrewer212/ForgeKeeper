# Foundry Intake Bridge

The Foundry Intake Bridge moves approved product work from a ChatGPT collaboration into the private, local-first Forgekeeper workspace without granting remote access to Forgekeeper's SQLite database.

## `.forgepack` contract

A `.forgepack` file is a ZIP archive containing:

```text
manifest.json
assets/
  concepts/
  measurements/
  references/
  models/
  documents/
```

`manifest.json` uses format `fenrir-forgepack`, version `1`. It carries a stable product ID, product stage, canon gate, forgeability gate, physical print-trial state, pipeline handoff, asset checksums, and provenance.

## Stage behavior

| Packet stage | Forgekeeper behavior |
|---|---|
| Planning | Create or update a Planning record only. |
| Concept Approved | Create or update the Design Project and Concept Spec. Requires canon approval. |
| Engineering | Keep the Design Project in Prototype status and attach supplied model assets. |
| Prototype | Track engineering work without implying physical success. |
| Print Trial | Track the current model and pending or completed trial state. |
| Production Approved | Mark the Design Project for Production. Requires approved forgeability, a passed physical trial, and an STL or 3MF. |
| Released | Mark the Design Project Active under the same production gates. |

Forgekeeper never promotes an unapproved packet merely because it contains concept art or a model.

## Planning promotion and continuity

Manual promotion from Planning preserves the packet's stable product ID and materializes its complete imported history into the Design Library:

- concept images become linked Concept Specs;
- STL and 3MF assets become versioned model records;
- measurements, gate summaries, risks, requirements, blockers, provenance, and next actions remain attached;
- documents, diagnostics, references, and every prior packet remain visible through the Foundry Packets tab;
- later Planning-stage packet imports synchronize with an already-promoted design without silently changing its approval status.

Workspaces created by earlier bridge builds are repaired on load when a blank promoted record and its original Planning packet can be matched safely.

## Native safety boundary

The Tauri importer:

- accepts `.forgepack` files selected through the native file picker;
- rejects unsupported formats and versions;
- rejects absolute paths, traversal, symlinks, overlapping ZIP entries, and undeclared assets;
- limits entry count, individual asset size, manifest size, and total extraction size;
- verifies every declared SHA-256 checksum;
- extracts through a staging directory and finalizes the intake only after every asset passes;
- preserves the original manifest beside the managed assets;
- treats a previously extracted packet ID as an idempotent import.

Managed assets are stored under:

```text
<configured asset root>/Intake/<product-id>/<packet-id>/
```

If no asset root is configured, Forgekeeper uses its application data directory.

## Ownership and approval

The Canon Keeper, Forgeability Engineer, and Product Pipeline may prepare a packet. Derek remains the approval authority for canon and production milestones. Forgekeeper records approvals and provenance; it does not infer them.
