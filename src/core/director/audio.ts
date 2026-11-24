import { parseDirectorPlan, type DirectorAsset, type DirectorPlan } from './plan'

export const spokenQuantity = /(?<![\p{Script=Latin}\d])[+-]?\d+(?:[.,]\d+)*(?:[ \t]?[％%万亿倍])?/gu

/** 240 CJK characters/minute, 150 Latin words/minute, and 250 ms per sentence pause. */
export function estimateNarrationSeconds(text: string): number {
  const cjk = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0
  const words = text.match(/\p{Script=Latin}+(?:['’-]\p{Script=Latin}+)*/gu)?.length ?? 0
  const quantities = text.match(spokenQuantity)?.length ?? 0
  const pauses = text.match(/[。！？!?]+|\.(?=\s|$)/gu)?.length ?? 0
  return Math.max(1, cjk / 4 + (words + quantities) / 2.5 + pauses * 0.25)
}

type Span = { startFrame: number; durationFrames: number }
const end = (span: Span) => span.startFrame + span.durationFrames

/** Map common boundaries once, keeping required spans positive even when rounding compresses them. */
function reflowBoundaries(duration: number, target: number, spans: Span[]) {
  const boundaries = [...new Set([0, duration, ...spans.flatMap(span => [span.startFrame, end(span)])])].sort((a, b) => a - b)
  const indexes = new Map(boundaries.map((frame, index) => [frame, index]))
  const starts: number[][] = boundaries.map(() => [])
  const finishes: number[][] = boundaries.map(() => [])
  for (const span of spans) {
    const first = indexes.get(span.startFrame)!, last = indexes.get(end(span))!
    starts[first].push(last)
    finishes[last].push(first)
  }
  const latest = boundaries.map(() => target)
  for (let i = boundaries.length - 2; i >= 0; i--) {
    latest[i] = Math.min(latest[i + 1], ...starts[i].map(last => latest[last] - 1))
  }
  if (latest[0] < 0) throw new Error('Narration is too short to preserve all DirectorPlan timing ranges.')
  const mapped = [0]
  for (let i = 1; i < boundaries.length; i++) {
    const earliest = Math.max(mapped[i - 1], ...finishes[i].map(first => mapped[first] + 1))
    mapped.push(Math.max(earliest, Math.min(latest[i], Math.round(boundaries[i] * target / duration))))
  }
  return (frame: number) => mapped[indexes.get(frame)!]
}

/** Reflow against measured narration length expressed in whole frames at the plan's fps. */
export function reflowDirectorPlan(input: DirectorPlan, actualDurationFrames: number): DirectorPlan {
  const plan = parseDirectorPlan(input)
  const fps = plan.frameRate.numerator / plan.frameRate.denominator
  if (!Number.isSafeInteger(actualDurationFrames) || actualDurationFrames < 1 || actualDurationFrames > 3600 * fps) {
    throw new Error('Actual narration duration must be a positive whole frame count of at most one hour.')
  }
  const segments = new Map(plan.scriptSegments.map(segment => [segment.id, segment]))
  const overlaps = plan.shots.flatMap(shot => shot.scriptSegmentIds.map(id => {
    const segment = segments.get(id)!
    const startFrame = Math.max(segment.startFrame, shot.startFrame)
    return { startFrame, durationFrames: Math.min(end(segment), end(shot)) - startFrame }
  }))
  const at = reflowBoundaries(plan.durationFrames, actualDurationFrames, [
    ...plan.scriptSegments, ...plan.scenes, ...plan.shots, ...plan.captions, ...plan.audio, ...overlaps,
    ...plan.shots.flatMap(shot => shot.mediaLayers ?? []),
  ])
  const scale = (frame: number) => Math.round(frame * actualDurationFrames / plan.durationFrames)
  const span = <T extends Span>(item: T): T => {
    const startFrame = at(item.startFrame)
    return { ...item, startFrame, durationFrames: at(end(item)) - startFrame }
  }
  const assets = new Map(plan.assets.map(asset => [asset.id, asset]))
  const mediaSpan = <T extends Span & { assetId: string; sourceInFrame?: number }>(item: T): T => {
    const available = assets.get(item.assetId)?.sourceDurationFrames
    // With no measured duration, only the existing source range is known to be usable.
    const limit = available === undefined ? item.durationFrames : available - (item.sourceInFrame ?? 0)
    const scaled = span(item)
    return { ...scaled, durationFrames: Math.min(scaled.durationFrames, limit) }
  }
  const shots = plan.shots.map(shot => ({
    ...span(shot),
    ...(shot.mediaLayers && { mediaLayers: shot.mediaLayers.map(layer => layer.kind === 'video' ? mediaSpan(layer) : span(layer)) }),
    cueAnchors: shot.cueAnchors.map(anchor => {
      const segment = segments.get(anchor.scriptSegmentId)!
      const start = at(Math.max(shot.startFrame, segment.startFrame))
      const finish = at(Math.min(end(shot), end(segment)))
      // Map cue positions within the same scaled overlap used for their enclosing spans.
      const oldStart = Math.max(shot.startFrame, segment.startFrame)
      const oldEnd = Math.min(end(shot), end(segment))
      const offset = Math.floor((anchor.frame - oldStart) * (finish - start) / (oldEnd - oldStart))
      return { ...anchor, frame: start + offset }
    }),
  }))
  const shotsById = new Map(shots.map(shot => [shot.id, shot]))
  return parseDirectorPlan({
    ...plan, durationFrames: actualDurationFrames, narration: { ...plan.narration, timing: 'actual' },
    scriptSegments: plan.scriptSegments.map(span), scenes: plan.scenes.map(span), shots, captions: plan.captions.map(span),
    audio: plan.audio.map(mediaSpan),
    transitions: plan.transitions.map(transition => transition.kind === 'cut' ? transition : {
      ...transition, durationFrames: Math.max(1, Math.min(scale(transition.durationFrames),
        shotsById.get(transition.fromShotId)!.durationFrames, shotsById.get(transition.toShotId)!.durationFrames)),
    }),
  })
}

export interface NarrationAudio {
  asset: DirectorAsset
  measuredDurationFrames: number
  sourceInFrame?: number
  volume?: number
  origin?: NonNullable<DirectorPlan['narration']['origin']>
}

export function attachNarration(plan: DirectorPlan, {
  asset, measuredDurationFrames, sourceInFrame = 0, volume = 1, origin = 'unknown',
}: NarrationAudio): DirectorPlan {
  if (asset.kind !== 'audio') throw new Error('Narration requires an audio asset.')
  if (!Number.isSafeInteger(sourceInFrame) || sourceInFrame < 0 || !Number.isSafeInteger(measuredDurationFrames) ||
      measuredDurationFrames <= sourceInFrame || measuredDurationFrames > 1_000_000) {
    throw new Error('Narration requires a source offset within its measured audio duration.')
  }
  const isNarration = (track: DirectorPlan['audio'][number]) => plan.narration.trackId ?
    track.id === plan.narration.trackId : track.assetId === plan.narration.assetId
  const prior = plan.audio.find(isNarration)
  const audio = plan.audio.filter(track => !isNarration(track))
  const trackIds = new Set(audio.map(track => track.id))
  let trackId = prior?.id ?? 'narration'
  for (let index = 1; trackIds.has(trackId); index++) trackId = 'narration-' + index
  const durationFrames = measuredDurationFrames - sourceInFrame
  const reflowed = reflowDirectorPlan({ ...plan, audio, narration: { ...plan.narration, trackId: undefined } }, durationFrames)
  return parseDirectorPlan({
    ...reflowed, assets: [...reflowed.assets.filter(item => item.id !== asset.id), { ...asset, sourceDurationFrames: measuredDurationFrames }],
    narration: { ...reflowed.narration, assetId: asset.id, timing: 'actual', origin, trackId },
    audio: [...reflowed.audio, { id: trackId, assetId: asset.id, startFrame: 0, sourceInFrame, durationFrames, volume }],
  })
}
