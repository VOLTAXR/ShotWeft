# ShotWeft Handoff Memory

Updated: 2026-11-24 (context restoration before M2)
Branch: `feat/shotweft-v2-ai-director`
Local HEAD: `b32b7b72518ecb447b22a5fd4f121bdf85bccca0`
Remote branch: verified at `b32b7b72518ecb447b22a5fd4f121bdf85bccca0`
Working tree at handoff: clean before M2 work.

## Read first

`AGENTS.md`, `README.md`, `docs/DEVELOPMENT_STATUS.md`, `docs/VIDEO_ENGINE_DECISION.md`, `docs/V2_AUDIT.md`, `docs/V2_UPSTREAM_RESEARCH.md`, `docs/TEST_REPORT.md`, `docs/agent-reports/latest.md`, `skills/shotweft/SKILL.md`, this `docs/memory/` directory.

## Current state

- M0/M1 complete and pushed; do not rebuild.
- M2/M3 not implemented. The latest report still describes M0/M1, not V2 completion.
- Package version must remain `1.5.0`.
- No LICENSE, no CI workflow; Remotion is local-evaluation only.

## Commands

```bash
cd /mnt/d/Projects/ShotWeft
npm run check
npm run build
npm test
npm run test:remotion
npm run test:video-render
npm run test:package
```

Real render environment:

```bash
FFMPEG_PATH="$PWD/.tmp/ffmpeg-lgpl/ffmpeg-n8.1-latest-linux64-lgpl-8.1/bin/ffmpeg"
FFPROBE_PATH="$PWD/.tmp/ffmpeg-lgpl/ffmpeg-n8.1-latest-linux64-lgpl-8.1/bin/ffprobe"
PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers"
SHOTWEFT_REQUIRE_PDF=1
```

Codex pattern (verified `gpt-6.2-sol` no-write session thread `01a20cb8-64a4-7b30-9a0c-e816be3c695f`):

```bash
codex exec -C /mnt/d/Projects/ShotWeft -s workspace-write \
  -m gpt-6.2-sol -c approval_policy="never" \
  -c model_reasoning_effort="high" \
  -c sandbox_workspace_write.network_access=true \
  --json -o .tmp/<out>.md - < .tmp/<prompt>.md
```

## Subagent logs

- `.tmp/v2-m2/audit.log` — Repository Auditor
- `.tmp/v2-m2/upstream.log` — Open Source Researcher
- `.tmp/v2-m2/architecture.log` — Architect
- PIDs and prompts are alongside the logs; raw logs stay in `.tmp/`.

## Constraints

Do not force push, merge `main`, publish npm, create a Release/tag, change package version, download large models, write to C:, or overwrite user changes. Keep raw logs under `.tmp/`. Report actual model/exit codes only; never fabricate. Never call synthetic fixture video a real presenter or synthetic speech a human recording.

## Next action

Read the three subagent conclusions, reconcile them with actual source, then send a bounded M2 implementation prompt to Codex `gpt-6.2-sol` high. One writer at a time.