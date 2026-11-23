# ShotWeft Agent 分镜

用 `agent storyboard` 将原创短片剧本拆为可编辑的 ShotWeft 项目。命令在本地按固定规则运行。同一份输入和选项会得到相同的场景、镜头顺序、关联和时长。项目和条目 ID 以及更新时间由模型在创建时生成。

## 输入格式

将剧本保存为 UTF-8 纯文本文件。文件可带 BOM，大小上限为 1 MiB（1,048,576 字节）。

```text
1. 外景 旧码头 - 清晨
阿槐把铜纸鹤搁在缆桩上。潮水推来一张旧船票。
阿槐：原来你还留着这张票。
备注：先听到松动的缆绳。

INT. LIGHTHOUSE - NIGHT
老孟拧亮灯。阿槐把船票压在灯座下。
阿槐: 把灯留给下一班船吧。
```

场景标题以 `内景`、`外景`、`INT.` 或 `EXT.` 开头，可带 `1.` 或 `场景三` 等编号。场景类型统一为 `内景` 或 `外景`。时间可用带空格的短横线、长横线或斜杠分隔，例如 `内景：旧仓库 / 夜`。`场景三 外景 礁石滩 黄昏` 中的常见时段也可用空格分隔。省略时间时记为 `日`。

每行可独立写动作、对白或备注。系统将普通叙述写入场景的 `description`，将 `角色：台词` 和 `角色: 台词` 写入 `dialogue`，将备注、括号旁注及首个场景标题之前的文字写入 `notes`。没有场景标题时，文本归入一个默认场景。场景数超过镜头数时，后续场景的正文并入最后一个保留的场景，后续标题记在该场景的备注中。

## 命令

```text
shotweft agent storyboard <script.txt> <project.zip> --title <标题> [--frame 16:9|9:16|2.39:1] [--shots 12] [--pdf <storyboard.pdf>]
```

- `--title` 必填，长度为 1 到 120 个 UTF-16 代码单元。
- `--frame` 默认为 `16:9`。
- `--shots` 默认为 12，可指定 1 到 50 的整数。
- 指定 `--pdf` 时使用 ShotWeft 的分镜排版导出 PDF，需要安装 Playwright Chromium。显示中文需要系统提供中文字体。

从仓库运行时，先执行 `npm run build:cli`，再用 `node dist/cli/shotweft.js` 作为命令前缀。

## 完整工作流

命令适用于关闭 stdin 的自动化任务，全程在本地运行，无需 LLM 或 MCP。以下 Bash 示例使用当前目录的 `script.txt`，输出文件需使用新路径。手上已有网页项目 ZIP 时，可替换 `starter.zip` 作为导入源。`agent storyboard` 将剧本生成独立项目。

```bash
cli() { shotweft "$@" </dev/null; }
first_id() { node -p 'JSON.parse(require("node:fs").readFileSync(0, "utf8"))[0].id'; }

cli project create starter.zip --title "候潮灯 项目草案"
cli project restore starter.zip imported.zip
cli agent storyboard script.txt project.zip --title "候潮灯" --shots 12
shot_id=$(cli shot list project.zip | first_id)
scene_id=$(cli scene list project.zip | first_id)
cli shot update project.zip "$shot_id" --title "潮水推来船票" --duration 4.5
cli scene update project.zip "$scene_id" --location "渡口外侧"
cli export json project.zip --output project.json
cli export zip project.zip --output delivery.zip
cli export pdf delivery.zip --output storyboard.pdf
cli agent verify delivery.zip
cli agent verify delivery.zip --pdf storyboard.pdf
cli project restore delivery.zip restored.zip
cli shot update restored.zip "$shot_id" --notes "保留缆绳声"
cli agent verify restored.zip
```

在仓库中可将 `cli` 函数内的 `shotweft` 替换为 `node dist/cli/shotweft.js`。执行 `export pdf` 前需安装 Playwright Chromium。ZIP 校验与已有 PDF 的校验均无需浏览器。

`export zip <zip> --output <新zip>` 保留项目清单、素材与标注。目标存在时拒绝覆盖，成功时返回 `{"path":"<绝对路径>"}`。恢复 ZIP 后会保留场景和镜头 ID，可用原 ID 继续编辑。

`agent verify <zip> [--pdf <storyboard.pdf>]` 检查 ZIP 项目清单、场景和镜头关联、条目白名单、素材大小和 CRC。结果含 ZIP 绝对路径 `path`、项目 `project` 和汇总 `summary`。传入 `--pdf` 时才会附带 `pdf` 对象，内含绝对路径 `path`、字节数 `bytes`、页数 `pages` 和标题 `title`。无标题时 `title` 为 `null`。ZIP 校验失败，或指定的 PDF 不存在、格式无效、损坏或为零页时，命令返回 `1`，错误写入 stderr。

## 输出和限制

成功时退出码为 `0`，标准输出为一行 JSON。`agent storyboard` 的 `path` 是 ZIP 的绝对路径。它的 `pdf` 字段是 PDF 绝对路径，只在指定 `--pdf` 时返回。两个 Agent 命令的 `project` 都是 ZIP 中的实际项目，包括场景和镜头。`summary` 含 `scenes`（场景数）、`shots`（镜头数）和 `duration`（总秒数）。在网页项目首页通过「恢复 ZIP」打开后，可继续编辑并重新导出。

参数错误以退出码 `2` 返回。无效剧本、目标文件已存在或写入与渲染失败以退出码 `1` 返回。错误以 `{"error":"错误信息"}` 写入标准错误。ZIP 和 PDF 的目标父目录须已存在，已有文件会保留。

每个保留场景至少分配一个镜头，其余镜头按动作和对白的长度分配。镜头取正文片段或场景地点作为标题，根据文字量估算时长，景别、角度、运镜和焦段按固定顺序轮换。时长以半秒为步长，最高 8 秒。场景文本和镜头备注会按项目格式的长度上限截断。生成的项目以文字为主，画面使用编辑器的默认画面底图，可在网页补充图片或视频。

## 后续接入 LLM 的边界

当前命令离线确定性运行，不调用外部 AI 或 API，无需 API Key。未来可将 LLM 作为主动启用的拆解来源，仅产生候选场景和镜头。若需要将剧本发送给外部服务，应由用户明确选择并授权。候选数据仍须在本地通过项目格式与关联校验，由现有的 ZIP 和 PDF 导出路径写入。
