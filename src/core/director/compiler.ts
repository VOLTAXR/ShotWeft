import { presenterVideoEnd } from '../presenter/layout'
import { parseDirectorPlan, referencedDirectorAssetIds, type DirectorAsset, type DirectorPlan, type DirectorShot } from './plan'

export const compositionRegistry = Object.freeze({ director: 'ShotWeftDirector' })

type M1Shot = DirectorShot & { sceneType: 'title' | 'chart' | 'quote' }
type M1Plan = Omit<DirectorPlan, 'shots' | 'assets'> & { shots: M1Shot[]; assets: (DirectorAsset & { path: string })[] }

function isM1Plan(plan: DirectorPlan): plan is M1Plan {
  return plan.productionMode === 'script' && !plan.presenter &&
    plan.assets.every(asset => asset.path && !asset.projectAssetId) &&
    plan.shots.every(shot => shot.presenterLayout === 'none' && !shot.assetIds.length && shot.camera === 'static' &&
      !shot.mediaLayers?.length && (shot.sceneType === 'title' || shot.sceneType === 'chart' || shot.sceneType === 'quote'))
}

function composition<T extends DirectorPlan>(plan: T) {
  if (plan.narration.assetId && !plan.audio.some(a => a.assetId === plan.narration.assetId)) throw new Error('Narration audio must be scheduled in audio.')
  return { id: compositionRegistry.director, width: plan.resolution.width, height: plan.resolution.height,
    fps: plan.frameRate.numerator / plan.frameRate.denominator, durationInFrames: plan.durationFrames, plan }
}

export function compileDirectorPlan(value: unknown) {
  const plan = parseDirectorPlan(value)
  if (!isM1Plan(plan)) {
    throw new Error('M1 renders script graphics and local audio only; presenter and visual media rendering are not implemented.')
  }
  return composition(plan)
}

export function compileDirectorPlanForRender(value: unknown, mediaSources?: ReadonlyMap<string, DirectorMediaSource>) {
  const plan = parseDirectorPlan(value)
  if (plan.shots.some(shot => shot.camera !== 'static')) throw new Error('Remotion rendering requires static cameras.')
  if (plan.productionMode === 'presenter' && !plan.presenter) throw new Error('Missing presenter media.')
  if (plan.presenter) validatePresenterSource(plan, mediaSources?.get(plan.presenter.assetId), true)
  return composition(plan)
}

export interface DirectorMediaSource {
  kind: DirectorAsset['kind']
  /** Measured source duration in units of the plan's frame rate. */
  durationFrames?: number
  /** Measured duration of a single playable embedded audio stream. */
  audioDurationFrames?: number
}

function validatePresenterSource(plan: DirectorPlan, source: DirectorMediaSource | undefined, requireDuration: boolean) {
  const presenter = plan.presenter
  if (!presenter) return
  if (source?.kind !== 'video') throw new Error('Missing resolved presenter video for asset ' + presenter.assetId + '.')
  const offset = presenter.sourceInFrame ?? 0
  const videoEnd = offset + presenterVideoEnd(plan)
  if (requireDuration || source.durationFrames !== undefined) {
    if (!Number.isSafeInteger(source.durationFrames) || source.durationFrames! <= 0) {
      throw new Error('Missing measured presenter video duration.')
    }
    if (videoEnd > source.durationFrames!) throw new Error('Presenter video range exceeds measured source duration.')
  }
  if (presenter.audio === 'embedded') {
    if (!Number.isSafeInteger(source.audioDurationFrames) || source.audioDurationFrames! <= 0) {
      throw new Error('Presenter embedded audio requires one measured playable audio stream.')
    }
    if (offset + plan.durationFrames > source.audioDurationFrames!) throw new Error('Presenter audio range exceeds measured source duration.')
  }
}

export interface DirectorMediaSources {
  projectAssets?: ReadonlyMap<string, DirectorMediaSource>
  localAssets?: ReadonlyMap<string, DirectorMediaSource>
}

/** Compile metadata against the caller's resolved media inventory. Project IDs take precedence over paths. */
export function compileDirectorPlanForProject(value: unknown, sources: DirectorMediaSources = {}) {
  const plan = parseDirectorPlan(value)
  if (plan.productionMode === 'presenter' && !plan.presenter) throw new Error('Missing presenter media.')
  const referenced = referencedDirectorAssetIds(plan)
  const mediaSources = new Map<string, DirectorMediaSource>()
  for (const asset of plan.assets) {
    if (!referenced.has(asset.id)) continue
    const source = asset.projectAssetId !== undefined ? sources.projectAssets?.get(asset.projectAssetId) :
      sources.localAssets?.get(asset.path!)
    if (!source) throw new Error('Missing media for asset ' + asset.id + ' (' + (asset.projectAssetId ?? asset.path) + ').')
    if (source.kind !== asset.kind) throw new Error('Resolved media kind does not match asset ' + asset.id + '.')
    mediaSources.set(asset.id, source)
  }
  if (plan.presenter) {
    const presenter = plan.presenter
    validatePresenterSource(plan, mediaSources.get(presenter.assetId), Boolean(plan.transcript || plan.layoutTimeline ||
      presenter.audio || presenter.sourceInFrame !== undefined || presenter.volume !== undefined))
  }
  validateDirectorMediaRanges(plan, mediaSources)
  return { ...composition(plan), mediaSources }
}

export function validateDirectorMediaRanges(plan: DirectorPlan, mediaSources: ReadonlyMap<string, DirectorMediaSource>) {
  const limits = new Map(plan.assets.map(asset => [asset.id, asset.sourceDurationFrames]))
  const checkRange = (assetId: string, sourceEndFrame: number) => {
    const duration = mediaSources.get(assetId)?.durationFrames
    if (duration === undefined || !Number.isSafeInteger(duration) || duration <= 0) {
      throw new Error('Missing measured media duration for asset ' + assetId + '.')
    }
    if (sourceEndFrame > duration) throw new Error('Media source range exceeds measured duration for asset ' + assetId + '.')
    if (sourceEndFrame > (limits.get(assetId) ?? duration)) throw new Error('Media source range exceeds declared duration for asset ' + assetId + '.')
  }
  for (const track of plan.audio) checkRange(track.assetId, track.sourceInFrame + track.durationFrames)
  for (const shot of plan.shots) {
    for (const layer of shot.mediaLayers ?? []) {
      if (layer.kind === 'video') checkRange(layer.assetId, (layer.sourceInFrame ?? 0) + layer.durationFrames)
    }
    for (const element of shot.visualElements) {
      if (element.kind === 'video') checkRange(element.assetId, shot.durationFrames)
    }
  }
}

export interface DirectorPlanStore { plan: DirectorPlan }
