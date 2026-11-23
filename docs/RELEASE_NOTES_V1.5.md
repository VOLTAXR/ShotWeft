# ShotWeft V1.5 发布准备说明

软件包版本为 `1.5.0`。记录日期为 2026-11-23。安装步骤使用本地 tarball。本阶段未发布 npm 包，也未创建正式 GitHub Release 或项目许可证；当前 `v1.5.0` 标签沿用现有仓库状态，本次清理不创建、移动或删除标签。

## 已实现功能

- 网页工作台可管理项目、场景、镜头和素材，支持裁切、视频关键帧、画布标注及图层。可导出 PNG、PDF、JSON 和项目 ZIP。
- CLI 支持项目、场景和镜头操作，以及 JSON、ZIP 和 PDF 导出。CLI 与网页可互相恢复项目 ZIP，保留素材、标注和场景／镜头 ID。
- `agent storyboard` 可从 UTF-8 短片剧本按本地规则生成分镜项目。默认生成 12 个镜头，可附带 PDF。`agent verify` 校验项目 ZIP，可同时校验已有 PDF。

## 安装与校验

构建和运行 CLI 需要 Node.js 22.12 或更高版本。在仓库根目录执行 `npm ci`，然后运行 `mkdir -p artifacts`（Linux）或 `New-Item -ItemType Directory -Force artifacts`（PowerShell），再生成本地 tarball 和校验文件。`npm pack` 会自动构建 CLI。准备检查产物时使用只存放本次构建 tarball 的目录。

```sh
npm pack --pack-destination artifacts
npm run release:checksums
cd artifacts
```

也可下载相应 GitHub Actions 任务的产物并解压到同一目录。该目录包含 `shotweft-1.5.0.tgz`、`SHA256SUMS.txt` 和 `release-manifest.json`。SHA256 通过后再安装。

Linux

```bash
sha256sum --check SHA256SUMS.txt && npm install -g ./shotweft-1.5.0.tgz && shotweft --help
```

Windows PowerShell

```powershell
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath .\shotweft-1.5.0.tgz).Hash
if ((Get-Content -LiteralPath .\SHA256SUMS.txt) -notcontains "$hash  shotweft-1.5.0.tgz") {
    throw 'SHA256 校验失败'
}
npm.cmd install -g .\shotweft-1.5.0.tgz
shotweft --help
```

安装包保留 `private: true`，由 npm 阻止误发布。它包含 CLI、示例 JPEG、素材来源、第三方声明、Agent 指南和本说明。

## Playwright Chromium 与平台差异

导出 PDF 需要与 Playwright `1.65.1` 对应的本机 Chromium headless shell。Linux 还需要 Chromium 的系统依赖，可同时用 `--with-deps` 安装。中文文字需要系统提供中文字体，例如 Linux 的 Noto Sans CJK 或 Windows 的微软雅黑。

```bash
# Linux
npx playwright@1.65.1 install --with-deps chromium --only-shell
```

```powershell
# Windows PowerShell
npx.cmd playwright@1.65.1 install chromium --only-shell
```

如设置 `PLAYWRIGHT_BROWSERS_PATH`，安装和导出须使用同一目录。Windows 和 Linux/WSL 使用各自平台的浏览器。ZIP 素材解压优先使用 `SHOTWEFT_TMP`。未设置时，Windows 使用当前目录下的 `.tmp`，Linux 使用系统临时目录。两平台字体可能不同，PDF 字节数也可能不同。测试命令及 Windows UTF-8 输出说明见 [Windows 与 Linux 测试](WINDOWS_TESTING.md)。

## Agent 工作流

从 UTF-8 `script.txt` 创建分镜，使用 `shot list` 和 `scene list` 获取 ID，再用 `shot update` 或 `scene update` 编辑。导出 ZIP 后验证交付文件，也可用网页项目首页的「恢复 ZIP」继续编辑。

```bash
shotweft agent storyboard script.txt project.zip --title "候潮灯" --shots 12
shotweft shot list project.zip
shotweft scene list project.zip
shotweft export zip project.zip --output delivery.zip
shotweft export pdf delivery.zip --output storyboard.pdf
shotweft agent verify delivery.zip --pdf storyboard.pdf
shotweft project restore delivery.zip restored.zip
```

验证 ZIP 和已有 PDF 无需 Chromium。完整的输入约定、自动化调用和恢复示例见 [Agent 分镜指南](AGENT.md)。

## 已知限制

- Agent 按文本规则拆解场景和镜头。LLM、MCP 和智能语义分析尚未实现。生成的项目使用默认画面，可在网页手动补充图片或视频。
- 剧本上限为 1 MiB，可指定 1 至 50 个镜头。场景多于镜头时，后续场景合并到最后一个保留场景。
- 项目 ZIP 备份和恢复上限为 768 MB。含用户素材的项目须使用 ZIP 恢复。PDF 导出和真实页面渲染依赖本机浏览器及字体。
