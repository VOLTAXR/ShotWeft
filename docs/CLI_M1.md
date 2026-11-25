# CLI M1 — Project-native animation

## Command contract

Inputs are local. Existing command signatures are unchanged. New mutations require `--expected-revision <sha256>`; `--dry-run` runs the same validation but leaves the ZIP byte-identical. Asset IDs printed by a dry-run are candidates, not committed IDs.

```text
asset import <project.zip> <batch.json> --root <directory> --expected-revision <sha256> [--dry-run] [--ffmpeg <path>] [--ffprobe <path>]
asset list <project.zip>
asset show <project.zip> <asset-id>
asset remove <project.zip> <asset-id> --expected-revision <sha256> [--dry-run]
director import-plan <project.zip> <plan.json> [--map <mapping.json>] --expected-revision <sha256> [--dry-run]
director show-project <project.zip>
director attach-narration <project.zip> <asset-id-or-file> --origin imported|synthetic|tts|unknown [--root <directory>] --expected-revision <sha256> [--dry-run] [--ffmpeg <path>] [--ffprobe <path>]
director render <project.zip> --output <new.mp4> [--browser <path>] [--ffmpeg <path>] [--ffprobe <path>]
```

Asset batch: `[ {"path":"media/coast.jpg","source":"https://example.org/asset","license":"CC0-1.0"} ]`. Only `path` is required. The batch is bounded and strict. Paths must be relative to the supplied root; escaping symlinks and traversal are rejected. Rights metadata is operator-provided and is not inferred or verified by ShotWeft.

Plan mapping: `[ {"planAssetId":"coast","projectAssetId":"<committed ID>"} ]`. Existing valid links in the exchange plan may be used instead. Map path-based assets by their DirectorPlan ID, not by filename; stray, duplicate, conflicting, missing or incompatible mappings fail. The resulting embedded plan has project asset links only. In `attach-narration`, the second argument is a project audio asset ID unless `--root` is present; with `--root` it is a relative audio path imported in the same transaction. Origin describes the supplied source; it does not prove the voice is human. Project-native rendering in CLI M1 covers script-mode animation, not new presenter features.

## Limits and receipts

- Asset batches contain 1–100 entries, and batch/mapping JSON is limited to 1 MiB. Limits per original are 25 MiB (images), 120 MiB (video), and 60 MiB (audio), plus existing ZIP limits. Images/video must be at most 8192 pixels per side and 60 megapixels; timed media must have a measured duration of at most one hour. Video accepts H.264 MP4 or VP8/VP9/AV1 WebM, with at most one optional AAC (MP4) or Opus/Vorbis (WebM) stream. Audio accepts PCM WAV, MP3, and AAC M4A. Availability depends on the installed LGPL toolchain. SVG, external media links and files that only have the expected extension are not accepted.
- Import produces PNG thumbnails (visual preview for images/video, a marker for audio) and stores the original bytes. `asset list` lists metadata in archive order; `asset show` returns one record. `asset remove` identifies references instead of cascading. `asset import` adds `assets` and `asset remove` adds `id` to the standard transaction receipt.
- `director import-plan` keeps authored script text, timing and plan IDs. `director attach-narration` measures the whole audio file from zero, rounds down to a whole project frame and replaces the narration schedule while retaining other audio; timing is reflowed, not aligned to words. `director show-project` returns `{projectPath, valid, plan}`. `director render` probes the actual extracted media again, renders the embedded plan, and returns the absolute output `path`, `projectPath`, `engine`, `composition`, `reviewStatus`, `durationFrames`, and verified `video` metadata. Rendering does not edit the ZIP or overwrite an existing output. It requires a source checkout with existing Chromium and local LGPL FFmpeg/FFprobe; there is no bundled renderer or fallback.
- Success writes one JSON line to stdout (exit 0); malformed command flags or batch/mapping JSON/schema write one JSON error to stderr (exit 2). Conflicts, invalid plans, unresolved references, bad media and I/O/render failures write one JSON error to stderr (exit 1).

## Reproduce

From the checkout root, set `FFMPEG_PATH`, `FFPROBE_PATH`, and `PLAYWRIGHT_BROWSERS_PATH` (or `SHOTWEFT_BROWSER`) to your existing tools and browser. Then run:

```bash
npm run build:cli
npm run test:cli-m1 -- --render
```

This executes the full creation, ingestion, mapping, narration, validation and render flow in a new `.tmp/cli-m1/acceptance-*` directory. See `scripts/test-cli-m1.mjs` for the exact invocations and verification. The short coastal excerpt uses the committed [M2 image/video sources and synthetic Microsoft Huihui narration](../demos/m2/README.md), not new human narration. It does not fulfill the outstanding product human-voice or real-person acceptance gates.

The WSL acceptance output is `.tmp/cli-m1/acceptance-DqerQF/{project.zip,project.mp4}` (local, not checked in). The 698-frame exchange plan reflowed to 705 frames; the embedded plan contains three captions and the `海岸线` Morph. Independent FFprobe measured 1280×720, 30/1 fps, 705 frames, 23.500 s, H.264/yuv420p plus one 48 kHz stereo AAC stream. Full decode passed, the existing output was not overwritten, and the ZIP SHA-256 was unchanged by rendering. `ffprobe.json` and `receipt.json` are alongside the artifacts.

## Targeted reuse

| Upstream | Verified local version / license | Reuse and adaptation |
| --- | --- | --- |
| [zip.js](https://github.com/gildas-lormeau/zip.js) | 2.25.0, BSD-3-Clause ([source license](https://github.com/gildas-lormeau/zip.js/blob/master/LICENSE)) | Existing streamed ZIP read/write, CRC checks and extraction through `withProject()` and `updateProjectArchive()`. No port or new backend. |
| [FFmpeg](https://github.com/FFmpeg/FFmpeg) | Local `n8.1.3-39-g660b5aa7db-20261123`, LGPL configuration ([n8.1 license](https://github.com/FFmpeg/FFmpeg/blob/n8.1/LICENSE.md)) | Existing `probeFile`, fixed demuxer/protocol options, decoder capability checks and external render/verify. New caller uses bounded decode and small PNG thumbnails. No bundled binary or copied upstream source. |
| [Zod](https://github.com/colinhacks/zod) | 4.6.7, MIT ([source license](https://github.com/colinhacks/zod/blob/main/LICENSE)) | Strict small JSON batch/mapping schemas; reuses `parseDirectorPlan()` for plan content. |
| [Remotion](https://github.com/remotion-dev/remotion) | 4.0.546, [source-available Remotion License](https://github.com/remotion-dev/remotion/blob/v4.0.546/LICENSE.md) | New trusted source resolver feeds the existing bundler, frame renderer, `DirectorComposition`, and external LGPL encoder; no second composition, package or rendering backend. |

License files were retrieved from those projects; exact dependency versions were checked against the installed packages. No repository was cloned and no installer was run. Commercial Remotion use and the ShotWeft project license remain undecided. Local engineering acceptance is not distribution approval.
