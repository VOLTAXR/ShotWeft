# ShotWeft Development Status

Last updated: 2026-11-24
Scope: V1.6 video workflow through P4 final acceptance and V1.5 implementation history

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

P0 documents the architecture and licensing decision. P1 implements the optional frame-based timeline, archive validation, SRT/VTT parsing, history/duplicate/restore remapping, and legacy-project tests. P2 adds the Video workspace to the React editor. P3 adds local MP4 rendering and verification from project ZIPs. See the [engine decision and acceptance criteria](VIDEO_ENGINE_DECISION.md).

| Milestone | Scope |
| --- | --- |
| P1 · Timeline data and archives | **Implemented:** optional schema, frame math, SRT/VTT parsing, history/duplicate/restore remapping, legacy ZIP compatibility, and focused tests. |
| P2 · Editor and preview | **Implemented:** five templates, six editing tracks, browser playback and frame seek, clip operations, SRT/VTT imports, editable captions and graphics, and project undo/redo. |
| P3 · Local rendering | **Implemented:** runtime detection and build checks, FFmpeg export, MP4 verification, and no-overwrite publication. |
| P4 · Acceptance | **Implemented:** Linux full regression and real renders, browser-to-CLI render, legacy compatibility, and Linux/Windows package checks. Windows FFmpeg rendering remains untested. |

P1 verification: `npm run check` and `npm run build` exited `0`; the focused video-model suite passed 5 groups; the full regression passed 34 groups; the installed-package test passed with a 3-page, 454,410-byte PDF. The focused suite covers frame math, all five presets, SRT/VTT multiline parsing, schema rejection, legacy V1.0 ZIP reads, video ZIP round trips, browser restore/duplicate asset remapping, and IndexedDB undo/redo of `video`.

### P2 verification

The Playwright runs used `PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers"` and `SHOTWEFT_REQUIRE_PDF=1` on Linux.

| Command | Exit code | Result |
| --- | ---: | --- |
| `npm run check` | 0 | TypeScript check passed. |
| `npm run build` | 0 | Browser and CLI builds passed. |
| `npm test -- --video-workspace-only` | 0 | 3 groups passed covering template creation, real video playback, shared media, captions, integer clip edits, persistence, undo/redo, and the 390 px layout. |
| `npm test` | 0 | All 37 groups passed, including the existing 34 regression groups. |
| `npm run test:package` | 0 | Isolated install, tarball checks, restored project editing, a 3-page PDF (454,411 bytes), and uninstall passed. |

Repository screenshots were restored after testing.

### P3 verification

The Linux tests used FFmpeg and ffprobe `n8.1.3-39-g660b5aa7db-20261123` from the supplied LGPL build. Its reported configuration enables `libopenh264` and LGPL v3-or-later licensing. ShotWeft invokes the binaries from their local installation.

```bash
ffmpeg_bin="$PWD/.tmp/ffmpeg-lgpl/ffmpeg-n8.1-latest-linux64-lgpl-8.1/bin"
FFMPEG_PATH="$ffmpeg_bin/ffmpeg" FFPROBE_PATH="$ffmpeg_bin/ffprobe" npm run test:video-render
FFMPEG_PATH="$ffmpeg_bin/ffmpeg" FFPROBE_PATH="$ffmpeg_bin/ffprobe" \
  PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" SHOTWEFT_REQUIRE_PDF=1 npm test
PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" SHOTWEFT_REQUIRE_PDF=1 npm run test:package
```

| Command | Exit code | Result |
| --- | ---: | --- |
| `npm run check` | 0 | TypeScript check passed. |
| `npm run build` | 0 | Browser and CLI builds passed. |
| `npm run test:video-render` | 0 | The real synthetic render and CLI error cases passed. |
| `npm test` | 0 | All 41 groups passed, including the browser-created ZIP render, real PDF checks, and Agent regressions. |
| `npm run test:package` | 0 | Isolated install, tarball allowlist, installed CLI and PDF (3 pages, 454,411 bytes), and uninstall passed. |
| `node .tmp/p3-edge-check.mjs` | 0 | One-frame render and build preflight cases passed. |

| Real render fixture | Resolution | FPS | Frames | Video duration | Audio duration |
| --- | ---: | ---: | ---: | ---: | ---: |
| Landscape with variable-rate input | 640×360 | 30000/1001 | 72 | 2.402400 s | 2.402000 s |
| Silent portrait | 360×640 | 25/1 | 25 | 1.000000 s | 1.000000 s |
| Browser-created project ZIP | 1920×1080 | 30/1 | 75 | 2.500000 s | 2.500000 s |

All three outputs measured yuv420p H.264 video and stereo 48 kHz AAC-LC audio in MP4. The synthetic tests independently probed both aspect ratios, checked faststart, decoded overlay and caption boundary frames, and measured sampled audio and silence windows. The CLI returned `0` for rendering, archive-only verification, MP4 verification, and ZIP restore. It returned `1` for existing targets, missing or invalid executables, corrupt media, and a mismatched MP4. A missing `--output` returned `2`. Source files and ZIP bytes were unchanged, and restored ZIP media matched byte for byte.

The supplemental Linux check rendered one H.264/AAC frame through `PATH` lookup to a path with spaces and Unicode. Controlled preflight responses for reported GPL/nonfree flags and a missing `drawtext` filter returned exit code `1`. Windows FFmpeg and long-timeline performance were outside this run. Screenshots were restored, and raw verification logs are under `.tmp/`.

### P4 final acceptance

Final checks ran on the pushed V1.6 branch at `910f6e9` with package version `1.5.0`.

| Check | Exit | Result |
| --- | ---: | --- |
| Linux full regression | 0 | 41 PASS groups, including video model/workspace, browser ZIP render, PDF, Agent, CLI, and legacy archive tests. |
| Standalone real render | 0 | Landscape 640×360 at 30000/1001 fps, 72 frames, 2.4024 s, H.264/AAC; portrait 360×640 at 25 fps, 25 frames, 1.0 s, silent AAC; error/no-overwrite/cleanup checks passed. |
| Linux package | 0 | Isolated install, 3-page PDF (454,411 bytes), and uninstall passed. |
| Windows package | 0 | Native Windows package workflow and 3-page PDF (454,711 bytes) passed. Windows FFmpeg rendering was not run. |
| Browser-created ZIP | 0 | 1920×1080, 30 fps, 75 frames, 2.5 s H.264/AAC from the browser timeline export. |

Known limitations: no Windows FFmpeg binary was available for native render verification; long-timeline performance was not benchmarked; Voice/Music use audio embedded in video assets; no audio-only import yet; package remains `1.5.0` and no release was created.

## Implemented Features

### Web Workbench

- Project home page: create, rename, duplicate, archive, and delete projects; hash routing preserves position after refresh.
- Script: add, edit, and delete scenes; drag or arrow-key reorder; deleting a scene clears shot associations.
- Shots: add, edit, delete, search, filter, duplicate, and drag-reorder; list and timeline order stay synchronized.
- Storyboard canvas: Konva rendering, composition guides, aspect ratios, crop zoom/pan, and keyboard nudging.
- Annotations and layers: all annotation tools plus move, resize, layer order, visibility, lock, and opacity.
- Media: JPG/PNG/WebP up to 25 MB, MP4/WebM up to 120 MB, and keyframe extraction.
- Video: editable main, B-roll, voice, music, caption, and graphics tracks with a fullscreen, integer-frame browser preview. Voice and music use audio embedded in project video assets.
- Undo/redo: scenes, shots, aspect ratio, crop, media associations, and video timeline edits. The latest 40 steps are retained.
- Export: PNG, storyboard PDF, project JSON, and project ZIP; ZIP restore creates an independent copy.
- Local data: IndexedDB persistence, no external network requests, desktop and 390 px layouts verified.

### CLI

- Project: `create` / `show` / `update` / `restore`.
- Scenes and shots: `list` / `show` / `add` / `update` / `move` / `delete` with 1-based `--position`.
- Export: `export json` / `export zip` / `export pdf`.
- Agent: `agent storyboard` creates a 12-shot project from UTF-8 screenplay text; `agent verify` validates ZIP files and optional PDFs.
- Video uses a user-installed LGPL FFmpeg and ffprobe to render and verify local H.264/AAC MP4. Archive-only `video verify` uses the shared ZIP reader.
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
- Video preview depends on browser decoding and media synchronization. Voice and music use embedded video audio. Standalone audio imports remain planned.
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
