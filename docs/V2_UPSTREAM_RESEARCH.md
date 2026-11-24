# V2 Upstream Research

Researched 2026-11-24 using the extracted wallstreet source, primary upstream README/license files, npm metadata, PyPI metadata and the actual local tool binaries. Raw responses and tool checks stay in `.tmp/v2/research/` and `.tmp/v2/logs/`. Integration costs below are engineering estimates, not measured benchmarks. Python tools were researched, not installed or executed.

## Provenance and decisions

| Upstream / verified pin | License and primary URLs | Reusable capability | Integration cost and platform constraints |
| --- | --- | --- | --- |
| wallstreet-explainer: package `1.0.0`, archive commit `b79bc0573455cb5fe335e78f653012e658fa9758` | [Repository](https://github.com/HeyChengC/wallstreet-explainer), [pinned MIT license](https://github.com/HeyChengC/wallstreet-explainer/blob/b79bc0573455cb5fe335e78f653012e658fa9758/LICENSE). License explicitly excludes third-party examples media. | Shot-purpose/rationale discipline, word cue anchors, presenter paragraph boundaries, shared-object continuity, deterministic seek rendering, review contact sheets and synthetic SFX. | Medium/high to port ideas to strict React/data contracts. Existing implementation uses HTML/Canvas/JS, Playwright screenshots and external FFmpeg, with Python preprocessing; it is not a Remotion app. Fonts and model weights need separate acquisition/rights checks. Network helpers (`yt-dlp`, news screenshots, edge-tts) are outside M1. |
| Remotion and direct `@remotion/{player,renderer,bundler,cli}`: exact `4.0.546`, verified npm registry and lockfile | Proprietary **source-available, non-OSI** Remotion License. [Pinned source license](https://github.com/remotion-dev/remotion/blob/v4.0.546/LICENSE.md), [terms](https://www.remotion.dev/docs/license), installed `node_modules/remotion/LICENSE.md`. | React frame APIs, shared Player/renderer composition, Studio, dynamic metadata, local Chromium frame capture. [Player](https://www.remotion.dev/docs/player), [renderFrames](https://www.remotion.dev/docs/renderer/render-frames), [bundler](https://www.remotion.dev/docs/bundler). | Medium for the bounded M1; high for full V1 timeline parity. Node and existing Chromium required; frame capture consumes disk/CPU. Linux/WSL validated here; native Windows/macOS unverified. Eligibility and commercial/embedded/distribution terms need a separate decision. No cloud services or license telemetry package is invoked by ShotWeft. |
| faster-whisper `1.2.1` (verified [PyPI metadata](https://pypi.org/pypi/faster-whisper/1.2.1/json)); commit unknown | MIT: [repository and README](https://github.com/SYSTRAN/faster-whisper), [license](https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE). Models/dependencies must be assessed separately. | CTranslate2 ASR, word timestamps, VAD, batched transcription and quantized CPU/GPU inference. | Medium Python worker/CLI integration; not a browser TS dependency. Python ≥3.9; GPU path requires compatible NVIDIA CUDA/cuDNN/CTranslate2. CPU int8 is available. PyAV handles decoding and bundles FFmpeg libraries that need their own build-license audit; model downloads/cache, subprocess limits, word-to-frame conversion and user consent remain future work. |
| WhisperX `3.8.6` (verified [PyPI metadata](https://pypi.org/pypi/whisperx/3.8.6/json)); commit unknown | **BSD-2-Clause** in the currently verified [license](https://github.com/m-bain/whisperX/blob/main/LICENSE), [README](https://github.com/m-bain/whisperX). Do not assume the project's historical MIT descriptions apply to this snapshot. | ASR plus language-dependent forced alignment and optional speaker diarization. | High: Python ≥3.10,<3.14, PyTorch/model runtimes, optional CUDA and substantial memory. Diarization can require a Hugging Face token and acceptance of separate model terms. Not suitable as a mandatory offline dependency without cached models and a capability preflight. No tokens/models fetched in M1. |
| rembg `2.0.87` (verified [PyPI metadata](https://pypi.org/pypi/rembg/2.0.87/json)); commit unknown | MIT code: [repository](https://github.com/danielgatis/rembg), [license](https://github.com/danielgatis/rembg/blob/main/LICENSE.txt). Each background-removal model has separate provenance/terms. | ONNX-based image background removal, CPU/GPU sessions, reusable alpha mattes. | Medium for still cutouts, high for stable presenter video mattes. Python ≥3.11,<4, ONNX Runtime; GPU needs compatible runtime/drivers. Frame-by-frame removal needs temporal cleanup, premultiplication/despill, model caching and performance measurement. No model download or integration here. |
| PySceneDetect `0.7.3` (verified [PyPI metadata](https://pypi.org/pypi/scenedetect/0.7.3/json) and [official site](https://www.scenedetect.com/)); commit unknown | BSD-3-Clause: [source/license](https://github.com/Breakthrough/PySceneDetect/blob/main/LICENSE). Bundled Windows/Docker media tools have separate licenses. | Content/adaptive/fade scene detection, frame metrics and scene lists for candidate local footage segmentation. | Medium Python/OpenCV or alternative decoding integration. Python ≥3.10. Splitting requires separate FFmpeg/mkvmerge; avoid bundled executables until audited. Detection is not semantic asset matching and must map source timebases to plan frames. |
| wavesurfer.js `8.1.0` (verified npm metadata; not installed); commit unknown | BSD-3-Clause: [repository/license](https://github.com/katspaugh/wavesurfer.js/blob/main/LICENSE), [official API](https://wavesurfer.xyz/). | Interactive waveform, regions and audio seek controls; precomputed peaks could replace P5's placeholder. | Low/medium UI work; browser-only decode, CORS for remote media, memory limits for large audio and browser codec support. Must synchronize with the existing frame clock. It does not transcribe, mix final audio or render MP4. |
| FFmpeg local `n8.1.3-39-g660b5aa7db-20261123`, source short commit `660b5aa7db` reported by executable; full commit unknown | Actual supplied build reports LGPL-3.0-or-later, with no `--enable-gpl` / `--enable-nonfree`. [License/build rules](https://ffmpeg.org/legal.html), [filters](https://ffmpeg.org/ffmpeg-filters.html), [ffprobe](https://ffmpeg.org/ffprobe.html). | Existing V1.6 decoding/mixing/encoding, image-sequence encoding, H.264 through `libopenh264`, stereo 48 kHz AAC, output verification. | Low incremental M1 cost by reusing preflight and verifier. External user-installed binary only; build configuration and codec patents/distribution require separate review. Supplied Linux build is validated; no binaries/libraries are added to the tarball. |

Remotion 4.0.546's locally installed `@remotion/compositor-linux-x64-gnu/ffmpeg -version` reports `--enable-gpl` and `libx264`; this is distinct from the supplied LGPL build. ShotWeft's M1 adapter therefore uses **Remotion `renderFrames()` → PNG sequence → validated external LGPL FFmpeg (`libopenh264` + native AAC)**. It does not call Remotion `renderMedia()` or use the bundled FFmpeg to encode. PNG capture uses the existing browser. Remotion development packages, their installed native tools and local browser caches are excluded from the CLI tarball; the source-checkout workflow is for local validation only. The web build contains the Player runtime and is also an evaluation artifact, not an approved distribution. Studio is a development preview, not a license bypass.

GitHub API commit/release discovery returned HTTP 403 rate limits during this run. Unresolved Python/wavesurfer commit hashes are deliberately **unknown**; the verified package versions above are research pins, not invented installed dependencies or a claim that source branch tips equal those releases. README/license branch snapshots describe currently observed capabilities/terms; a later integration must audit the exact downloaded artifact and model licenses again.

## wallstreet source inspection

The extracted tree is `.tmp/v2-upstream/wallstreet-explainer`. Its codeload archive global PAX `comment` records the full commit above; archive SHA-256 is `043cbdaf3f5bedca92ec7a671fae3e1f24776a3019a56624f2afbdde8a137d34`. `package.json` declares private version 1.0.0, MIT, and Playwright `^1.58.2` (a range, not a verified installed version).

Inspected implementation paths and implications:

- `scripts/render.mjs`: local HTTP/Playwright deterministic `window.seek(t)` capture, still/check paths, stale script/timeline checks, worker rendering and FFmpeg encoding. Its filesystem server and executable authoring model are references; ShotWeft does not import or execute its film JavaScript from plan data.
- `scripts/timeline_stub.mjs`: Chinese/English/digit/punctuation timing heuristics and `stub: true` distinction from audio-aligned timing. Cue expressions refer to script IDs/words. Estimated timing is not ASR or forced alignment.
- `kit/kit.js`, `kit/scenes.js`, `scripts/moves.js` and `references/motion.md`: persistent focal objects and transitions motivated by the idea being explained. M1 independently implements a persistent keyed React element with geometric interpolation; no kit code is copied.
- `kit/host.js`, `scripts/host_timeline.py`, `references/presenter.md`: presenter windows change at paragraph boundaries, avoid repeated rapid layout changes, respect original media fps. These inform later presenter planning, not a delivered M1 pipeline.
- `scripts/matte.py`, `matte_clean.py`, `matte_despill.py`: foreground extraction and cleanup; `scripts/mix.py`, `sfx_synth.py`, `references/audio.md`: audio assembly and generated effects; `references/review.md`, `motion_check.py`, `strip.py`, `sheet.py`: frame/contact-sheet/motion review ideas. No claim these utilities are installed or validated inside ShotWeft.
- `requirements.txt` includes network-oriented edge-tts and yt-dlp plus NumPy/OpenCV/Pillow and optional faster-whisper/ONNX/rembg. They are not M1 dependencies. Example presenters can be digital humans; ShotWeft's fixture contains only mathematical tones and original graphics.

## wallstreet MIT notice and media exclusion

The inspected license is **MIT License**, copyright **2026 wallstreet-explainer contributors**. It permits reuse/modification/distribution of covered software while requiring the copyright and permission notice in substantial copies, with the standard warranty disclaimer. The complete authoritative notice is retained in the extracted `LICENSE` and linked at the pinned commit above. No covered upstream source was vendored in M1.

The license explicitly excludes third-party video frames, news screenshots, logos and photos in `examples/`; those retain their owners' rights. It points to `examples/ai-burn-money/CREDITS.md`. That credit file is evidence of provenance, not a blanket reuse grant. **No examples media, presenter footage, fonts or third-party screenshots are copied into ShotWeft or its package.** New product fixtures are original React graphics and a reproducibly synthesized PCM WAV.

This branch makes no open-source release, redistribution, commercial license or model-weight clearance decision. M2–M6 research conclusions are candidates only.

The full inspected license notice follows (including its explicit exclusion):

```text
MIT License

Copyright (c) 2026 wallstreet-explainer contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---
Third-party materials shown in examples/ (video frames, news screenshots,
logos, photos) are NOT covered by this license and remain the property of
their respective owners. See examples/ai-burn-money/CREDITS.md.
```
