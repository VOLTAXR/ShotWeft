# ShotWeft Agent Report

- Task: Correct V1.6 model attribution and report schema
- Status: **completed**
- Generated: 2026-11-24T03:18:26.302Z
- Summary: Added schema v2 runtime model fields and corrected the V1.6 attribution: Pi ran on qwen-cn / deepseek-v4.1-flash-1017 with no model switch; Codex ran four gpt-6.2-sol/high threads; Antigravity ran one readiness test outside ShotWeft with no V1.6 code contribution.

## Agent

- Name: Pi
- Codex model: gpt-6.2-sol
- Reasoning effort: high
- Codex invocations: 4
- Last Codex exit code: -

## Runtime Model Evidence

- Pi runtime provider: qwen-cn
- Pi runtime model: deepseek-v4.1-flash-1017
- Model switches: 0
- Codex invocations: 4
- Antigravity invocations: 1
- Evidence: {"pi_session_id":"01a206ac-c34a-7576-86b2-d57d0f09f547","pi_model_change_events":["2026-11-23T04:31:55.396Z qwen-cn/deepseek-v4.1-flash-1017","2026-11-24T03:09:14.569Z qwen-cn/deepseek-v4.1-flash-1017 (same model)"],"pi_session_model_constant":true,"pi_reasoning_level":"high","codex_provider":"openai","codex_model":"gpt-6.2-sol","codex_reasoning_effort":"high","codex_exit_codes":[0,null,0,0],"codex_thread_ids":["01a2090e-ab36-78a0-bc0a-c4c1fdab78d3","01a20918-e35f-77d0-a541-bc7971ff4f2c","01a20b0b-cbad-7261-9e59-f69d87c924d8","01a20b32-11ec-73d2-ae01-6d6a8c25d9c8"],"antigravity_model_label":"Gemini 4 Neon (Medium)","antigravity_evidence":"One confirmed readiness-test conversation with two steps, workspace outside ShotWeft; no V1.6 code contribution. Four process startup logs were observed, so exact launch count is unknown.","antigravity_used_for_v16":false}

## Git

- Branch: `feat/shotweft-v1.6-video-workflow`
- Commit: `4a49e2d1f60a2eaa72ed24787eb118dc0afcbf45`
- Remote: https://github.com/VOLTAXR/ShotWeft.git
- Push status: pushed
- Push detail: 4a49e2d schema/docs commit pushed to origin/feat/shotweft-v1.6-video-workflow before report generation

## Changed Files

- `scripts/agent-report.mjs`
- `docs/agent-reports/README.md`

## Tests

Passed: 6 · Failed: 0 · Skipped: 0

| Test | Command | Status | Exit |
| --- | --- | --- | ---: |
| Report generator syntax | node --check scripts/agent-report.mjs | passed | 0 |
| Pi session evidence | parse PI_SESSION_FILE model_change and thinking_level_change events | passed | 0 |
| Codex thread evidence | read Codex turn_context for the four V1.6 thread IDs | passed | 0 |
| Antigravity evidence | read Antigravity conversation summary metadata and startup logs | passed | 0 |
| Schema dry run | node scripts/agent-report.mjs --input .tmp/model-attribution-input.json --dry-run | passed | 0 |
| Application code unchanged | git diff --name-only | passed | 0 |

## Unresolved

- Historical reports produced before schema v2 do not contain runtime model fields.
- The exact Antigravity CLI launch count is uncertain; one readiness-test conversation is confirmed.
- Codex P1 was aborted by the executor after writing code; its tests were rerun and verified by Pi.

## Skipped

- None
