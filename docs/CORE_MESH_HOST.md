# Core Mesh worker host

The existing FoundryMeshRuntime runs as a short-lived private worker. It has no network listener, printer command surface or shell-command dispatch. Core authenticates the transport client, verifies scoped permissions and the stored human review, and locks the proposal and target before starting it.

Mesh evaluates the established project-write capability (or the explicit Watcher finding acknowledgement/resolution capabilities), honors saved deny policies, disabled workers and Safe Mode, and dispatches a registered Core-action tool. Its handler requests the bounded Core mutation through private IPC and verifies the durable read-back result.

CoreTransactionPersistence is backed by the same open SQLite transaction as the mutation. Mesh snapshot, audit events, action result and target data commit together. A worker crash or invalid result rolls everything back; denial/failure audit records are retained separately. A lost-response retry returns the committed result without repeating work.

The host accepts only an immutable reviewed proposal context and authenticated principal permissions from Core. It cannot accept a caller-selected executable, arbitrary tool name, file path or approval claim. Provider credentials and Node injection variables are not inherited. Frames, operations, memory and execution time are bounded.

Build with node scripts/build-core-mesh.mjs from committed source. The bundle includes exact source/digest provenance and Tauri API license notices. Foundry Engine packages the verified bundle with an official hash-checked offline Node runtime and its complete upstream notices. It does not download code at application runtime.

Windows/Core migration preserves an existing ForgeKeeper Mesh authority, including policies, domain records, approvals and journal. It retains byte-for-byte source backups and detects later writes from the older authority instead of silently replacing permissions.

Android 0.3.7 requires the Mesh-enforced server capability before enabling reviewed execution and displays actual verified receipts. This transport does not claim that legacy direct data-entry paths, background alerts or printer commissioning are complete.
