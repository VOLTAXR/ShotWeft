# ShotWeft Architecture Memory

Last verified against source: 2026-11-24
Scope: M2 script workflow and M3 presenter engineering preview.

## Existing stable layers

| Layer | Source | Contract |
| --- | --- | --- |
| V1 project/storyboard | `src/model.ts`, `src/core/project-edit.ts`, `src/db.ts` | `Project` with scenes/shots, Dexie IndexedDB `frameos-studio`, history/undo, assets by project |
| V1 media | `src/media.ts` | Local image/video/audio import, thumbnails, browser decode, project asset blobs |
| Project archive | `src/core/project-archive.ts` | ZIP manifest v1/v2/v3, asset-ID validation, legacy compatibility, 768 MB cap |
| V1.6 video timeline | `src/video-model.ts`, `src/video-workspace.tsx`, `src/video-preview.tsx` | Six-track frame timeline, templates, captions, native preview |
| V1.6 FFmpeg render | `src/cli/video.ts`, `src/cli/ffmpeg.ts` | Validated external LGPL FFmpeg/ffprobe, staged no-overwrite MP4 |
| V2 DirectorPlan | `src/core/director/plan.ts` | Strict Zod `schemaVersion: 1`, separate JSON; coverage, cue anchors, safe relative asset paths |
| V2 compiler | `src/core/director/compiler.ts` | Plan → composition metadata; media-aware paths resolve images/video and presenters; legacy M1 path remains restricted |
| V2 React/Remotion | `src/director/*`, `remotion/*` | Same composition in Player and renderer; frame-driven morph |
| V2 render | `src/cli/remotion-adapter.ts` | Remotion `renderFrames()` → external LGPL FFmpeg encode/verify |
| V2 CLI | `src/cli/director.ts`, `src/cli/main.ts` | `director validate`, `video export-remotion`; one-line JSON; 0/1/2 exit codes |
| Agent skill | `skills/shotweft/SKILL.md` | Executable local workflow contract |

## Current DirectorPlan boundary

- Editable plans are standalone JSON or project `direction`, persisted through IndexedDB history and ZIP v3. `activeTimeline` selects the editor without converting legacy data.
- Local export resolves safe relative paths; the project Player resolves blob assets through explicit `projectAssetId` linkage.
- `src/core/presenter/` imports transcripts and aligns script offsets to frames. The ASR provider is an injected local-only host boundary; no runtime/model ships with the application.
- The plan carries optional word ranges, caption highlights and layouts. Presenter visuals and B-roll are muted; a separate derived voice schedule feeds the shared Player and the external FFmpeg mix.
- `DirectorComposition` is shared between Player and renderer. Any new scene/media logic must stay in that shared component path.

## Compatibility rules

- Additive schema changes only; keep legacy fixtures valid.
- Do not create a second timeline. The V1.6 `VideoTimeline` and V2 `DirectorPlan` must have an explicit projection/boundary if both are offered.
- Project persistence must remap asset IDs on duplicate/restore/ZIP import and preserve undo/redo.
- ZIP manifest version changes require read support for all earlier versions.
- Render remains deterministic: integer frames, rational fps, no wall clock/random state.
- Existing FFmpeg project renderer remains available.

## Formal agent configuration

- Continue directly in Pi using the operator-selected runtime. Record the actual provider/model from session metadata.
- Do not launch Codex CLI for new work. Historical reports retain their actual model and invocation evidence.
- Subagents are read-only for audits unless a single writer is explicitly assigned.

## Open architecture decisions

- M2 optional TTS wiring, standalone plan import UX and ZIP-to-Remotion CLI media resolution.
- M3 live ASR runtime, real-person project authoring, real-data alignment validation and matting.
- M4 component registry and transition topology.
- M5 waveform/audio bus and workbench UI scope.
- M6 automatic-review evidence thresholds.