# ShotWeft Agent Completion Protocol

After every completed development task:

1. Run the claimed tests and record their real exit codes.
2. Keep raw logs and the report input under `.tmp/`.
3. Create `.tmp/agent-report-input.json` using the schema in `docs/agent-reports/README.md`.
4. Run `npm run report:agent` on the current authorized development branch.
5. Verify the report commit was pushed. Do not force-push or overwrite another agent's changes.
6. Mark a task complete only when the report's tests were actually executed; list skipped or blocked checks explicitly.

Reports are concise English, machine-readable in `docs/agent-reports/latest.json`, readable in `docs/agent-reports/latest.md`, and archived with a UTC timestamp. Never include credentials, private information, raw logs, or private registration materials.
