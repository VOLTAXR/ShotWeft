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

## Not implemented

M2 script importer/planner, plan editor, project persistence, real media layers, imported voice/TTS, M2 demo; M3 presenter render, ASR/word alignment, automatic subtitles, presenter layouts/cutout; M4 component library; M5 material/audio/workbench; M6 auto review and cross-platform/performance closure.

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
- Latest report: `docs/agent-reports/latest.json` (M0/M1; historical, not current V2 completion).