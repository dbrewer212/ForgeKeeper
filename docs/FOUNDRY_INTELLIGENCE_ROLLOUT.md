# Foundry Intelligence Rollout

This branch begins the Foundry Intelligence rollout from the current `mobile-foundry` integration baseline.

## Ownership boundaries

- **Foundry Mesh** remains the authority, governance, permissions, event, action, and tool spine.
- **Watcher** owns observation, workstation/equipment telemetry, anomaly findings, and operating baselines.
- **Foundry Intelligence** interprets intent, builds context, reasons, plans, selects governed Mesh tools, retrieves experience, and evaluates outcomes.
- **Bastion** remains the human supervisory/control and approval surface rather than becoming a second policy engine.
- **Forgekeeper** remains workspace and knowledge stewardship.
- **Production Steward** remains deterministic production continuity and next-action logic.
- **Workbench** remains asset, model, revision, manufacturing, and production-preparation intelligence.
- **Foundry Link** remains the authenticated desktop/mobile transport and command/result plane.
- **Mobile Foundry** remains the roaming interface while Windows retains execution authority for workstation-bound operations.
- **OpenClaw** remains the background automation/execution worker.
- **Odysseus** remains the conversational/research workspace.
- **Ollama** remains a local inference provider rather than an authority source.

## Rollout sequence

1. Baseline and responsibility contracts. **Implemented; CI validated.**
2. Watcher provider expansion and normalized observation contracts. **In progress.**
3. World Model expansion through the existing Foundry Domain and Workbench rather than a competing database.
4. Mesh capability/skill expansion with explicit risk, authority, reversibility, preconditions, side effects, and verification.
5. Foundry Asset Service and file intelligence.
6. Structured workstation execution adapters.
7. Foundry Intelligence worker and model-routing layer.
8. Experience memory derived from durable attributable events and verified outcomes.
9. Teach-mode workflow learning with human promotion into reusable skills.
10. Performance intelligence and learned workstation operating profiles.
11. Intelligence requests across Foundry Link and Mobile Foundry.
12. Native Android completion, then voice, then deliberately bounded proactivity.

## Current Watcher foundation

The existing Windows host snapshot remains the compatibility source used by Bastion and the Watcher lifecycle probe. A shared host sampler now coalesces concurrent collection and retains a short-lived sample so logical Watcher providers do not repeatedly invoke the same native PowerShell/CIM probe.

Current logical providers:

- `windows-host` — compatibility host snapshot.
- `windows-cpu` — CPU utilization projection.
- `windows-memory` — physical-memory projection.
- `windows-storage` — fixed-disk capacity/free-space projection.
- `windows-process` — bounded process-count summary.
- `windows-gpu` — GPU identity/adapter-memory projection; utilization and temperature remain an explicit provider gap rather than fabricated values.

Provider output can now be normalized into attributable Watcher observations with provider ID, timestamp, domain, availability, value, and failure detail. A failed provider produces unavailable observations instead of implying a healthy or zero-valued reading.

Next native sensing expansion is Windows process detail, service state, storage/volume detail, network state, installed-software inventory, Foundry-service state, and equipment adapters. High-volume or sensitive detail remains workstation-local unless a specific governed projection is approved for mobile or model context.

## Safety rule

No model receives a bypass around Mesh governance. Intelligence may reason and propose actions, but execution must resolve through registered capabilities/tools and existing permission/approval policy.

## Commissioning rule

Implementation state and commissioned runtime state remain separate. New workers/services enter dormant state until their real workstation dependencies, probes, permissions, and recovery behavior are physically verified.
