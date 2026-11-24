import { open } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { parseDirectorPlan, type DirectorPlan } from '../core/director/plan'
import { planFromScript, type PlanFromScriptInput } from '../core/director/planner'
import { importScript, scriptByteLimit, type ScriptFormat } from '../core/director/script'
import { writeOutput } from './project-file'

// A plan can include the script in its source, narration, segments and captions.
const directorPlanByteLimit = 16 * 1024 * 1024
const scriptFileFormats = new Map<string, ScriptFormat>([['', 'txt'], ['.txt', 'txt'], ['.md', 'markdown'], ['.markdown', 'markdown'], ['.json', 'json']])

export async function readDirectorPlan(source: string) {
  const handle = await open(resolve(source), 'r')
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size > directorPlanByteLimit) throw new Error('DirectorPlan must be a regular JSON file up to 16 MiB.')
    let value: unknown
    try { value = JSON.parse(await handle.readFile('utf8')) } catch { throw new Error('Invalid DirectorPlan JSON.') }
    return parseDirectorPlan(value)
  } finally { await handle.close() }
}

function planSummary(plan: DirectorPlan, path: string) {
  return { valid: true, path, schemaVersion: plan.schemaVersion, productionMode: plan.productionMode,
    scenes: plan.scenes.length, shots: plan.shots.length, durationFrames: plan.durationFrames, frameRate: plan.frameRate,
    reviewStatus: plan.reviewStatus }
}

export async function validateDirectorPlan(source: string) {
  const plan = await readDirectorPlan(source)
  return planSummary(plan, resolve(source))
}

async function readScript(source: string) {
  const format = scriptFileFormats.get(extname(source).toLowerCase())
  if (!format) throw new Error('Script file must be TXT, Markdown, or JSON.')
  const handle = await open(resolve(source), 'r')
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size > scriptByteLimit) throw new Error('Script must be a regular file up to 1 MiB.')
    const contents = Buffer.alloc(scriptByteLimit + 1)
    let size = 0
    while (size < contents.length) {
      const { bytesRead } = await handle.read(contents, size, contents.length - size, size)
      if (!bytesRead) break
      size += bytesRead
    }
    return importScript(contents.subarray(0, size), format)
  } finally { await handle.close() }
}

export async function generateDirectorPlan(source: string, output: string, options: Omit<PlanFromScriptInput, 'script'>) {
  const plan = planFromScript({ ...options, script: await readScript(source) })
  const blob = new Blob([JSON.stringify(plan, null, 2) + '\n'], { type: 'application/json' })
  if (blob.size > directorPlanByteLimit) throw new Error('Generated DirectorPlan exceeds 16 MiB.')
  const path = await writeOutput(output, blob)
  return { ...planSummary(plan, path), provider: 'offline' }
}
