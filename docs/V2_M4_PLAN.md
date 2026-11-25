# V2 M4 — Animated Components, Morph and Narration Quality (Reuse-First Plan)

Status: **plan only**, prepared after the CLI M1 quality rejection ([investigation](CLI_M1_QUALITY_INVESTIGATION.md)). No M4 code has been written. CLI M0/M1 behaviour and the existing V2 M0–M3 work must remain intact.

## 1. Objective

Turn the Director renderer from a static slide renderer into a frame-deterministic motion system, and make narration quality and sync measurable, without replacing the existing architecture: `DirectorPlan` → `DirectorComposition` → Remotion frames → external LGPL FFmpeg → FFprobe.

M4 is complete only when an automated review gate and a recorded human review both pass on a **new** demo. FFprobe, schema validation, decode and exit code `0` remain necessary, never sufficient.

## 2. Non-goals

- No presenter/matting work (M3), no M5 asset/audio workbench, no M6 review UI.
- No new rendering engine, no ZIP-native Remotion, no bundled binaries, no cloud service, no paid API.
- No web-app redesign; the Player/Studio keep working with plans that omit the new optional fields.

## 3. Reuse map (verified in this repository/workstation)

| Upstream | Verified version / commit | License | Reusable modules | Integration risk |
| --- | --- | --- | --- | --- |
| [degueba/onda](https://github.com/degueba/onda) | `3c814051269597b31fee1603bef7ccfb93d091b6` (main, 2026-06-17); 70 components / 18 transitions | MIT (verified `LICENSE`) | Source-installed Remotion 4 components and transitions: `fade-in/out`, `count-up`, `ken-burns`, `bar-chart`, `line-chart`, `captions`, `word-stagger`, `typewriter`, `title-card`, `chapter-card`, `stat-card`, `quote-card`, `lower-third`, `morph`, `expand-morph`, `cross-fade`, `wipe`; `registry/lib/{motion,choreography,easing,timing,canvas,random}` | Registry files assume `@remotion/transitions`, `@remotion/paths`, `@remotion/media-utils`, `@remotion/motion-blur` (not installed). Young project (33 stars) — review every adopted file, copy only what is used, keep MIT notices, never run its CLI against user projects. |
| [Remotion](https://github.com/remotion-dev/remotion) | `4.0.546` (installed, existing) | Source-available, non-OSI | `interpolate`, `spring`, `Sequence`, `TransitionSeries`, `AbsoluteFill` | Commercial/distribution decision still open. Adding `@remotion/transitions` must be evaluated against the same terms. |
| [Motion](https://github.com/motiondivision/motion) | `12.43.0` (installed as `motion`/`framer-motion`) | MIT | Spring/easing presets, layout primitives for **Studio/Player UI only** | Motion animates on wall-clock time and is **not frame-deterministic**; must not drive MP4 frames. Render path keeps Remotion `useCurrentFrame` + `interpolate`/`spring`. |
| [veltman/flubber](https://github.com/veltman/flubber) | not installed; pin at adoption | MIT | `interpolate(fromPath, toPath)` for SVG path/shape morphs, sampled per frame | Extra dependency and bundle size; malformed/complex paths throw; only for vector/icon morphs, not text or images. |
| [d3/d3-geo](https://github.com/d3/d3-geo) | not installed; pin at adoption | ISC | `geoPath`, `geoMercator`/`geoAlbers` projections for map scenes | Projection choice is editorial; adds bundle weight; must be sampled from the frame, never animated by CSS. |
| [HeyChengC/wallstreet-explainer](https://github.com/HeyChengC/wallstreet-explainer) | `b79bc0573455cb5fe335e78f653012e658fa9758` | MIT (third-party example media excluded) | Measurement ideas and thresholds from `scripts/motion_check.py` (still ratio, holds > 2 s/min, camera coverage, layer parallax, cut rate) and scene grammar from `kit/scenes.js` | Reference only. Its HTML/Canvas string templating and Python/OpenCV pipeline are **not** portable into this TypeScript/React renderer; do not port code, do not copy media. |
| [FFmpeg](https://github.com/FFmpeg/FFmpeg) | local `n8.1.3-39-g660b5aa7db-20261123`, LGPL build | LGPL | `freezedetect`, `silencedetect`, `select`/`scene`, `signalstats`, `astats`, decode for correlation | Thresholds need calibration; FFmpeg reports frames, not aesthetics. External binary only, never bundled. |
| [zod](https://github.com/colinhacks/zod) | `4.6.7` (installed) | MIT | Strict additive schema for animation fields | Schema growth must stay backward compatible and within existing 16 MiB plan limits. |
| [@zip.js/zip.js](https://github.com/gildas-lormeau/zip.js) | `2.25.0` (installed) | BSD-3-Clause | No change; ZIP v3 stays authoritative | No new archive fields required for M4. |

Licenses were read from the repositories at the pinned commits/files. Hugging Face, PyPI and the npm registry were unreachable from this workstation during the investigation, so third-party **model** licenses below are marked unverified and must be re-checked (hash + model card + commercial clause) before any weight is downloaded.

## 4. Frame-deterministic animation model

Additive, optional fields on `VisualElement` (absent = today's static behaviour, so existing plans and ZIPs render unchanged):

```ts
animation?: {
  enter?: { preset?: 'fade'|'rise'|'blur'|'scale'|'wipe'|'typewriter'; delayFrames?: number;
            durationFrames?: number; easing?: 'linear'|'easeOut'|'springSmooth'|'springSnappy' }
  exit?:  { preset?: 'fade'|'drop'|'scale'|'wipe'; durationFrames?: number; easing?: ... }
  keyframes?: { frame: number; opacity?: number; x?: number; y?: number; scale?: number; rotation?: number }[] // ≤ 20
  stagger?: { unit: 'char'|'word'|'element'; frames: number }                    // text reveals
}
camera?: { from: { scale: number; x: number; y: number }; to: { ... }; easing?: ... }  // Ken Burns
```

Rules:

1. All values derive from `useCurrentFrame()`; no `Date.now()`, `performance.now()`, CSS transitions/animations, `requestAnimationFrame`, or unseeded `Math.random()`. Any randomness uses a seeded PRNG stored in the plan (`seed`), so identical input renders identical frames.
2. Springs use Remotion `spring({ frame, fps, config })`; every preset is a fixed config so frame N is identical on every machine.
3. `keyframes` are sorted, bounded, clamped and validated at parse time; overlapping shots keep the existing half-open frame rules.
4. Multi-element Morph: extend `transition` to `sharedElementIds: string[]` (keeping `sharedElementId` for compatibility) and allow cross-kind pairs only where interpolation is defined (text↔text, image↔image, box↔box); text changes cross-fade rather than interpolate glyphs.
5. The compiler records each animated element's frame window so tests can assert exact values at entry, mid, exit and beyond.

## 5. Component plan (reuse first)

Build only what the demo needs, as plain components under `src/director/components/`, mirroring Onda APIs rather than copying its tree:

| Component | Reuse | Notes |
| --- | --- | --- |
| `TitleCard` | Onda `title-card`/`chapter-card` choreography | headline + optional kicker; no duplicated caption text |
| `StatCounter` | Onda `count-up` | spring-driven count, tabular numerals, locale-safe |
| `BarChart` / `LineChart` | Onda `bar-chart`/`line-chart` | deterministic per-frame growth; replace static `ChartScene` bars |
| `KenBurnsImage` | Onda `ken-burns` | fixes the letterboxed `contain` thumbnail; `cover` + slow drift by default |
| `QuoteCard` | existing `QuoteScene` + Onda `quote-card` | keep current semantics |
| `CaptionTrack` | Onda `captions`/`word-stagger` | strips Markdown, wraps by measured width, word-level highlight from alignment |
| `MorphGroup` | existing `morph.ts` + `@remotion/transitions` | multi-element; flubber only for vector shapes |
| `MapScene` (deferred) | `d3-geo` | only if a demo needs geography |

Text layout: add measured autofit (wrap to box, reduce font size to a floor, hard cap at 3 lines) instead of `overflow: hidden`. Prefer `@remotion/layout-utils` if its license review passes; otherwise measure with an offscreen canvas in the browser bundle.

## 6. Narration and caption quality

Priorities: correct, intelligible Chinese narration; captions synchronized to actual speech.

1. **Human narration stays the acceptance source.** TTS is an optional authoring aid, always labelled by `narration.origin` (`imported|tts|synthetic|unknown`) and never described as human.
2. **Measure, never estimate, segment timing.** Run the M3 alignment path (or an explicit `segmentStarts` map) to place script segments on real speech; `narration.timing: "actual"` must only be set when boundaries come from measurement. Character-proportional timing must be labelled `estimated` (this alone would have caught the delivered fixture).
3. **Gate caption drift.** Compute per-segment drift between caption spans and measured speech activity; fail above 150 ms; warn above 80 ms.
4. **Strip Markdown** for captions/headlines from a normalized view while keeping `originalScript` byte-verbatim.
5. **Local Chinese TTS shortlist** (no models installed or downloaded in this task):

| Candidate | Code license | Weights | Fit | Verdict |
| --- | --- | --- | --- | --- |
| [Kokoro-82M](https://github.com/hexgrad/kokoro) (Apache-2.0 repo, `main`; 82M params) | Apache-2.0 (verified `LICENSE`) | Model card reports Apache-2.0; **unverified here** (Hugging Face unreachable) | Small ONNX/PyTorch, CPU real-time, dedicated Chinese voices + `misaki[zh]` G2P | **Primary candidate**; verify weight hash/license before use |
| [MeloTTS](https://github.com/myshell-ai/MeloTTS) (MIT repo, `main`) | MIT (verified) | Unverified | Chinese+English mix, CPU-friendly | **Fallback candidate** |
| [CosyVoice](https://github.com/FunAudioLLM/CosyVoice) (Apache-2.0 repo, `main`) | Apache-2.0 (verified `LICENSE`) | Unverified | Higher quality, larger/faster GPU preference | Fallback if CPU budget allows |
| [Piper](https://github.com/rhasspy/piper) (MIT code) | MIT (verified `LICENSE.md`) | **Per-voice licenses**; Chinese voice cards not retrievable here | Lightweight ONNX runtime | **Conditional**: only with a commercially licensed Chinese voice |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) (Apache-2.0) | Apache-2.0 (verified) | Per-model | ONNX runtime for VITS/Matcha models | Conditional on model license |
| [Matcha-TTS](https://github.com/shivammehta25/Matcha-TTS) | MIT (verified) | Unverified | Fast small model | Conditional on Chinese weights |
| IndexTTS | custom “bilibili Model Use License Agreement” | — | — | **Excluded** (non-standard terms) |
| edge-tts / cloud TTS | — | — | — | **Excluded** (online service, not local) |
| ChatTTS / F5-TTS / Fish Speech | code permissive | Non-commercial weights | — | **Excluded** for commercial use |

6. **ASR is optional** and used only to review intelligibility (e.g. CER against the script). No model is downloaded in M4 planning; if unavailable, the gate records “human listening required” and the demo cannot claim acceptance.

## 7. Automated review gate (first implementation step)

A new `scripts/review-video.mjs` (Node, existing LGPL FFmpeg/FFprobe, no new dependency) produces one JSON report and a non-zero exit when thresholds fail:

| Check | Metric | Pass condition |
| --- | --- | --- |
| Frozen time | `freezedetect=n=-50dB:d=0.5` | ≤ 30% of duration |
| Long holds | frozen intervals > 2 s | ≤ 1 per minute; no hold > 2.5 s |
| Cuts and pacing | inter-frame luma delta > 5 | 12–35 cuts/min; p75 shot ≤ 4 s |
| Per-shot motion | frozen time inside each shot | no shot 100% frozen |
| Audio integrity | correlation vs source, peak, clipped samples | ≥ 0.98, ≤ 95% FS, no truncation |
| Caption sync | drift vs measured speech | ≤ 150 ms per segment |
| Streams | existing FFprobe profile | unchanged |
| Human review | watched 100%, listened 100% | recorded in the report, separate from automated status |

The gate is wired into `npm run test:cli-m1` for the new demo and into the agent report as `quality` fields. The current artifact must **fail** this gate — that is the regression test for the gate itself.

## 8. Implementation order

1. **M4.0 — Quality gate and baseline (no product code).** Implement `review-video`; run on the rejected CLI M1 MP4 and on `demos/m2/m2-demo.mp4`; record both failures. Tests: synthetic static MP4 fails, synthetic animated MP4 passes, thresholds are deterministic.
2. **M4.1 — Animation schema (additive).** Extend `visualElementSchema`/`transitionSchema`, keep strictness and limits; compiler exposes per-frame windows; plans without the new fields produce byte-identical frames to today. Tests: 20+ rejection cases, backward-compat frame hashes.
3. **M4.2 — Frame-deterministic primitives.** `animate(element, frame)` with enter/exit/keyframes, easing/spring presets, seeded randomness; render the same frame twice and compare PNG hashes; verify frame windows at boundaries.
4. **M4.3 — Components.** Title, stat/count-up, bar/line chart, Ken Burns image, quote, captions with word highlight. Each: unit test + rendered frame assertions + contact sheet.
5. **M4.4 — Multi-element Morph and transitions.** `sharedElementIds`, text cross-fade, `TransitionSeries` adoption; flubber for vector shapes; morph must stay perceptible for its full declared duration.
6. **M4.5 — Narration and captions.** Measured segment alignment, drift gate, Markdown-safe captions, normalized text view; optional TTS adapter behind an explicit flag and provenance, offline only.
7. **M4.6 — New demo and review.** 60–90 s, new (not the rejected excerpt), 16:9 plus a 9:16 short, real image/video, ≥ 2 multi-element morphs, human narration if authorized (otherwise clearly labelled TTS), passing review gate and a recorded human pass. CLI M1 commands (`asset import`, `director import-plan`, `director attach-narration`, `director render`) remain the production path; the demo is produced through them.

Each step ends with the existing gates (`check`, `build`, `test`, `test:remotion`, `test:video-render`, `test:package`, `test:project-archive-transaction`, `test:cli-m1`) plus the new review gate. Skipped checks are reported as skipped.

## 9. Risks and open decisions

- **Remotion licensing** (non-OSI) still blocks distribution/commercial claims; `@remotion/transitions` inherits it.
- **Onda maturity and peer dependencies**: small project, source-installed registry; adopting files without their lib modules is the main breakage risk.
- **Determinism regressions** from third-party components that use time or unseeded randomness; every adopted component needs a two-run frame-hash test.
- **Schema growth** must not break V2 M2/M3 plans or ZIP v3; new fields stay optional and validated.
- **TTS model licenses** (weights, training data, commercial use) are unverified; Hugging Face/PyPI/npm were unreachable during this investigation. No weight may be adopted without a pinned hash and license re-check.
- **ASR absent**: intelligibility cannot be certified automatically today; the report must say so rather than claim quality.
- **Performance**: per-frame text measurement and extra components increase bundle/render cost; measure at 720p/1080p before promising long timelines.