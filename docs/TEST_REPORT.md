# Test Reports

## V2 M3 · Presenter engineering preview

The focused tests cover transcript JSON/SRT/VTT import, repeated-word alignment, manual corrections, caption round-trips, layout and voice invariants, and CLI errors. The render test decodes full, PiP, split and B-roll MP4 frames, checks one attenuated voice and muted B-roll, and exercises the same presenter layer in the browser Player. The M2 subtitle regression verifies that exported script captions omit blank paragraph separators at the cue boundary without changing script text or frame timing.

Two initial browser harness runs decoded the MP4 but timed out in the Vite dev-server Player. The harness now serves a static production bundle so the test does not depend on dev-server module optimization or reloads.

The [synthetic MP4](../demos/m3/m3-synthetic.mp4) independently probed at 640×360, 30/1 fps, 693 frames, 23.100 seconds, H.264/yuv420p and one 48 kHz stereo AAC-LC stream. It uses SAPI speech, interpolated timings and cuts. It is not evidence of live ASR, real-person sync or a 60+ second human acceptance render. See the [agent report](agent-reports/latest.md) for exact commands and exit codes.

## V2 M2 · Script workflow, project persistence and real media

Environment: Linux/WSL2, Node.js 22.23.5, Playwright 1.65.1 with the existing `.browsers` Chromium, Remotion 4.0.546 and the supplied LGPL FFmpeg/ffprobe `n8.1.3-39-g660b5aa7db-20261123`. Package remains `1.5.0`. Raw logs and exit files are under `.tmp/v2-m2`, `.tmp/m2.2a`, `.tmp/m2.2b`; the real M2 artifact is in `demos/m2/`.

```bash
npm run check
npm run build
npm run test:director-m2
npm run test:director-project
npm run test:director-workspace
FFMPEG_PATH="$PWD/.tmp/ffmpeg-lgpl/ffmpeg-n8.1-latest-linux64-lgpl-8.1/bin/ffmpeg" FFPROBE_PATH="$PWD/.tmp/ffmpeg-lgpl/ffmpeg-n8.1-latest-linux64-lgpl-8.1/bin/ffprobe" PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" SHOTWEFT_REQUIRE_PDF=1 npm test
FFMPEG_PATH="$PWD/.tmp/ffmpeg-lgpl/ffmpeg-n8.1-latest-linux64-lgpl-8.1/bin/ffmpeg" FFPROBE_PATH="$PWD/.tmp/ffmpeg-lgpl/ffmpeg-n8.1-latest-linux64-lgpl-8.1/bin/ffprobe" PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npm run test:remotion
FFMPEG_PATH="$PWD/.tmp/ffmpeg-lgpl/ffmpeg-n8.1-latest-linux64-lgpl-8.1/bin/ffmpeg" FFPROBE_PATH="$PWD/.tmp/ffmpeg-lgpl/ffmpeg-n8.1-latest-linux64-lgpl-8.1/bin/ffprobe" npm run test:video-render
PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" SHOTWEFT_REQUIRE_PDF=1 npm run test:package
```

| Command | Exit | Actual result |
| --- | ---: | --- |
| `npm run check` | 0 | TypeScript passes. |
| `npm run build` | 0 | Browser, CLI and PDF builds pass. |
| `npm run test:director-m2` | 0 | 6 groups: fidelity/offsets, deterministic 60s+ planner, regeneration/locks, media compiler, M1 compatibility, CLI contracts. |
| `npm run test:director-project` | 0 | 6 groups: v1/v2 compatibility, undo/redo, remap, ZIP v3, audio reflow, missing media. |
| `npm run test:director-workspace` | 0 | 6 groups: script generation, shot seek/edit/undo, lock/regenerate, media mapping, narration reflow/persistence, 390 px/editor exclusivity/URL cleanup. |
| `npm test` | 0 | 45 legacy groups passed; no groups skipped. |
| `npm run test:remotion` | 0 | 11 groups; includes real image layer, trimmed video layer, overlay, explicit audio and muted B-roll. |
| `npm run test:video-render` | 0 | 4 legacy render groups. |
| `npm run test:package` | 0 | 5 groups; 16-entry tarball, installed CLI, 3-page PDF 454,411 bytes, uninstall. |

### M2 artifact

`demos/m2/m2-demo.mp4` is a real Remotion/LGPL FFmpeg output: 1280×720, 30/1 fps, 2,509 frames, 83.633 s, H.264 yuv420p, AAC-LC stereo 48 kHz, faststart. The plan has 11 shots, title/image/chart/graphic scenes, one B-roll video layer, captions and one shared `海岸线` morph. `demos/m2/project.zip` is a ZIP v3 editable project with five linked assets and round-tripped in the focused project suite. `demos/m2/contact-sheet.jpg` was visually inspected.

**The narration is synthetic Windows SAPI speech (Microsoft Huihui), not a human recording.** It is not reported as human-voice acceptance. No real presenter or ASR model was available. The demo uses only local images/video and no wallstreet-explainer example media.

At the M2 checkpoint, M3 was not implemented. See the M3 engineering preview above for subsequent evidence. Native Windows/macOS Remotion render, real fractional-fps MP4, long-timeline performance, matting and M4–M6 remain open. No release, tag change, npm publication or main modification was performed.

## V2 M0/M1 · DirectorPlan and Remotion local validation

Environment: Linux/WSL2, Node.js 22.23.5, Playwright 1.65.1 with the existing local Chromium installation, Remotion 4.0.546, and the supplied LGPL FFmpeg/ffprobe `n8.1.3-39-g660b5aa7db-20261123`. Package remains `1.5.0`. Raw logs, real exit files, fixture outputs, probe JSON and report input are retained under `.tmp/v2/` and `.tmp/agent-report-input.json`.

```bash
npm run check
npm run build
ffmpeg_bin="$PWD/.tmp/ffmpeg-lgpl/ffmpeg-n8.1-latest-linux64-lgpl-8.1/bin"
FFMPEG_PATH="$ffmpeg_bin/ffmpeg" FFPROBE_PATH="$ffmpeg_bin/ffprobe" \
  PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" SHOTWEFT_REQUIRE_PDF=1 npm test
FFMPEG_PATH="$ffmpeg_bin/ffmpeg" FFPROBE_PATH="$ffmpeg_bin/ffprobe" npm run test:video-render
PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" SHOTWEFT_REQUIRE_PDF=1 npm run test:package
FFMPEG_PATH="$ffmpeg_bin/ffmpeg" FFPROBE_PATH="$ffmpeg_bin/ffprobe" \
  PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npm run test:remotion
python /home/VOLTA/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/shotweft
npm run report:agent -- --no-commit
```

| Command | Exit | Actual result |
| --- | ---: | --- |
| `npm run check` | 0 | Strict TypeScript includes the new `remotion/` entry/root. |
| `npm run build` | 0 | Browser, CLI and PDF renderer built. Existing third-party Rollup annotation/chunk warnings remain informational. |
| `npm test` with required PDF and LGPL tool environment | 0 | All 45 V1.0/V1.5/V1.6/P5 groups passed. No groups skipped. |
| `npm run test:video-render` with LGPL tools | 0 | Four legacy render groups passed, including audio-only and mixed sources. |
| `npm run test:package` with required PDF | 0 | Isolated install, 16-entry tarball scan, installed CLI, real 3-page PDF (454,411 bytes), and uninstall passed. |
| `npm run test:remotion` with LGPL tools and existing browser | 0 | Eight PASS groups; no skipped checks. |
| Skill validator | 0 | ShotWeft skill frontmatter and structure valid. |
| Local Studio browser check | 0 | Registered composition loaded in existing Chromium with no browser errors. The long-running Studio server was then deliberately stopped (130). |
| `npm run report:agent -- --no-commit` | 0 | English JSON/Markdown latest and UTC archive written; no commit or push performed. |

The focused suite exercises 32 strict-schema rejection cases plus cue-anchor boundary/Unicode cases, exact three-scene coverage, 16:9/9:16 metadata and rational 30000/1001 data/compilation. It checks shared-element identity keys, interpolation endpoints/midpoints for both morphs, real Player mounting and seeks, local audio readiness, modal audio cleanup, the native timeline and 390 px layout. CLI checks verify single-line JSON and exit codes 0/1/2; the separate CLI render smoke test also ran with stdin closed. Existing outputs and output symlinks are refused; failed browser/asset/source-range checks publish no MP4, remove staging and leave source bytes intact.

| Real Remotion frame render + LGPL encode | Resolution | FPS | Frames | H.264 duration | AAC duration |
| --- | ---: | ---: | ---: | ---: | ---: |
| Three-scene landscape | 640×360 | 30/1 | 180 | 6.000 s | 6.000 s |
| Three-scene portrait | 360×640 | 30/1 | 180 | 6.000 s | 6.000 s |

Both actual MP4s contain yuv420p H.264 and stereo 48 kHz AAC-LC. Independent ffprobe JSON is retained at `.tmp/v2/remotion-tests/{landscape,portrait}-ffprobe.json`, with MP4s alongside it and the combined `render-evidence.json`. Decoded pixel samples confirm the shared gold element at frames 42/51/60; decoded audio confirms the synthesized 220/330/440 Hz tones at separate windows. Representative decoded morph frames were visually inspected. A separate first CLI smoke render also succeeded with the same 640×360 / 180-frame / 6-second profile. The synthetic WAV is locally generated math, explicitly not human voice.

An initial focused run exited 1 because a test selector matched Remotion's pooled audio elements as well as the fixture; narrowing the selector fixed the test. A public-JSON import warning was removed by loading the editable plan with a local fetch. The second focused run exited 0. An early standalone legacy render run exited 1 because it overlapped a build replacing `dist/cli/shotweft.js`; its rerun after the build exited 0. The first full regression attempt also exited 1 because its CLI help expectation listed only the old commands. The expectation now includes both new commands and parses hyphenated action names; the sequential full-suite rerun passed all 45 groups with exit 0. A concurrent rerun also exited 1 on a filesystem-backed Blob read during legacy PDF export, and the supplemental CLI diagnostic ended with SIGKILL. A separate legacy PDF export then exited 0. The existing suites share fixed `.tmp/phase3-*` fixtures, so final acceptance ran alone; the concurrent diagnostics are not counted as passes. These failures remain in the raw logs and are not represented as passed attempts.

Remotion is source-available/non-OSI. This branch, Studio and the Player web build are **local evaluation only**, not an approved distribution/commercial-license decision. Remotion's installed compositor FFmpeg reports GPL configuration; the adapter instead calls `renderFrames()` and encodes/mixes with the supplied validated external LGPL FFmpeg. No FFmpeg/Chromium binary or Remotion package is added to the CLI tarball. The Remotion export requires the source checkout.

Not run / outside M1: native Windows/macOS rendering, real fractional-fps Remotion MP4, long-timeline performance, presenter/visual footage rendering, ASR/alignment, asset matching, matting, TTS and AI quality review. Fractional fps was validated through data/compiler metadata only; actual M1 renders above were 30/1. Later features are not reported as skipped acceptance passes. No wallstreet examples media or human voice was downloaded. Tracked screenshots were restored from the initial clean working tree; generated copies remain under `.tmp/v2/screenshots-generated`. M0/M1 was committed as `fb51285` and pushed to `feat/shotweft-v2-ai-director`; no release, tag change, npm publication or main modification was performed.


## P5 Standalone Audio

The P5 fixtures use locally generated tones in PCM WAV, MP3, and AAC in M4A. Linux verification used Node.js 22.23.5, Playwright Chromium, and the supplied LGPL FFmpeg and ffprobe build `n8.1.3-39-g660b5aa7db-20261123`.

```bash
npm run check
npm run build
ffmpeg_bin="$PWD/.tmp/ffmpeg-lgpl/ffmpeg-n8.1-latest-linux64-lgpl-8.1/bin"
FFMPEG_PATH="$ffmpeg_bin/ffmpeg" FFPROBE_PATH="$ffmpeg_bin/ffprobe" \
  PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" SHOTWEFT_REQUIRE_PDF=1 npm test
FFMPEG_PATH="$ffmpeg_bin/ffmpeg" FFPROBE_PATH="$ffmpeg_bin/ffprobe" npm run test:video-render
PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" SHOTWEFT_REQUIRE_PDF=1 npm run test:package
```

| Command | Exit | Result |
| --- | ---: | --- |
| `npm run check` | 0 | TypeScript passed. |
| `npm run build` | 0 | Browser and CLI builds passed. |
| `npm test` | 0 | 45 groups passed, including 41 existing regression groups and four P5 groups. No groups skipped. |
| `npm run test:video-render` | 0 | Four groups passed, including audio-only, mixed, silent portrait, and verification and failure cases. |
| `npm run test:package` | 0 | Isolated install, 14-entry tarball check, three-page PDF (454,411 bytes), and uninstall passed. |

Two earlier full runs exited 1. The first encountered a mute assertion that ran before the IndexedDB save completed. The second exposed a storyboard crop regression caused by refreshing asset URLs on history edits. The final run passed after both fixes. Tracked screenshots were restored. Raw logs and exit codes are in `.tmp/p5/`.

| Render fixture | Resolution | FPS | Frames | Video duration | AAC duration |
| --- | ---: | ---: | ---: | ---: | ---: |
| Audio only, using WAV, MP3, and M4A | 320×180 | 30000/1001 | 84 | 2.8028 s | 2.803 s |
| Video, still, embedded audio, and standalone M4A | 640×360 | 30000/1001 | 72 | 2.4024 s | 2.402 s |
| Browser-exported video and standalone M4A ZIP | 1920×1080 | 30/1 | 75 | 2.500 s | 2.500 s |
| Silent portrait regression | 360×640 | 25/1 | 25 | 1.000 s | 1.000 s |

The outputs contain yuv420p H.264 and stereo 48 kHz AAC-LC in faststart MP4. The render tests independently inspect stream properties and measure decoded audio windows for source trim, overlap, gain, mute, and silence. They also exercise bad inputs, no-overwrite, temporary cleanup, and byte-identical source files and ZIP inputs.

Browser tests cover native play, pause, and seek, clip edits and overlapping Voice and Music playback, media element and object URL cleanup, the 390 px layout, and strict rejection of malformed or unsupported imports. ZIP checks cover V1.0 and pre-P5 timeline v1 reads, v2 writes for timelines or standalone audio, original bytes and thumbnails, scene and shot IDs, browser asset-ID remapping, annotations, unknown fields, and IndexedDB undo and redo.

Native Windows FFmpeg rendering, other browser engines, and long-timeline performance are outside this run. The package stays at `1.5.0`.

## Phase 1 Test Report

Acceptance date: 2026-11-20.
System: Windows; working directory on D:.
Node.js 24.21.0, npm 11.19.0, Git 2.55.0.
The initial project directory was empty.
The official npm registry was reachable.
Cache, temporary files, and browsers were kept inside the project.

| Check | Result |
| --- | --- |
| TypeScript strict mode and Vite build | Passed |
| Home page, demo photos, and Konva canvas | Passed |
| Create, rename, duplicate, archive, and confirmed delete | Passed |
| Scene editing, shot editing, and order synchronization | Passed |
| Aspect-ratio changes, guides, and timed preview | Passed |
| Refresh restores project, scenes, shots, and aspect ratio | Passed |
| 1366, 1440, and 1920 px desktop widths | Passed |
| 390 px narrow layout | Passed |
| Browser console and network requests | No errors. The page requests local resources only. |

Browser: Playwright Chromium Headless Shell.
Three screenshots are available under `docs/screenshots`.
The build emits a dependency `use client` notice.
Phase 1 acceptance covered the implemented functionality.
Video frame extraction, canvas layers, and export were deferred.

## Phase 2 Test Report

Acceptance date: 2026-11-20.
Environment: Windows and the D: project directory.
Build and automated tests passed.

| Check | Browser result |
| --- | --- |
| Old-project migration | Upgraded from the Phase 1 database. Original scenes, shots, and backdrops were preserved. |
| Scene editing | Create, autosave, reorder, and delete passed. Undo restored shot associations. |
| Shots and timeline | Create, duplicate, and delete passed. Horizontal and vertical drag results stayed synchronized. |
| Undo and redo | Buttons and keyboard shortcuts passed. History survived refresh. |
| Property panel | Lens, duration, notes, and other properties edited and saved. |
| Real images | JPG, PNG, and WebP upload passed. |
| Storyboard crop | Zoom and pan tested. Refresh, undo, and redo restored the frame. |
| Real video | H.264 MP4 and VP9 WebM upload and playback passed. |
| Video keyframes | Seeked and saved keyframes. Refresh restored them to the storyboard canvas. |
| Mixed preview | Images played for their shot duration, then automatically switched to video. |
| Error handling | Corrupt MP4 files displayed a decode error. |
| Project duplication | Duplicated projects remapped assets and extracted frames. |
| Layout sizes | 1366, 1440, 1920, and 390 px passed regression. |
| Runtime errors | Automation found no console errors or failed requests. |

The automated suite uses real JPG and MP4 files.
Additional browser tests covered PNG, WebP, and WebM.
Desktop screenshots use 1440 × 900.

- [Shot order](screenshots/04-shot-order.png)
- [Image crop](screenshots/05-image-crop.png)
- [Video keyframe](screenshots/06-video-keyframe.png)

Browser codec support determines playable formats.
The build still emits the dependency `use client` notice.

## Phase 3 Test Report

Acceptance date: 2026-11-20.
TypeScript checks and the Vite production build passed.
Playwright covered new features and the first two phases.

| Check | Browser result |
| --- | --- |
| Canvas aspect ratios | 16:9, 9:16, and 2.39:1 verified. |
| Desktop layout | 1440×900 and 1920×1080 verified. |
| Current split layout | Actual viewport measured at 1042×871 and reproduced in Chromium. |
| Narrow regression | 390 px width verified. |
| Property panel | Resize, collapse, and expand verified. |
| Timeline | Height drag, ruler positioning, and playhead verified. |
| Shot order | Horizontal timeline and vertical list drag both passed. |
| Annotations | All five tools created successfully. Drag and transform tested. |
| Layers | Ordering, rename, lock, hide, and opacity passed. |
| Save history | Undo, redo, layer deletion, and refresh restore tested. |
| Annotation isolation | Adjacent shots kept independent annotation data. |
| PNG | Downloaded a real photo with annotations; verified 1920×1080. |
| PDF | Downloaded two-page landscape A4; checked Chinese layout page by page. |
| Video | Downloaded the original MP4; bytes matched the uploaded file. |
| JSON | Checked shots, annotations, and media manifest. |
| ZIP | Tested backup, restore copy, and corrupt-archive feedback. |
| Old projects | Phase 1 database migration and Phase 2 regressions passed. |

Export samples came from real edits in the browser.
Regression tests cover image upload, video playback, and keyframe extraction.
The existing build keeps the dependency `use client` notice.

- [1440×900 annotated canvas](screenshots/07-annotated-canvas-1440.png)
- [1920×1080 editor](screenshots/08-workspace-1920.png)
- [1042×871 split view](screenshots/09-workspace-split.png)
- [Rendered exported PDF](screenshots/10-storyboard-pdf.png)

## V1.0 Acceptance

Acceptance date: 2026-11-20.
Package version: 1.0.0. Display version: V1.0.
TypeScript strict checks and the Vite production build passed.
All 17 browser regression groups passed.

| Check | Result |
| --- | --- |
| Old projects | Opened the old database and checked scenes, shots, and assets. |
| Storyboard and layers | Annotation creation, transform, lock, layer order, undo, and refresh passed. |
| Timeline | Horizontal/vertical drag, ruler, and preview tested. |
| Playback fix | After shortening the current shot, the playhead stayed in that shot. |
| Menu fix | Outside-click dismissal tested. Escape returned focus to the trigger. |
| Images | JPG upload, preview, crop, and PNG export tested. |
| Video | MP4 upload, playback, seeking, and frame extraction tested. |
| Export | Verified PNG, original MP4, JSON, storyboard PDF, and ZIP. |
| ZIP restore | Independent copy restored images, video, and annotations. Corrupt backups produced feedback. |
| Reference validation | ZIPs missing demo photos were rejected. |
| Layout | Desktop and actual split widths passed regression. |
| Runtime errors | Browser acceptance found no console errors or failed requests. |

PNG restored from the project matched the original export byte for byte.
Exported original video matched the uploaded file byte for byte.
V1.0 acceptance produced 12 temporary browser screenshots that are not committed.
The build still emits the third-party `use client` notice.
