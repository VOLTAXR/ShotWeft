# ShotWeft 开发状态

记录日期：2026-11-23
记录范围：V1.5 CLI 与 Agent 工作流、公开发布清理、Windows/Linux 验收

## 一、当前状态

| 项 | 值 |
| --- | --- |
| 发布基线 | `main` / `54fb7fa27b33f03ef606156316f27a8525477f53` |
| 当前清理分支 | `chore/remove-registration-materials` |
| 现有标签 | `v1.5.0`（指向当前发布基线；本次清理不创建、移动或删除标签） |
| 远端 | `origin/main` |
| 包名与版本 | `shotweft` / `1.5.0` |
| Node.js 要求 | `>=22.12` |
| npm 发布 | `private: true`，禁止误发布 |

## 二、已实现功能

### 网页工作台

- 项目工作台：新建、重命名、复制、归档、删除，Hash 路由刷新后保留位置。
- 剧本：场景增删改、拖动排序、方向键排序；删除场景解除镜头关联。
- 镜头：增删改、搜索、筛选、复制、拖动排序，列表与时间轴顺序同步。
- 分镜画布：Konva 渲染、构图线、画幅切换、裁切缩放与平移、键盘微调。
- 标注与图层：全部标注工具、移动/缩放、层级、显隐、锁定、透明度。
- 实时媒体：JPG/PNG/WebP（≤25 MB）、MP4/WebM（≤120 MB）、关键帧提取。
- 撤销/重做：覆盖场景、镜头、画幅、裁切、素材关联，保留最近 40 步。
- 导出：PNG、分镜表 PDF、项目 JSON、项目 ZIP；ZIP 恢复为独立副本。
- 本地数据：IndexedDB 全量保存，无外部网络请求，桌面与 390 px 窄屏通过。

### V1.5 CLI

- 项目：`create` / `show` / `update` / `restore`。
- 场景与镜头：`list` / `show` / `add` / `update` / `move` / `delete`，1-based `--position`。
- 导出：`export json` / `export zip` / `export pdf`。
- Agent：`agent storyboard` 从 UTF-8 剧本生成 12 镜头项目；`agent verify` 校验 ZIP 和可选 PDF。
- 数据互通：CLI 直接读写网页项目 ZIP，网页可恢复 CLI 产物。
- 工程化：`npm pack`、`prepack`、`shotweft` bin、分级 `--help`、Node 版本门槛。
- 稳定性：`.shotweft-lock` 目录锁、原子替换、拒绝覆盖、流式 ZIP、临时目录清理。
- 输出契约：stdout 为单行 JSON，stderr 为单行 JSON，退出码 0/1/2；stdout EPIPE 静默退出。

### Agent 工作流

```text
project create -> project restore -> agent storyboard -> shot/scene update
-> export json/zip/pdf -> agent verify -> project restore -> 继续编辑
```

流程无需 LLM、MCP 或交互输入。当前剧本拆解是本地确定性规则，不是语义 AI。

## 三、公开发布清理

- 删除 `docs/screenshots/v1.0/` 下 13 张发布清理专用截图。
- `release.json` 改为纯 ShotWeft 发布元数据：产品名、发布版本、显示版本；移除产品登记字段。
- 网页标题、应用品牌、PDF 页脚、版本记录、计划、README 和第三方声明标题统一为 ShotWeft。
- 相关发布清理文档段落已删除；发布检查清单只保留正常安全检查、打包检查、许可证检查和发布授权。
- `docs/TEST_REPORT.md` 删除申请材料校验段落及 v1.0 截图链接，保留真实功能验收。
- `docs/screenshots/v1.0` 不再由测试生成；V1 浏览器测试改为写入 `.tmp/v1-screenshots`。
- `.gitignore` 保留三条防止误上传的忽略规则。
- 保留 `public/THIRD_PARTY_NOTICES.txt`、`docs/OPEN_SOURCE_AUDIT.md`、`docs/MEDIA_SOURCES.md`、正常产品截图和全部业务源码。

## 四、实际验收结果

环境：Linux/WSL2，Node.js 22.23.5；Windows Node.js 24.21.0；Playwright 1.65.1 / Chromium headless shell 1255。

| 检查 | 命令 | 退出码 | 结果 |
| --- | --- | ---: | --- |
| 类型检查 | `npm run check` | 0 | 通过，无输出。 |
| 生产构建 | `npm run build` | 0 | 网页、CLI 入口、CLI 运行模块和 PDF 渲染器构建成功。 |
| 完整回归 | `PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" SHOTWEFT_REQUIRE_PDF=1 npm test` | 0 | 29 组 PASS，含网页、CLI、Agent、ZIP 安全、真实 PDF 和恢复后编辑。 |
| Linux 安装包 | `PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" SHOTWEFT_REQUIRE_PDF=1 npm run test:package` | 0 | 隔离 `npm ci`、真实 `npm pack`、临时前缀全局安装通过；tarball 14 项、5 张示例 JPEG。PDF 3 页、454,411 字节，每页 JPEG 校验通过，卸载后 shim 移除。 |
| Windows 安装包 | 原生 `cmd.exe` + `SHOTWEFT_REQUIRE_PDF=1` + `npm run test:package` | 0 | 隔离安装通过；PDF 3 页、454,711 字节，每页 JPEG 校验通过；实际 Windows Chromium 运行，未跳过 PDF；卸载后 shim 移除。 |
| 打包扫描 | `npm pack` / `test:package` | 0 | 不含被忽略的申请资料目录、`docs/screenshots/`、`src/`、`node_modules/`、`.tmp/`、`.bak` 或开发机绝对路径；`private: true` 保留。 |

测试后 `docs/screenshots/*` 已从索引还原，未提交平台差异。

## 五、已知限制

- Agent 拆解为本地规则，LLM、MCP 和语义镜头分析尚未实现。
- 生成项目使用默认画面，用户需在网页补充图片或视频。
- PDF 依赖本机 Playwright Chromium 和系统中文字体。
- Windows PowerShell 5.1 读取 CLI UTF-8 stdout 时需要设置 `[Console]::OutputEncoding = [Text.UTF8Encoding]::new()`；PowerShell 7 无此问题。
- 仓库尚未添加项目许可证；需用户在 MIT 与 Apache-2.0 之间确认后处理。
- 现有 `v1.5.0` 标签与 `main` 历史保持不变；本清理分支不创建新标签，也不修改正式发布状态。
- 本地 IndexedDB 继续使用既有小写兼容键，防止破坏已有用户项目数据；该键不属于公开品牌。

## 六、后续任务

1. 用户确认项目许可证后添加 LICENSE，并复核第三方依赖与演示素材的分发条件。
2. 建立真实 GitHub Actions CI（当前仓库未包含工作流，README 中的失效徽章已移除）。
3. 为 V1.5 生成正式发布说明、SHA256 和可选发布附件；不自动创建 Release 或标签。
4. 继续评估 LLM 适配器，只提交候选镜头，默认保持离线路径。
5. 评估 Windows/Linux 安装文档与 Agent 调用指南的产品化整理。