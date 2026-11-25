---
name: shotweft
description: Validate and render ShotWeft DirectorPlan JSON locally, or edit, validate and render ShotWeft project ZIPs through its non-interactive CLI.
---

Use the repository CLI from the source-checkout root after `npm ci` and `npm run build:cli`. Results are one JSON line: success on stdout (exit 0), runtime or invalid-plan errors on stderr (1), usage errors (2). No MCP or paid service is required.

For the original V2 M1 standalone example, start with `public/director/demo-plan.json`. Copy it and `synthetic-tones.wav` to the same working directory before editing. The WAV is self-generated tones, explicitly not human voice. `npm run director:demo` regenerates and overwrites the reference fixtures; use it only when fixture regeneration is intended.

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

These are the original M1 fixture boundaries, not a list of current renderer capabilities. See the repository README for the M2 script workflow and M3 synthetic presenter engineering preview. Standalone DirectorPlan JSON is exchange data; the authoritative CLI project ZIP stores the embedded DirectorPlan at `project.direction`.

For review, validate the plan, inspect the Player via **Video → Director demo (Remotion)** or Studio, watch the resulting MP4 and inspect the returned measured stream properties. `reviewStatus` is a manual field (`draft`, `needs-review`, `approved`); validation and export do not grant approval or update it. The Player control loads the editable demo, not an arbitrary file picker. Use Studio input props or CLI for other authored plans.

## Guarded Project ZIP edits

Read the current SHA-256 with `shotweft project revision project.zip`. Prepare a strict array of 1–100 operations using the [Agent guide](../../docs/AGENT.md#operations-json-schema). Run `shotweft project apply project.zip operations.json --expected-revision <sha256> --dry-run` to validate the exact edit path without replacing the ZIP. Commit with the same expected source revision and omit `--dry-run`. Use committed result IDs; dry-run IDs and the candidate digest are not reusable commitments. On a revision conflict, reread and reconcile before retrying. Legacy `project update` and scene/shot edits also accept `--expected-revision` without changing their result shape. `project apply` itself does not import media. Use the commands below for CLI M1 animation production.

## Project-native animation (CLI M1)

1. `shotweft project create project.zip --title "My film"`; read `shotweft project revision project.zip`.
2. Write a strict JSON array such as `[{"path":"coast.jpg"},{"path":"broll.mp4"}]`. Use `shotweft asset import project.zip batch.json --root ./media --expected-revision "$revision" --dry-run`, then repeat without the dry-run. Collect committed `assets[].id` and `revision`; inspect with `asset list project.zip` or `asset show project.zip <id>`. Do not infer license, origin or permission.
3. Validate the exchange plan with `director validate plan.json`. Make `mapping.json` an array of `{"planAssetId":"coast","projectAssetId":"<committed asset ID>"}` entries. Run `shotweft director import-plan project.zip plan.json --map mapping.json --expected-revision "$revision"` (preview with `--dry-run` first).
4. For an audio file, use `shotweft director attach-narration project.zip narration.m4a --root ./media --origin synthetic --expected-revision "$revision"`. For an existing audio asset use its ID and omit `--root`. Set origin to the actual supplied provenance: `imported`, `synthetic`, `tts`, or `unknown`. This measures duration and reflows timing; it does not transcribe or synthesize speech. Update the revision from each committed receipt, never from a dry-run.
5. `shotweft director show-project project.zip` validates links and shows the authoritative embedded plan. Also run `shotweft agent verify project.zip` for project integrity. Render with `shotweft director render project.zip --output delivery.mp4` from the source checkout. Supply existing tools as above, then independently inspect the render and re-read the ZIP revision. Output is for review, not approval.

Use `asset remove project.zip <id> --expected-revision "$revision"` only for unused media; any reference prevents removal. ZIP-native rendering in CLI M1 is script-mode only. See [CLI M1](../../docs/CLI_M1.md) for exact syntax, accepted codecs and limits. Do not treat standalone plan JSON as the project after import.

Existing V1.6 commands remain separate:

```bash
node dist/cli/shotweft.js video render project.zip --output .tmp/legacy-new.mp4
node dist/cli/shotweft.js video verify project.zip --video .tmp/legacy-new.mp4
node dist/cli/shotweft.js agent storyboard script.txt .tmp/storyboard-new.zip --title "My film"
node dist/cli/shotweft.js agent verify .tmp/storyboard-new.zip
```

On failure, inspect the JSON error. Fix usage for exit 2; for exit 1 repair the plan, missing media/tool, unsupported M1 feature or source range and rerun validation. Existing targets are never overwritten. A `.shotweft-lock` directory means an active/interrupted write: confirm the writer has stopped before removing a stale lock. Do not work around a rejected GPL/nonfree build; choose a compatible LGPL build with `libopenh264`, native AAC and the existing capability set. Do not mark skipped tests as passed.

Remotion 4.0.546 is source-available/non-OSI. This branch and its web build are local evaluation artifacts; commercial use, embedded distribution and release approval remain separate decisions. See [research](../../docs/V2_UPSTREAM_RESEARCH.md) and [verification](../../docs/TEST_REPORT.md). Do not copy wallstreet examples media.
