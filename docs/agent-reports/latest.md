# ShotWeft Agent Report

- Task: CLI M1 — Project-native animation
- Status: **completed**
- Generated: 2026-11-25T04:21:13.234Z
- Summary: Added guarded media import/removal, strict embedded DirectorPlan mapping, measured narration attachment and script-mode MP4 rendering directly from the authoritative ZIP. The local demo renders committed coastal media, captions and one Morph without changing its ZIP revision.

## Agent

- Name: Pi
- Codex model: not used
- Reasoning effort: not applicable
- Codex invocations: 0
- Last Codex exit code: -

## Runtime Model Evidence

- Pi runtime provider: qwen-cn
- Pi runtime model: deepseek-v4.1-flash-1017
- Model switches: 0
- Codex invocations: 0
- Antigravity invocations: 0
- Evidence: {"pi_session_id":"01a206ac-c34a-7576-86b2-d57d0f09f547","codex_thread_ids":[],"notes":"Pi session environment; CLI M1 worked directly in Pi with no other agents. The earlier archived snapshot of this task predates the authorized push; this report records the verified pushed state. Early focused errors (binding, missing SVG fixture), TypeScript error, and an investigator wall-clock timeout preceded final successful runs; logs are private under .tmp/cli-m1/."}

## Git

- Branch: `feat/shotweft-v2-ai-director`
- Commit: `5ac465870057d72e02971dcc126fc1a77850444c`
- Remote: https://github.com/VOLTAXR/ShotWeft.git
- Push status: pushed
- Push detail: origin/feat/shotweft-v2-ai-director; remote ref verified identical to local after push; main untouched.

## Changed Files

- `docs/AGENT.md`
- `docs/CLI_M1.md`
- `docs/memory/PROGRESS.md`
- `docs/memory/TASKS.md`
- `package.json`
- `scripts/test-cli-m1.mjs`
- `scripts/test-cli.mjs`
- `skills/shotweft/SKILL.md`
- `src/cli/ffmpeg.ts`
- `src/cli/main.ts`
- `src/cli/project-assets.ts`
- `src/cli/project-director.ts`
- `src/cli/project-file.ts`
- `src/cli/remotion-adapter.ts`

## Tests

Passed: 11 · Failed: 0 · Skipped: 0

| Test | Command | Status | Exit |
| --- | --- | --- | ---: |
| TypeScript | npm run check | passed | 0 |
| Production and CLI build | npm run build | passed | 0 |
| Full regression | npm test | passed | 0 |
| Standalone Remotion and Player regression | npm run test:remotion | passed | 0 |
| Legacy video regression | npm run test:video-render | passed | 0 |
| Private CLI package and install | npm run test:package | passed | 0 |
| CLI M0 regression | npm run test:project-archive-transaction | passed | 0 |
| CLI M1 transaction and format coverage | npm run test:cli-m1 | passed | 0 |
| End-to-end CLI M1 acceptance | npm run test:cli-m1 -- --render | passed | 0 |
| Sample delivered render | ffmpeg -i project.mp4 -vf select,scale,tile -frames:v 1 contact-sheet.jpg | passed | 0 |
| Read-only remote ref verification | git -c http.version=HTTP/1.1 ls-remote origin refs/heads/feat/shotweft-v2-ai-director refs/heads/main | passed | 0 |

## Unresolved

- Authorized V2 M2 human narration and V2 M3 60+ second real presenter, local executable ASR, and editorial sync acceptance remain open.
- Native Windows/macOS and fractional-fps ZIP-native Remotion, and long-timeline resource performance, were not evaluated.
- Remotion commercial eligibility, ShotWeft licensing/distribution and release approval are separate unresolved decisions.

## Skipped

- Native Windows/macOS, fractional ZIP-native Remotion and long-render performance outside CLI M1 WSL acceptance.
- Human voice, real presenter and executable ASR fixtures unavailable; synthetic demo is not a substitute.
