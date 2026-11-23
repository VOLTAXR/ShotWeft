# ShotWeft Development Status

Last updated: 2026-11-23
Scope: V1.6 video workflow P0 design and V1.5 implementation and acceptance history

## Current State

| Item | Value |
| --- | --- |
| Release baseline | `main` / `54fb7fa27b33f03ef606156316f27a8525477f53` |
| V1.6 design branch | `feat/shotweft-v1.6-video-workflow` |
| Previous cleanup branch | `chore/remove-registration-materials` |
| Existing tag | `v1.5.0` (points to the release baseline; this cleanup does not create, move, or delete tags) |
| Remote | `origin/main` |
| Package and version | `shotweft` / `1.5.0` |
| Node.js requirement | `>=22.12` |
| npm publication | `private: true`, accidental publication blocked |

## V1.6 Video Workflow

P0 documents the architecture and licensing decision. The existing React editor will compose and preview an optional frame-based timeline. Local MP4 export will use a user-installed LGPL build of FFmpeg and verify the result with `ffprobe`. The timeline and render commands are planned. See the [engine decision and acceptance criteria](VIDEO_ENGINE_DECISION.md).

| Next milestone | Planned work |
| --- | --- |
| P1 · Timeline data and archives | Add the optional schema, frame math, audio assets, and compatibility tests for legacy and video-enabled ZIPs. |
| P2 · Editor and preview | Add multi-track editing, synchronized preview, undo/redo, and the five built-in templates. |
| P3 · Local rendering | Add runtime detection and build checks, FFmpeg export, MP4 verification, and no-overwrite publication. |
| P4 · Acceptance | Verify browser-to-CLI workflows, legacy compatibility, and packaging on Linux and Windows. |

## Implemented Features

### Web Workbench

- Project home page: create, rename, duplicate, archive, and delete projects; hash routing preserves position after refresh.
- Script: add, edit, and delete scenes; drag or arrow-key reorder; deleting a scene clears shot associations.
- Shots: add, edit, delete, search, filter, duplicate, and drag-reorder; list and timeline order stay synchronized.
- Storyboard canvas: Konva rendering, composition guides, aspect ratios, crop zoom/pan, and keyboard nudging.
- Annotations and layers: all annotation tools plus move, resize, layer order, visibility, lock, and opacity.
- Media: JPG/PNG/WebP up to 25 MB, MP4/WebM up to 120 MB, and keyframe extraction.
- Undo/redo: scenes, shots, aspect ratio, crop, and media associations; latest 40 steps retained.
- Export: PNG, storyboard PDF, project JSON, and project ZIP; ZIP restore creates an independent copy.
- Local data: IndexedDB persistence, no external network requests, desktop and 390 px layouts verified.

### V1.5 CLI

- Project: `create` / `show` / `update` / `restore`.
- Scenes and shots: `list` / `show` / `add` / `update` / `move` / `delete` with 1-based `--position`.
- Export: `export json` / `export zip` / `export pdf`.
- Agent: `agent storyboard` creates a 12-shot project from UTF-8 screenplay text; `agent verify` validates ZIP files and optional PDFs.
- Data interchange: the CLI reads and writes web project ZIPs; the web app restores CLI output.
- Engineering: `npm pack`, `prepack`, `shotweft` bin, scoped `--help`, and Node version enforcement.
- Reliability: `.shotweft-lock` directory locks, atomic replacement, overwrite refusal, streamed ZIP, and temporary cleanup.
- Output contract: one-line JSON on stdout and stderr, exit codes 0/1/2, and silent stdout EPIPE exit.

### Agent Workflow

```text
project create -> project restore -> agent storyboard -> shot/scene update
-> export json/zip/pdf -> agent verify -> project restore -> continue editing
```

The workflow runs without LLM, MCP, or interactive input. Screenplay breakdown is currently deterministic local logic, not semantic AI.

## Public Release Cleanup

- Removed 13 release-specific screenshots under `docs/screenshots/v1.0/`.
- Replaced `release.json` with pure ShotWeft metadata: product name, release version, and display version.
- Unified the web title, app branding, PDF footer, changelog, plan, README, and third-party notice title as ShotWeft.
- Removed release-cleanup sections from public documentation; the release checklist now covers security, packaging, licensing, and release authorization only.
- Removed the private-material validation section and v1.0 screenshot links from `docs/TEST_REPORT.md`; real feature acceptance remains.
- V1 browser tests now write screenshots to `.tmp/v1-screenshots` instead of `docs/screenshots/v1.0`.
- Kept the three `.gitignore` rules that prevent accidental uploads.
- Preserved `public/THIRD_PARTY_NOTICES.txt`, `docs/OPEN_SOURCE_AUDIT.md`, `docs/MEDIA_SOURCES.md`, normal product screenshots, and all business source.

## Actual Acceptance Results

Environment: Linux/WSL2 with Node.js 22.23.5; Windows with Node.js 24.21.0; Playwright 1.65.1 / Chromium headless shell 1255.

| Check | Command | Exit | Result |
| --- | --- | ---: | --- |
| TypeScript | `npm run check` | 0 | Passed, no output. |
| Production build | `npm run build` | 0 | Web, CLI entry, CLI runtime, and PDF renderer built. |
| Full regression | `PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" SHOTWEFT_REQUIRE_PDF=1 npm test` | 0 | 29 PASS groups covering web, CLI, Agent, ZIP security, real PDF, and restore-edit. |
| Linux package | `PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" SHOTWEFT_REQUIRE_PDF=1 npm run test:package` | 0 | Isolated `npm ci`, real `npm pack`, and temporary global install passed; 14 tarball entries and 5 demo JPEGs. PDF: 3 pages, 454,411 bytes, every page JPEG checked; uninstall removed the shim. |
| Windows package | Native `cmd.exe` with `SHOTWEFT_REQUIRE_PDF=1` and `npm run test:package` | 0 | Isolated install passed; PDF: 3 pages, 454,711 bytes, every page JPEG checked; real Windows Chromium ran without skipping PDF; uninstall removed the shim. |
| Package scan | `npm pack` / `test:package` | 0 | No ignored private-material directory, `docs/screenshots/`, `src/`, `node_modules/`, `.tmp/`, `.bak`, or development-machine path; `private: true` retained. |

Test-generated `docs/screenshots/*` differences were restored from the index and not committed.

## Known Limitations

- Agent breakdown uses local rules; LLM, MCP, and semantic shot analysis are not implemented.
- Generated projects use default backdrops; users add images or video in the web editor.
- PDF depends on local Playwright Chromium and system CJK fonts.
- Windows PowerShell 5.1 requires `[Console]::OutputEncoding = [Text.UTF8Encoding]::new()` for CLI UTF-8 stdout; PowerShell 7 does not.
- No project LICENSE file exists yet; the user must choose MIT or Apache-2.0.
- The existing `v1.5.0` tag and `main` history remain unchanged; this cleanup branch does not create tags or alter the official release state.
- IndexedDB keeps the existing lowercase compatibility key so existing user projects continue to load; it is not public branding.

## Next Tasks

1. Add a LICENSE after the user chooses MIT or Apache-2.0, then recheck dependency and demo-media distribution terms.
2. Establish real GitHub Actions CI; the repository currently has no workflow and the stale README badge was removed.
3. Prepare formal V1.5 release notes, SHA256 values, and optional release assets; do not create a Release or tag automatically.
4. Continue evaluating an LLM adapter that submits candidates only, with the offline path as the default.
5. Review the Windows/Linux installation guide and Agent guide for product-facing polish.
## Documentation Localization (2026-11-23)

Public documentation and CLI help are now in English. The README follows a 14-section structure: introduction, features, requirements, installation, quick start, CLI reference, Agent workflows, storyboard generation, project management, export and validation, troubleshooting, development, testing, and license. Installation is explicitly limited to the local tarball; the future `npm install -g shotweft@latest` form is documented as unavailable because the package remains `private: true`.

Translated: README, CHANGELOG, all `docs/**/*.md` explanatory text, release documentation, Agent documentation, development status, test reports, package metadata, and CLI help/usage text. Chinese remains only where required by the preservation rules: the demo project name, the Chinese screenplay fixture and dialogue in the Agent guide, demo command values, and technical values such as `内景`/`外景`. Web application interface strings and runtime error messages were intentionally not translated.

Verification: `npm ci` exited `0`; `npm run check` exited `0`; `npm run build` exited `0`; `SHOTWEFT_REQUIRE_PDF=1 npm test` exited `0` with 29 PASS groups; `SHOTWEFT_REQUIRE_PDF=1 npm run test:package` exited `0` with a 3-page, 454,411-byte PDF and successful uninstall. No tests were skipped.
