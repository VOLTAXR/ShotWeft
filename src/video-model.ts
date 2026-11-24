export interface FrameRate {
  numerator: number
  denominator: number
}

export const videoTrackKinds = ['main-video', 'b-roll', 'voice', 'music', 'captions', 'graphics'] as const
export type VideoTrackKind = typeof videoTrackKinds[number]

export const isAudioTrack = (kind: VideoTrackKind) => kind === 'voice' || kind === 'music'

export interface VideoGraphic {
  kind: 'text' | 'box'
  text?: string
  x: number
  y: number
  width: number
  height: number
  opacity: number
  fontSize: number
  color: string
  align: 'left' | 'center' | 'right'
}

export interface VideoClip {
  id: string
  assetId?: string
  startFrame: number
  durationFrames: number
  sourceInFrame?: number
  sourceOutFrame?: number
  volume: number
  muted: boolean
  label: string
  graphic?: VideoGraphic
}

export interface VideoTrack {
  id: string
  kind: VideoTrackKind
  label: string
  muted: boolean
  visible: boolean
  clips: VideoClip[]
}

export interface SubtitleStyle {
  position?: 'top' | 'center' | 'bottom'
  fontSize?: number
  color?: string
  background?: string
}

export const captionDefaults = {
  position: 'bottom', fontSize: 54, color: '#ffffff', background: '#121826dd',
} satisfies SubtitleStyle

export interface SubtitleCue {
  id: string
  trackId: string
  startFrame: number
  endFrame: number
  text: string
  style?: SubtitleStyle
}

export interface VideoTimeline {
  schemaVersion: 1
  fps: FrameRate
  width: number
  height: number
  tracks: VideoTrack[]
  subtitles: SubtitleCue[]
  template?: { id: string; revision: number }
}

// Snap each timestamp independently so sequential clips do not accumulate rounding errors.
export function secondsToFrame(seconds: number, fps: FrameRate) {
  const frame = Math.round(seconds * fps.numerator / fps.denominator)
  if (seconds < 0 || !Number.isSafeInteger(frame) || frame < 0) throw new RangeError('Time is outside the frame range')
  return frame === 0 ? 0 : frame
}

export function frameToSeconds(frame: number, fps: FrameRate) {
  if (!Number.isSafeInteger(frame) || frame < 0) throw new RangeError('Expected a non-negative safe integer frame')
  return frame * fps.denominator / fps.numerator
}

export function clipEndFrame(clip: VideoClip) {
  return clip.startFrame + clip.durationFrames
}

export function timelineDurationFrames(timeline: VideoTimeline) {
  let end = 0
  for (const track of timeline.tracks) {
    for (const clip of track.clips) end = Math.max(end, clipEndFrame(clip))
  }
  for (const cue of timeline.subtitles) end = Math.max(end, cue.endFrame)
  return end
}

// Audio tracks can have multiple active clips. Lookups use half-open frame ranges.
export function activeClipsAtFrame(track: VideoTrack, frame: number) {
  return track.clips.filter(clip => clip.startFrame <= frame && frame < clipEndFrame(clip))
}

export function activeCuesAtFrame(timeline: VideoTimeline, frame: number) {
  return timeline.subtitles.filter(cue => cue.startFrame <= frame && frame < cue.endFrame)
}

function remappedId(ids: ReadonlyMap<string, string>, id: string) {
  const replacement = ids.get(id)
  if (replacement === undefined) throw new Error('Missing timeline reference: ' + id)
  return replacement
}

export function regenerateTimelineIds(timeline: VideoTimeline, assetIds?: ReadonlyMap<string, string>): VideoTimeline {
  const trackIds = new Map(timeline.tracks.map(track => [track.id, crypto.randomUUID()]))
  return {
    ...timeline,
    fps: { ...timeline.fps },
    ...(timeline.template && { template: { ...timeline.template } }),
    tracks: timeline.tracks.map(track => ({
      ...track, id: remappedId(trackIds, track.id),
      clips: track.clips.map(clip => ({
        ...clip, id: crypto.randomUUID(),
        ...(clip.assetId !== undefined && assetIds && { assetId: remappedId(assetIds, clip.assetId) }),
        ...(clip.graphic && { graphic: { ...clip.graphic } }),
      })),
    })),
    subtitles: timeline.subtitles.map(cue => ({
      ...cue, id: crypto.randomUUID(), trackId: remappedId(trackIds, cue.trackId),
      ...(cue.style && { style: { ...cue.style } }),
    })),
  }
}

type Template = {
  width: number
  height: number
  fps: number
  tracks: readonly (readonly [VideoTrackKind, string])[]
}

const templates = {
  'talking-head': { width: 1920, height: 1080, fps: 30, tracks: [
    ['main-video', 'Presenter'], ['b-roll', 'B-roll'], ['voice', 'Voice'], ['captions', 'Captions'],
  ] },
  educational: { width: 1920, height: 1080, fps: 30, tracks: [
    ['main-video', 'Demonstration'], ['b-roll', 'Picture-in-picture'], ['voice', 'Narration'], ['graphics', 'Section labels'],
  ] },
  'short-form': { width: 1080, height: 1920, fps: 30, tracks: [
    ['main-video', 'Main video'], ['b-roll', 'B-roll'], ['voice', 'Voice'], ['music', 'Music'], ['captions', 'Captions'],
  ] },
  documentary: { width: 1920, height: 1080, fps: 24, tracks: [
    ['main-video', 'Main footage'], ['b-roll', 'B-roll'], ['voice', 'Narration'], ['music', 'Music'], ['graphics', 'Location titles'],
  ] },
  'cinematic-title': { width: 1920, height: 804, fps: 24, tracks: [
    ['main-video', 'Background'], ['graphics', 'Title'], ['music', 'Music'],
  ] },
} as const satisfies Record<string, Template>

export type VideoTemplateId = keyof typeof templates
export const videoTemplateIds = Object.keys(templates) as VideoTemplateId[]

export function applyVideoTemplate(id: VideoTemplateId): VideoTimeline {
  const { width, height, fps, tracks } = templates[id]
  return {
    schemaVersion: 1, fps: { numerator: fps, denominator: 1 }, width, height,
    tracks: tracks.map(([kind, label]) => ({ id: crypto.randomUUID(), kind, label, muted: false, visible: true, clips: [] })),
    subtitles: [], template: { id, revision: 1 },
  }
}
