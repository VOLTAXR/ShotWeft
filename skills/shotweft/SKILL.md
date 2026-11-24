---
name: shotweft
description: Validate and render ShotWeft DirectorPlan JSON locally, or operate existing ShotWeft storyboard and video ZIP workflows through its non-interactive CLI.
---

Use the repository CLI from the source-checkout root after `npm ci` and `npm run build:cli`. Results are one JSON line: success on stdout (exit 0), runtime or invalid-plan errors on stderr (1), usage errors (2). No MCP or paid service is required.

For M1 start with `public/director/demo-plan.json`. Copy it and `synthetic-tones.wav` to the same working directory before editing. The WAV is self-generated tones, explicitly not human voice. `npm run director:demo` regenerates and overwrites the reference fixtures; use it only when fixture regeneration is intended.

```bash
node dist/cli/shotweft.js director validate public/director/demo-plan.json
node dist/cli/shotweft.js video export-remotion public/director/demo-plan.json \
  --output .tmp/director-new.mp4 \
  --ffmpeg /path/to/lgpl/ffmpeg --ffprobe /path/to/lgpl/ffprobe \
  --browser /path/to/existing/chromium
npm run remotion:studio
```

`FFMPEG_PATH`, `FFPROBE_PATH`, and `SHOTWEFT_BROWSER` can supply tool paths. Without a browser override, Playwright resolves its existing Chromium using `PLAYWRIGHT_BROWSERS_PATH`. The export command downloads no browser. Create the output's parent directory first and choose a new path. The adapter captures Remotion PNG frames, mixes scheduled local audio using validated external LGPL FFmpeg, probes the staged MP4, then publishes without replacement. Remotion's bundled GPL FFmpeg is not the encoder. Temporary work is under `.tmp` and cleaned on ordinary success/failure.

Read [the schema](../../src/core/director/plan.ts) and [demo](../../public/director/demo-plan.json) when authoring a plan. All objects are strict. Required top-level fields:

- `schemaVersion: 1`, `productionMode`, `originalScript`, `scriptSegments`.
- `aspectRatio` (`16:9` or `9:16`), reduced positive rational `frameRate: {numerator, denominator}`, even matching `resolution: {width, height}`, `durationFrames`.
- `scenes`, `shots`, `narration`, `presenter`, `assets`, `captions`, `transitions`, `audio`, `style`, `reviewStatus`.

Each shot needs `id`, `scriptSegmentIds`, `purpose`, `startFrame`, `durationFrames`, `sceneType`, `visualElements`, `assetIds`, `camera`, `transition`, `cueAnchors`, `presenterLayout`, `rationale`. Frames use half-open ranges. Scenes and shots cover the plan without gaps/overlap; script segments cover the script timeline, each shot belongs to one scene, references resolve and per-collection IDs are unique. Visual boxes use normalized coordinates and must fit in-frame. Cue anchors use a segment ID, Unicode code-point `charOffset` and absolute `frame`; the character and frame must belong to that segment and shot. This is explicit authored timing, not speech alignment.

`script` mode renders `title`, illustrative `chart`, and `quote` graphics with static camera, captions and local audio. A `morph` transition names matching `sharedKey` elements of the same kind/text in adjacent shots. It interpolates the outgoing shot's final `durationFrames` toward the next shot's geometry without shortening the timeline. `cut` has zero duration and no shared element. Audio clips specify asset ID, frame span, `sourceInFrame` and volume 0–1; media must cover the requested source range. Asset paths are safe relative paths under the plan directory, including after symlink resolution. No URLs, scripts, arbitrary JSX or plugins are accepted.

`presenter` mode and presenter layouts are schema contracts; the M1 renderer rejects them. It also rejects shot visual assets and `slow-push`. There is no ASR, TTS, AI director, asset search, background removal, automatic quality review or M2–M6 implementation. DirectorPlan is a separate JSON store, not a V1 project/ZIP field.

For review, validate the plan, inspect the Player via **Video → Director demo (Remotion)** or Studio, watch the resulting MP4 and inspect the returned measured stream properties. `reviewStatus` is a manual field (`draft`, `needs-review`, `approved`); validation and export do not grant approval or update it. The Player control loads the editable demo, not an arbitrary file picker. Use Studio input props or CLI for other authored plans.

Existing V1.6 commands remain separate:

```bash
node dist/cli/shotweft.js video render project.zip --output .tmp/legacy-new.mp4
node dist/cli/shotweft.js video verify project.zip --video .tmp/legacy-new.mp4
node dist/cli/shotweft.js agent storyboard script.txt .tmp/storyboard-new.zip --title "My film"
node dist/cli/shotweft.js agent verify .tmp/storyboard-new.zip
```

On failure, inspect the JSON error. Fix usage for exit 2; for exit 1 repair the plan, missing media/tool, unsupported M1 feature or source range and rerun validation. Existing targets are never overwritten. A `.shotweft-lock` directory means an active/interrupted write: confirm the writer has stopped before removing a stale lock. Do not work around a rejected GPL/nonfree build; choose a compatible LGPL build with `libopenh264`, native AAC and the existing capability set. Do not mark skipped tests as passed.

Remotion 4.0.546 is source-available/non-OSI. This branch and its web build are local evaluation artifacts; commercial use, embedded distribution and release approval remain separate decisions. See [research](../../docs/V2_UPSTREAM_RESEARCH.md) and [verification](../../docs/TEST_REPORT.md). Do not copy wallstreet examples media.
