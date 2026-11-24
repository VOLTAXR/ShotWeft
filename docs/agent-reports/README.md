# Agent Development Reports

This directory is the machine-readable completion record for ShotWeft development tasks.

## Required After Every Completed Task

1. Run the tests that the task claims.
2. Write the report input to `.tmp/agent-report-input.json`. Keep raw logs in `.tmp`.
3. Run `npm run report:agent`.
4. Confirm the generated report commit was pushed to the current authorized development branch.

The generator writes:

- `latest.md` and `latest.json`
- `archive/<UTC timestamp>.md` and `.json`

It never commits logs, credentials, or unrelated working-tree changes.

## Input

```json
{
  "task": "Short task title",
  "status": "completed",
  "summary": "One or two sentences describing verified work.",
  "runtime_provider": "provider-from-session-metadata",
  "runtime_model": "model-from-session-metadata",
  "model_switches": 0,
  "codex_invocations": 1,
  "antigravity_invocations": 0,
  "model_evidence": {
    "pi_session_id": "session-id",
    "codex_thread_ids": ["thread-id"],
    "notes": "Evidence is summarized; do not copy credentials or private content."
  },
  "agent": {
    "name": "Pi",
    "codex": {
      "model": "gpt-6.2-sol",
      "reasoning_effort": "high",
      "invocations": 1,
      "exit_code": 0
    }
  },
  "changed_files": ["src/example.ts"],
  "tests": [
    {
      "name": "TypeScript",
      "command": "npm run check",
      "status": "passed",
      "exit_code": 0,
      "detail": ""
    }
  ],
  "git": { "pushed": "pushed", "push_detail": "origin/feature-branch" },
  "unresolved": [],
  "skipped": []
}
```

`status` is `completed`, `partial`, or `blocked`. Test status is `passed`, `failed`, or `skipped`; skipped tests must be listed instead of reported as passed. If Codex was not used, set `agent.codex.model` and `reasoning_effort` to `null` and `invocations` to `0`.

Schema v2 records the Pi runtime separately from Codex:

- `runtime_provider` and `runtime_model` come from Pi session/environment evidence, not from Codex configuration.
- `model_switches` counts distinct runtime model changes; list same-model re-selections under `model_evidence` if useful.
- `codex_invocations` counts actual Codex CLI executions.
- `antigravity_invocations` counts confirmed Antigravity CLI invocations; record uncertainty in `model_evidence`.
- `agent.codex.model` and `reasoning_effort` describe the Codex runtime, not Pi.
- Do not infer any value from configuration alone. Use `null`/`unknown` or an explicit note when evidence is unavailable.

## Safety Rules

- Reports must not contain API keys, tokens, passwords, private keys, personal contact data, or private registration materials.
- The generator rejects matching input before writing files.
- Only files under `docs/agent-reports/` are staged for the report commit.
- The generator refuses to run on `main`/`master` unless `--allow-main` is explicitly supplied.
- It never force-pushes and aborts if unrelated working-tree changes would be committed.
- Raw logs and report inputs remain under `.tmp/` and are not committed.

Use `--dry-run` to validate input without writing, `--no-commit` to write without committing, and `--no-push` for a local-only report commit.
