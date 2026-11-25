# ShotWeft Agent Report

- Task: CLI M0 ProjectArchive transactions
- Status: **completed**
- Generated: 2026-11-25T02:27:48.150Z
- Summary: Added a complete ZIP transaction callback, byte-level SHA-256 revisions, strict ordered batch edits and verified dry-run. Existing edit commands delegate without changing their result shapes.

## Agent

- Name: Pi
- Codex model: not used
- Reasoning effort: not applicable
- Codex invocations: 0
- Last Codex exit code: -

## Runtime Model Evidence

- Pi runtime provider: openai
- Pi runtime model: gpt-6.2-sol
- Model switches: 0
- Codex invocations: 0
- Antigravity invocations: 0
- Evidence: {"pi_session_id":"01a206ac-c34a-7576-86b2-d57d0f09f547","notes":"Implemented and verified directly in Pi. No Codex CLI or additional agents were invoked for this task."}

## Git

- Branch: `feat/shotweft-v2-ai-director`
- Commit: `0bc342360f934af2ea6d32578b8cfe59cafd738f`
- Remote: https://github.com/VOLTAXR/ShotWeft.git
- Push status: pushed
- Push detail: Authorized feature branch only; verify the report SHA on origin after publish.

## Changed Files

- `docs/AGENT.md`
- `docs/memory/PROGRESS.md`
- `package.json`
- `scripts/test-cli.mjs`
- `scripts/test-package.mjs`
- `scripts/test-project-archive-transaction.mjs`
- `skills/shotweft/SKILL.md`
- `src/cli/main.ts`
- `src/cli/project-file.ts`
- `src/cli/project-operations.ts`
- `src/core/project-archive.ts`

## Tests

Passed: 12 · Failed: 0 · Skipped: 0

| Test | Command | Status | Exit |
| --- | --- | --- | ---: |
| TypeScript | npm run check | passed | 0 |
| Production build | npm run build | passed | 0 |
| Archive transactions | npm run test:project-archive-transaction | passed | 0 |
| Full regression | npm test | passed | 0 |
| Remotion regression | npm run test:remotion | passed | 0 |
| Legacy video render | npm run test:video-render | passed | 0 |
| Offline package verification | npm run test:package | passed | 0 |
| Script preview CLI build | npm run build:cli | passed | 0 |
| Script preview plan generation | shotweft director generate demos/m2/script.md --output .tmp/m0-smoke/plan.json --title "ShotWeft M0 Preview" --aspect 16:9 --mode script | passed | 0 |
| Script preview plan validation | shotweft director validate .tmp/m0-smoke/plan.json | passed | 0 |
| Standalone script preview render | shotweft video export-remotion .tmp/m0-smoke/plan.json --output .tmp/m0-smoke/preview.mp4 | passed | 0 |
| Independent preview probe | ffprobe .tmp/m0-smoke/preview.mp4 | passed | 0 |

## Unresolved

- The file lock coordinates ShotWeft writers. Other programs must cooperate to eliminate the race between the final revision check and rename.
- Existing product roadmap and earlier real-media acceptance blockers are unchanged.

## Skipped

- Native Windows/macOS: this verification ran on WSL/Linux.
- Binary asset import, ZIP-native Remotion, and later milestones are outside CLI M0.
