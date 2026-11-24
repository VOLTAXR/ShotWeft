import { open } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseDirectorPlan } from '../core/director/plan'
export async function readDirectorPlan(source: string) {
  const handle = await open(resolve(source), 'r')
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size > 2 * 1024 * 1024) throw new Error('DirectorPlan must be a regular JSON file up to 2 MiB.')
    let value: unknown
    try { value = JSON.parse(await handle.readFile('utf8')) } catch { throw new Error('Invalid DirectorPlan JSON.') }
    return parseDirectorPlan(value)
  } finally { await handle.close() }
}
export async function validateDirectorPlan(source: string) {
  const plan = await readDirectorPlan(source)
  return { valid: true, path: resolve(source), schemaVersion: plan.schemaVersion, productionMode: plan.productionMode,
    scenes: plan.scenes.length, shots: plan.shots.length, durationFrames: plan.durationFrames, frameRate: plan.frameRate,
    reviewStatus: plan.reviewStatus }
}
