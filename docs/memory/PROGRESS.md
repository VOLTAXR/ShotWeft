# ShotWeft Progress Memory

Last verified: 2026-11-24
Source of truth: repository/source and `docs/agent-reports/latest.json`; this file is a handoff index, not a substitute for test logs.

## Completed

### V1.5
CLI project/scene/shot/export JSON|ZIP|PDF, Agent storyboard/verify, Node 22.12 gate, streaming ZIP, EPIPE/help/error contracts. 45-group regression baseline established.

### V1.6 P0-P5
- P0: FFmpeg-only engine decision.
- P1: frame timeline, five templates, SRT/VTT.
- P2: six-track Video workspace.
- P3: local MP4 render/verify.
- P5: standalone WAV/MP3/M4A, ZIP v2, audio mixing.

### V2 M0/M1
- M0: `docs/V2_AUDIT.md`, `docs/V2_UPSTREAM_RESEARCH.md`; upstream pinned.
- M1: strict DirectorPlan, three shared React scenes, `idea` morph, Player modal, local synthetic audio, Studio registration, `director validate`, `video export-remotion`.
- Real MP4s: 640×360 and 360×640, 180 frames, 30/1 fps, 6 s, H.264 yuv420p + AAC-LC stereo 48 kHz.
- Final M0/M1 test exit codes: check 0, build 0, `npm test` 0 (45 PASS), `test:remotion` 0 (8 PASS), `test:video-render` 0 (4 PASS), `test:package` 0 (16-entry tarball, 3-page PDF 454,411 bytes).
- Git: feature `fb51285`, docs `5f8a467`, report `b32b7b7`; remote branch verified at `b32b7b7`.

### V2 M2 script workflow
- M2.1: script/TXT/Markdown/JSON importer with stable IDs and verbatim offsets; deterministic offline planner; additive media/narration plan fields; `director generate`; focused tests. Commit `bf1782d`.
- M2.2a: project `direction`/`activeTimeline`, IndexedDB undo/redo, ZIP manifest v3, asset remapping, narration reflow, real image/video layers in shared Player/MP4. Commit `071995f`.
- M2.2b: project Director workspace, script generation, shot seek/edit/lock/regenerate, project media mapping, narration import, legacy timeline switch; focused browser suite. Commit `5f9a312`.
- M2 demo: `demos/m2/` 83.633 s, 1280x720, 2509 frames, 30/1 fps, H.264/AAC; chart, image, B-roll video, captions, one morph, editable plan and project ZIP. Narration is synthetic SAPI Huihui, **not human**.

## V2 M3 engineering preview (partial)

- JSON, faster-whisper-style JSON, SRT and VTT import; deterministic script-to-timing alignment, manual corrections, captions and cue anchors, and SRT/VTT export.
- Shared presenter layouts and one voice schedule for Player/MP4. The 23.1-second editable synthetic fixture exercises full-frame, PiP, split and B-roll; it contains synthetic speech and interpolated timing, with no morph.
- A local-only ASR host interface is present, but executable ASR, real-person authoring/acceptance and cutout are not delivered. M4–M6 remain gated on real-media acceptance.

## CLI M0 — ProjectArchive transactions

- Project ZIP remains the only authoritative CLI project; standalone JSON is exchange data. `updateProjectArchive()` stages and validates a full archive using the existing lock and ZIP reader/writer, with streaming SHA-256, guarded writes and dry-run.
- `project revision` and `project apply` expose the API to Agents; legacy in-place mutations keep their output shape and gain the expected-revision option. Binary import, ZIP-native Remotion rendering and the V2 M0–M6 roadmap are unchanged.
- See [Agent usage and schema](../AGENT.md#edit-the-authoritative-project-zip) and the [agent report](../agent-reports/latest.md) for acceptance evidence.

## CLI M1 — Project-native animation

- Reuses M0 transactions for local media batch ingestion/removal, strict exchange plan mapping and measured narration attachment. Script-mode `director render` resolves media only from the ZIP and calls the shared Remotion adapter. No UI, new renderer, TTS, ASR, MCP, or product roadmap work.
- Local WSL delivery: `.tmp/cli-m1/acceptance-DqerQF/project.zip` and `project.mp4`. Independent FFprobe and full decode: 1280×720, 30/1 fps, 705 frames, 23.500 s, H.264/yuv420p and 48 kHz stereo AAC-LC. Sampled frames show the real coastal photo and B-roll, captions and the shared `海岸线` element moving between shots. ZIP revision unchanged; narration is synthetic Microsoft Huihui speech, not human media.
- [CLI M1 contract and reproduction](../CLI_M1.md); Pi runtime `openai/gpt-6.2-sol`, no new Codex or Antigravity invocations. Local report only; no release, push or change to `main`.
- **Quality rejected.** The delivered MP4 is 87.0% frozen (longest hold 11.27 s), essentially a slide deck; its audio is a faithful copy of a synthetic SAPI track whose caption timing is character-proportional, not speech-measured (drift up to ~2 s). Encoding, decode and exit codes were correct and are not quality acceptance. Findings and measurements: [quality investigation](../CLI_M1_QUALITY_INVESTIGATION.md). No engine or fixture changes made in that step.

## Honest blockers

- No authorized human voice recording; M2 human-voice acceptance is currently blocked. Synthetic tones are not accepted as final narration.
- No authorized real presenter footage; M3 human-presenter acceptance is blocked. Synthetic fixtures may test code but must not be reported as real-person acceptance.
- No faster-whisper/WhisperX models installed; network/model download is not authorized by default.
- Native Windows Remotion/FFmpeg render remains unverified.
- Remotion distribution/commercial terms remain unresolved.
- No LICENSE selected for ShotWeft.

## Historical evidence

- Pi session: `01a206ac-c34a-7576-86b2-d57d0f09f547`.
- M0/M1 Codex `gpt-6.1-sol` threads: `01a20c5c-18a7-7a53-b1d7-44e569117c86` (model check), `01a20c60-7026-7a03-9cd7-1422b39ccb3b` (implementation).
- See `docs/agent-reports/archive/` for historical reports and `docs/agent-reports/latest.json` for the current engineering checkpoint.