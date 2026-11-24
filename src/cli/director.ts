import { open, realpath } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { parseDirectorPlan, type DirectorPlan } from '../core/director/plan'
import { planFromScript, type PlanFromScriptInput } from '../core/director/planner'
import { importScript, scriptByteLimit, type ScriptFormat } from '../core/director/script'
import { reflowDirectorPlan } from '../core/director/audio'
import { compileDirectorPlanForRender, validateDirectorMediaRanges } from '../core/director/compiler'
import { referencedDirectorAssetIds } from '../core/director/plan'
import { alignTranscript, alignmentOverridesSchema } from '../core/presenter/alignment'
import { formatSRT, formatVTT, type CaptionMode } from '../core/presenter/captions'
import { presenterLayoutWarnings, presenterSpans } from '../core/presenter/layout'
import { parseTranscript, transcriptByteLimit, type TranscriptFormat } from '../core/presenter/transcript'
import { openFFprobe } from './ffmpeg'
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

async function readPresenterInput(source: string) {
  const handle = await open(resolve(source), 'r')
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size > transcriptByteLimit) throw new Error('Presenter input must be a regular file up to 16 MiB.')
    const buffer = Buffer.alloc(Math.min(info.size + 1, transcriptByteLimit + 1))
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length)
      if (!bytesRead) break
      length += bytesRead
    }
    if (length > info.size) throw new Error('Presenter input changed while being read.')
    return buffer.subarray(0, length)
  } finally { await handle.close() }
}

async function readTranscript(source: string) {
  const format = extname(source).slice(1).toLowerCase()
  if (format !== 'json' && format !== 'srt' && format !== 'vtt') throw new Error('Transcript file must be JSON, SRT, or VTT.')
  return parseTranscript(await readPresenterInput(source), format satisfies TranscriptFormat)
}

async function writeDirectorJSON(output: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' })
  if (blob.size > directorPlanByteLimit) throw new Error('Director JSON output exceeds 16 MiB.')
  return writeOutput(output, blob)
}

export async function importDirectorTranscript(source: string, output: string) {
  const transcript = await readTranscript(source)
  return { path: await writeDirectorJSON(output, transcript), source: transcript.source, words: transcript.words.length }
}

export async function alignDirectorTranscript(source: string, transcriptPath: string, output: string,
  options: { captionMode?: CaptionMode; corrections?: string; keywords?: string[]; durationFrames?: number }) {
  const [original, transcript, corrections] = await Promise.all([
    readDirectorPlan(source), readTranscript(transcriptPath), options.corrections ? readPresenterInput(options.corrections) : undefined,
  ])
  const overrides = corrections
    ? alignmentOverridesSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(corrections))) : undefined
  const input = options.durationFrames === undefined || options.durationFrames === original.durationFrames
    ? original : reflowDirectorPlan(original, options.durationFrames)
  const { plan, report } = alignTranscript(input, transcript, { ...options, overrides })
  return { ...planSummary(plan, await writeDirectorJSON(output, plan)), alignment: report, captions: plan.captions.length }
}

export async function exportDirectorCaptions(source: string, output: string) {
  const plan = await readDirectorPlan(source)
  const extension = extname(output).toLowerCase()
  if (extension !== '.srt' && extension !== '.vtt') throw new Error('Caption output must have an SRT or VTT extension.')
  if (!plan.captions.length) throw new Error('DirectorPlan has no captions to export.')
  const contents = (extension === '.srt' ? formatSRT : formatVTT)(plan.captions, plan.frameRate)
  return { path: await writeOutput(output, new Blob([contents])), captions: plan.captions.length }
}

export async function validatePresenterPlan(source: string, probePath?: string) {
  const plan = await readDirectorPlan(source)
  if (!plan.presenter) throw new Error('Missing presenter media.')
  const referenced = referencedDirectorAssetIds(plan)
  const directory = await realpath(dirname(resolve(source)))
  const { prepareMedia } = await import('./remotion-adapter')
  const ffprobe = await openFFprobe(probePath)
  const sources = new Map<string, Awaited<ReturnType<typeof prepareMedia>>>()
  const fps = plan.frameRate.numerator / plan.frameRate.denominator
  for (const asset of plan.assets) {
    if (!referenced.has(asset.id)) continue
    sources.set(asset.id, await prepareMedia(asset, sources.size, directory, undefined, fps, undefined, ffprobe,
      asset.id === plan.presenter.assetId && plan.presenter.audio === 'embedded'))
  }
  compileDirectorPlanForRender(plan, sources)
  validateDirectorMediaRanges(plan, sources)
  return { ...planSummary(plan, resolve(source)), layouts: presenterSpans(plan), warnings: presenterLayoutWarnings(plan) }
}
