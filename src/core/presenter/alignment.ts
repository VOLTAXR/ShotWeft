import { z } from 'zod'
import { secondsToFrame } from '../../video-model'
import { reflowDirectorPlan } from '../director/audio'
import { parseDirectorPlan, type DirectorPlan } from '../director/plan'
import { alignCueAnchors, makeCaptions, type AlignedWord, type Caption, type CaptionMode } from './captions'
import { matchSequence } from './matching'
import { wordTokens } from './tokens'
import { transcriptSchema, type Transcript } from './transcript'

const frame = z.number().int().min(0).max(1_000_000)
const overrideSchema = z.strictObject({
  scriptSegmentId: z.string(), charStart: frame, charEnd: frame,
  startFrame: frame, durationFrames: frame.min(1),
  confidence: z.number().min(0).max(1).optional(),
})
export const alignmentOverridesSchema = z.array(overrideSchema).max(200_000)
export type WordTimingOverride = z.infer<typeof overrideSchema>

type Timing = { startFrame: number; endFrame: number; confidence?: number }
type ScriptToken = { scriptSegmentId: string; charStart: number; charEnd: number; text: string; key: string; weight: number; manual?: Timing }
type SpokenToken = Timing & { key: string }
export type AlignmentReport = {
  matchRate: number
  confidence?: number
  segments: { scriptSegmentId: string; matchRate: number; matched: number; total: number }[]
}

export class AlignmentRejected extends Error {
  constructor(readonly report: AlignmentReport) {
    const low = report.segments.filter(segment => segment.matchRate < 0.8).slice(0, 5)
      .map(segment => segment.scriptSegmentId + ' ' + segment.matched + '/' + segment.total)
    super('Alignment coverage below 0.8 (overall ' + report.matchRate.toFixed(3) + '; low coverage: ' +
      (low.join(', ') || 'no spoken script') + '). Correct word timings or supply a closer transcript.')
    this.name = 'AlignmentRejected'
  }
}

function tokenizeScript(segments: DirectorPlan['scriptSegments'], overrides: WordTimingOverride[], duration: number) {
  const bySegment = new Map(segments.map(segment => [segment.id, [] as WordTimingOverride[]]))
  for (const override of overrides) {
    const group = bySegment.get(override.scriptSegmentId)
    if (!group || override.startFrame + override.durationFrames > duration) throw new Error('Invalid manual word correction segment or frame range.')
    group.push(override)
  }
  const tokens: ScriptToken[] = []
  for (const segment of segments) {
    const words = wordTokens(segment.text, true)
    const characters = Array.from(segment.text)
    let index = 0
    const append = (word: typeof words[number]) => tokens.push({ ...word, scriptSegmentId: segment.id, weight: 1 })
    for (const correction of bySegment.get(segment.id)!.sort((a, b) => a.charStart - b.charStart)) {
      while (index < words.length && words[index].charEnd <= correction.charStart) append(words[index++])
      const first = index
      while (index < words.length && words[index].charEnd <= correction.charEnd) index++
      if (index === first || words[first].charStart !== correction.charStart || words[index - 1].charEnd !== correction.charEnd) {
        throw new Error('Manual word correction must cover whole, non-overlapping script words.')
      }
      tokens.push({ scriptSegmentId: segment.id, charStart: correction.charStart, charEnd: correction.charEnd,
        text: characters.slice(correction.charStart, correction.charEnd).join(''), key: '', weight: index - first,
        manual: { startFrame: correction.startFrame, endFrame: correction.startFrame + correction.durationFrames,
          ...(correction.confidence !== undefined && { confidence: correction.confidence }) } })
    }
    while (index < words.length) append(words[index++])
    // Reserve a frame for a script-only segment such as a Markdown heading.
    if (!words.length) tokens.push({ scriptSegmentId: segment.id, charStart: 0, charEnd: 0, text: '', key: '', weight: 0 })
    if (tokens.length > 200_000) throw new Error('Alignment supports at most 200,000 script tokens.')
  }
  return tokens
}

function tokenizeSpeech(transcript: Transcript, plan: DirectorPlan) {
  const tokens: SpokenToken[] = []
  const offset = plan.presenter?.sourceInFrame ?? 0
  const at = (seconds: number) => secondsToFrame(seconds, plan.frameRate) - offset
  const remaining = transcript.durationSeconds === undefined ? undefined : at(transcript.durationSeconds)
  if (remaining !== undefined && remaining <= 0) throw new Error('Transcript ends before the presenter source offset.')
  for (const word of transcript.words) {
    const parts = wordTokens(word.text)
    const timeAt = (index: number) => index === parts.length ? word.endSeconds :
      word.startSeconds + (word.endSeconds - word.startSeconds) * index / parts.length
    for (const [index, part] of parts.entries()) {
      const startFrame = at(timeAt(index)), endFrame = at(timeAt(index + 1))
      if (endFrame < 0 || (endFrame === 0 && startFrame < 0) || startFrame >= plan.durationFrames) continue
      if (endFrame > plan.durationFrames + 1) throw new Error('Transcript word timing exceeds the plan duration.')
      tokens.push({ key: part.key, startFrame: Math.max(0, startFrame), endFrame: Math.min(plan.durationFrames, endFrame),
        ...(word.confidence !== undefined && { confidence: word.confidence }) })
    }
    if (tokens.length > 200_000) throw new Error('Alignment supports at most 200,000 transcript tokens.')
  }
  return tokens
}

function matchTimings(script: ScriptToken[], spoken: SpokenToken[], duration: number) {
  const matches = new Map<number, Timing>()
  let firstScript = 0
  let firstSpoken = 0
  const anchors = script.flatMap((token, index) => token.manual ? [{ index, timing: token.manual }] : [])
  anchors.push({ index: script.length, timing: { startFrame: duration, endFrame: duration } })
  let lastEnd = 0
  for (const { index, timing } of anchors) {
    if (timing.startFrame < lastEnd) throw new Error('Manual word corrections must have monotonic, non-overlapping frames.')
    let stop = firstSpoken
    while (stop < spoken.length && spoken[stop].startFrame < timing.startFrame && spoken[stop].endFrame <= timing.startFrame) stop++
    const labels = script.slice(firstScript, index).map(token => token.key)
    const speech = spoken.slice(firstSpoken, stop)
    for (const [i, j] of matchSequence(labels, speech.map(word => word.key))) matches.set(firstScript + i, speech[j])
    if (index < script.length) matches.set(index, timing)
    while (stop < spoken.length && spoken[stop].startFrame < timing.endFrame) stop++
    firstScript = index + 1
    firstSpoken = stop
    lastEnd = timing.endFrame
  }
  return matches
}

/** Interpolate unmatched tokens and quantize to positive, disjoint frame spans. */
function allocateTimings(script: ScriptToken[], matches: ReadonlyMap<number, Timing>, duration: number) {
  const output: Timing[] = []
  const anchors = script.flatMap((token, index) => token.manual ? [{ index, timing: token.manual }] : [])
  anchors.push({ index: script.length, timing: { startFrame: duration, endFrame: duration } })
  let first = 0, cursor = 0
  for (const { index: stop, timing: anchor } of anchors) {
    if (anchor.startFrame - cursor < stop - first) throw new Error('Too few frames between manual corrections or plan boundaries for word alignment.')
    for (let i = first; i < stop;) {
      const current = matches.get(i)
      if (current) {
        const latest = anchor.startFrame - (stop - i)
        const startFrame = Math.max(cursor, Math.min(latest, current.startFrame))
        const endFrame = Math.max(startFrame + 1, Math.min(latest + 1, current.endFrame))
        output.push({ startFrame, endFrame, ...(current.confidence !== undefined && { confidence: current.confidence }) })
        cursor = endFrame
        i++
        continue
      }
      let next = i + 1
      while (next < stop && !matches.has(next)) next++
      const target = Math.min(anchor.startFrame - (stop - next), matches.get(next)?.startFrame ?? anchor.startFrame)
      const gap = Math.max(next - i, target - cursor)
      const from = cursor
      const count = next - i
      for (let j = 1; j <= count; j++, i++) {
        const endFrame = from + Math.floor(gap * j / count)
        output.push({ startFrame: cursor, endFrame })
        cursor = endFrame
      }
    }
    if (stop < script.length) output.push(anchor)
    cursor = anchor.endFrame
    first = stop + 1
  }
  return output
}

export interface AlignmentOptions {
  overrides?: WordTimingOverride[]
  captionMode?: CaptionMode
  keywords?: string[]
  appearance?: Pick<Caption, 'style' | 'safeArea'>
}

/** Align the original script against timings from the same take as the plan. */
export function alignTranscript(input: DirectorPlan, source: Transcript, options: AlignmentOptions = {}) {
  const plan = parseDirectorPlan(input)
  const transcript = transcriptSchema.parse(source)
  const segments = [...plan.scriptSegments].sort((a, b) => a.startFrame - b.startFrame)
  const script = tokenizeScript(segments, alignmentOverridesSchema.parse(options.overrides ?? []), plan.durationFrames)
  const matches = matchTimings(script, tokenizeSpeech(transcript, plan), plan.durationFrames)
  const counts = new Map<string, { total: number; matched: number }>()
  let total = 0, matched = 0, confidenceTotal = 0, confidenceCount = 0
  for (const [index, token] of script.entries()) {
    const count = counts.get(token.scriptSegmentId) ?? { total: 0, matched: 0 }
    count.total += token.weight
    total += token.weight
    const match = matches.get(index)
    if (match) {
      count.matched += token.weight
      matched += token.weight
      if (match.confidence !== undefined) {
        confidenceTotal += match.confidence * token.weight
        confidenceCount += token.weight
      }
    }
    counts.set(token.scriptSegmentId, count)
  }
  const report: AlignmentReport = { matchRate: total ? matched / total : 0,
    ...(confidenceCount > 0 && { confidence: confidenceTotal / confidenceCount }),
    segments: segments.map(({ id }) => {
      const count = counts.get(id)!
      return { scriptSegmentId: id, ...count, matchRate: count.total ? count.matched / count.total : 1 }
    }),
  }
  if (report.matchRate < 0.8 || report.segments.some(segment => segment.matchRate < 0.8)) throw new AlignmentRejected(report)
  const timings = allocateTimings(script, matches, plan.durationFrames)
  const starts = new Map<string, number>([[segments[0].id, 0]])
  const words: AlignedWord[] = []
  for (const [index, token] of script.entries()) {
    const { scriptSegmentId, charStart, charEnd, text } = token
    const { startFrame, endFrame, confidence } = timings[index]
    if (!starts.has(scriptSegmentId)) starts.set(scriptSegmentId, startFrame)
    if (!token.weight) continue
    words.push({ id: 'word-' + starts.size + '-' + charStart.toString(36), scriptSegmentId, text, charStart, charEnd, startFrame,
      durationFrames: endFrame - startFrame, ...(confidence !== undefined && { confidence }) })
  }
  const retimed = reflowDirectorPlan({ ...plan, transcript: undefined, captions: [] }, plan.durationFrames, starts)
  const ordered = [...retimed.scriptSegments].sort((a, b) => a.startFrame - b.startFrame)
  const metadata = { source: transcript.source, matchRate: report.matchRate, words,
    ...(transcript.language && { language: transcript.language }), ...(report.confidence !== undefined && { confidence: report.confidence }) }
  const captions = makeCaptions(ordered, words, options.captionMode ?? 'sentence', options.keywords, options.appearance)
  return { report, plan: parseDirectorPlan({
    ...retimed, transcript: metadata, captions,
    shots: alignCueAnchors(retimed.shots, ordered, words, captions),
  }) }
}
