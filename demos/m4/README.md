# M4 Animation Components Demo

Engineering demonstration of the M4 component registry rendered through the existing CLI. It is **not** production acceptance; the operator reviews the pilot separately (M4.7).

## Files

- `plan.json` — 8-shot, 21.6 s, 1280×720, 30 fps component reel (title, chapter, bullets, drawn path, Ken Burns image, timeline, count-up stat, animated map) with two multi-element morphs.
- `project.zip` — authoritative ZIP-native project (plan embedded in `project.direction`, one linked image asset).
- `demo.mp4` — render produced by `director render` from the ZIP.
- `map-portrait.json`, `map-portrait.zip`, `map-portrait.mp4` — 9:16 map/route variant (720×1280, 8 s).
- `media/coast.jpg` — byte-identical copy of `demos/m2/media/coast.jpg` (Pexels License, see [media sources](../../docs/MEDIA_SOURCES.md)).
- `contact-sheet.jpg`, `map-contact-sheet.jpg` — sampled frames.
- Default review thresholds; `quality-portrait.json` disables the cut-rate check for the single continuous 9:16 map shot.

## Component coverage

| Component | Shot | Motion |
| --- | --- | --- |
| `title` | 1 | blur-in, fade-out |
| `chapter` | 2 | spring rise with number rule |
| `bullets` | 3 | staggered item rise |
| `path` | 4 | SVG draw-on + slow scale keyframes |
| image `camera` | 5 | Ken Burns pan/zoom |
| element morph | 4→5, 5→6 | multi-element geometry interpolation (`morph-title`, `morph-bar`) |
| `timeline` | 6 | axis draw + staggered milestones |
| `stat` | 7 | spring count-up + keyframed pulse |
| `map` | 8 | d3-geo projection, sequential trade-route draw-on, city markers, land polygons, slow zoom |

## Verification

- `director validate` and `director show-project` pass. Rendering left both ZIP revisions byte-identical (demo `778223…`, portrait `fef713…`).
- Independent FFprobe: 1280×720, 30 fps, 648 frames, 21.6 s, H.264/yuv420p + 48 kHz stereo AAC-LC.
- Automated review (`npm run review:video`): frozen ratio **27.8%** (limit 30%), longest hold **1.033 s** (limit 2.5 s), zero holds > 2 s, **8.3 cuts/min**, no clipped audio samples.
- Two independent renders of the same plan are frame-identical (`framemd5`), proving frame determinism.
- Frames inspected visually: contact sheet.

## Honest limitations

- Audio is digital silence (no narration). The native FFmpeg AAC encoder emits a ~1 ms start transient when encoding silence (peak ≈ −0.2 dBFS, no clipping); the review reports it as a warning. This demo makes no speech or narration claim.
- The map uses Natural Earth 110 m land polygons (public domain) simplified to 117 polygons/2,162 points; it is a schematic teaching map, not a geodetic basemap.
- The 9:16 variant exercises the same components but has no narration or captions.
- M4.7 production acceptance (30 s Silk Roads pilot with operator media) is pending operator input; nothing was fabricated to stand in for it.

## Reproduction

```bash
node dist/cli/shotweft.js project create demos/m4/project.zip --title 'M4 component reel'
# asset import → director import-plan → director render (see docs/V2_M4_PLAN.md)
npm run review:video -- demos/m4/demo.mp4 --json .tmp/m4-review.json
```
