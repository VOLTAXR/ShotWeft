# ShotWeft P3 Agent Intelligence Plan

This document records the post-P2 design for V1.5. P3 delivered a plan only; LLM analysis, MCP, intelligent shot suggestions, automatic media matching, and multi-agent collaboration are not implemented. See [Agent guide](AGENT.md) for commands that work today.

## 1. Current State and Boundary

`agent storyboard` reads UTF-8 text up to 1 MiB and calls the local `breakdownScript` rules for Chinese/English scene headings, action, dialogue, and notes. It produces 12 shots by default and supports 1–50. Identical input and options produce identical scene order, shot order, relations, and durations. Project, scene, and shot IDs come from local factories; the project timestamp is set at creation. There is no AI call and no MCP integration. The core workflow runs fully offline. Implementations: [rule breakdown](../src/core/script-breakdown.ts) and [storyboard command](../src/cli/storyboard.ts).

| Stage | Current CLI | Behavior |
| --- | --- | --- |
| Create and restore | `project create`, `project restore` | Create a project with one initial scene and shot, or restore web/CLI ZIP to a new path. JSON restore requires a project with no user media. |
| Storyboard and editing | `agent storyboard`, `shot`, `scene` | Generate an independent project ZIP and optional PDF. Read scene/shot IDs through the CLI before update or reorder. |
| Delivery | `export json`, `export zip`, `export pdf` | JSON is the manifest. ZIP preserves manifest, annotations, and media. PDF renders with local Chromium and the web storyboard layout. |
| Validation and continuation | `agent verify`, `project restore`, `shot`, `scene` | Validate a delivery ZIP and optional PDF. Restore preserves scene/shot IDs for further edits. |

- **Projects and ZIPs.** `ProjectSnapshot` contains a `Project` and `Asset[]`; media and thumbnails are Blobs. The CLI `ProjectArchive` also contains bundled photos and an optional source manifest. `writeProjectFile` calls `readProjectManifest` to validate structure and relations before writing. ZIP reads also check the entry allowlist, duplicate names, size limits, media sizes, and CRC. See [project snapshot](../src/project-snapshot.ts), [project model](../src/model.ts), and [project archive](../src/core/project-archive.ts).
- **PDF.** Export uses local Playwright Chromium; pages and media are served through local interception. `agent verify --pdf` checks a regular file, PDF header and EOF marker, parseability, and non-zero page count, then returns path, bytes, pages, and title. Validation does not launch Chromium. Delivery review still needs to check ZIP/PDF correspondence and page readability. See [PDF export and validation](../src/cli/pdf.ts).
- **Locks and staging.** A `.shotweft-lock` directory beside the target is both a write lock and a staging location on the same filesystem. New files publish through hard links and refuse overwrite; existing ZIP edits use atomic `rename`. `agent storyboard --pdf` stages both outputs and tries to withdraw a published ZIP if PDF publication fails. Media extraction prefers `SHOTWEFT_TMP`; otherwise Windows uses the working-directory `.tmp` and Linux/macOS use the system temporary directory. Commands clean staging at the end. A forced process termination can leave temporary files, locks, or a single published output. See [CLI file I/O](../src/cli/project-file.ts).
- **Automation contract.** Commands need no stdin. Success writes one JSON line to stdout and exits `0`. Runtime failure exits `1`; usage errors exit `2`; stderr is one `{"error":"<message>"}` line. Help and version are text. Stdout `EPIPE` exits silently with `0`, so automation should verify the actual output and files. See [command dispatch](../src/cli/main.ts) and [CLI entry](../src/cli/entry.ts).

## 2. Optional LLM Screenplay Analysis

**Offline by default, explicitly enabled.** Keep the current offline `agent storyboard` path. A future provider-neutral adapter can sit between screenplay reading and candidate generation. It receives approved screenplay text and generation constraints; local code treats its output as untrusted data. The adapter accepts timeout, cancellation, and budget, while core breakdown and ZIP/PDF paths keep local types and validation. Local models or user-selected services are permitted; the project does not bind to any paid API.

1. **Preview and authorization before sending.** Extract only needed scene fragments, action, or dialogue; remove unnecessary names, contact details, absolute paths, and project metadata locally. Show the recipient, redacted text, purpose, retention terms, and cost ceiling. Authorization is bound to recipient, request content, and budget; any change requires reapproval. Automation can generate a local preview and submit a machine-readable local authorization record; existing CLI calls stay non-interactive. Without authorization, use local rules.
2. **Credentials and budget.** Only after explicit enablement and authorization, read the credential selected by the user from the environment or system credential service. The key is used only for adapter authentication and is never echoed. Set total timeout, input/output token limits, maximum requests, and a total cost ceiling; retries count toward the ceiling. If cost cannot be bounded, budget is insufficient, or authorization does not match, continue with local rules.
3. **Validate candidates.** Use a versioned schema that accepts only candidate scene/shot fields. Scene fields map to existing location, setting, time, description, dialogue, and notes. Shot fields include `sceneIndex`, title, size, angle, movement, lens, duration, and notes. Reject unknown fields, out-of-range references, empty titles, and invalid durations. Shot count must equal the requested count (1–50), every candidate scene needs at least one shot, and text must respect project limits. Models cannot specify project IDs, file paths, media URLs, or write commands.
4. **Confirmation and publication.** Preview candidates and their source locally. After confirmation, the CLI creates real IDs, maps `sceneIndex` to `sceneId`, validates the manifest and relations, and uses the existing ZIP/PDF write paths. If the model is unconfigured, times out, errors, returns an unparsable response, fails candidate validation, or candidates are rejected, regenerate the entire breakdown with `breakdownScript`. Use fixed fallback categories for review. Invalid input files, lock conflicts, or write failures keep the existing error contract.

## 3. Intelligent Shot Size and Language

`breakdownScript` first gives every retained scene at least one shot, then distributes extra shots by action/dialogue length. Within a scene, shots rotate through the following combinations; duration is estimated by text length in half-second steps up to 8 seconds. See [rule breakdown](../src/core/script-breakdown.ts).

| Size | Angle | Movement | Lens |
| --- | --- | --- | --- |
| Wide | Eye level | Static | 24mm |
| Medium | Eye level | Follow | 35mm |
| Close | Three-quarter | Static | 50mm |
| Extreme close | High angle | Slow push-in | 85mm |

Future work should first use local heuristics to identify scene establishment, character action, dialogue, reaction, and prop details, then evaluate whether an optional model improves size, angle, movement, and lens choices. Coverage suggestions may include establishing, shot/reverse-shot, reaction, and insert shots. Transition suggestions may include cut or dissolve, subject to the shot budget. The `Shot` model already has `size`, `angle`, `movement`, and `lens`; transition and coverage types can stay in a review record, with accepted information written to `notes`.

Each suggestion includes source (rules or adapter), screenplay line range, a readable rationale, and confidence. Model-reported confidence is only a ranking signal; reliability must be measured on an evaluation set. Reviewers may accept, reject, or override each item, preserving the relationship between final choices and candidates. If evidence cannot be located, confidence is low, suggestions conflict, or the user does not select a field, fill it with fixed rules. Only reviewed valid fields enter the project.

## 4. Automatic Media Matching

Search only media already authorized in the current project and a user-selected local authorized library. Candidate catalogs can be partitioned by `projectId` and record media ID, type, dimensions, duration, aspect ratio, scene/action keywords, author, source, license, attribution, and allowed uses. `Asset.source` is only a provenance hint; verify the license separately. Demo media has its own source and use record. See [demo media sources](MEDIA_SOURCES.md).

Filter first by project permission, license, and intended use, then score by keywords, scene, media type, and aspect ratio; break ties by stable ID. Recommend only local files already imported or explicitly authorized, and map approved choices through the CLI write path to `assetId`/`posterId`; only bundled photos use existing `media` references. Check ownership and references before publication. When there are no candidates, matches are weak, files are missing, or rights are unclear, keep the default backdrop and continue. Media matching never searches for or downloads external images/videos and never opens provenance URLs.

Local access or display in an internal draft does not imply permission to package, distribute, or use commercially. Third-party media may have attribution, redistribution, or derivative-use limits and may involve likeness or trademark rights. Check licenses against the actual use before ZIP packaging and PDF delivery; use the default backdrop when uncertain.

## 5. Multi-Agent Collaboration

| Role | Responsibility |
| --- | --- |
| Planner | Produce scene/shot candidates, media suggestions, and evidence locations from an approved snapshot. |
| Reviewer | Check story coverage, shot continuity, authorization, cost, and duplicates; propose revisions for human confirmation. |
| Verifier | Preflight schema, project version, references, and target paths; after publication, call read-only `agent verify`. |

The CLI is the only write boundary for Agent access to project ZIPs and delivery artifacts. Roles submit candidates or read-only results; confirmed writes go through CLI validation, locking, staging, and publication. Web IndexedDB edits keep their existing transactions. MCP may become a future tool-access layer under the same authorization and read/write constraints. The core workflow can call the CLI directly without MCP.

- **Concurrency.** Serialize submissions per project and normalized target path; allow bounded read-only analysis. Release write resources during external analysis, then revalidate project version and references under the CLI lock; if concurrent edits occurred, re-review with a new snapshot. Shared cross-project queues still limit request concurrency and total budget.
- **Idempotency.** Record task ID, input version, options, and target paths for approved tasks. Before retrying, verify an existing artifact belongs to the task and matches; reuse it if so. If a target exists but ownership is unclear or content changed, report a conflict and keep the CLI overwrite refusal.
- **Recovery and logs.** Record states such as reviewed, publishing, verified, or failed. On recovery, check ZIP, PDF, staging, and locks first. Only handle a stale lock after confirming no active writer; preserve files with unclear ownership. If one artifact was published, check the task record; if needed, regenerate the PDF from the verified ZIP through the CLI and verify the delivery again. Logs contain only task ID, state, validation result, duration, and error category.

## 6. Security and Privacy

The default path needs no network, model, or key. Future remote calls require explicit opt-in and pre-send authorization; installing an adapter or detecting credentials is not authorization. Do not upload screenplays, media, thumbnails, full project ZIPs, or other project content by default. Treat screenplays, media metadata, and model responses as data; instructions inside them must not trigger tool calls, network access, or file writes.

User API keys are used only to authenticate authorized requests and are not written to the repository, command arguments, project ZIP/PDF, request previews, logs, responses, or errors. Map external-service errors locally to safe categories and avoid raw headers, response bodies, or stack traces. Do not read or use user credentials without authorization.

Approval and audit records stay in an access-controlled local location and record task ID, processing mode, service identity, authorization scope, sent volume, budget, duration, and result. Raw screenplays, media, unredacted requests, and responses do not enter normal logs. Candidate previews and review records stay local according to user choice and have a retention period. Current command JSON can contain project text and absolute paths; automation should treat complete stdout as project content rather than forwarding it as a log.

## 7. Phased Scope and Decisions

| Phase | Scope | Acceptance | Rollback |
| --- | --- | --- | --- |
| P3 · current | Record the plan and extension boundary | Documentation matches the current CLI; type and diff checks pass. | Revert the plan documents. |
| Next 1 · Local quality | Build a fixed evaluation set, improve action-first titles, coverage and transition suggestions, and evaluate authorized local media matching. | Structural assertions pass. Full generation and validation work offline without keys. Blind review shows repeatable improvement against the baseline. Unauthorized media never enters delivery. | Revert to the original `breakdownScript`, disable media suggestions, and keep the default backdrop. |
| Next 2 · Optional adapter | Add a provider-neutral candidate interface, authorization preview, budget, and fallback. | Default calls have no network and no credential reads. Authorized content matches the actual request. Simulated timeout, failure, and over-budget cases fall back deterministically. Candidates enter only after review. | Disable the adapter; local analysis and editing continue, and existing artifacts remain restorable. |
| Next 3 · Multi-agent | Evaluate planner/reviewer/verifier roles. Evaluate MCP separately only when a concrete tool need exists. | Quality improvement over the single workflow is measurable. Concurrency, duplicate tasks, stale snapshots, and interrupted recovery pass. Core CLI works without MCP. | Disable orchestration and optional tool access; call the CLI directly. |

Local rules have the most predictable cost and latency, work offline, and support stable regression. Remote models may improve semantics and coverage but add latency, cost, privacy exposure, and output variance. Multi-agent workflows add requests, state management, and recovery cost. Record duration, cost, fallback rate, and review score per screenplay in each phase; prove quality gains before adding complexity. Keep the candidate pipeline on existing project and ZIP formats so delivered projects remain usable if new capabilities are disabled.

## 8. Test and Evaluation Plan

1. **Fixed screenplay set.** Use original or explicitly licensed Chinese/English samples with fixed versions, shot budgets, and expectations. Cover multi-scene, no-heading, dialogue-heavy, action-heavy, transitions, scene merging, 1 and 50 shots, UTF-8 BOM, empty, and over-1-MiB cases. Add ambiguous local media, unauthorized media, and cross-project isolation.
2. **Structure and artifact assertions.** Check scene order, action/dialogue/notes classification, shot count and relations, duration range, aspect ratio, media ownership, and manifest round trips. When comparing deterministic output, ignore generated IDs and timestamps and compare relations in scene order. Reuse existing CLI regression for overwrite refusal, CRC, lock conflicts, paired-output target conflicts, PDF validation, and web restore/continue editing. Add fault injection for future orchestration: PDF publication failure after ZIP publication and process interruption, then check rollback and recovery. See [existing CLI regression](../scripts/test-cli.mjs).
3. **Human scoring and baseline comparison.** With identical screenplays and shot budgets, blind-review fixed rules, local improvements, and authorized model output. Score story fidelity, action-title clarity, coverage/continuity, rationale quality, and media fit from 1 to 5; record disagreements, human edit volume, and typical failures. Summarize changes against the baseline and report structural pass rate, fallback rate, latency, and cost.
4. **Candidates and fallback.** Use fixed responses and fake adapters to test malformed output, unknown fields, oversized content, invalid references, wrong counts, timeout, missing credentials, over-budget, authorization refusal, and rejected suggestions. Assert fallback equals the local baseline, invalid candidates are never published, and no request is sent when authorization does not match. Use synthetic credentials and content to check redaction, logs, and stdout. Adapter tests can run offline in CI.
5. **Default offline path.** Close stdin, isolate credentials, block external network, and run project creation, storyboard, editing, JSON/ZIP export, validation, and restore; check exit codes, one-line JSON, and files. Add real PDF export when local Chromium is available; otherwise independently validate a generated PDF sample. Use an observable fake adapter to confirm the default path never initializes a remote adapter, reads credentials, or attempts network access.