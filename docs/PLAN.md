# ShotWeft Development Plan

| Phase | Local acceptance criteria |
| --- | --- |
| 1 · Environment and prototype | Start the home page and editor. Check desktop and narrow layouts in a browser. |
| 2 · Data and basic editing | Edit scenes, shots, timeline, and real media. Refresh and restore state. |
| 3 · Storyboard and timeline | Verify annotations, layers, zoom, timeline, and project export. |
| 4 · Real media | Expand format coverage and large-file handling. |
| 5 · Export and polish | Improve final rendering and export details. |
| 6 · Quality and documentation | Complete acceptance, technical documentation, screenshots, and local commits. |

## Phase 1 Approach

- Build a local web app with React, TypeScript, and Vite.
- Preserve page position across refresh with hash routing.
- Store projects and edit data locally with Dexie.
- Use Radix Dialog for keyboard-accessible dialogs.
- Use Motion for route, panel, and list transitions.
- Use Konva for the viewing canvas and composition guides.
- Use Lucide icons throughout the interface.
- Use custom CSS for layout and design variables.

Project root: `D:\Projects\ShotWeft`.
The npm cache, temporary directory, and browsers stay inside the project.

Research and verification evidence is in the audit and test documents in this directory.

## Current Progress

Phase 1 is accepted. Project management and basic editing are available. Desktop and narrow layouts have been verified. Actual results are recorded in `docs/TEST_REPORT.md`.

Phase 2 is accepted. Real media and undo history are implemented. Scene and shot management stay synchronized with the storyboard. Details are in `docs/TEST_REPORT.md`.

Phase 3 delivered annotations, layers, and layout adjustments. PNG, PDF, JSON, and ZIP export were delivered early. Later phases expand media formats and improve final rendering.

V1.0 has completed browser acceptance.

## V1.5 Agent CLI and Next Steps

V1.5 provides an offline Agent CLI for rule-based screenplay breakdown, ZIP restore, scene and shot editing, JSON/ZIP/PDF export, and delivery validation. Agent writes to project ZIPs go through the CLI. Command and output contracts are in [Agent guide](AGENT.md).

P3 delivers the intelligence plan. Next, improve local heuristics and build an evaluation set, then evaluate an explicitly enabled LLM adapter, and finally consider multi-agent collaboration. MCP can be added later as an optional tool boundary; the core workflow runs without it. See [Agent intelligence plan](AGENT_INTELLIGENCE.md).