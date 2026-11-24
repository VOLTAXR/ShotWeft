import { z } from 'zod'
import type { Asset } from '../model'
import { clipEndFrame, videoTrackKinds, type VideoTimeline, type VideoTrackKind } from '../video-model'

const id = z.string().min(1).max(160)
const text = z.string().max(20_000)
const frame = z.number().int().nonnegative()
const positiveInteger = z.number().int().positive()
const unit = z.number().min(0).max(1)
const color = z.string().regex(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i)
const dimension = positiveInteger.refine(value => value % 2 === 0, 'Expected an even dimension')

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b]
  return a
}

export const frameRateSchema = z.strictObject({ numerator: positiveInteger, denominator: positiveInteger })
  .refine(({ numerator, denominator }) => numerator >= denominator && numerator <= 60 * denominator && gcd(numerator, denominator) === 1,
    'Expected a reduced rational frame rate from 1 to 60 fps')

const graphic = z.strictObject({
  kind: z.enum(['text', 'box']), text: text.optional(), x: unit, y: unit,
  width: unit.positive(), height: unit.positive(), opacity: unit,
  fontSize: z.number().positive(), color, align: z.enum(['left', 'center', 'right']),
})

const clip = z.strictObject({
  id, assetId: id.optional(), startFrame: frame, durationFrames: positiveInteger,
  sourceInFrame: frame.optional(), sourceOutFrame: frame.optional(),
  volume: unit, muted: z.boolean(), label: text, graphic: graphic.optional(),
}).superRefine((value, ctx) => {
  if (!Number.isSafeInteger(clipEndFrame(value))) {
    ctx.addIssue({ code: 'custom', path: ['durationFrames'], message: 'Clip end must be a safe integer' })
  }
  const sourceEnd = (value.sourceInFrame ?? 0) + value.durationFrames
  if (!Number.isSafeInteger(sourceEnd) || (value.sourceOutFrame !== undefined && value.sourceOutFrame !== sourceEnd)) {
    ctx.addIssue({ code: 'custom', path: ['sourceOutFrame'], message: 'Source range must match the clip duration and end on a safe frame' })
  }
})

const track = z.strictObject({
  id, kind: z.enum(videoTrackKinds), label: text, muted: z.boolean(), visible: z.boolean(), clips: z.array(clip),
})

const cue = z.strictObject({
  id, trackId: id, startFrame: frame, endFrame: frame, text,
  style: z.strictObject({
    position: z.enum(['top', 'center', 'bottom']).optional(), fontSize: z.number().positive().optional(),
    color: color.optional(), background: color.optional(),
  }).optional(),
}).refine(value => value.endFrame > value.startFrame, { path: ['endFrame'], message: 'Cue end must follow its start' })

type Span = { startFrame: number; endFrame: number; index: number }

function firstOverlap(spans: Span[]) {
  const ordered = spans.sort((a, b) => a.startFrame - b.startFrame)
  return ordered.find((span, index) => index > 0 && span.startFrame < ordered[index - 1].endFrame)
}

export const videoTimelineSchema = z.strictObject({
  schemaVersion: z.literal(1), fps: frameRateSchema, width: dimension, height: dimension,
  tracks: z.array(track), subtitles: z.array(cue),
  template: z.strictObject({ id, revision: positiveInteger }).optional(),
}).superRefine((timeline, ctx) => {
  const trackIds = new Set<string>()
  const clipIds = new Set<string>()
  const cueIds = new Set<string>()
  const captionSpans = new Map<string, Span[]>()
  function issue(path: (string | number)[], message: string) {
    ctx.addIssue({ code: 'custom', path, message })
  }

  for (const [index, track] of timeline.tracks.entries()) {
    const path = ['tracks', index]
    if (trackIds.has(track.id)) issue([...path, 'id'], 'Duplicate track ID')
    trackIds.add(track.id)
    if (track.kind === 'captions') {
      captionSpans.set(track.id, [])
      if (track.clips.length) issue([...path, 'clips'], 'Caption tracks contain subtitle cues only')
    }
    for (const [clipIndex, clip] of track.clips.entries()) {
      const clipPath = [...path, 'clips', clipIndex]
      if (clipIds.has(clip.id)) issue([...clipPath, 'id'], 'Duplicate clip ID')
      clipIds.add(clip.id)
      if (clip.graphic) {
        if (track.kind !== 'graphics' || clip.assetId !== undefined) {
          issue([...clipPath, 'graphic'], 'Generated graphics belong on graphics tracks and have no asset ID')
        }
        if (hasSourceRange(clip)) issue(clipPath, 'Generated graphics cannot have source trim points')
      } else if (clip.assetId === undefined) {
        issue([...clipPath, 'assetId'], 'Media clips require an asset ID')
      }
    }
    if (track.kind === 'main-video' || track.kind === 'b-roll' || track.kind === 'graphics') {
      const overlap = firstOverlap(track.clips.map((clip, index) => ({ startFrame: clip.startFrame, endFrame: clipEndFrame(clip), index })))
      if (overlap) issue([...path, 'clips', overlap.index, 'startFrame'], 'Visual clips on a track cannot overlap')
    }
  }
  for (const [index, cue] of timeline.subtitles.entries()) {
    if (cueIds.has(cue.id)) issue(['subtitles', index, 'id'], 'Duplicate cue ID')
    cueIds.add(cue.id)
    const spans = captionSpans.get(cue.trackId)
    if (spans) spans.push({ startFrame: cue.startFrame, endFrame: cue.endFrame, index })
    else issue(['subtitles', index, 'trackId'], 'Cue must reference a caption track')
  }
  for (const spans of captionSpans.values()) {
    const overlap = firstOverlap(spans)
    if (overlap) issue(['subtitles', overlap.index, 'startFrame'], 'Cues on a caption track cannot overlap')
  }
}) satisfies z.ZodType<VideoTimeline>

function hasSourceRange(clip: { sourceInFrame?: number; sourceOutFrame?: number }) {
  return clip.sourceInFrame !== undefined || clip.sourceOutFrame !== undefined
}

export function acceptsVideoAsset(track: VideoTrackKind, asset: Asset['kind']) {
  if (track === 'captions') return false
  if (track === 'graphics') return asset === 'image'
  if (track === 'voice' || track === 'music') return asset === 'video'
  return true
}

export function validateVideoAssetReferences(
  timeline: VideoTimeline, projectId: string, assets: readonly Pick<Asset, 'id' | 'projectId' | 'kind'>[],
) {
  const byId = new Map(assets.map(asset => [asset.id, asset]))
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.assetId === undefined) continue
      const asset = byId.get(clip.assetId)
      if (!asset || asset.projectId !== projectId) throw new Error('Missing project asset for video clip ' + clip.id)
      if (!acceptsVideoAsset(track.kind, asset.kind)) {
        throw new Error('Incompatible asset for ' + track.kind + ' clip ' + clip.id)
      }
      if (asset.kind === 'image' && hasSourceRange(clip)) throw new Error('Still images cannot have source trim points: ' + clip.id)
    }
  }
}
