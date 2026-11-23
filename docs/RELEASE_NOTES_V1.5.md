# ShotWeft V1.5 Release Notes

Package version: `1.5.0`. Recorded: 2026-11-23. Installation uses a local tarball. No npm package has been published and no official GitHub Release has been created. The existing `v1.5.0` tag reflects the current repository state; this release preparation does not create, move, or delete tags.

## Implemented Features

- The web workbench manages projects, scenes, shots, and media, including cropping, video keyframes, canvas annotations, and layers. It exports PNG, PDF, JSON, and project ZIP.
- The CLI supports project, scene, and shot operations plus JSON, ZIP, and PDF export. CLI and web projects restore each other's ZIP files while preserving media, annotations, and scene/shot IDs.
- `agent storyboard` builds a storyboard project from a UTF-8 short-film screenplay using local rules. It produces 12 shots by default and can emit a PDF. `agent verify` validates a project ZIP and can validate an existing PDF.

## Installation and Verification

Building and running the CLI requires Node.js 22.12 or newer. From the repository root, run `npm ci`, create an artifacts directory with `mkdir -p artifacts` (Linux) or `New-Item -ItemType Directory -Force artifacts` (PowerShell), then build the local tarball and checksum files. `npm pack` builds the CLI automatically. Use a dedicated artifacts directory that contains only the tarball from this build.

```sh
npm pack --pack-destination artifacts
npm run release:checksums
cd artifacts
```

You can also download the matching GitHub Actions artifacts and extract them into the same directory. It contains `shotweft-1.5.0.tgz`, `SHA256SUMS.txt`, and `release-manifest.json`. Verify SHA256 before installing.

Linux:

```bash
sha256sum --check SHA256SUMS.txt && npm install -g ./shotweft-1.5.0.tgz && shotweft --help
```

Windows PowerShell:

```powershell
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath .\shotweft-1.5.0.tgz).Hash
if ((Get-Content -LiteralPath .\SHA256SUMS.txt) -notcontains "$hash  shotweft-1.5.0.tgz") {
    throw 'SHA256 verification failed'
}
npm.cmd install -g .\shotweft-1.5.0.tgz
shotweft --help
```

The package keeps `private: true`, preventing accidental publication. It contains the CLI, demo JPEGs, media sources, third-party notices, the Agent guide, and these release notes.

## Playwright Chromium and Platform Differences

PDF export requires the local Chromium headless shell matching Playwright `1.65.1`. Linux also needs Chromium system dependencies; `--with-deps` installs them. Chinese text requires a system CJK font, such as Noto Sans CJK on Linux or Microsoft YaHei on Windows.

```bash
# Linux
npx playwright@1.65.1 install --with-deps chromium --only-shell
```

```powershell
# Windows PowerShell
npx.cmd playwright@1.65.1 install chromium --only-shell
```

If `PLAYWRIGHT_BROWSERS_PATH` is set, installation and export must use the same directory. Windows and Linux/WSL use their own platform browsers. ZIP media extraction prefers `SHOTWEFT_TMP`; when unset, Windows uses the current directory `.tmp` and Linux uses the system temporary directory. Fonts and PDF byte sizes can differ by platform. See [Windows and Linux testing](WINDOWS_TESTING.md) for test commands and the Windows UTF-8 output note.

## Agent Workflow

Create a storyboard from UTF-8 `script.txt`, read IDs with `shot list` and `scene list`, then edit with `shot update` or `scene update`. Export a ZIP, validate the delivery, or restore it in the web project home page to continue editing.

```bash
shotweft agent storyboard script.txt project.zip --title "候潮灯" --shots 12
shotweft shot list project.zip
shotweft scene list project.zip
shotweft export zip project.zip --output delivery.zip
shotweft export pdf delivery.zip --output storyboard.pdf
shotweft agent verify delivery.zip --pdf storyboard.pdf
shotweft project restore delivery.zip restored.zip
```

Validating a ZIP and an existing PDF does not require Chromium. See [Agent guide](AGENT.md) for the complete input contract, automation examples, and restore workflow.

## Known Limitations

- The Agent breaks down scenes and shots using text rules. LLM, MCP, and semantic shot analysis are not implemented. Generated projects use default backdrops; add real images or video in the web editor.
- Screenplay input is limited to 1 MiB and 1–50 shots. If there are more scenes than shots, later scenes are merged into the final retained scene.
- Project ZIP backup and restore are limited to 768 MB. Projects with user media must use ZIP restore. PDF export and real page rendering depend on the local browser and fonts.