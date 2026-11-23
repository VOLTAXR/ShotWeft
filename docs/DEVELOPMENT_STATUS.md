# ShotWeft 开发状态

记录日期：2026-11-23
记录范围：V1.5 Agent 端到端分镜创作、CLI/网页回归及发布可靠性。前十三节保留各阶段的历史结果。最新验收见[阶段一发布可靠性固化](#十四阶段一发布可靠性固化)。

## 一、当前已完成功能

### V1.0 网页工作台（已验收，材料冻结）

- 项目工作台：新建、重命名、复制、归档、删除，Hash 路由刷新后保留位置。
- 剧本：场景增删改、拖动排序、方向键排序；删除场景解除镜头关联。
- 镜头：增删改、搜索、筛选、复制、拖动排序，列表与时间轴顺序同步。
- 分镜画布：Konva 渲染、构图线、画幅切换、裁切缩放与平移、键盘微调。
- 标注与图层：全部标注工具、移动/缩放、层级、显隐、锁定、透明度。
- 实时媒体：JPG/PNG/WebP（≤25 MB）、MP4/WebM（≤120 MB）、关键帧提取。
- 撤销/重做：覆盖场景、镜头、画幅、裁切、素材关联，保留最近 40 步。
- 导出：PNG、两页分镜表 PDF、项目 JSON、项目 ZIP；ZIP 恢复为独立副本。
- 本地数据：IndexedDB 全量保存，无外部网络请求，桌面与 390 px 窄屏通过。

### V1.5 CLI

- 项目：`create` / `show` / `update` / `restore`。
- 场景与镜头：`list` / `show` / `add` / `update` / `move` / `remove`，1-based `--position`。
- 导出：`export json`（清单）与 `export pdf`（复用网页分镜布局）。
- 数据互通：CLI 直接读写网页项目 ZIP，网页可恢复 CLI 产物。
- 工程化：`npm pack` 本地安装包、`prepack` 钩子、`shotweft` bin、子命令 `--help`。
- 稳定性：`.shotweft-lock` 目录锁 + 同目录 `rename` 原子替换。
- 输出契约：stdout 恒为 JSON，stderr 恒为 JSON，退出码 0/1/2。

### V1.5 Agent 端到端分镜（本轮新增）

- `shotweft agent storyboard <script.txt> <project.zip> --title <标题> [--frame …] [--shots 12] [--pdf <storyboard.pdf>]`。
- 读取 UTF-8 纯文本剧本，支持 BOM、1 MiB 上限和中文/英文场景标题。
- 默认恰好生成 12 个镜头，也支持 1 到 50 个；每个镜头自动关联场景并填写标题、景别、角度、运镜、焦段、时长和备注。
- 场景自动填写地点、内景/外景、时间、动作描述、对白和备注。
- 真实生成可被网页恢复的项目 ZIP；传入 `--pdf` 时复用现有分镜布局导出真实 PDF。
- ZIP 与 PDF 使用成对写入：任一目标已存在时拒绝覆盖；PDF 写入失败时回滚已发布的 ZIP。
- 离线确定性拆解，不调用外部 AI/API，不需要 API Key。
- 使用说明见 [AGENT.md](AGENT.md)。

## 二、本轮开发内容

| 文件 | 变更 |
| --- | --- |
| `src/core/script-breakdown.ts` | 新增剧本场景/动作/对白解析、镜头分配与时长估算。 |
| `src/cli/storyboard.ts` | 新增读取剧本、构建项目、成对写入 ZIP/PDF 的 CLI 流程。 |
| `src/cli/main.ts` | 注册 `agent storyboard`，补充帮助与参数校验。 |
| `src/cli/project-file.ts` | 抽出 `writeOutputPair`，保证 ZIP/PDF 不覆盖且失败回滚。 |
| `scripts/test-cli.mjs` | 新增 3 组 Agent 自动化测试，含真实 PDF 和网页恢复后编辑。 |
| `scripts/test.mjs` | 将临时目录环境变量补齐到 TMPDIR。 |
| `README.md` | 增加 Agent 用法与离线说明。 |
| `CHANGELOG.md` | 增加 V1.5 条目。 |
| `docs/AGENT.md` | 新增输入格式、命令、输出契约和 LLM 接入边界。 |
| `docs/DEVELOPMENT_STATUS.md` | 本文件。 |

本轮未增加外部依赖，未修改 `main` 分支或 `v1.0.0` 标签。

## 三、当前 Git

| 项 | 值 |
| --- | --- |
| 分支 | `feat/shotweft-cli-v1.5` |
| 本轮基线提交 | `35c65c9 fix(cli): 流式导出 PDF 并保留项目清单原有字段` |
| 初始提交 | `5039aa5 初始提交` |
| 本轮提交 | 本文件所在的提交（用 `git log -1` 查看哈希） |
| 远端 | `origin/feat/shotweft-cli-v1.5` |

## 四、本轮验收结果

环境：Linux/WSL2，Node.js 22.23.5，Playwright 1.65.1，Chromium headless shell 1255（项目内 `.browsers/`）。

| 步骤 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npx tsc --noEmit` | 退出码 0，无输出 |
| 生产构建 | `npm run build` | 退出码 0，网页 + `dist/cli/shotweft.js` + `dist/cli/render.js` |
| 完整回归 | `PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npm test` | 退出码 0，21 个 PASS 分组 |

新增的 3 组 Agent 测试：

```text
PASS Agent four-scene script, 12 deterministic shots, ZIP restore, and PDF image streams > 10 KB
PASS Agent input errors, no-clobber outputs, merged scenes, and 1–50 shot boundaries
PASS Agent ZIP browser restore, 12 readable shots, and edited JSON export
```

独立产物抽检（使用另一份原创五场剧本《霜轨》）：

- 命令退出码 0，生成 5 个场景、12 个镜头，总时长 45.5 秒。
- PDF 真实导出成功：3 页，标题 `霜轨 · 分镜表`，每页真实图像流约 257–269 KB。
- ZIP 可被 `project restore` 恢复为 12 个镜头；`export json` 读回场景、镜头和画幅一致。
- Playwright 实测网页从 Agent ZIP 恢复，镜头列表读出 12 个标题；修改首个镜头标题后导出 JSON，修改生效且仍为 12 个镜头。

说明：

- `npm test` 会重新生成 `docs/screenshots/*.png`。平台字体/抗锯齿差异已在测试后 `git checkout` 还原，未纳入提交。
- 测试在当前 Linux/WSL2 环境执行；Windows 全局安装复验未在本轮重复。
- Codex `exec` 实际退出码为 0，本轮无需自动修复重试。
- 抽检与测试临时文件位于 `.tmp/`（已 gitignore），未创建额外备份文件。

## 五、已知限制与未解决问题

### Agent 相关限制

1. **离线规则拆解，不是语义 AI**：当前不调用 LLM、MCP 或外部 API。镜头标题、景别和时长来自文本长度与固定轮换规则，不能理解剧情语义。
2. **镜头标题可能是对白**：标题优先取正文片段，遇到对白行时会直接用台词，尚未按动作优先重排。
3. **默认画面**：生成项目只有文字和分镜布局，不自动匹配图片/视频素材，网页打开后使用默认画面底图。
4. **输入规模**：剧本上限 1 MiB，镜头数上限 50；场景数超过镜头数时，多余场景正文合并进最后一个保留场景。
5. **PDF 环境依赖**：真实 PDF 需要本地 Playwright Chromium；中文显示依赖系统中文字体。

### 既有 CLI 遗留（本轮未修）

高：

1. `package.json` 没有 `engines`，Node 18/20.0 上可能安装成功但运行时报 `openAsBlob is not a function`。
2. ZIP 读写仍是整包内存模型，接近 768 MB 上限时峰值内存约为文件大小的 2 倍。
3. `npm pack` 尚未在 `git clean -xdf` 的全新工作区复验。

中：

4. ZIP 条目白名单偏严，第三方附加目录项或系统元数据可能被拒。
5. `softwareVersion` 沿用来源清单，不归一化为当前登记版本。
6. `project update` 的 `rename` 仍会替换 symlink 目标本身。
7. `--help` 在子命令后仍会打印总帮助并返回 0，拼写错误可能被吞掉。
8. stdout EPIPE 未处理，`| head -1` 可能向 stderr 打印 Node 堆栈。
9. JSON 恢复的语法错误未本地化。
10. `shot move` 到原位置仍刷新 `updated` 并重写文件。
11. 新建/导出文件权限固定 0600。
12. 构建顺序脆弱：`vite build` 会清空整个 `dist/`，含 `dist/cli`。
13. `finally` 中未保护的 `rm(lock)` 在 Windows 句柄延迟时可能抛 EPERM。
14. `docs/PLAN.md`、`docs/EXTENSION_BOUNDARY.md` 仍写“Agent/MCP 留给 V1.5”，未与本轮 Agent 现状对齐；`docs/TEST_REPORT.md` 尚无 Agent 记录。

## 六、下一阶段任务

1. **P0 · 发布质量**：补 `engines: { "node": ">=22.12" }` 与入口版本检查；干净工作区跑 `npm pack` + 全局安装；收敛 `--help`、EPIPE、JSON 错误本地化等契约问题。
2. **P0 · 兼容性护栏**：为 ZIP 白名单和 `softwareVersion` 策略补回归测试并写入文档。
3. **P1 · Agent 升级**：在用户明确授权的前提下接入可选的 LLM 拆解器，仅产生候选场景/镜头，仍走本地格式校验和现有 ZIP/PDF 导出；保留当前离线路径作为无网络默认值。
4. **P1 · Agent 质量**：动作优先的标题、镜头覆盖类型、转场和对白标注；可选自动匹配示例素材或占位画面。
5. **P1 · 大文件**：ZIP 读写改为流式/临时文件，把峰值内存从 2 倍降到常数级。
6. **P2 · 跨平台**：Windows 文件锁清理、symlink 目标、FAT32/exFAT 输出路径验证。
7. **P2 · MCP**：按 `docs/EXTENSION_BOUNDARY.md` 的边界接入外部工具，不绕过现有事务和校验。

## 七、约束与红线

- `main` 分支：本轮不推送、不合并。
- 提交方式：只提交本轮有效修改，不创建额外备份文件，不自动合并 Pull Request。
- 不修改 Codex/Pi 全局配置，不读取或输出 API Key。

## 八、P0 生产发布可靠性验收（2026-11-23）

Linux/WSL2 验收环境使用 Node.js 22.23.5 和 npm 10.9.9，基线为 `feat/shotweft-cli-v1.5` 的 `cdbb255`。

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npx tsc --noEmit` | 0 | 类型检查通过。 |
| `npm run build` | 0 | 网页、CLI 入口、CLI 运行模块和 PDF 渲染器均成功构建。 |
| `PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npm test` | 0 | 21 个 PASS 分组，包括网页与 CLI 的带媒体 ZIP 往返、PDF 一致性、文件锁及 Agent 回归。 |
| `PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npm run test:package` | 0 | 隔离目录中的 `npm ci`、真实 `npm pack` 和临时前缀全局安装均通过。tarball 含 12 个文件，其中 5 张示例 JPEG。安装后的 CLI 通过项目、分镜、JSON、恢复、场景／镜头更新及 PDF 导出，PDF 大小为 458,680 字节。 |
| Windows `npm run test:package`（Node.js 24.21.0，npm 11.19.0） | 0 | D 盘项目内临时前缀真实全局安装通过；`shotweft` 命令完成帮助、创建、12 镜头分镜、JSON、恢复、场景／镜头更新。PDF 因 Windows Chromium 未安装而跳过。 |

回归重新生成了 21 张截图。`git checkout -- docs/screenshots` 因 `.git/index.lock` 所在文件系统只读而返回 128。随后通过 `git diff --name-only -z -- docs/screenshots | git checkout-index --force -z --stdin` 从索引还原，退出码 0。`git diff --exit-code -- docs/screenshots` 返回 0。

首次打包验收返回 1，原因是 `prepack` 的构建输出混入了 `npm pack --json` 的 stdout。改为在临时目录定位实际生成的 `.tgz` 后通过。失败工作目录已清理，日志位于 `.tmp/package-xSFJXL.log`。

另用真实 Node.js 22.11.0 和 22.12.0 验证版本边界。22.11.0 执行 `--help`、`--version` 和 `project create` 均返回 1，stderr 为单行 JSON，未出现堆栈。22.12.0 执行 `--help`、`--version`、`project create` 和 `project show` 均返回 0。

ZIP 验收使用一份 604,109,947 字节的项目，包含六个 96 MiB MP4 素材条目和对应的 JPEG 缩略图。MP4 由内置示例视频追加 `free` 区块生成。CLI 使用 `--max-old-space-size=64`，由 GNU `time` 记录峰值 RSS。

| CLI 命令 | 退出码 | 峰值 RSS |
| --- | --- | --- |
| `project show` | 0 | 115,068 KiB |
| `export json` | 0 | 114,052 KiB |
| `project restore` | 0 | 116,044 KiB |
| `project restore`（素材 CRC32 损坏） | 1 | 115,168 KiB |

抽检观察到了素材解压临时文件和恢复过程中的 ZIP 暂存文件，提取目录在每条命令结束后均为空。恢复后各素材条目的大小和 CRC32 与原 ZIP 一致。损坏样本报 `Invalid CRC32`，目标文件未生成。完整抽检退出码为 0。

已知限制：

- Windows 真机安装已用 Node.js 24.21.0 和 npm 11.19.0 通过；安装后的 PDF 导出未在 Windows 执行，因为未安装 Windows Chromium，脚本按设计跳过并返回成功。
- Windows 临时目录在 P1 已改为优先 `SHOTWEFT_TMP`，未设置时使用当前工作目录下的 `.tmp`，避免默认写入 C 盘。
- ZIP 读写需要临时磁盘空间。恢复和更新期间，提取媒体与目标暂存 ZIP 会同时占用空间。强制终止进程可能留下临时文件或锁目录。
- RSS 来自上述样本的单次抽检，未设置自动化阈值。

## 九、P1 CLI 完整性与自动化稳定性（2026-11-23）

本轮以 `feat/shotweft-cli-v1.5` 的 `ce8f850` 为基线，在 Linux/WSL2 使用 Node.js 22.23.5、npm 10.9.9 和项目内的 Chromium headless shell 1255 验收。

- CLI 按命令组和子命令显示中文帮助。帮助允许省略位置参数，仍通过 `parseArgs` 校验选项。命令和参数错误返回 `2`，运行失败返回 `1`，stderr 为单行 JSON。无效 JSON 和文件不存在使用中文提示。
- stdout 收到 `EPIPE` 时静默返回 `0`。另外实测 `export json | head -1` 和 `export json | head -c 0` 均返回 `0`，stderr 为空。模拟动态导入失败、向 `/dev/full` 写 stdout 均返回 `1` 和单行 JSON。
- 场景和镜头移到原位置时跳过 ZIP 写入，回归确认 ZIP 字节和 `project.updated` 一致。锁清理失败时保留原操作结果，真实锁冲突继续报错。
- ZIP 媒体解压优先使用 `SHOTWEFT_TMP`；未设置时 Windows 使用当前工作目录的 `.tmp`，Linux/macOS 使用系统临时目录。已在原生 Windows 上实测带媒体 ZIP 的 `project show` 和 `project restore`，临时目录无残留。

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npx tsc --noEmit` | 0 | 类型检查通过。 |
| `npm run build` | 0 | 网页、CLI 入口和 PDF 渲染器成功构建。 |
| `PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npm test` | 0 | 24 组 PASS，覆盖新增 CLI 契约及既有网页、CLI 和 Agent 回归。 |
| `PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npm run test:package` | 0 | 隔离目录的 `npm ci`、`npm pack` 和临时前缀全局安装均通过。tarball 共 12 项，含 5 张示例 JPEG。已安装的 CLI 成功创建项目、生成分镜、导出 JSON、恢复、编辑并导出 458,679 字节的 PDF。 |
| Windows `npm run test:package`（Node.js 24.21.0，npm 11.19.0） | 0 | D 盘临时前缀真实全局安装通过；安装后的 CLI 完成创建、分镜、JSON、恢复、场景／镜头更新。Windows 原生带媒体 ZIP 的 `project show` / `project restore` 也通过，临时目录无残留。PDF 未在 Windows 导出，因为未安装 Windows Chromium。 |

`npm test` 重写了 21 张截图。`git checkout -- docs/screenshots` 因索引目录只读返回 `128`，随后用 `git diff --name-only -z -- docs/screenshots | git checkout-index --force -z --stdin` 还原。最终 `git diff --exit-code -- docs/screenshots` 返回 `0`。

## 十、P2 Agent 完整工作流（2026-11-23）

基线为 `feat/shotweft-cli-v1.5` 的 `d659d22`。新增 `export zip` 和 `agent verify`。ZIP 导出复用现有流式读写、目标锁和原子发布，保留清单及媒体并拒绝覆盖。验证复用 ZIP 清单与媒体检查，可附带 PDF 路径、字节数、页数和标题。PDF 验证无需 Chromium。Agent 流程离线运行，无需 LLM 或 MCP。P3 智能能力另行规划。

Linux/WSL2 使用 Node.js 22.23.5、npm 10.9.9 和项目内 Playwright Chromium headless shell 1255。

| 命令 | 退出码 | 实际结果 |
| --- | --- | --- |
| `npx tsc --noEmit` | 0 | 类型检查通过。 |
| `npm run build` | 0 | 网页、CLI 入口和 PDF 渲染器构建通过。 |
| `PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npm test` | 0 | Codex 首次运行曾在既有场景对白刷新断言处失败，随后按原命令重跑通过；Pi 独立连续运行 2 次均为 27 组全部通过，覆盖 4 场 12 镜头完整流程、真实 PDF、恢复后继续编辑及网页回归。 |
| `PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npm run test:package` | 0 | 隔离源码 `npm ci`、打包与临时前缀全局安装通过。安装后的 CLI 生成 2 场 12 镜头，ZIP 副本与源清单一致。恢复及更新后总时长从 32 秒变为 34 秒。真实 PDF 为 3 页、471,111 字节，通过 `agent verify --pdf`。 |
| Windows `cmd.exe /d /s /c "cd /d D:\Projects\ShotWeft && npm run test:package"`（Node.js 24.21.0，npm 11.19.0） | 0 | 原生 Windows 真实全局安装通过。安装后的 CLI 完成创建、分镜、编辑、JSON/ZIP 导出、ZIP 验证、恢复和继续编辑；因未安装 Windows Chromium，PDF 导出与 PDF 验证按设计跳过。 |

使用真实 Node.js 22.11.0 和 22.12.0 在关闭 stdin 的环境单独运行两个新命令。22.11.0 各返回 `1`，stderr 为单行版本错误 JSON。22.12.0 各返回 `0`，stdout 为单行结果 JSON。

CLI 回归确认 ZIP 副本的媒体逐条一致，拒绝覆盖和锁冲突。无效 ZIP、错误关联、白名单外条目、媒体大小不符和 CRC 错误均返回 `1`。PDF 不存在、格式错误、截断或为零页时均返回 `1`。`export zip` 缺少 `--output` 返回 `2`。两条新命令在 stdout 提前关闭时均静默返回 `0`，带媒体流程结束后 `SHOTWEFT_TMP` 解压目录为空。项目内 Chromium 路径被替换为不存在的目录时，已有 PDF 仍可通过验证。

测试产生的 21 张截图平台差异已从索引还原，`git diff --exit-code -- docs/screenshots` 返回 `0`。

## 十一、P3 智能能力技术方案（2026-11-23）

基线为 `feat/shotweft-cli-v1.5` 的 `e6e7f39`。本轮交付 [P3 智能能力技术方案](AGENT_INTELLIGENCE.md)，并同步阶段计划、扩展接口约定、README 和版本记录。历史验收记录保留在上文。第五节第 14 项涉及的阶段计划与扩展接口约定已按当前 CLI 实现更新。

- **已明确**。现有 Agent CLI 按规则离线运行。未来智能能力只提交候选，经过授权、审核与本地校验，最终由 CLI 通过现有 ZIP/PDF 写入路径发布。方案规定了请求预览、凭据与预算边界、默认回退、本地素材许可、并发与恢复以及评测方法。
- **尚未实现**。LLM 及 provider adapter、MCP、外部网络请求、凭据读取、智能镜头语言推理、本地素材自动匹配、多 Agent 编排和新增评测集均未落地。本轮仅改文档，业务代码和依赖维持现状。
- **后续优先级**。先完善本地启发式和固定评测集，再评估显式启用的 provider adapter，最后考虑多 Agent。MCP 按实际工具接入需求另行评估，核心 CLI 流程可独立运行。

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npx tsc --noEmit` | 0 | 类型检查通过，无输出。 |
| `git diff --check` | 0 | 差异检查通过，无输出。 |

P3 提交时仅改文档，未重复完整浏览器回归；最终验收见第十三节。

## 十二、本轮提交记录

| 阶段 | 提交 | 内容 |
| --- | --- | --- |
| P0 | `ce8f850` | Node.js 版本门槛、真实打包/安装验收、流式 ZIP 读写。 |
| P1 | `d659d22` | 分级帮助、EPIPE、错误 JSON、参数校验、空操作与临时目录。 |
| P2 | `e6e7f39` | `export zip`、`agent verify`、完整 Agent 工作流测试。 |
| P3 | `395c06b` | 智能能力技术方案与扩展边界文档，不含 LLM/MCP 实现。 |

分支保持 `feat/shotweft-cli-v1.5`。本轮不推送 `main`、不合并 PR、不修改 `v1.0.0` 标签。


## 十三、最终验收（2026-11-23）

在 P3 提交 `395c06b` 之后，对最终工作树重新执行完整验收。P3 仅改文档，未改变业务代码。

| 检查 | 实际命令 | 退出码 | 结果 |
| --- | --- | ---: | --- |
| 类型检查 | `npx tsc --noEmit` | 0 | 通过，无输出。 |
| 生产构建 | `npm run build` | 0 | 网页、CLI 入口、CLI 运行模块和 PDF 渲染器构建成功。 |
| 完整回归 | `PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npm test` | 0 | 27 组 PASS，包含 12 镜头 Agent 全流程、真实 PDF、ZIP 恢复、继续编辑和全部既有网页回归。 |
| Linux 真实安装 | `PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npm run test:package` | 0 | 隔离 `npm ci`、真实 `npm pack`、临时前缀全局安装通过；安装后的 CLI 完成创建、分镜、编辑、JSON/ZIP/PDF、验证、恢复和继续编辑。PDF 为 3 页、471,111 字节。 |
| Windows 真实安装 | `cmd.exe /d /s /c "cd /d D:\Projects\ShotWeft && npm run test:package"` | 0 | Node.js 24.21.0、npm 11.19.0 下完成同样的非 PDF 工作流。未安装 Windows Chromium，PDF 导出与验证按设计跳过。 |
| Node 版本边界 | `npx node@22.11.0 dist/cli/shotweft.js agent verify …` | 1 | 单行 JSON 版本错误，无堆栈。 |
| Node 版本边界 | `npx node@22.12.0 dist/cli/shotweft.js agent verify …` | 0 | 返回单行验证 JSON。 |

最终工作树只包含已提交的代码与文档；`docs/screenshots/` 已从索引还原，

## 十四、阶段一发布可靠性固化

2026-11-23，在 `feat/shotweft-cli-v1.5` 的 `e2a9027` 上扩展测试。隔离安装包验收扫描 `dist/**/*.js`，调用安装后的 CLI 导出和验证真实 PDF，最后卸载并检查 npm shim。CLI 回归验证非法 ZIP 条目无写出、截断或 CRC 损坏的 ZIP 无解压残留，以及 `shot update` 经符号链接写入原目标。全量测试首次遇到固定预览端口 `4175` 已占用，将预览改为使用系统分配的本地端口。

Linux/WSL2 使用 Node.js 22.23.5、npm 10.9.9 和项目内 Chromium headless shell 1255。

| 命令 | 退出码 | 实际结果 |
| --- | ---: | --- |
| `npm run check` | 0 | 类型检查通过。 |
| `npm run build` | 0 | 网页、CLI 和 PDF 渲染器构建通过。 |
| `PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npm test` | 0 | 最终复跑 29 组 PASS，含真实 PDF、ZIP 失败清理、符号链接写入、锁与拒绝覆盖，以及既有网页回归。 |
| `PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npm run test:package` | 0 | 隔离源码 `npm ci`、真实打包及临时前缀全局安装通过。tarball 共 12 项，含 5 张示例 JPEG。打包的 JavaScript 通过开发机路径检查。安装后的 CLI 完成 PDF 和 ZIP 工作流，`npm uninstall -g --prefix` 成功移除 shim。 |
| `SHOTWEFT_REQUIRE_PDF=1 PLAYWRIGHT_BROWSERS_PATH="$PWD/.tmp/package-browser-unavailable" npm run test:package` | 1（预期） | 指定不存在的浏览器目录，脚本报告当前平台及缺少的可执行文件路径。 |

全量测试前两次返回 `1`，先遇到端口占用，随后是新增用例只匹配 ShotWeft 白名单错误。zip.js 会先以 `Unsafe filename` 拒绝部分路径，断言现接受两层拒绝并检查无文件写出。最终复跑使用 `/tmp` 下的临时 Node 编译缓存，测试生成的截图已恢复。

安装包生成 `安装分镜 · 分镜表`，3 页、458,680 字节。每页均有一张 2380×1684 JPEG，图像流为 150,459–154,363 字节。抽查首页，中文标题和镜头文字可读。

Pi 在原生 Windows Node.js 24.21.0、npm 11.19.0 上完成最终复验。Windows Chromium headless shell 已安装到 `D:\Projects\ShotWeft\.browsers`，安装包验收以 `SHOTWEFT_REQUIRE_PDF=1` 真实执行，退出码 0：3 页 PDF、458,376 字节、每页 2380×1684 JPEG，`agent verify --pdf` 通过，卸载后 shim 已移除。Windows 端还完成了恢复、镜头更新和继续验证。提取首页 JPEG 人工查看，中文标题、镜头和正文显示正常。PowerShell 5.1 直接解析 CLI UTF-8 stdout 受控制台编码影响，需设置 `[Console]::OutputEncoding = [Text.UTF8Encoding]::new()`，该限制已写入 Windows 测试文档。

Linux 侧最终复验为 29 组 PASS，安装包测试退出码 0，真实 PDF 为 3 页、458,679 字节，每页 JPEG 均通过检查，卸载成功。

复验命令见 [Windows 与 Linux 测试](WINDOWS_TESTING.md)，配置和许可证来源见 [发布参考资料](RELEASE_REFERENCES.md)。


## 十五、外部历史变更与待确认事项（2026-11-23）

在阶段一测试期间，仓库历史发生了不属于本任务调度范围的外部变更：

- `eacf7ea`（17:57）删除了 `copyright/v1.0/`、`scripts/build-copyright.mjs` 和 `scripts/v1-manual.json`。
- `b3cb52a`（18:04）将该提交合并到 `main`，并创建/推送 `v1.5.0` 标签。
- 远端 `main` 与 `origin/feat/shotweft-cli-v1.5` 都已包含这些变更。

这些提交不是本协调 Agent 创建、提交或推送的；本任务没有重置、回滚或重写历史。它们与“不得修改 V1.0 软著材料、不得擅自创建正式 Release 标签、不得直接合并 main”的约束冲突，属于需要用户确认的事项。当前后续开发在 `feat/shotweft-cli-v1.5` 上继续，不修改 `main` 和标签；在用户明确授权前，不恢复或再次删除软著材料，也不创建新的正式 Release。
