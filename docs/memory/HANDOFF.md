# ShotWeft Handoff Memory

Updated: 2026-11-24 (M3 engineering checkpoint)
Development branch: `feat/shotweft-v2-ai-director`; the operator authorizes fast-forward delivery to `main`.
For exact Git and verification evidence, see `docs/agent-reports/latest.json` and check the remote ref.

## Read first

`AGENTS.md`, `README.md`, `docs/DEVELOPMENT_STATUS.md`, `docs/VIDEO_ENGINE_DECISION.md`, `docs/V2_AUDIT.md`, `docs/V2_UPSTREAM_RESEARCH.md`, `docs/TEST_REPORT.md`, `docs/agent-reports/latest.md`, `skills/shotweft/SKILL.md`, this `docs/memory/` directory.

## Current state

- M0/M1 complete.
- M2 is on `main`; `demos/m2/` is the editable synthetic-voice artifact, not human acceptance.
- M3 has an engineering preview at `demos/m3/` with a standalone editable plan and MP4. It is a synthetic test, not the real-person or live ASR acceptance demo.
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

Continue directly in Pi. Do not launch Codex CLI. Historical Codex execution evidence belongs in reports; new test logs and report inputs go under `.tmp/`.

## Subagent logs

- `.tmp/v2-m2/audit.log` — Repository Auditor
- `.tmp/v2-m2/upstream.log` — Open Source Researcher
- `.tmp/v2-m2/architecture.log` — Architect
- PIDs and prompts are alongside the logs; raw logs stay in `.tmp/`.

## Constraints

Do not force push, merge `main`, publish npm, create a Release/tag, change package version, download large models, write to C:, or overwrite user changes. Keep raw logs under `.tmp/`. Report actual model/exit codes only; never fabricate. Never call synthetic fixture video a real presenter or synthetic speech a human recording.

## Next action

Obtain authorized Mandarin narration for M2 and 60+ seconds of authorized presenter footage for M3. Configure an authorized local ASR runtime and model, then verify recognition/alignment and produce the editable real-person demo before opening M4–M6.