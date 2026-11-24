# ShotWeft Architecture Memory

Last verified against source: 2026-11-24
Branch head: `b32b7b72518ecb447b22a5fd4f121bdf85bccca0`

## Existing stable layers

| Layer | Source | Contract |
| --- | --- | --- |
| V1 project/storyboard | `src/model.ts`, `src/core/project-edit.ts`, `src/db.ts` | `Project` with scenes/shots, Dexie IndexedDB `frameos-studio`, history/undo, assets by project |
| V1 media | `src/media.ts` | Local image/video/audio import, thumbnails, browser decode, project asset blobs |
| V1.6 project archive | `src/core/project-archive.ts` | ZIP manifest v1/v2, asset-ID validation, legacy compatibility, 768 MB cap |
| V1.6 video timeline | `src/video-model.ts`, `src/video-workspace.tsx`, `src/video-preview.tsx` | Six-track frame timeline, templates, captions, native preview |
| V1.6 FFmpeg render | `src/cli/video.ts`, `src/cli/ffmpeg.ts` | Validated external LGPL FFmpeg/ffprobe, staged no-overwrite MP4 |
| V2 DirectorPlan | `src/core/director/plan.ts` | Strict Zod `schemaVersion: 1`, separate JSON; coverage, cue anchors, safe relative asset paths |
| V2 compiler | `src/core/director/compiler.ts` | Plan → composition metadata; M1 rejects presenter/visual footage/slow-push |
| V2 React/Remotion | `src/director/*`, `remotion/*` | Same composition in Player and renderer; frame-driven morph |
| V2 render | `src/cli/remotion-adapter.ts` | Remotion `renderFrames()` → external LGPL FFmpeg encode/verify |
| V2 CLI | `src/cli/director.ts`, `src/cli/main.ts` | `director validate`, `video export-remotion`; one-line JSON; 0/1/2 exit codes |
| Agent skill | `skills/shotweft/SKILL.md` | Executable local workflow contract |

## Current DirectorPlan boundary

- The plan is a separate JSON store. It is **not** persisted in a project ZIP or IndexedDB yet.
- Plan assets use safe relative filesystem paths. Project assets use blob records and asset IDs. Any M2 integration must map these explicitly; do not silently treat one as the other.
- M1 renders only title/chart/quote graphics, captions, local audio, and `idea` shared-element morphs.
- Presenter data and visual media are representable but rejected by the M1 compiler.
- `src/director/DirectorPreview.tsx` currently fetches only `/director/demo-plan.json`. This is a hard-coded demo limitation, not a project preview.
- `DirectorComposition` is shared between Player and renderer. Any new scene/media logic must stay in that shared component path.

## Compatibility rules

- Additive schema changes only; keep legacy fixtures valid.
- Do not create a second timeline. The V1.6 `VideoTimeline` and V2 `DirectorPlan` must have an explicit projection/boundary if both are offered.
- Project persistence must remap asset IDs on duplicate/restore/ZIP import and preserve undo/redo.
- ZIP manifest version changes require read support for all earlier versions.
- Render remains deterministic: integer frames, rational fps, no wall clock/random state.
- Existing FFmpeg project renderer remains available.

## Formal agent configuration

- Pi: `qwen-cn/deepseek-v4.1-flash-1017`, reasoning high.
- Codex CLI: `gpt-6.2-sol`, reasoning high. Historical reports retain their real `gpt-6.1-sol` records.
- Codex runs with workspace-write, approval never, network access enabled, no YOLO/danger-full-access.
- Subagents are read-only for audits unless a single writer is explicitly assigned.

## Open architecture decisions

- M2 plan/project persistence shape and ZIP manifest version.
- M2 media-layer schema and project-asset mapping.
- M2 audio timing provenance: estimated vs imported vs TTS.
- M3 transcript/word-timing model and optional ASR worker boundary.
- M4 component registry and transition topology.
- M5 waveform/audio bus and workbench UI scope.
- M6 automatic-review evidence thresholds.