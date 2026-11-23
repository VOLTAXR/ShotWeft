# Windows and Linux Testing

Install a Windows `.msi` matching the system architecture from the [Node.js download page](https://nodejs.org/en/download), using version 22.12 or newer. Reopen native PowerShell or cmd and confirm with `node -v` and `npm -v`. Package tests also require Git and Windows `tar.exe` on `PATH`. The commands below use the NTFS project directory `D:\Projects\ShotWeft`, put temporary files in the project `.tmp`, and install Chromium in `.browsers`.

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

In cmd, use `set "name=value"` so the value ends before the quote. Installation and testing must use the same `PLAYWRIGHT_BROWSERS_PATH`. Windows installation commands must run with Windows Node.js. If a shared `.browsers` directory contains only another platform's browser, Playwright may see the same revision marker. Point Windows installation and testing at `.browsers\windows` so each platform uses its own download directory.

## Linux / WSL

```bash
npm ci
PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npx playwright install chromium --only-shell
npm run check
npm run build
PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npm test
SHOTWEFT_REQUIRE_PDF=1 PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npm run test:package
```

Package acceptance uses isolated source and a temporary global prefix, running real `npm ci`, `npm pack`, global installation, and uninstall. A real PDF reports page count, byte size, and per-page JPEG checks. In normal mode, the script prints a `SKIP` with a path only when the current platform/architecture browser executable is missing. With `SHOTWEFT_REQUIRE_PDF=1`, a missing browser fails the test. If the browser is installed but fails to launch, both modes fail.

## PowerShell UTF-8 JSON

CLI JSON output is UTF-8. Prefer PowerShell 7. In Windows PowerShell 5.1, set native-command output decoding before piping CLI output to `ConvertFrom-Json`. For an existing UTF-8 JSON file, pass `-Encoding UTF8` to `Get-Content`. See [PowerShell character encoding](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding).

```powershell
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
shotweft project show .tmp\working.zip | ConvertFrom-Json
```

## Platform Differences

| Area | Windows | Linux |
| --- | --- | --- |
| File locks and writes | Creates `.shotweft-lock` beside the target. An application holding the ZIP open can block atomic replacement; close it before retrying. Full CLI regression creates file symlinks, so the account needs symlink permission. | Uses the same sibling directory lock. Native Linux filesystems usually allow replacing a file even while another process has it open. |
| Temporary directory | Extraction prefers `SHOTWEFT_TMP`, then the current directory `.tmp`. The commands above also put `TEMP` and `TMP` on D:. | Extraction prefers `SHOTWEFT_TMP`, then the system temporary directory (usually `/tmp`). Package tests on both platforms create isolated directories under the project `.tmp`. |
| Real PDF and fonts | Uses Windows Chromium headless shell. Chromium uses installed CJK fonts such as Microsoft YaHei. | Uses Linux Chromium headless shell and requires system libraries and CJK fonts such as Noto Sans CJK. |

Both platforms publish new ZIP/PDF files through hard links and edit existing ZIPs with atomic replacement on the same filesystem. Editing a symlinked project locks and writes the ZIP target. If a process is killed and leaves a lock directory, confirm no writer is active before cleanup. Font and anti-aliasing differences can change PDF pixels and byte size; tests check page count, file size, title, and actual page images, while Chinese rendering should be inspected by opening the PDF.