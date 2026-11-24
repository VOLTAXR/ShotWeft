# ShotWeft Agent Report

- Task: V2 M3 presenter engineering preview
- Status: **partial**
- Generated: 2026-11-24T13:22:31.909Z
- Summary: Verified and documented the shared presenter layout, imported transcript alignment, caption exports and synthetic MP4. Fixed exports for script captions with blank lines at cue boundaries. Human-media acceptance remains open.

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
- Evidence: {"pi_session_id":"01a206ac-c34a-7576-86b2-d57d0f09f547","notes":"Pi directly performed this closure and launched no Codex CLI. Earlier implementation was inherited from a Codex turn configured for gpt-6.2-sol high; its JSONL turn completed, but no process exit code was captured by the historical launcher.","prior_codex_thread_ids":["01a20d70-e352-7082-a1a5-4597f86ea738"]}

## Git

- Branch: `feat/shotweft-v2-ai-director`
- Commit: `8be90edc7f8a6456e7e69c2d71cc449602d4551b`
- Remote: https://github.com/VOLTAXR/ShotWeft.git
- Push status: pushed
- Push detail: Implementation refs verified on origin/main and the authorized development branch. The report commit is published and verified separately.

## Changed Files

- `CHANGELOG.md`
- `README.md`
- `demos/m2/README.md`
- `demos/m2/captions.srt`
- `demos/m3/README.md`
- `demos/m3/captions.srt`
- `demos/m3/captions.vtt`
- `demos/m3/director-plan.json`
- `demos/m3/fixture/README.md`
- `demos/m3/fixture/b-roll.mp4`
- `demos/m3/fixture/narration.wav`
- `demos/m3/fixture/presenter.mp4`
- `demos/m3/fixture/script.md`
- `demos/m3/fixture/transcript.json`
- `demos/m3/fixture/tts.txt`
- `demos/m3/m3-synthetic.mp4`
- `docs/DEVELOPMENT_STATUS.md`
- `docs/MEDIA_SOURCES.md`
- `docs/TEST_REPORT.md`
- `docs/V2_UPSTREAM_RESEARCH.md`
- `docs/memory/ARCHITECTURE.md`
- `docs/memory/HANDOFF.md`
- `docs/memory/PROGRESS.md`
- `docs/memory/PROJECT.md`
- `docs/memory/TASKS.md`
- `package.json`
- `remotion/root.tsx`
- `scripts/test-cli.mjs`
- `scripts/test-director-m3-render.mjs`
- `scripts/test-director-m3.mjs`
- `src/cli/director-audio.ts`
- `src/cli/director.ts`
- `src/cli/main.ts`
- `src/cli/remotion-adapter.ts`
- `src/core/director/audio.ts`
- `src/core/director/compiler.ts`
- `src/core/director/plan.ts`
- `src/core/presenter/alignment.ts`
- `src/core/presenter/captions.ts`
- `src/core/presenter/layout.ts`
- `src/core/presenter/matching.ts`
- `src/core/presenter/plan.ts`
- `src/core/presenter/provider.ts`
- `src/core/presenter/tokens.ts`
- `src/core/presenter/transcript.ts`
- `src/director/DirectorComposition.tsx`
- `src/director/DirectorPreview.tsx`
- `src/director/PresenterLayer.tsx`
- `src/video-subtitles.ts`

## Tests

Passed: 14 · Failed: 0 · Skipped: 0

| Test | Command | Status | Exit |
| --- | --- | --- | ---: |
| TypeScript after caption fix | npm run check | passed | 0 |
| Production build | npm run build | passed | 0 |
| Presenter core and CLI | npm run test:director-m3 | passed | 0 |
| Presenter render and Player | npm run test:director-m3-render | passed | 0 |
| M2 core | npm run test:director-m2 | passed | 0 |
| Project and ZIP | npm run test:director-project | passed | 0 |
| Director workspace | npm run test:director-workspace | passed | 0 |
| Required-PDF regression | npm test | passed | 0 |
| Remotion regression rerun | npm run test:remotion | passed | 0 |
| Legacy render | npm run test:video-render | passed | 0 |
| Installed package | npm run test:package | passed | 0 |
| Production Player smoke test | node .tmp/pi-m3-final/probe-static.mjs | passed | 0 |
| Final CLI and demo artifacts | Rebuild CLI; validate-presenter; export-captions; ffprobe | passed | 0 |
| Publish integrity | git diff --check; git merge-base --is-ancestor | passed | 0 |

## Unresolved

- M2 uses synthetic speech; authorized human narration is required for its human-voice gate.
- M3 lacks authorized real presenter footage and a true sixty-second presenter demo. No executable ASR runtime or model is bundled; the demo timings are interpolated.
- M4 through M6 remain gated. Remotion remains local evaluation only.

## Skipped

- Real-person and human-voice acceptance.
- Actual ASR-model execution and recognition or timing accuracy measurements.
- Native Windows and macOS rendering and long-timeline performance.
