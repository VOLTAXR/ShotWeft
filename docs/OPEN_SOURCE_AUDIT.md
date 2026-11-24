# Open-Source Audit

Dependency and environment review baseline: 2026-11-20.
Locked versions are in `package-lock.json`.
Repository licenses are governed by the linked upstream files.

| Project | License and status | Actual use |
| --- | --- | --- |
| [OpenFrame](https://github.com/kazim-45/openframe) | MIT. The repository does not list a formal release. | Reference for scene and shot organization. |
| [Storyboarder](https://github.com/wonderunit/storyboarder) | v3.0.0 is a pre-release. The repository also provides an installer EULA. Source licensing is not fully confirmed. | Reference for storyboard review. No source code or assets are included. |
| [React Konva](https://github.com/konvajs/react-konva/blob/master/LICENSE) | MIT. The 19.2 series is compatible with React 19.2. | Declarative viewing canvas and composition guides. |
| [Konva](https://github.com/konvajs/konva) | MIT. Uses the 10.x line compatible with React Konva. | Canvas rendering. |
| [shadcn/ui](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md) | MIT. The main repository is actively maintained. | Reference for component conventions. Dialogs use Radix UI directly. |
| [Radix UI](https://github.com/radix-ui/primitives/blob/main/LICENSE) | MIT. Uses React Dialog. | Focus management and keyboard behavior. |
| [Motion](https://github.com/motiondivision/motion) | MIT. Uses 12.x. | Enter, exit, and layout animation. |
| [Dexie](https://github.com/dexie/Dexie.js/blob/master/LICENSE) | Apache-2.0. Uses 4.x. | IndexedDB persistence. |
| [Lucide](https://github.com/lucide-icons/lucide/blob/main/LICENSE) | ISC, including an upstream Feather MIT notice. | Interface icons. |

Application layout and business code are implemented by this project.

Licenses and copyright notices distributed with dependencies are retained. The third-party notices file is shipped with distributions. Photo licenses are recorded separately in `MEDIA_SOURCES.md`.

## Installed Versions

| Dependency | Locked version |
| --- | --- |
| React / React DOM | 19.2.9 |
| React Konva / Konva | 19.2.7 / 10.10.0 |
| Radix React Dialog | 1.3.1 |
| Motion | 12.43.0 |
| Dexie | 4.4.7 |
| Lucide React | 1.77.0 |
| Vite / TypeScript | 7.3.8 / 5.9.3 |
| Playwright | 1.65.1 |

Runtime dependency declarations are also included in the build output.

## Phase 2 Reuse

The existing Motion `Reorder` component provides drag animation for scene lists, shot lists, and the timeline. Dexie extends the existing database. Version updates preserve old projects and original demo images. The browser handles decoding and frame extraction. Phase 2 added no runtime dependencies.

Demo videos were scaled and transcoded with FFmpeg. Local work used the executable from `@ffmpeg-installer/win32-x64` 4.1.0. FFmpeg is not packaged with the app.

## Phase 3 Dependencies

| Component | Version | License | Use |
| --- | --- | --- | --- |
| [React Konva](https://konvajs.org/docs/react/Transformer.html) | 19.2.7 | MIT | Reuse Transformer for annotation scaling. |
| [Motion](https://motion.dev/docs/react-reorder) | 12.43.0 | MIT | Reuse Reorder for shot and layer ordering. |
| [zip.js](https://github.com/gildas-lormeau/zip.js) | 2.25.0 | BSD-3-Clause | Project ZIP packing and restore. |
| [pdf-lib](https://github.com/Hopding/pdf-lib) | 1.17.1 | MIT | Generate A4 storyboard sheets. |
| [Zod](https://github.com/colinhacks/zod) | 4.6.7 | MIT | Validate ZIP project manifests. |

Existing media and attribution records remain in use. Dependency notices ship with `THIRD_PARTY_NOTICES.txt`.

## V2 M2 local evaluation (2026-11-24)

M2 adds no new third-party dependency. It reuses React/Remotion 4.0.546, Zod, Dexie and the existing Playwright Chromium/LGPL FFmpeg. Project media layers use the user's local files and existing project asset records. The M2 demo uses local `public/demo-media` images/video and a locally generated Windows SAPI narration; the narration is synthetic and is not a human voice or an authorized third-party asset. No wallstreet-explainer example media, fonts or model weights were copied. The visual layer renderer remains local-evaluation-only under the Remotion terms described below.

## V2 M0/M1 local evaluation (2026-11-24)

Direct development dependencies `remotion`, `@remotion/player`, `@remotion/renderer`, `@remotion/bundler`, and `@remotion/cli` are pinned exactly to `4.0.546`. The installed Remotion License is proprietary/source-available and non-OSI, with use eligibility and distribution restrictions. These packages and the Player web build are for local evaluation only; this is not a decision to distribute or use commercially. [Source license](https://github.com/remotion-dev/remotion/blob/v4.0.546/LICENSE.md), [terms](https://www.remotion.dev/docs/license).

The installed Remotion compositor package includes an FFmpeg build configured with `--enable-gpl`. M1 does not call it to encode. ShotWeft captures PNG frames with Remotion `renderFrames` and uses the separately provided, preflight-validated LGPL FFmpeg with `libopenh264`/native AAC for the MP4. No FFmpeg binary/library, browser or Remotion package is added to the CLI tarball; export is source-checkout-only. Building the web Player does include Remotion code and remains a local evaluation artifact.

wallstreet-explainer archive commit `b79bc0573455cb5fe335e78f653012e658fa9758` was inspected for design ideas. Its MIT notice explicitly excludes third-party media in `examples/`. No kit source, examples media, fonts or model weights are vendored. The demo WAV is reproducibly synthesized by `scripts/generate-director-demo.mjs` and is not human voice. Python/waveform tools are research only, not new dependencies. Their verified versions, licenses, platform constraints and unknown commit values are recorded in [V2_UPSTREAM_RESEARCH.md](V2_UPSTREAM_RESEARCH.md).
