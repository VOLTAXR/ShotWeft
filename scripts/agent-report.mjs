#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const reports = join(root, 'docs', 'agent-reports')
const archive = join(reports, 'archive')
const inputArg = process.argv.indexOf('--input')
const inputPath = resolve(root, inputArg >= 0 ? process.argv[inputArg + 1] : '.tmp/agent-report-input.json')
const dryRun = process.argv.includes('--dry-run')
const allowMain = process.argv.includes('--allow-main')
const noCommit = process.argv.includes('--no-commit')
const noPush = process.argv.includes('--no-push')

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function strings(value, path = 'input') {
  if (typeof value === 'string') return [[path, value]]
  if (Array.isArray(value)) return value.flatMap((item, index) => strings(item, `${path}[${index}]`))
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => strings(item, `${path}.${key}`))
  return []
}

function assertSafe(value) {
  const forbidden = [
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/i, 'private key'],
    [/\b(?:sk-[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b/, 'credential'],
    [/\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{8,}/i, 'credential assignment'],
    [/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/, 'email address'],
    [/(?<!\d)(?:\+?\d[\s-]?){10,}(?!\d)/, 'phone number'],
    [/软著|软件著作权|著作权登记|登记申请|申请人|身份证|registrationName|registrationVersion|copyright\/v1\.0|build-copyright|v1-manual/i, 'private registration material'],
  ]
  for (const [path, text] of strings(value)) {
    for (const [pattern, label] of forbidden) {
      if (pattern.test(text)) throw new Error(`Report input rejected: ${label} in ${path}`)
    }
  }
}

function normalize(input) {
  assert(input && typeof input === 'object', 'Report input must be a JSON object')
  assert(typeof input.task === 'string' && input.task.trim(), 'task is required')
  assert(typeof input.summary === 'string' && input.summary.trim(), 'summary is required')
  assert(['completed', 'partial', 'blocked'].includes(input.status), 'status must be completed, partial, or blocked')
  assert(Array.isArray(input.changed_files), 'changed_files must be an array')
  assert(Array.isArray(input.tests), 'tests must be an array')
  assert(Array.isArray(input.unresolved ?? []), 'unresolved must be an array')
  assert(Array.isArray(input.skipped ?? []), 'skipped must be an array')
  for (const file of input.changed_files) {
    assert(typeof file === 'string' && file && !file.startsWith('/') && !file.includes('..'), 'changed file must be a repository-relative path')
  }
  const tests = input.tests.map((test, index) => {
    assert(test && typeof test.name === 'string' && test.name, `tests[${index}].name is required`)
    assert(['passed', 'failed', 'skipped'].includes(test.status), `tests[${index}].status is invalid`)
    assert(test.exit_code === null || Number.isInteger(test.exit_code), `tests[${index}].exit_code is invalid`)
    assert(typeof test.command === 'string' && test.command, `tests[${index}].command is required`)
    return {
      name: test.name,
      command: test.command,
      status: test.status,
      exit_code: test.exit_code,
      detail: typeof test.detail === 'string' ? test.detail : '',
    }
  })
  const branch = git('branch', '--show-current') || 'detached'
  if ((branch === 'main' || branch === 'master') && !allowMain) throw new Error('Refusing to report on main without --allow-main')
  const report = {
    schema: 'shotweft.agent-report.v1',
    generated_at: new Date().toISOString(),
    task: input.task.trim(),
    status: input.status,
    summary: input.summary.trim(),
    agent: {
      name: typeof input.agent?.name === 'string' ? input.agent.name : 'Pi',
      codex: {
        model: input.agent?.codex?.model ?? null,
        reasoning_effort: input.agent?.codex?.reasoning_effort ?? null,
        invocations: Number.isInteger(input.agent?.codex?.invocations) ? input.agent.codex.invocations : 0,
        exit_code: Number.isInteger(input.agent?.codex?.exit_code) ? input.agent.codex.exit_code : null,
      },
    },
    changed_files: [...new Set(input.changed_files)],
    tests: {
      passed: tests.filter(test => test.status === 'passed').length,
      failed: tests.filter(test => test.status === 'failed').length,
      skipped: tests.filter(test => test.status === 'skipped').length,
      items: tests,
    },
    git: {
      branch,
      commit: git('rev-parse', 'HEAD'),
      remote: git('remote', 'get-url', 'origin'),
      pushed: input.git?.pushed ?? 'unknown',
      push_detail: input.git?.push_detail ?? '',
    },
    unresolved: input.unresolved ?? [],
    skipped: input.skipped ?? [],
  }
  assertSafe(report)
  return report
}

function markdown(report) {
  const rows = report.tests.items.map(test =>
    `| ${escape(test.name)} | ${escape(test.command)} | ${test.status} | ${test.exit_code ?? '-'} |`)
  return [
    '# ShotWeft Agent Report',
    '',
    `- Task: ${escape(report.task)}`,
    `- Status: **${report.status}**`,
    `- Generated: ${report.generated_at}`,
    `- Summary: ${escape(report.summary)}`,
    '',
    '## Agent',
    '',
    `- Name: ${escape(report.agent.name)}`,
    `- Codex model: ${escape(report.agent.codex.model ?? 'not used')}`,
    `- Reasoning effort: ${escape(report.agent.codex.reasoning_effort ?? 'not applicable')}`,
    `- Codex invocations: ${report.agent.codex.invocations}`,
    `- Last Codex exit code: ${report.agent.codex.exit_code ?? '-'}`,
    '',
    '## Git',
    '',
    `- Branch: \`${escape(report.git.branch)}\``,
    `- Commit: \`${report.git.commit}\``,
    `- Remote: ${escape(report.git.remote)}`,
    `- Push status: ${escape(report.git.pushed)}`,
    ...(report.git.push_detail ? [`- Push detail: ${escape(report.git.push_detail)}`] : []),
    '',
    '## Changed Files',
    '',
    ...(report.changed_files.length ? report.changed_files.map(file => `- \`${escape(file)}\``) : ['- None']),
    '',
    '## Tests',
    '',
    `Passed: ${report.tests.passed} · Failed: ${report.tests.failed} · Skipped: ${report.tests.skipped}`,
    '',
    '| Test | Command | Status | Exit |',
    '| --- | --- | --- | ---: |',
    ...rows,
    '',
    '## Unresolved',
    '',
    ...(report.unresolved.length ? report.unresolved.map(item => `- ${escape(item)}`) : ['- None']),
    '',
    '## Skipped',
    '',
    ...(report.skipped.length ? report.skipped.map(item => `- ${escape(item)}`) : ['- None']),
    '',
  ].join('\n')
}

function escape(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
}

async function main() {
  const input = JSON.parse(await readFile(inputPath, 'utf8'))
  const report = normalize(input)
  if (dryRun) {
    console.log(JSON.stringify(report, null, 2))
    return
  }
  await mkdir(archive, { recursive: true })
  const stamp = report.generated_at.replace(/[:.]/g, '-')
  const json = JSON.stringify(report, null, 2) + '\n'
  const md = markdown(report)
  await writeFile(join(reports, 'latest.json'), json)
  await writeFile(join(reports, 'latest.md'), md)
  await writeFile(join(archive, stamp + '.json'), json)
  await writeFile(join(archive, stamp + '.md'), md)

  if (noCommit) return
  const status = git('status', '--porcelain').split('\n').filter(Boolean)
  const outside = status.filter(line => !line.slice(3).startsWith('docs/agent-reports/'))
  if (outside.length) throw new Error('Refusing to commit reports with unrelated changes:\n' + outside.join('\n'))
  git('add', 'docs/agent-reports')
  git('commit', '-m', 'docs(agent-reports): ' + report.task)
  if (!noPush) git('push', 'origin', report.git.branch)
  console.log(JSON.stringify({
    task: report.task,
    report: 'docs/agent-reports/latest.md',
    archive: 'docs/agent-reports/archive/' + stamp + '.md',
    commit: git('rev-parse', 'HEAD'),
    pushed: !noPush,
  }, null, 2))
}

await main()