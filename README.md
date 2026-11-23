# ShotWeft

用于短片创作的本地影视前期工作台。
工作台包含项目首页和响应式编辑器。
打开《潮汐之前》可编辑示例剧本和镜头。

## Windows 本地启动

仓库安装依赖、构建网页和使用 CLI 均需 Node.js 22.12 或更高版本，与 `package.json` 的 `engines.node` 一致。Vite 自身兼容 Node.js 20.19 系列，ShotWeft 仓库统一使用 22.12 或更高版本。部署后的网页在浏览器中运行，无需本地安装 Node.js。

在仓库根目录运行。

```powershell
New-Item -ItemType Directory -Force .tmp | Out-Null
$env:TEMP = "$PWD\.tmp"
$env:TMP = $env:TEMP
npm.cmd ci
npm.cmd run dev
```

访问 [本地工作台](http://127.0.0.1:5173/)。
浏览器用 IndexedDB 保存项目。
使用同一协议、主机和端口打开旧项目。

## ShotWeft CLI V1.5

从仓库根目录使用 Node.js 22.12 或更高版本运行。构建后可直接用 Shell 调用 CLI。

```bash
npm ci
npm run build:cli
node dist/cli/shotweft.js --help
node dist/cli/shotweft.js project create tide.zip --title "潮汐之前" --frame 2.39:1
node dist/cli/shotweft.js scene list tide.zip
node dist/cli/shotweft.js shot add tide.zip --title "雾中的海岸" --duration 5
node dist/cli/shotweft.js export json tide.zip
```

可在仓库根目录执行 `npm pack` 创建本地 tarball，打包时会自动构建 CLI。使用 `npm install -g ./shotweft-1.5.0.tgz` 安装后，可直接运行 `shotweft --help`。`package.json` 的 `private: true` 会阻止 `npm publish`，防止误发布。安装步骤和 SHA256 校验命令见 [V1.5 发布准备说明](docs/RELEASE_NOTES_V1.5.md)。

使用 `npm run test:package` 验证本地安装包。测试需要 Git 和系统 `tar`，在项目 `.tmp/` 中复制当前源码、安装依赖、打包并安装到临时全局前缀。验收会调用 npm 生成的命令入口，再卸载并检查入口已移除。依赖下载复用项目 `.npm-cache`。测试默认使用项目 `.browsers` 内对应平台的 Chromium。缺少浏览器时会明确输出 `SKIP`。发布验收设置 `SHOTWEFT_REQUIRE_PDF=1`，要求真实导出和验证 PDF。运行命令与 PDF 前置条件见 [Windows 与 Linux 测试](docs/WINDOWS_TESTING.md)。失败时脚本会打印日志路径。

新建项目含一个初始场景和一个初始镜头。使用 `scene list` 和 `shot list` 获取 ID，再传给查询、更新、排序或删除命令。删除场景会解除关联，镜头保留。使用 `project update --archived true` 归档，传 `false` 重新启用。

CLI 直接读写网页编辑器的项目 ZIP。网页可通过「恢复 ZIP」导入 CLI 项目，CLI 也可从网页备份恢复一个新文件。

```bash
node dist/cli/shotweft.js project restore web-backup.zip working.zip
npx playwright install chromium --only-shell
node dist/cli/shotweft.js export pdf working.zip --output storyboard.pdf
```

PDF 需要可启动的 Playwright Chromium，中文内容需要系统安装中文字体。仓库外可运行 `npx playwright@1.65.1 install chromium --only-shell`。若用 `PLAYWRIGHT_BROWSERS_PATH` 指定安装目录，导出时使用同一变量。PDF 使用与网页相同的分镜布局、裁切和标注渲染。平台差异见 [PDF 与字体要求](docs/WINDOWS_TESTING.md#平台差异)。

### 帮助与退出码

用 `shotweft --help` 或 `shotweft -h` 查看总帮助，用 `shotweft project --help` 查看命令组，用 `shotweft project create --help` 查看具体用法。查看帮助时可省略位置参数和必填选项。未知命令、子命令和选项仍会报错。

操作成功时退出码为 `0`，标准输出是一行 JSON。帮助和版本信息以文本输出。运行失败返回 `1`，命令或参数错误返回 `2`，失败信息以单行 `{"error":"错误信息"}` 写入标准错误。标准输出管道的读取端提前关闭时，CLI 在收到 `EPIPE` 后静默退出，退出码为 `0`。

### ZIP 写入与临时目录

新建、恢复和导出要求目标路径可用。编辑命令通过文件锁和原子替换保存原 ZIP。场景或镜头移到当前位置时，ZIP 字节与项目更新时间保持原值。若进程被强制终止而遗留同名 `.shotweft-lock` 目录，确认该文件当前没有写入任务后再移除锁目录。

CLI 优先使用 `SHOTWEFT_TMP` 指定的目录暂存从 ZIP 解压的媒体。该目录会在需要时创建。未设置时，Windows 使用当前工作目录下的 `.tmp`，Linux 和 macOS 使用系统临时目录（Linux 上通常是 `/tmp`）。项目文件仍写入命令指定的位置，原子替换使用目标旁的暂存文件。

### Agent 分镜、验证和恢复

用 UTF-8 纯文本剧本 `script.txt` 生成 12 镜头。在执行更新前，从对应列表读取首个镜头与场景的 `id`，填写变量 `SHOT_ID` 与 `SCENE_ID`。已有网页备份时，可用它替换示例中的 `starter.zip` 作为导入源。

```bash
shotweft project create starter.zip --title "候潮灯 项目草案"
shotweft project restore starter.zip imported.zip
shotweft agent storyboard script.txt project.zip --title "候潮灯" --frame 16:9 --shots 12
shotweft shot list project.zip
shotweft scene list project.zip
shotweft shot update project.zip "$SHOT_ID" --title "潮水推来船票" --duration 4.5
shotweft scene update project.zip "$SCENE_ID" --location "渡口外侧"
shotweft export json project.zip --output project.json
shotweft export zip project.zip --output delivery.zip
shotweft export pdf delivery.zip --output storyboard.pdf
shotweft agent verify delivery.zip
shotweft agent verify delivery.zip --pdf storyboard.pdf
shotweft project restore delivery.zip restored.zip
shotweft shot update restored.zip "$SHOT_ID" --notes "保留缆绳声"
shotweft agent verify restored.zip
```

工作流本地运行，无需 LLM、MCP 或交互输入。从仓库运行时，用 `node dist/cli/shotweft.js` 替换 `shotweft`。`agent storyboard` 默认生成 12 个镜头，画幅为 16:9，也可用 `--pdf <新pdf>` 在生成项目时一并导出 PDF。使用网页项目首页的「恢复 ZIP」导入后，可继续编辑场景和镜头。可直接执行的 Bash 示例和输出字段见 [Agent 分镜指南](docs/AGENT.md)。

`export zip` 的 `--output` 必填，目标须为新路径。命令流式写出完整 ZIP，返回包含绝对路径的 `path`。`agent verify` 检查项目清单、关联和素材，返回 `path`、`project` 及场景数、镜头数和总秒数。附带 `--pdf` 时还返回 PDF 路径、字节数、页数和标题。验证 PDF 无需 Chromium。

ZIP 恢复保留项目 ID、素材和标注。JSON 只含清单，只有项目没有用户素材时才可从 JSON 恢复为 ZIP。内置示例图片可随项目恢复；含用户图片或视频的项目须使用 ZIP。

场景和镜头操作、项目清单与 ZIP 读写由网页和 CLI 共享，入口位于 [src/core](src/core)。

构建网页和 CLI 后，`npm test -- --cli-only` 会检查 CLI 编辑、PDF 和 ZIP 双向兼容，以及从剧本生成分镜、在网页恢复后继续编辑的流程。

## 本地验收

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.browsers"
npx.cmd playwright install chromium --only-shell
npm.cmd run build
npm.cmd test
```

测试启动临时预览服务并自动关闭。
截图位于 [docs/screenshots](docs/screenshots)。

GitHub Actions 在推送到 `feat/shotweft-cli-v1.5` 和向 `main` 提交 PR 时验证 Node.js 22.12。Linux 跑完整回归，Linux 与 Windows 都用安装后的 CLI 导出并验证真实 PDF。各任务成功后上传各自的 `.tgz`、`SHA256SUMS.txt` 和 `release-manifest.json`。手动触发要求工作流已存在于默认分支。发布前验收见 [发布检查清单](docs/RELEASE_CHECKLIST.md)。

- [版本记录](CHANGELOG.md)
- [扩展接口约定](docs/EXTENSION_BOUNDARY.md)
- [P3 智能能力技术方案](docs/AGENT_INTELLIGENCE.md)（规划文档，LLM 尚未实现。）
- [阶段计划](docs/PLAN.md)
- [开源审查](docs/OPEN_SOURCE_AUDIT.md)
- [发布参考资料及许可](docs/RELEASE_REFERENCES.md)
- [素材来源](docs/MEDIA_SOURCES.md)
- [测试报告](docs/TEST_REPORT.md)
- [第二阶段功能说明](docs/PHASE_2.md)

## 第三阶段操作

- 在画布工具栏选择标注工具。
- 点击放置文字。拖动创建形状或笔迹。
- 点击标注，再拖动控制点缩放。
- 在「图层」中调整层序、名称和不透明度。
- 用眼睛和锁图标切换显示及锁定。
- 拖动侧栏边界或时间轴顶边调整尺寸。
- 聚焦边界后也可用方向键调整。
- 从「导出」下载 PNG、PDF、JSON 或 ZIP。
- 镜头关联视频时可导出原始视频。
- 在项目首页用「恢复 ZIP」创建副本。

PNG 保留裁切及可见标注。
视频镜头的分镜图使用选定关键帧。
PDF 页面以高分辨率图像输出。
ZIP 包含媒体、缩略图和项目清单。
ZIP 备份与恢复上限为 768 MB。
JSON 保存项目结构与媒体清单。
ZIP 恢复为独立项目。
恢复副本从新的编辑历史开始。

## 当前范围

项目支持新建、重命名、复制、归档和删除。
场景、镜头和时间轴支持拖拽排序。
图片可裁切。视频可预演并提取关键帧。
项目、素材和编辑记录保存在浏览器。
可用画幅为 16:9、9:16 和 2.39:1。
示例含三张摄影照片和两段真实视频。
画布支持五种标注及图层属性。
属性面板可折叠和调宽。
时间轴支持调高、拖拽和刻度定位。
第三方导出依赖仅在导出或恢复时加载。
第三方依赖声明见 [THIRD_PARTY_NOTICES.txt](public/THIRD_PARTY_NOTICES.txt)。





