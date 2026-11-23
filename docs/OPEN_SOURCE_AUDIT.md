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