# Test Reports

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