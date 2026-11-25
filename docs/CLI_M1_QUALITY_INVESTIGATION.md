# CLI M1 Delivered-Video Quality Investigation

Status: **rejected for production quality**. Successful encoding, schema validation, decode and exit code `0` do not constitute visual or audio acceptance.

Scope: the CLI M1 acceptance artifact produced by `npm run test:cli-m1 -- --render`
(`.tmp/cli-m1/acceptance-DqerQF/{project.zip,project.mp4}`, local only, not committed). No code was changed and no fixture was re-rendered for this investigation.

## 1. Verdict

| Question | Answer |
| --- | --- |
| Is the render pipeline broken? | No. Streams, frame count, duration and audio are correct and the audio is a faithful copy of its source. |
| Is the delivered animation acceptable? | No. 87.0% of the timeline is frozen; the excerpt is a slide deck with one 0.4 s morph. |
| Is the narration acceptable? | No. It is synthetic SAPI speech, and captions are character-proportional estimates rather than measured speech timing. |
| Was this detected automatically? | No. M1 gates checked encoding, frames and decode only. Nothing measured motion, speech quality or sync. |

## 2. Measured evidence

Commands are listed in §7. All numbers below were produced in this workstation (WSL/Linux, LGPL FFmpeg n8.1.3).

### 2.1 Picture

| Metric | Delivered | Indicative reference |
| --- | --- | --- |
| Duration / frames / rate | 23.500 s / 705 / 30 fps, 1280×720 | — |
| Frozen time (`freezedetect=n=-50dB:d=0.5`) | **20.433 s = 87.0%** | 15–29% still (reference films) |
| Frozen intervals | 0–2.767, 2.767–14.033, 14.667–16.067, 16.067–16.667, 19.100–23.500 | — |
| Longest single hold | **11.267 s** | p75 shot length 2.4–3.0 s |
| Holds longer than 2 s | 3 (2.77 s, 11.27 s, 4.40 s) | ≤ 1 per minute |
| Inter-frame mean luma delta | median 0.000; 578/704 frames < 0.05; only **5** frames > 1.0 | — |
| Hard cuts (delta > 5) | 4 in 23.5 s ≈ **10/min** | 26–32/min |
| Mean shot length | 7.83 s (3 shots) | p75 2.4–3.0 s |

Frame-level motion exists only where the engine happens to animate:

- `ChartScene` bar growth (24 frames, ≈0.8 s).
- `TitleScene` watermark fade (12 frames, mean luma delta 0.011–0.061 — visually imperceptible).
- One 12-frame (0.4 s) `morph` of the `海岸线` label.
- A hard appearance of the 3 s B-roll layer.

### 2.2 Sound

Decoded the MP4 audio and the fixture source to 16 kHz mono and compared them directly.

| Metric | Result |
| --- | --- |
| Correlation with `narration.m4a[0, 23.5 s]` at lag 0 | **0.99999** |
| Best correlation over 0–4000 sample lags | 0.99999 at lag 0 (no offset/loop) |
| Peak level | 21,316 / 32,768 = 65.1% FS |
| Near-clipped samples | 0 |
| Active 100 ms windows | 91% |
| Envelope self-correlation at 2/4/6/8 s | 0.117 / 0.080 / 0.018 / −0.001 (no repetition) |
| Source | 83.635 s, 294 non-space characters (263 Han) ≈ 3.1 Han/s, nine 0.69–0.83 s paragraph pauses |

Conclusion: the mix, trim, resample, AAC encode and mux are correct. The MP4 contains **one** narration track with no duplication, no clipping, no sample-rate/pitch corruption and no looping. The unintelligibility therefore originates in the **synthetic source fixture** (Microsoft Huihui SAPI, generated for the M2 demo from the full script including Markdown markers), not in the CLI M1 audio path. This investigation did not listen subjectively and has no ASR model, so intelligibility is **not** certified by measurement; the operator's rejection stands.

### 2.3 Narration ↔ caption synchronization

Comparing the plan's segment boundaries with measured speech pauses in the same source file:

| Boundary (plan) | Measured next speech onset | Drift |
| --- | --- | --- |
| 2.73 s (heading→p1) | no pause after heading | n/a |
| 13.90 s | 11.86 s | **+2.04 s** |
| 23.27 s | 23.20 s | +0.07 s |
| 30.80 s | 30.48 s | +0.32 s |
| 39.57 s | 39.97 s | −0.40 s |
| 46.20 s | 47.02 s | −0.82 s |
| 53.13 s | 54.20 s | −1.07 s |
| 60.10 s | 60.73 s | −0.63 s |
| 68.23 s | 67.96 s | +0.27 s |
| 78.50 s | 77.73 s | +0.77 s |

The plan timings are reproduced by a **pure character-proportion model** over the measured total duration (every boundary within 0.12–0.71 s of `charEnd/316 × 83.633 s`), yet the plan declares `narration.timing: "actual"` and carries no transcript. Captions therefore drift by up to ~2 s, and `attachNarration` re-scales them again (698→705 frames) without ever consulting speech.

The 23.5 s cut was also arbitrary: the next paragraph's speech resumes at 23.198 s, so the last 0.30 s of the film speaks text that no caption or shot covers.

### 2.4 Visual composition defects visible in frames

- The title caption renders the raw script marker: `# 海岸线为什么在后退`, duplicating the headline text.
- Each shot shows the same sentence twice: a large "focus" element **and** the full-sentence caption beneath it.
- The focus text is truncated mid-sentence (`…沙滩上会留下一条`, without `细线`), inherited from the hand-tuned `demos/m2` plan; the current planner instead emits up to 100 characters into a fixed 0.84×0.16 box with `overflow: hidden`, which visually clips in a different way.
- Photos render `fit: contain` inside an 84%×40% box, producing a small letterboxed thumbnail surrounded by empty background.
- The B-roll shot pastes large opaque text cards over slow fog footage.
- Caption text keeps `\n\n` and wraps with a stranded trailing word.

## 3. Root causes

### 3.1 Engine limitations (ShotWeft)

1. **No element animation model.** `visualElementSchema` is a strict object of geometry, text and colors. There is no entry/exit, no keyframes, no stagger, no easing, no per-element timing. `Element.tsx` is a static `div`; only `morph.ts`, `ChartScene` and `TitleScene` read the frame.
2. **Morph is single-element, geometry-only, and short.** `sharedElementsAtFrame` interpolates one `sharedElementId` pair over `transition.durationFrames` (max 0.4 s here) and ignores text changes, opacity, rotation and multi-element groups.
3. **Only three scene components exist.** `title`, `chart`, `quote`; `graphic`, `image`, `video`, `split` render nothing but generic elements. There is no reusable component library, no count-up, no Ken Burns, no mask/wipe, no lower third.
4. **No text layout engine.** Fixed `fontSize`, fixed box, `overflow: hidden`, no autofit, no Markdown stripping, no line-break control.
5. **Timing is character-proportional, not speech-measured.** `reflowDirectorPlan` scales existing spans linearly; the fixture's spans were estimated and then labelled `actual`.
6. **No quality gate.** Neither the CLI, the tests, nor the agent report measure motion, hold time, cut rate, speech intelligibility or caption drift.

### 3.2 Fixture defects (the CLI M1 acceptance test)

1. A 23.5 s excerpt cut from a demo authored for a different purpose: 3 of 11 shots, 1 of 10 transitions, no 9:16 or component exercise.
2. Narration truncated by wall-clock (`-t 23.5`) rather than at a speech boundary, including 0.30 s of the next paragraph.
3. Reuse of a synthetic SAPI track as the only narration, labelled `synthetic` but never reviewed for intelligibility.
4. Reuse of the M2 plan's truncated 18-character focus strings and its raw-text captions.
5. A "Morph" assertion that passes on a 0.4 s label slide without checking that motion is perceptible.

### 3.3 Test-design defects

The end-to-end test asserts stream shape, frame count, decode and byte identity. Those assertions are necessary but were reported as acceptance. No test would have failed for a completely static video with unintelligible audio.

## 4. What remains valid

- CLI M0/M1 functionality: guarded transactions, dry-run byte identity, asset ingestion/removal with reference checks, plan mapping, measured narration attachment, ZIP-native rendering, stream/decoder verification, no-overwrite and lock behaviour all behave as tested.
- The rendering architecture (ZIP extraction → media preparation → shared `DirectorComposition` → LGPL encode → FFprobe) is sound and should be extended, not replaced.
- The audio path is faithful; do not "fix" it.

## 5. Required follow-up (summary)

The reuse-first M4 plan, thresholds and upstream/license research are in [V2 M4 plan](V2_M4_PLAN.md). Its first deliverable is an automated review gate that fails this exact artifact, before any new animation work is claimed.

## 6. Non-claims

- No human listening test, no ASR, no TTS quality benchmark was run.
- Reference ranges are indicative targets from an unrelated reference corpus, not a ShotWeft standard.
- No claim is made that fixing the fixture alone would make the output production quality; §3.1 is the dominant cause.

## 7. Reproduction

```bash
FF=.tmp/ffmpeg-lgpl/*/bin/ffmpeg            # existing LGPL build, n8.1.3
MP4=.tmp/cli-m1/acceptance-DqerQF/project.mp4
D=.tmp/cli-m1/quality

# frozen time and holds
$FF -hide_banner -nostdin -i "$MP4" -map 0:v -vf "freezedetect=n=-50dB:d=0.5" -f null -

# per-frame motion
$FF -hide_banner -nostdin -i "$MP4" -map 0:v \
  -vf "tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=$D/diff.txt" -f null -

# audio comparison
$FF -loglevel error -y -i "$MP4" -map 0:a:0 -ac 1 -ar 16000 -c:a pcm_s16le $D/mp4.wav
$FF -loglevel error -y -i demos/m2/media/narration.m4a -t 23.5 -ac 1 -ar 16000 -c:a pcm_s16le $D/source-cut.wav
# normalized cross-correlation and clipping: 0.99999 at lag 0, 0 clipped samples

# speech pauses
$FF -hide_banner -nostdin -i demos/m2/media/narration.m4a -af "silencedetect=n=-35dB:d=0.25" -f null -
```

Evidence files are kept locally under `.tmp/cli-m1/quality/` (not committed): `freezedetect.log`, `diff.txt`, `scenes.txt`, `mp4.wav`, `source-cut.wav`, `frames-grid.jpg`, `upstream/*`.