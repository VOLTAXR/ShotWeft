# ShotWeft Extension Boundary

## V1.0 Web Project Boundary

V1.0 exposes a project snapshot type in `src/project-snapshot.ts`. `readProject(id)` reads the project and its assets in one transaction. Existing export features use this entry point. A snapshot contains a `Project` and its associated `Asset[]`; media is represented as Blob values. The app saves undoable edits through `editProject`, and the edit transaction handles projects, assets, and history together. Backup restore creates a new project through `importProject`.

## V1.5 Agent CLI Boundary

- The Agent CLI supports local screenplay breakdown, scene and shot editing, JSON/ZIP/PDF export, ZIP restore, and read-only validation of a ZIP and optional PDF. External integrations read through `project show`, `scene list`, `shot list`, `export json`, or `agent verify`, and follow the non-interactive JSON and exit-code contract. See [Agent guide](AGENT.md).
- The CLI is the stable write boundary for Agent and external integrations. It validates manifests and references, applies target locks, stages output, uses atomic replacement for existing ZIPs, and refuses to overwrite create/export targets. Web editing continues to use IndexedDB transactions and undo history.
- LLM analysis, multi-agent orchestration, and MCP are optional future extensions. LLM analysis submits candidates only; local review and validation happen before the CLI writes. MCP may wrap existing read/write commands and must follow the same authorization, validation, locking, and transaction boundaries. The core CLI workflow does not require MCP. See [Agent intelligence plan](AGENT_INTELLIGENCE.md).