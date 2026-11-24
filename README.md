# ShotWeft

ShotWeft is a local-first pre-production workspace for short films. It combines a responsive browser workbench with a command-line interface (CLI) and an offline storyboard agent. Projects, media, and edit history stay in the browser or in portable project ZIP files.

The included demo project, **潮汐之前**, can be opened from the project home page and edited immediately.

## Features

- Project home page for creating, renaming, duplicating, archiving, and deleting projects.
- Responsive editor with shot list, script, storyboard canvas, media library, timeline, and preview.
- Drag-and-drop ordering for scenes and shots, synchronized between the list and timeline.
- Konva storyboard canvas with framing guides, aspect ratios, crop zoom/pan, and keyboard nudging.
- Five annotation tools with layer ordering, visibility, lock, opacity, and rename controls.
- Local JPG, PNG, WebP, MP4, and WebM media with thumbnail and keyframe extraction.
- Undo/redo for projects, scenes, shots, aspect ratios, crops, and media associations.
- PNG, storyboard PDF, project JSON, and project ZIP export.
- CLI project, scene, shot, JSON, ZIP, and PDF operations.
- Offline `agent storyboard` and `agent verify` workflows.
- ZIP restore creates an independent project with a fresh edit history.

V1.6 P1 adds the optional frame-based timeline data layer and V1.0/V1.5-compatible archive persistence. The React video workbench and local MP4 renderer are P2/P3 work; see the [video engine decision and milestone plan](docs/VIDEO_ENGINE_DECISION.md).

## Requirements

- Node.js **22.12 or newer**.
- npm.
- Git and the system `tar` command for package tests.
- Playwright Chromium for real PDF export.
- A CJK system font when the storyboard contains Chinese text.

Install the browser once:

```bash
npx playwright@1.65.1 install --with-deps chromium --only-shell
```

On Windows PowerShell:

```powershell
npx.cmd playwright@1.65.1 install chromium --only-shell
```

If you set `PLAYWRIGHT_BROWSERS_PATH`, use the same value for installation and PDF export.

## Installation

ShotWeft is currently distributed as a local tarball. It is **not published on npm**, and `package.json` keeps `private: true` to prevent accidental publishing.

From the repository root:

```bash
npm ci
npm run build
npm pack
npm install -g ./shotweft-1.5.0.tgz
shotweft --help
```

On Windows:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd pack
npm.cmd install -g .\shotweft-1.5.0.tgz
shotweft --help
```

The intended future public installation form is:

```bash
npm install -g shotweft@latest
```

This command is not available today. Do not use it until a public package is released.

The packed CLI contains the compiled CLI, PDF renderer, Agent guide, release notes, demo JPEGs, and third-party notices. Verify package contents and checksums with:

```bash
npm run test:package
npm run release:checksums
```

## Quick Start

Build the CLI and create a project:

```bash
npm ci
npm run build:cli
node dist/cli/shotweft.js --help
node dist/cli/shotweft.js project create tide.zip --title "Before the Tide" --frame 2.39:1
node dist/cli/shotweft.js scene list tide.zip
node dist/cli/shotweft.js shot add tide.zip --title "Foggy Coast" --duration 5
node dist/cli/shotweft.js export json tide.zip
```

Start the browser workbench:

```bash
npm run dev
```

Open `http://127.0.0.1:5173/`. The browser stores projects in IndexedDB. Open old projects with the same protocol, host, and port.

## CLI Reference

Run `shotweft --help` for the top-level help. Help is scoped:

```bash
shotweft --help
shotweft project --help
shotweft project create --help
shotweft agent storyboard --help
```

### Project commands

```text
project create <zip> --title <title> [--frame 16:9|9:16|2.39:1]
project show <zip>
project update <zip> [--title <title>] [--frame <frame>] [--archived true|false]
project restore <zip|json> <new-zip>
```

### Scene commands

```text
scene list <zip>
scene show <zip> <id>
scene add <zip> [scene options]
scene update <zip> <id> [scene options]
scene move <zip> <id> --position <1-based-index>
scene delete <zip> <id>
```

Scene options: `--location`, `--setting 内景|外景`, `--time`, `--description`, `--dialogue`, `--notes`.

### Shot commands

```text
shot list <zip>
shot show <zip> <id>
shot add <zip> [shot options]
shot update <zip> <id> [shot options]
shot move <zip> <id> --position <1-based-index>
shot delete <zip> <id>
```

Shot options: `--title`, `--size`, `--angle`, `--movement`, `--lens`, `--duration`, `--notes`, `--scene <id>`. Use `--scene=` to clear the scene association.

### Export commands

```text
export json <zip> [--output <new-json>]
export zip <zip> --output <new-zip>
export pdf <zip> --output <new-pdf>
```

### Agent commands

```text
agent storyboard <script.txt> <project.zip> --title <title> [--frame ...] [--shots 12] [--pdf <storyboard.pdf>]
agent verify <zip> [--pdf <storyboard.pdf>]
```

Successful commands write one JSON line to stdout. Errors write one JSON line to stderr. Exit codes are `0` for success, `1` for runtime failure, and `2` for usage errors. Commands do not prompt for input.

## Agent Workflows

`agent storyboard` converts a UTF-8 screenplay into a ShotWeft project. It runs locally and deterministically; it does not call an LLM, an external API, or MCP.

```bash
shotweft agent storyboard script.txt project.zip \
  --title "Before the Tide" --frame 16:9 --shots 12 --pdf storyboard.pdf
shotweft shot list project.zip
shotweft scene list project.zip
shotweft shot update project.zip <shot-id> --title "The Ticket" --duration 4.5
shotweft scene update project.zip <scene-id> --location "Outer Pier"
shotweft export json project.zip --output project.json
shotweft export zip project.zip --output delivery.zip
shotweft export pdf delivery.zip --output storyboard.pdf
shotweft agent verify delivery.zip
shotweft agent verify delivery.zip --pdf storyboard.pdf
shotweft project restore delivery.zip restored.zip
shotweft shot update restored.zip <shot-id> --notes "Keep the rope sound"
shotweft agent verify restored.zip
```

`export zip` refuses to overwrite an existing target. `agent verify` validates the project manifest, scene/shot relations, archive allowlist, media sizes, and CRC. It validates an existing PDF without launching Chromium. ZIP restore preserves project, scene, and shot IDs so edits can continue.

See [Agent guide](docs/AGENT.md) for input rules, output fields, and automation examples.

## Storyboard Generation

`agent storyboard` accepts UTF-8 text up to 1 MiB and supports:

- Chinese headings: `内景`, `外景`, with optional numbering such as `1.` or `场景三`.
- English headings: `INT.` and `EXT.`.
- Time separated by a spaced hyphen, em dash, slash, or a recognized trailing time word.
- Action lines, dialogue lines such as `Name: line`, and notes.

The default is exactly 12 shots. Use `--shots` to request 1–50. Each retained scene receives at least one shot; remaining shots are distributed by text length. Shot duration is estimated from text length, rounded to half-second steps, with an 8-second maximum. If there are more scenes than shots, later scene text is merged into the final retained scene.

The generated project contains text and default backdrops. Add real images or video in the web editor. Chinese content is preserved as written; it is not translated.

## Project Management

Use `project create` for a new project, `project restore` to import a web or CLI ZIP, and `project update` for title, aspect ratio, or archive state.

The first project contains one initial scene and one shot. Read scene and shot IDs with `scene list` and `shot list`, then pass them to `show`, `update`, `move`, or `delete`. Deleting a scene clears the scene association on its shots; deleting a shot removes the shot.

Project ZIPs are shared with the web editor. The web project home page can restore a CLI ZIP, and the CLI can restore a web backup. JSON contains only the manifest; projects with user media must use ZIP. ZIP backup and restore are limited to 768 MB.

## Export and Validation

```bash
shotweft export json project.zip --output project.json
shotweft export zip project.zip --output delivery.zip
shotweft export pdf delivery.zip --output storyboard.pdf
shotweft agent verify delivery.zip --pdf storyboard.pdf
```

- `export json` writes the project manifest; without `--output` it prints the manifest to stdout.
- `export zip` streams a complete, restorable ZIP and returns an absolute `path`.
- `export pdf` renders the same storyboard layout used by the web editor and requires Playwright Chromium.
- `agent verify` checks ZIP integrity and optional PDF metadata: path, byte size, page count, and title.

For release artifacts:

```bash
npm pack --pack-destination artifacts
npm run release:checksums
```

This creates `SHA256SUMS.txt` and `release-manifest.json` alongside the tarball. `private: true` remains effective; no npm publication is performed by these commands.

## Troubleshooting

### PDF export cannot start Chromium

Install the matching Playwright Chromium:

```bash
npx playwright@1.65.1 install --with-deps chromium --only-shell
```

If `PLAYWRIGHT_BROWSERS_PATH` is set, install and export with the same directory.

### Chinese text is missing from a PDF

Install a CJK font. Linux commonly uses Noto Sans CJK; Windows commonly uses Microsoft YaHei. PDF pages are rasterized, so text appearance depends on system fonts.

### PowerShell 5.1 cannot parse CLI JSON

CLI output is UTF-8. Prefer PowerShell 7, or set:

```powershell
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
shotweft project show .tmp\working.zip | ConvertFrom-Json
```

### A target file already exists

ShotWeft refuses to overwrite create/export targets. Choose a new output path. To update an existing project ZIP in place, use `project update`, `scene update`, or `shot update`.

### A lock directory remains

A `.shotweft-lock` directory beside a project means a write is active or was interrupted. Confirm no process is writing, then remove the stale lock.

### Node version error

Use Node.js 22.12 or newer. `package.json` declares `engines.node`.

## Development

```bash
npm ci
npm run dev
npm run build
```

The web app uses React, TypeScript, and Vite. Konva renders the storyboard canvas; Dexie stores projects in IndexedDB; Motion handles interface transitions; Radix Dialog provides accessible dialogs. Shared project, scene, shot, ZIP, and PDF logic lives in `src/core` and `src/cli`.

Build the CLI separately with:

```bash
npm run build:cli
```

The repository includes a completion-reporting protocol in [AGENTS.md](AGENTS.md). Reports are generated with `npm run report:agent`.

## Testing

```bash
npm run check
npm run build
PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npm test
PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" SHOTWEFT_REQUIRE_PDF=1 npm run test:package
```

Windows package verification:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.browsers"
$env:SHOTWEFT_REQUIRE_PDF = '1'
npm.cmd run test:package
```

`npm test` starts a temporary preview server and runs the browser, CLI, ZIP security, Agent, and PDF regressions. `npm run test:package` performs an isolated `npm ci`, real `npm pack`, temporary-prefix global install, PDF verification, and uninstall check. See [Windows and Linux testing](docs/WINDOWS_TESTING.md) and [release checklist](docs/RELEASE_CHECKLIST.md).

## License

ShotWeft does not currently include a project LICENSE file. The project license is pending user confirmation; MIT and Apache-2.0 are the candidates under review. Third-party dependencies retain their own licenses. See [third-party notices](public/THIRD_PARTY_NOTICES.txt), [open-source audit](docs/OPEN_SOURCE_AUDIT.md), and [media sources](docs/MEDIA_SOURCES.md).

Additional documentation:

- [Development reports](docs/agent-reports/latest.md)
- [Changelog](CHANGELOG.md)
- [Extension boundary](docs/EXTENSION_BOUNDARY.md)
- [Agent intelligence plan](docs/AGENT_INTELLIGENCE.md)
- [Project plan](docs/PLAN.md)
- [Test report](docs/TEST_REPORT.md)
- [Phase 2 features](docs/PHASE_2.md)