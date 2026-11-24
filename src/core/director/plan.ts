import { z } from 'zod'
import { scriptByteLimit } from './script'

const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/)
const text = z.string().max(20_000)
const scriptText = z.string().max(scriptByteLimit).refine(value => new TextEncoder().encode(value).length <= scriptByteLimit,
  'Script text exceeds the 1 MiB limit')
const charOffset = z.number().int().min(0).max(scriptByteLimit)
const frame = z.number().int().min(0).max(1_000_000)
const length = z.number().int().min(1).max(1_000_000)
const unit = z.number().min(0).max(1)
const color = z.string().regex(/^#[\da-f]{6}$/i)
// Paths are relative to the plan's directory. No URLs, escapes, queries, or traversal.
export const directorAssetPath = z.string().max(240).regex(/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:wav|mp3|m4a|png|jpg|webp|mp4|webm)$/)
const span = { startFrame: frame, durationFrames: length }
const box = { x: unit, y: unit, width: unit.refine(n => n > 0), height: unit.refine(n => n > 0) }
const elementFields = {
  id, sharedKey: id.optional(), text: z.string().max(240),
  ...box, fontSize: z.number().min(8).max(300), color, background: color, borderRadius: z.number().min(0).max(200),
}
const mediaKind = z.enum(['image', 'video'])
const assetKind = z.enum(['audio', 'image', 'video'])
export const visualElementSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...elementFields, kind: z.enum(['text', 'number', 'box']) }),
  z.strictObject({ ...elementFields, kind: mediaKind, assetId: id, fit: z.enum(['contain', 'cover']), opacity: unit }),
])
const mediaLayerSchema = z.strictObject({ id, assetId: id, kind: mediaKind, ...span, sourceInFrame: frame.optional() })
const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a
export const directorFrameRateSchema = z.strictObject({
  numerator: z.number().int().min(1).max(120_000), denominator: z.number().int().min(1).max(10_000),
}).superRefine(({ numerator, denominator }, ctx) => {
  const fps = numerator / denominator
  if (fps < 1 || fps > 120) ctx.addIssue({ code: 'custom', message: 'Rational fps must be between 1 and 120' })
  if (gcd(numerator, denominator) !== 1) ctx.addIssue({ code: 'custom', message: 'Frame rate must be a reduced rational' })
})
const assetSchema = z.strictObject({
  id, kind: assetKind, path: directorAssetPath.optional(),
  projectAssetId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/).optional(),
  description: text, sourceDurationFrames: length.optional(),
})
const shotSchema = z.strictObject({
  id, scriptSegmentIds: z.array(id).min(1).max(1000), purpose: text, ...span,
  sceneType: z.enum(['title', 'chart', 'quote', 'graphic', 'image', 'video', 'split']), visualElements: z.array(visualElementSchema).min(1).max(50),
  assetIds: z.array(id).max(100), camera: z.enum(['static', 'slow-push']), transition: id.nullable(),
  assetNeeds: z.array(z.strictObject({ kind: mediaKind, purpose: text, keywords: z.array(z.string().max(240)).max(10) })).max(10).optional(),
  cueAnchors: z.array(z.strictObject({ scriptSegmentId: id, charOffset, frame })).max(1000),
  presenterLayout: z.enum(['none', 'full', 'pip', 'left', 'right', 'portrait', 'round']), rationale: text,
  locked: z.boolean().optional(),
  continuity: z.strictObject({ previousShotId: id.nullable(), nextShotId: id.nullable(), previous: text, next: text }).optional(),
  mediaLayers: z.array(mediaLayerSchema).max(50).optional(),
})
const baseSchema = z.strictObject({
  schemaVersion: z.literal(1), productionMode: z.enum(['script', 'presenter']), originalScript: scriptText,
  scriptSegments: z.array(z.strictObject({ id, text: scriptText, ...span, charStart: charOffset.optional(), charEnd: charOffset.optional() })).min(1).max(1000),
  aspectRatio: z.enum(['16:9', '9:16']),
  frameRate: directorFrameRateSchema,
  resolution: z.strictObject({ width: z.number().int().min(64).max(3840), height: z.number().int().min(64).max(3840) }),
  durationFrames: length,
  scenes: z.array(z.strictObject({ id, title: text, ...span, shotIds: z.array(id).min(1).max(1000) })).min(1).max(1000),
  shots: z.array(shotSchema).min(1).max(1000),
  narration: z.strictObject({ text: scriptText, assetId: id.nullable(), scriptSegmentIds: z.array(id).max(1000), timing: z.literal('estimated').optional() }),
  presenter: z.strictObject({ name: z.string().max(120), assetId: id }).nullable(),
  assets: z.array(assetSchema).max(1000),
  captions: z.array(z.strictObject({ id, scriptSegmentId: id, text: scriptText, ...span,
    style: z.strictObject({ color: color.optional(), background: color.optional(), fontSize: z.number().min(8).max(300).optional() }).optional(),
  })).max(5000),
  transitions: z.array(z.strictObject({
    id, fromShotId: id, toShotId: id, kind: z.enum(['cut', 'morph']), durationFrames: frame, sharedElementId: id.nullable(),
  })).max(1000),
  audio: z.array(z.strictObject({ id, assetId: id, ...span, sourceInFrame: frame, volume: z.number().min(0).max(1) })).max(100),
  style: z.strictObject({ background: color, foreground: color, accent: color, fontFamily: z.enum(['sans-serif', 'serif', 'monospace']) }),
  reviewStatus: z.enum(['draft', 'needs-review', 'approved']),
})

export const directorPlanSchema = baseSchema.superRefine((plan, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
  const unique = (values: string[], label: string) => { if (new Set(values).size !== values.length) issue('Duplicate ' + label + ' ID/reference') }
  const end = (s: { startFrame: number; durationFrames: number }) => s.startFrame + s.durationFrames
  const inside = (s: { startFrame: number; durationFrames: number }) => { if (end(s) > plan.durationFrames) issue('Frame range exceeds plan duration') }
  const coverage = (spans: { startFrame: number; durationFrames: number }[], start: number, finish: number, label: string) => {
    let cursor = start
    for (const s of [...spans].sort((a, b) => a.startFrame - b.startFrame)) {
      if (s.startFrame !== cursor) issue(label + ' coverage has a gap or overlap')
      cursor = end(s)
    }
    if (cursor !== finish) issue(label + ' coverage does not match duration')
  }
  const fps = plan.frameRate.numerator / plan.frameRate.denominator
  const { width, height } = plan.resolution
  const [rw, rh] = plan.aspectRatio.split(':').map(Number)
  if (width % 2 || height % 2 || width * rh !== height * rw) issue('Resolution must be even and match aspectRatio exactly')
  if (plan.durationFrames / fps > 3600) issue('Plan exceeds one hour')
  for (const [label, items] of Object.entries({ segment: plan.scriptSegments, scene: plan.scenes, shot: plan.shots,
    asset: plan.assets, caption: plan.captions, transition: plan.transitions, audio: plan.audio })) unique(items.map(i => i.id), label)
  const segments = new Map(plan.scriptSegments.map(s => [s.id, s]))
  const segmentLengths = new Map(plan.scriptSegments.map(s => [s.id, Array.from(s.text).length]))
  const shots = new Map(plan.shots.map(s => [s.id, s]))
  const assets = new Map(plan.assets.map(s => [s.id, s]))
  const transitions = new Map(plan.transitions.map(t => [t.id, t]))
  const sourceRange = (assetId: string, start: number, duration: number) => {
    const available = assets.get(assetId)?.sourceDurationFrames
    if (available !== undefined && start + duration > available) issue('Media source range exceeds asset duration: ' + assetId)
  }
  const refs = (ids: string[], available: ReadonlyMap<string, unknown>, label: string) => {
    unique(ids, label)
    if (ids.some(i => !available.has(i))) issue('Unknown ' + label + ' reference')
  }
  coverage(plan.scenes, 0, plan.durationFrames, 'Scene')
  coverage(plan.shots, 0, plan.durationFrames, 'Shot')
  coverage(plan.scriptSegments, 0, plan.durationFrames, 'Script segment')
  if (plan.scriptSegments.some(s => s.charStart !== undefined || s.charEnd !== undefined)) {
    const source = Array.from(plan.originalScript)
    let cursor = 0
    for (const segment of [...plan.scriptSegments].sort((a, b) => a.startFrame - b.startFrame)) {
      const finish = cursor + segmentLengths.get(segment.id)!
      if (segment.charStart !== cursor || segment.charEnd !== finish || source.slice(cursor, finish).join('') !== segment.text) {
        issue('Script segment character offsets must tile the original script')
      }
      cursor = finish
    }
    if (cursor !== source.length) issue('Script segment character offsets must cover the original script')
  }
  unique(plan.scenes.flatMap(s => s.shotIds), 'scene shot membership')
  if (plan.scenes.flatMap(s => s.shotIds).length !== plan.shots.length) issue('Every shot must belong to one scene')
  for (const scene of plan.scenes) {
    refs(scene.shotIds, shots, 'shot')
    coverage(scene.shotIds.flatMap(id => shots.has(id) ? [shots.get(id)!] : []), scene.startFrame, end(scene), 'Scene shot')
  }
  for (const segment of plan.scriptSegments) {
    inside(segment)
    if (!plan.shots.some(s => s.scriptSegmentIds.includes(segment.id))) issue('Unreferenced script segment')
  }
  const orderedShots = [...plan.shots].sort((a, b) => a.startFrame - b.startFrame)
  for (const [index, shot] of orderedShots.entries()) {
    inside(shot)
    refs(shot.scriptSegmentIds, segments, 'script segment')
    refs(shot.assetIds, assets, 'asset')
    unique(shot.visualElements.map(e => e.id), 'visual element')
    unique(shot.visualElements.flatMap(e => e.sharedKey ? [e.sharedKey] : []), 'shared element')
    for (const element of shot.visualElements) {
      if (element.x + element.width > 1 || element.y + element.height > 1) issue('Visual element exceeds safe frame bounds')
      if ('assetId' in element && (!shot.assetIds.includes(element.assetId) || assets.get(element.assetId)?.kind !== element.kind)) {
        issue('Visual element requires a matching shot media asset: ' + element.assetId)
      }
    }
    unique(shot.mediaLayers?.map(layer => layer.id) ?? [], 'media layer')
    for (const layer of shot.mediaLayers ?? []) {
      if (!shot.assetIds.includes(layer.assetId) || assets.get(layer.assetId)?.kind !== layer.kind) {
        issue('Media layer requires a matching shot asset: ' + layer.assetId)
      }
      if (layer.startFrame < shot.startFrame || end(layer) > end(shot)) issue('Media layer range exceeds shot duration')
      if (layer.kind === 'image' && layer.sourceInFrame !== undefined) issue('Still images cannot have a source range')
      if (layer.kind === 'video') sourceRange(layer.assetId, layer.sourceInFrame ?? 0, layer.durationFrames)
    }
    if (shot.continuity && (shot.continuity.previousShotId !== (orderedShots[index - 1]?.id ?? null) ||
      shot.continuity.nextShotId !== (orderedShots[index + 1]?.id ?? null))) issue('Continuity must reference adjacent shots')
    for (const sid of shot.scriptSegmentIds) {
      const segment = segments.get(sid)
      if (segment && (segment.startFrame >= end(shot) || end(segment) <= shot.startFrame)) issue('Shot script segment does not overlap shot')
    }
    if (shot.transition !== null && transitions.get(shot.transition)?.fromShotId !== shot.id) issue('Invalid outgoing transition reference')
    for (const anchor of shot.cueAnchors) {
      const segment = segments.get(anchor.scriptSegmentId)
      if (!segment || !shot.scriptSegmentIds.includes(anchor.scriptSegmentId) || anchor.charOffset >= segmentLengths.get(segment.id)! ||
        anchor.frame < shot.startFrame || anchor.frame >= end(shot) || anchor.frame < segment.startFrame || anchor.frame >= end(segment)) issue('Invalid cue anchor')
    }
    if (shot.presenterLayout !== 'none' && !plan.presenter) issue('Presenter layout needs a presenter')
  }
  for (const t of plan.transitions) {
    const from = shots.get(t.fromShotId), to = shots.get(t.toShotId)
    if (!from || !to || end(from) !== to.startFrame || from.transition !== t.id) { issue('Transition must connect adjacent shots'); continue }
    if (t.kind === 'cut') {
      if (t.durationFrames !== 0 || t.sharedElementId !== null) issue('Cut must have zero duration and no shared element')
    } else {
      const a = from.visualElements.find(e => e.sharedKey === t.sharedElementId)
      const b = to.visualElements.find(e => e.sharedKey === t.sharedElementId)
      if (!t.durationFrames || t.durationFrames > Math.min(from.durationFrames, to.durationFrames) || !a || !b || a.kind !== b.kind ||
        a.text !== b.text || 'assetId' in a || 'assetId' in b) issue('Morph needs matching shared graphic elements and an in-range duration')
    }
  }
  for (const asset of plan.assets) {
    const ext = asset.path?.split('.').pop()
    const extensions = { audio: ['wav', 'mp3', 'm4a'], image: ['png', 'jpg', 'webp'], video: ['mp4', 'webm'] }
    if (!asset.path && !asset.projectAssetId) issue('Asset requires a path or projectAssetId: ' + asset.id)
    if (ext && !extensions[asset.kind].includes(ext)) issue('Asset extension does not match kind')
    if (asset.kind === 'image' && asset.sourceDurationFrames !== undefined) issue('Still images cannot declare a source duration')
  }
  refs(plan.narration.scriptSegmentIds, segments, 'narration segment')
  if (plan.narration.assetId && assets.get(plan.narration.assetId)?.kind !== 'audio') issue('Narration requires an audio asset')
  if (plan.presenter && assets.get(plan.presenter.assetId)?.kind !== 'video') issue('Presenter requires a video asset')
  if (plan.productionMode === 'presenter' && !plan.presenter && (plan.reviewStatus !== 'draft' || plan.narration.timing !== 'estimated')) {
    issue('Presenter mode requires presenter media outside an estimated script draft')
  }
  for (const caption of plan.captions) {
    inside(caption)
    const segment = segments.get(caption.scriptSegmentId)
    if (!segment || caption.startFrame < segment.startFrame || end(caption) > end(segment)) issue('Invalid caption segment/range')
  }
  for (const audio of plan.audio) {
    inside(audio)
    if (assets.get(audio.assetId)?.kind !== 'audio') issue('Audio track requires an audio asset')
    sourceRange(audio.assetId, audio.sourceInFrame, audio.durationFrames)
  }
})

export type DirectorPlan = z.infer<typeof directorPlanSchema>
export type DirectorShot = DirectorPlan['shots'][number]
export type DirectorAsset = DirectorPlan['assets'][number]
export type VisualElement = z.infer<typeof visualElementSchema>

export function parseDirectorPlan(value: unknown): DirectorPlan {
  const result = directorPlanSchema.safeParse(value)
  if (!result.success) throw new Error('Invalid DirectorPlan: ' + result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '))
  return result.data
}
