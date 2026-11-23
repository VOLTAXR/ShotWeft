# ShotWeft 版本记录

## V1.5

- 新增 `shotweft agent storyboard`，在本地将原创短片剧本拆为场景和镜头，默认生成 12 个镜头。
- 生成可在网页恢复并继续编辑的 ShotWeft 项目 ZIP，可选导出分镜 PDF。
- 支持中英文场景标题、动作与对白分栏，按正文长度确定镜头分配与时长。

### P0 生产发布可靠性

- 声明 Node.js 22.12 最低版本并在 CLI 启动时校验，新增干净环境打包与全局安装验收。
- CLI 将 ZIP 素材逐项解压到临时文件，流式写入目标暂存 ZIP，保留网页兼容性和原有发布事务。

### P1 CLI 完整性与自动化稳定性

- 总帮助、命令组帮助和子命令帮助按调用范围展示，并严格校验命令、选项和参数数量。
- 标准输出遇到 `EPIPE` 时静默返回成功。JSON 恢复语法错误与文件不存在错误使用中文，失败仍以单行 JSON 和约定的退出码返回。
- 场景和镜头移到当前位置时保留 ZIP 字节和项目更新时间。锁清理失败时保留操作原本的结果。
- ZIP 媒体解压支持 `SHOTWEFT_TMP`，Windows 默认使用当前工作目录的 `.tmp`。
- 增加 CLI 契约回归，覆盖帮助、错误码、参数边界、管道提前关闭和同位置移动。

### P2 Agent 完整工作流

- 新增 `shotweft export zip`，流式写出保留项目清单与素材的可恢复 ZIP，使用原子写入并拒绝覆盖。
- 新增 `shotweft agent verify`，校验 ZIP 的项目清单、关联与素材，返回场景数、镜头数和总时长。可选验证 PDF 并读取页数、字节数和标题，无需启动 Chromium。
- 仓库 CLI 与真实全局安装测试均覆盖非交互式分镜、编辑、导出、验证、恢复和继续编辑。安装了对应平台的 Chromium 时执行真实 PDF 导出与验证。

### P3 智能能力技术方案

- 新增默认离线的智能能力方案，涵盖可选的 LLM 剧本分析、镜头语言建议、本地素材匹配、多 Agent 协作与评估。仅交付方案，不含 LLM 或 MCP 实现。见 [P3 智能能力技术方案](docs/AGENT_INTELLIGENCE.md)。

### 阶段一 · 发布可靠性回归

- 安装包验收默认使用项目内对应平台的 Chromium，检查安装后的 CLI 生成的 3 页 PDF 及各页 JPEG 图像，并执行 `agent verify --pdf`。发布验收可设置 `SHOTWEFT_REQUIRE_PDF=1` 强制运行。
- `npm pack` 验收扫描打包的 JavaScript 是否含开发机路径，并执行临时前缀全局卸载，检查 npm 命令入口已移除。
- CLI 回归覆盖 ZIP 路径穿越、绝对路径和 `__MACOSX/` 条目的拒绝，验证截断或损坏 ZIP 的解压临时目录清理，以及通过符号链接更新时保留链接并写入目标。
- 全量测试的预览服务使用系统分配的本地端口，避免固定端口被占用时中断。
- 新增 [Windows 与 Linux 测试](docs/WINDOWS_TESTING.md) 和 [发布参考资料及许可](docs/RELEASE_REFERENCES.md)。

### 阶段二 · GitHub 自动化与发布准备

- 配置 Linux 和 Windows GitHub Actions CI。Linux 跑完整回归和安装包验收，Windows 跑安装包验收。两个平台均要求真实 PDF，成功后分别上传 tarball 和校验文件。
- 新增 `npm run release:checksums`，为产物目录中的 tarball 生成 `SHA256SUMS.txt` 和 `release-manifest.json`。
- 安装包验证文件白名单、开发机路径和 `private: true`，将 Agent 指南和 V1.5 发布准备说明随 CLI 打包。新增 [发布准备说明](docs/RELEASE_NOTES_V1.5.md) 和 [发布检查清单](docs/RELEASE_CHECKLIST.md)。

## V1.0

验收日期为 2026-11-20。
软件包版本为 `1.0.0`。
Git 标签为 `v1.0.0`。

- 固定项目、场景、镜头和分镜编辑流程。
- 保留标注、图层、裁切和撤销记录。
- 验收图片上传、视频播放和关键帧提取。
- 验收 PNG、分镜表 PDF、JSON 和 ZIP 导出。
- ZIP 恢复为独立副本。
- 修正缩短镜头后播放指针越界的问题。
- 项目菜单和导出菜单支持点击外部关闭。
- Esc 关闭菜单后将焦点还给入口。
- ZIP 恢复会校验项目引用的示例图片。
- V1.0 独立记录于 ZIP 清单。
- 保留已存在的数据库格式和备份格式编号。

V1.5 另开开发分支。
