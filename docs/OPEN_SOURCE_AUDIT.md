# 开源审查

环境和依赖审查基准日为 2026-11-20。
锁定版本见项目的 package-lock.json。
仓库许可证以各链接对应文件为准。

| 项目 | 许可证与维护状态 | 实际用途 |
| --- | --- | --- |
| [OpenFrame](https://github.com/kazim-45/openframe) | MIT。仓库页面未列出正式发行版。 | 参考场景与镜头的组织方式。 |
| [Storyboarder](https://github.com/wonderunit/storyboarder) | v3.0.0 为预发行。仓库另附安装包 EULA。源码许可未充分确认。 | 参考分镜速览。项目未引入源码或资产。 |
| [React Konva](https://github.com/konvajs/react-konva/blob/master/LICENSE) | MIT。19.2 系列与 React 19.2 兼容。 | 声明式监看画布与构图线。 |
| [Konva](https://github.com/konvajs/konva) | MIT。使用与 React Konva 兼容的 10.x。 | 画布绘制。 |
| [shadcn/ui](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md) | MIT。主仓库持续维护。 | 参考组件约定。弹窗直接用 Radix UI。 |
| [Radix UI](https://github.com/radix-ui/primitives/blob/main/LICENSE) | MIT。使用 React Dialog。 | 焦点管理和键盘操作。 |
| [Motion](https://github.com/motiondivision/motion) | MIT。使用 12.x。 | 进入、退出和布局动画。 |
| [Dexie](https://github.com/dexie/Dexie.js/blob/master/LICENSE) | Apache-2.0。使用 4.x。 | IndexedDB 持久化。 |
| [Lucide](https://github.com/lucide-icons/lucide/blob/main/LICENSE) | ISC，也包含上游 Feather 的 MIT 声明。 | 界面图标。 |

应用布局和业务代码为项目实现。
保留随依赖分发的许可证和版权声明。
分发时一并提供第三方声明文件。
照片许可单独记录在 MEDIA_SOURCES.md。


## 实装版本

| 依赖 | 锁定版本 |
| --- | --- |
| React / React DOM | 19.2.9 |
| React Konva / Konva | 19.2.7 / 10.10.0 |
| Radix React Dialog | 1.3.1 |
| Motion | 12.43.0 |
| Dexie | 4.4.7 |
| Lucide React | 1.77.0 |
| Vite / TypeScript | 7.3.8 / 5.9.3 |
| Playwright | 1.65.1 |

运行依赖声明也包含在构建产物中。

## 第二阶段复用

使用现有 Motion 的 Reorder 组件。
它为场景列表、镜头列表和时间轴提供拖拽动画。
Dexie 扩展现有数据库。
版本更新保留旧项目和原始示例图片。
浏览器负责解码和抽帧。
第二阶段未增加运行时依赖。

示例视频由 FFmpeg 缩放和转码。
本地用 @ffmpeg-installer/win32-x64 4.1.0 提供的可执行文件。
FFmpeg 不随应用打包。

## 第三阶段依赖

| 组件 | 版本 | 许可 | 用途 |
| --- | --- | --- | --- |
| [React Konva](https://konvajs.org/docs/react/Transformer.html) | 19.2.7 | MIT | 复用 Transformer 处理标注缩放。 |
| [Motion](https://motion.dev/docs/react-reorder) | 12.43.0 | MIT | 复用 Reorder 处理镜头和图层排序。 |
| [zip.js](https://github.com/gildas-lormeau/zip.js) | 2.25.0 | BSD-3-Clause | 项目 ZIP 压包和恢复。 |
| [pdf-lib](https://github.com/Hopding/pdf-lib) | 1.17.1 | MIT | 生成 A4 分镜表。 |
| [Zod](https://github.com/colinhacks/zod) | 4.6.7 | MIT | 校验 ZIP 项目清单。 |

沿用现有素材及授权记录。
依赖授权随 THIRD_PARTY_NOTICES.txt 一起分发。
