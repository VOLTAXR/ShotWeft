# Test Reports

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
