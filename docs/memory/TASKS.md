# ShotWeft Tasks Memory

Last verified: 2026-11-24
Current priority: M2 human-voice acceptance, M3 real-person acceptance, and the M4 motion/narration quality plan. M0/M1 functionality is complete and must not be rebuilt; the CLI M1 delivered demo was rejected for visual/audio quality ([investigation](../CLI_M1_QUALITY_INVESTIGATION.md)).

## M2 — Script animation workflow

Acceptance criteria:

- [x] TXT/Markdown/JSON/pasted script, mixed Chinese/English; verbatim preservation.
- [x] Stable paragraph IDs and offsets.
- [x] Offline deterministic planner extends strict DirectorPlan; provider boundary is defined; no hard-coded model.
- [x] Every generated shot has script link, purpose, scene type, elements, asset needs, cue anchors, continuity and rationale.
- [x] Project plan generate/edit/preview; shot seek, live edits, regenerate/lock.
- [x] Plan persists in IndexedDB and ZIP v3; duplicate/restore/undo/redo/remap; V1/v2 compatibility.
- [x] Image/video/audio layers, B-roll, source offsets, missing-asset errors, 16:9/9:16 layouts; crop/scale UI is partial.
- [x] Imported WAV/MP3/M4A narration; estimated vs actual timing and reflow. TTS provider interface is not yet wired.
- [~] 83.633 s Chinese synthetic-speech MP4 with text, images, B-roll video, chart, captions, morph, editable plan/ZIP. Human-voice acceptance remains blocked.

Current M2 blockers: no authorized human voice recording. The committed demo uses synthetic SAPI speech and must not be represented as human-voice acceptance.

## M3 — Real-person presenter

Acceptance criteria:

- [ ] Complete presenter authoring in the project workspace or video-only auto transcript.
- [~] Local-only faster-whisper host interface with CPU/GPU and cache settings; actual runtime/model execution is pending and no model is shipped.
- [~] Imported word timestamps, Chinese/English token alignment, manual correction and deterministic matching are implemented; real-speech accuracy/disfluencies are unverified.
- [~] Sentence/word captions, highlights, safe areas and SRT/VTT are implemented; real-speech sync is unverified.
- [ ] Reviewable pause/repeat/silence edit suggestions; non-destructive undo; anchor recomputation.
- [~] Full, left/right split, rectangular/round PiP, vertical window and B-roll tested with synthetic media; remaining editorial layout and cutout coverage is open.
- [ ] Optional temporal matting with flicker/edge cleanup; normal layout works without it.
- [ ] Visual/keyword/subtitle/chart/layout anchors driven by actual speech; recompute after audio replacement.
- [ ] Real 60s+ teaching video with real presenter, transcript, word timing, subtitles, keyword highlight, PiP, split, B-roll, morph.

Current blockers: no real presenter media, no ASR model, no cutout model; final human acceptance blocked. Synthetic fixture tests are allowed but must be labelled.

## M4-M6

- M4: component library + morph transition set with schemas, previews, render tests. Detailed reuse-first plan: [V2 M4 plan](../V2_M4_PLAN.md). First step is an automated video review gate (frozen time, holds, cut rate, audio integrity, caption drift) that fails the rejected CLI M1 artifact; no M4 animation work starts before it.
- M5: material/rights, waveform, audio bus/ducking/loudness, workbench UI.
- M6: pre/post render review, contact sheets, 720p review, 16:9/9:16, cross-platform/performance, complete Skill.

## CLI track (separate from V2)

- CLI M0: guarded archive transactions and revision/dry-run are the foundation.
- CLI M1: guarded asset ingestion/removal, plan linking, measured narration and script-mode ZIP-native rendering; see [CLI M1](../CLI_M1.md) for the acceptance flow. Synthetic speech does not close V2 M2/M3 human-media gates.
- Reuse the shared DirectorPlan/DirectorComposition path when V2 M4 is authorized: extend typed scene and Morph primitives with fixtures before adding new editing surfaces. Do not create a separate CLI component system or advance M4–M6 as part of CLI M1.

## Required gates

Run sequentially after changes: `npm run check`, `npm run build`, `npm test`, `npm run test:remotion`, `npm run test:video-render`, `npm run test:package`. Add focused M2/M3 tests. Record real exit codes. Never mark skipped as passed.