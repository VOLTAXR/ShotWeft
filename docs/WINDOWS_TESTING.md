# Windows 与 Linux 测试

从 [Node.js 下载页](https://nodejs.org/en/download) 选用与系统架构相符的 Windows 安装程序（`.msi`），安装 22.12 或更高版本。重新打开原生 PowerShell 或 cmd，用 `node -v` 和 `npm -v` 确认版本。打包测试还需要能从 `PATH` 运行的 Git 和 Windows `tar.exe`。以下命令使用 D 盘 NTFS 上的项目目录 `D:\Projects\ShotWeft`，把临时目录设为项目的 `.tmp`，Chromium 安装到 `.browsers`。

## PowerShell

```powershell
Set-Location D:\Projects\ShotWeft
New-Item -ItemType Directory -Force .tmp | Out-Null
$env:TEMP = "$PWD\.tmp"
$env:TMP = $env:TEMP
$env:SHOTWEFT_TMP = $env:TEMP
npm.cmd ci
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.browsers"; npx.cmd playwright install chromium --only-shell
$env:SHOTWEFT_REQUIRE_PDF = '1'
npm.cmd run test:package
```

## cmd.exe

```bat
cd /d D:\Projects\ShotWeft
if not exist .tmp mkdir .tmp
set "TEMP=%CD%\.tmp"
set "TMP=%TEMP%"
set "SHOTWEFT_TMP=%TEMP%"
npm.cmd ci
set "PLAYWRIGHT_BROWSERS_PATH=%CD%\.browsers"&& npx.cmd playwright install chromium --only-shell
set "SHOTWEFT_REQUIRE_PDF=1"&& npm.cmd run test:package
```

cmd 中使用 `set "变量=值"`，将变量值的结束位置限定在引号内。安装和测试应使用同一个 `PLAYWRIGHT_BROWSERS_PATH`。Windows 安装命令须由 Windows Node.js 运行。若共享工作树中的 `.browsers` 只有另一平台的浏览器，Playwright 可能读到同修订版的安装标记。可以将 Windows 的安装和测试一起指向 `.browsers\windows`，让两个平台使用各自的下载目录。

## Linux / WSL

```bash
npm ci
PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npx playwright install chromium --only-shell
npm run check
npm run build
PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npm test
SHOTWEFT_REQUIRE_PDF=1 PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npm run test:package
```

安装包验收使用隔离的源码和临时全局前缀，实际运行 `npm ci`、`npm pack`、全局安装与卸载。真实 PDF 通过时会打印页数、字节数和每页 JPEG 检查结果。只有缺少当前系统和架构所需的浏览器可执行文件时，普通模式才打印带路径的 `SKIP`。设置 `SHOTWEFT_REQUIRE_PDF=1` 后，缺少浏览器会使测试失败。浏览器已安装但启动失败时，两种模式都报错。

## PowerShell 读取 UTF-8 JSON

CLI 的 JSON 输出为 UTF-8。推荐在 PowerShell 7 中读取。在 Windows PowerShell 5.1 中，将 CLI 的输出传给 `ConvertFrom-Json` 前，可先为当前终端设置原生命令的输出解码。读取已经写好的 UTF-8 JSON 文件时，可对 `Get-Content` 显式传入 `-Encoding UTF8`。见 [PowerShell 字符编码](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding)。

```powershell
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
shotweft project show .tmp\working.zip | ConvertFrom-Json
```

## 平台差异

| 项目 | Windows | Linux |
| --- | --- | --- |
| 文件锁和写入 | 在目标旁创建 `.shotweft-lock`。打开 ZIP 的应用可能阻止原子替换，复测前可关闭占用程序。完整 CLI 回归创建文件符号链接，运行账号须有创建权限。 | 同样使用目标旁的目录锁。Linux 原生文件系统通常允许替换仍被其他进程打开的文件。 |
| 临时目录 | CLI 解压优先使用 `SHOTWEFT_TMP`，默认使用当前工作目录的 `.tmp`。上述命令也将 `TEMP`、`TMP` 设在 D 盘。 | CLI 解压优先使用 `SHOTWEFT_TMP`，默认使用系统临时目录（通常是 `/tmp`）。两平台的安装包测试均在项目 `.tmp` 内创建隔离目录。 |
| 真实 PDF 和字体 | 使用 Windows Chromium headless shell。Chromium 使用系统中文字体，例如可用的微软雅黑。 | 使用 Linux Chromium headless shell，需有相应系统库及字体，例如可用的 Noto Sans CJK。 |

两平台发布新 ZIP 或 PDF 时使用硬链接，编辑既有 ZIP 时使用同一文件系统上的原子替换。编辑符号链接项目时，对链接指向的 ZIP 加锁、写入。进程被强制终止后若遗留锁目录，确认没有写入任务再清理。字体和抗锯齿策略可使 PDF 的像素与字节数不同。测试核对页数、文件大小、标题和实际页面图像，中文显示效果可打开 PDF 检查。
