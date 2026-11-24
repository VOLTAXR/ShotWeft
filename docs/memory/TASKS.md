# ShotWeft Tasks Memory

Last verified: 2026-11-24
Current priority: M2 then M3. M0/M1 are complete and must not be rebuilt.

## M2 — Script animation workflow

Acceptance criteria:

- [ ] TXT/Markdown/JSON/pasted script, mixed Chinese/English; verbatim preservation.
- [ ] Stable paragraph IDs and offsets.
- [ ] Offline semantic planner extends strict DirectorPlan; optional provider boundary is not hard-coded.
- [ ] Every shot has script link, purpose, scene type, elements, asset needs, audio anchors, motion, adjacency, rationale.
- [ ] Project plan import/edit/preview; choose shots and seek frames; live parameter edits; regenerate/lock a shot.
- [ ] Plan persists in IndexedDB and project ZIP; duplicate/restore/undo/redo/asset remapping; V1 compatibility.
- [ ] Image/video/audio layers, B-roll, crop/scale, source in/out, missing-asset errors, aspect layouts.
- [ ] Imported WAV/MP3/M4A narration; optional TTS interface; estimated vs actual timing; realign after replacement.
- [ ] Real Chinese 60s+ acceptance video with speech, text, image, video, chart, captions, morph; editable project; real Remotion MP4.

Current blockers: no authorized human voice recording; no authorized third-party media. A synthetic speech fixture may test the pipeline but cannot be represented as human-voice acceptance.

## M3 — Real-person presenter

Acceptance criteria:

- [ ] Script plus MP4/MOV/WebM, or video-only auto transcript.
- [ ] Optional faster-whisper/WhisperX ASR with CPU/GPU and cache configuration; no unauthorized model download.
- [ ] Word timestamps, Chinese/English, script-vs-speech alignment, disfluency handling, manual correction.
- [ ] Sentence/word subtitles, keyword highlight, SRT/VTT, safe areas, live sync.
- [ ] Reviewable pause/repeat/silence edit suggestions; non-destructive undo; anchor recomputation.
- [ ] Layouts: full, left/right split, rectangular/round PiP, vertical window, B-roll fullscreen, charts, article, board, text, cutout background.
- [ ] Optional temporal matting with flicker/edge cleanup; normal layout works without it.
- [ ] Visual/keyword/subtitle/chart/layout anchors driven by actual speech; recompute after audio replacement.
- [ ] Real 60s+ teaching video with real presenter, transcript, word timing, subtitles, keyword highlight, PiP, split, B-roll, morph.

Current blockers: no real presenter media, no ASR model, no cutout model; final human acceptance blocked. Synthetic fixture tests are allowed but must be labelled.

## M4-M6

- M4: component library + morph transition set with schemas, previews, render tests.
- M5: material/rights, waveform, audio bus/ducking/loudness, workbench UI.
- M6: pre/post render review, contact sheets, 720p review, 16:9/9:16, cross-platform/performance, complete Skill.

## Required gates

Run sequentially after changes: `npm run check`, `npm run build`, `npm test`, `npm run test:remotion`, `npm run test:video-render`, `npm run test:package`. Add focused M2/M3 tests. Record real exit codes. Never mark skipped as passed.