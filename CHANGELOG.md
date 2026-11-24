# ShotWeft Changelog

## V2 M0/M1 · Local Director Validation

- Added a strict, separate DirectorPlan TypeScript/Zod store with coverage, ID/reference, rational fps, resolution and cue-anchor validation; preserved V1.6 project/ZIP behavior and version `1.5.0`.
- Added three shared React graphic scenes, frame-driven shared-element morphs, original synthetic audio, an optional Video workspace Player modal, and a registered Remotion Studio composition.
- Added `director validate` and `video export-remotion` with one-line JSON, staged no-overwrite publication and adapter boundaries. Actual Remotion frames are encoded by the external validated LGPL FFmpeg and verified with ffprobe.
- Added focused plan/Player/morph/real-render verification, upstream provenance/license research, and an executable-command Agent skill. Exact acceptance results are in `docs/TEST_REPORT.md`.
- Remotion 4.0.546 is source-available/non-OSI and remains a local evaluation dependency. Its bundled GPL encoder is not used by this adapter. No distribution/commercial licensing decision, M2–M6 claim, release or version change is made.

## V1.6 P0 Video Workflow Design

- Recorded the design for an optional frame-based timeline, React preview, and local MP4 export using a user-installed LGPL build of FFmpeg. P0 is design only. See the [video engine decision](docs/VIDEO_ENGINE_DECISION.md).

### P1 · Timeline Data Foundation

- Added the optional frame-based video timeline schema, five editable presets, frame math, SRT/VTT parsing, and archive validation.
- Extended project history, duplication, browser restore, and ZIP round trips with additive `Project.video` support. Existing V1.0/V1.5 projects remain valid; source media is not duplicated.
- Added focused regression for frame boundaries, subtitle parsing, schema rejection, legacy ZIP reads, asset remapping, and undo/redo.

### P2 · Video Workspace

- Added an English Video tab with five starter templates, six frame-based editing tracks, shared project media, and a fullscreen browser preview.
- Added clip split, trim, move, source range, volume, mute, label, and delete controls, plus editable titles, lower thirds, and SRT/VTT subtitles.
- Added browser coverage for video playback, track and caption controls, persistence, undo/redo, and 390 px layout alongside the existing storyboard regressions.

### P3 · Local MP4 Rendering

- Added `shotweft video render` and `shotweft video verify` for non-interactive rendering and verification of project ZIPs. Use a compatible local LGPL FFmpeg and ffprobe installation.
- Added frame-based visual composition, burned-in titles and captions, and stereo audio mixing. Outputs use H.264 and AAC in faststart MP4 and are verified before publication to a new path.
- Verified landscape output at 640×360 for 2.4024 s, silent portrait output at 360×640 for 1 s, and a browser-created ZIP at 1920×1080 for 2.5 s on Linux. Windows FFmpeg and long-timeline performance were outside this run. See the [P3 verification record](docs/DEVELOPMENT_STATUS.md#p3-verification) for commands and exit codes.

### P4 · Final Acceptance

- Verified the complete V1.6 workflow on Linux: 41 regression groups, real H.264/AAC renders at 16:9 and 9:16, browser-created ZIP to MP4, old V1.0/V1.5 archive restore, package installation, and uninstall.
- Verified the Windows package workflow and PDF output. Windows FFmpeg rendering was not run; a compatible Windows LGPL build is still required.
- Package version remains `1.5.0`; no npm publication, official Release, tag change, or main merge was performed.

### P5 · Standalone Audio

- Added local WAV, MP3, and M4A import up to 60 MiB per file with signature and browser decode checks, a deterministic waveform placeholder, and native playback controls.
- Enabled standalone audio clips on Voice and Music with integer-frame edits, overlapping playback, gain, mute, and undo/redo through the existing project history.
- Added ZIP manifest v2 for timelines and standalone audio while retaining v1 read support and v1 export for legacy-only storyboards.
- Extended the LGPL FFmpeg pipeline to probe and mix audio-only inputs into faststart H.264/AAC-LC MP4. Package version remains `1.5.0`.

## V1.5

- Added `shotweft agent storyboard` for converting an original short-film screenplay into scenes and shots locally, with 12 shots by default.
- Added restorable ShotWeft project ZIP output and optional storyboard PDF export.
- Added Chinese and English scene headings, action/dialogue separation, and text-length-based shot allocation and duration.
- Added `shotweft export zip` and `shotweft agent verify` for non-interactive delivery and validation.

### P0 Production Release Reliability

- Declared Node.js 22.12 as the minimum version and added a CLI startup check.
- Added clean-environment package and global-install verification.
- Streamed ZIP media through temporary files and wrote ZIP output through staged files while preserving web compatibility and release transactions.

### P1 CLI Integrity and Automation Stability

- Added scoped top-level, command-group, and subcommand help with strict command, option, and positional validation.
- Made stdout `EPIPE` exit silently with success. Invalid JSON and missing files use localized errors, while failures remain one-line JSON with the documented exit code.
- Preserved ZIP bytes and project timestamps when a scene or shot is moved to its current position.
- Added `SHOTWEFT_TMP` for extracted media; Windows defaults to the current directory `.tmp`.
- Added CLI contract regressions for help, exit codes, argument boundaries, closed pipes, and no-op moves.

### P2 Complete Agent Workflow

- Added `shotweft export zip` for a complete, streamed, restorable ZIP with atomic publication and overwrite refusal.
- Added `shotweft agent verify` for project manifest, relation, archive allowlist, media size, and CRC validation, with optional PDF metadata checks and no Chromium requirement.
- Added non-interactive tests for storyboard generation, edits, JSON/ZIP/PDF export, validation, restore, and continued editing in both the repository CLI and an installed package.

### P3 Agent Intelligence Plan

- Added a default-offline plan covering optional LLM screenplay analysis, shot-language suggestions, local media matching, multi-agent collaboration, and evaluation. This is design only; no LLM or MCP implementation. See [Agent intelligence plan](docs/AGENT_INTELLIGENCE.md).

### Phase 1 Release Reliability Regression

- Installed-package tests now use the platform Chromium in `.browsers`, validate a real three-page PDF and every page image, and run `agent verify --pdf`. `SHOTWEFT_REQUIRE_PDF=1` makes PDF validation mandatory.
- `npm pack` verification scans packaged JavaScript for development-machine paths and checks that global uninstall removes the npm shim.
- CLI regressions cover ZIP traversal, absolute paths, `__MACOSX/` entries, temporary cleanup after truncated or corrupt ZIPs, and symlink-preserving updates.
- The full test preview server uses an operating-system-assigned port instead of a fixed port.
- Added [Windows and Linux testing](docs/WINDOWS_TESTING.md) and [release references](docs/RELEASE_REFERENCES.md).

### Phase 2 GitHub Automation and Release Preparation

- Added Linux and Windows GitHub Actions jobs. Linux runs the full regression and package checks; Windows runs package verification. Both require a real PDF and upload tarball/checksum artifacts.
- Added `npm run release:checksums` to generate `SHA256SUMS.txt` and `release-manifest.json`.
- Package verification checks the allowlist, development paths, and `private: true`; the Agent guide and V1.5 release notes are included in the CLI package. Added [release notes](docs/RELEASE_NOTES_V1.5.md) and [release checklist](docs/RELEASE_CHECKLIST.md).

## V1.0

Acceptance date: 2026-11-20.
Package version: `1.0.0`.
Git tag: `v1.0.0`.

- Stabilized project, scene, shot, and storyboard editing.
- Added annotations, layers, cropping, and undo history.
- Verified image upload, video playback, and keyframe extraction.
- Verified PNG, storyboard PDF, JSON, and ZIP export.
- ZIP restore creates an independent copy.
- Fixed the playback cursor moving past the end after shortening a shot.
- Closed project and export menus when clicking outside.
- Returned focus to the trigger after closing a menu with Escape.
- ZIP restore validates referenced demo photos.
- V1.0 is recorded independently in the ZIP manifest.
- Preserved existing database and backup format numbers.

V1.5 development continues on its own branch.
