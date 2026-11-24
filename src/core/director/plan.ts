import { z } from 'zod'

const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/)
const text = z.string().max(20_000)
const frame = z.number().int().min(0).max(1_000_000)
const length = z.number().int().min(1).max(1_000_000)
const unit = z.number().min(0).max(1)
const color = z.string().regex(/^#[\da-f]{6}$/i)
// Paths are relative to the plan's directory. No URLs, escapes, queries, or traversal.
export const directorAssetPath = z.string().max(240).regex(/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:wav|mp3|m4a|png|jpg|webp|mp4|webm)$/)
const span = { startFrame: frame, durationFrames: length }
const box = { x: unit, y: unit, width: unit.refine(n => n > 0), height: unit.refine(n => n > 0) }
export const visualElementSchema = z.strictObject({
  id, sharedKey: id.optional(), kind: z.enum(['text', 'number', 'box']), text: z.string().max(240),
  ...box, fontSize: z.number().min(8).max(300), color, background: color, borderRadius: z.number().min(0).max(200),
})
const shotSchema = z.strictObject({
  id, scriptSegmentIds: z.array(id).min(1).max(1000), purpose: text, ...span,
  sceneType: z.enum(['title', 'chart', 'quote']), visualElements: z.array(visualElementSchema).min(1).max(50),
  assetIds: z.array(id).max(100), camera: z.enum(['static', 'slow-push']), transition: id.nullable(),
  cueAnchors: z.array(z.strictObject({ scriptSegmentId: id, charOffset: frame, frame })).max(1000),
  presenterLayout: z.enum(['none', 'full', 'pip']), rationale: text,
})
const baseSchema = z.strictObject({
  schemaVersion: z.literal(1), productionMode: z.enum(['script', 'presenter']), originalScript: text,
  scriptSegments: z.array(z.strictObject({ id, text, ...span })).min(1).max(1000),
  aspectRatio: z.enum(['16:9', '9:16']),
  frameRate: z.strictObject({ numerator: z.number().int().min(1).max(120_000), denominator: z.number().int().min(1).max(10_000) }),
  resolution: z.strictObject({ width: z.number().int().min(64).max(3840), height: z.number().int().min(64).max(3840) }),
  durationFrames: length,
  scenes: z.array(z.strictObject({ id, title: text, ...span, shotIds: z.array(id).min(1).max(1000) })).min(1).max(1000),
  shots: z.array(shotSchema).min(1).max(1000),
  narration: z.strictObject({ text, assetId: id.nullable(), scriptSegmentIds: z.array(id).max(1000) }),
  presenter: z.strictObject({ name: z.string().max(120), assetId: id }).nullable(),
  assets: z.array(z.strictObject({ id, kind: z.enum(['audio', 'image', 'video']), path: directorAssetPath, description: text })).max(1000),
  captions: z.array(z.strictObject({ id, scriptSegmentId: id, text, ...span })).max(5000),
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
  if (fps < 1 || fps > 120) issue('Rational fps must be between 1 and 120')
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a
  if (gcd(plan.frameRate.numerator, plan.frameRate.denominator) !== 1) issue('Frame rate must be a reduced rational')
  const { width, height } = plan.resolution
  const [rw, rh] = plan.aspectRatio.split(':').map(Number)
  if (width % 2 || height % 2 || width * rh !== height * rw) issue('Resolution must be even and match aspectRatio exactly')
  if (plan.durationFrames / fps > 3600) issue('Plan exceeds one hour')
  for (const [label, items] of Object.entries({ segment: plan.scriptSegments, scene: plan.scenes, shot: plan.shots,
    asset: plan.assets, caption: plan.captions, transition: plan.transitions, audio: plan.audio })) unique(items.map(i => i.id), label)
  const segments = new Map(plan.scriptSegments.map(s => [s.id, s]))
  const shots = new Map(plan.shots.map(s => [s.id, s]))
  const assets = new Map(plan.assets.map(s => [s.id, s]))
  const transitions = new Map(plan.transitions.map(t => [t.id, t]))
  const refs = (ids: string[], available: ReadonlyMap<string, unknown>, label: string) => {
    unique(ids, label)
    if (ids.some(i => !available.has(i))) issue('Unknown ' + label + ' reference')
  }
  coverage(plan.scenes, 0, plan.durationFrames, 'Scene')
  coverage(plan.shots, 0, plan.durationFrames, 'Shot')
  coverage(plan.scriptSegments, 0, plan.durationFrames, 'Script segment')
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
  for (const shot of plan.shots) {
    inside(shot)
    refs(shot.scriptSegmentIds, segments, 'script segment')
    refs(shot.assetIds, assets, 'asset')
    unique(shot.visualElements.map(e => e.id), 'visual element')
    unique(shot.visualElements.flatMap(e => e.sharedKey ? [e.sharedKey] : []), 'shared element')
    for (const element of shot.visualElements) if (element.x + element.width > 1 || element.y + element.height > 1) issue('Visual element exceeds safe frame bounds')
    for (const sid of shot.scriptSegmentIds) {
      const segment = segments.get(sid)
      if (segment && (segment.startFrame >= end(shot) || end(segment) <= shot.startFrame)) issue('Shot script segment does not overlap shot')
    }
    if (shot.transition !== null && transitions.get(shot.transition)?.fromShotId !== shot.id) issue('Invalid outgoing transition reference')
    for (const anchor of shot.cueAnchors) {
      const segment = segments.get(anchor.scriptSegmentId)
      if (!segment || !shot.scriptSegmentIds.includes(anchor.scriptSegmentId) || anchor.charOffset >= Array.from(segment.text).length ||
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
      if (!t.durationFrames || t.durationFrames > Math.min(from.durationFrames, to.durationFrames) || !a || !b || a.kind !== b.kind || a.text !== b.text) issue('Morph needs matching shared elements and an in-range duration')
    }
  }
  for (const asset of plan.assets) {
    const ext = asset.path.split('.').pop()!
    const extensions = { audio: ['wav', 'mp3', 'm4a'], image: ['png', 'jpg', 'webp'], video: ['mp4', 'webm'] }
    if (!extensions[asset.kind].includes(ext)) issue('Asset extension does not match kind')
  }
  refs(plan.narration.scriptSegmentIds, segments, 'narration segment')
  if (plan.narration.assetId && assets.get(plan.narration.assetId)?.kind !== 'audio') issue('Narration requires an audio asset')
  if (plan.presenter && assets.get(plan.presenter.assetId)?.kind !== 'video') issue('Presenter requires a video asset')
  if (plan.productionMode === 'presenter' && !plan.presenter) issue('Presenter mode requires presenter media')
  for (const caption of plan.captions) {
    inside(caption)
    const segment = segments.get(caption.scriptSegmentId)
    if (!segment || caption.startFrame < segment.startFrame || end(caption) > end(segment)) issue('Invalid caption segment/range')
  }
  for (const audio of plan.audio) {
    inside(audio)
    if (assets.get(audio.assetId)?.kind !== 'audio') issue('Audio track requires an audio asset')
  }
})

export type DirectorPlan = z.infer<typeof directorPlanSchema>
export type DirectorShot = DirectorPlan['shots'][number]
export type VisualElement = z.infer<typeof visualElementSchema>

export function parseDirectorPlan(value: unknown): DirectorPlan {
  const result = directorPlanSchema.safeParse(value)
  if (!result.success) throw new Error('Invalid DirectorPlan: ' + result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '))
  return result.data
}
