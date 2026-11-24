import { parseDirectorPlan, type DirectorAsset, type DirectorPlan, type DirectorShot } from './plan'

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

export interface DirectorMediaSource {
  kind: DirectorAsset['kind']
  /** Measured source duration in units of the plan's frame rate. */
  durationFrames?: number
}

export interface DirectorMediaSources {
  projectAssets?: ReadonlyMap<string, DirectorMediaSource>
  localAssets?: ReadonlyMap<string, DirectorMediaSource>
}

/** Compile metadata against the caller's resolved media inventory. Project IDs take precedence over paths. */
export function compileDirectorPlanForProject(value: unknown, sources: DirectorMediaSources = {}) {
  const plan = parseDirectorPlan(value)
  if (plan.productionMode === 'presenter' && !plan.presenter) throw new Error('Missing presenter media.')
  const referenced = new Set(plan.shots.flatMap(shot => shot.assetIds))
  for (const track of plan.audio) referenced.add(track.assetId)
  if (plan.narration.assetId) referenced.add(plan.narration.assetId)
  if (plan.presenter) referenced.add(plan.presenter.assetId)
  const mediaSources = new Map<string, DirectorMediaSource>()
  for (const asset of plan.assets) {
    if (!referenced.has(asset.id)) continue
    const source = asset.projectAssetId !== undefined ? sources.projectAssets?.get(asset.projectAssetId) :
      sources.localAssets?.get(asset.path!)
    if (!source) throw new Error('Missing media for asset ' + asset.id + ' (' + (asset.projectAssetId ?? asset.path) + ').')
    if (source.kind !== asset.kind) throw new Error('Resolved media kind does not match asset ' + asset.id + '.')
    mediaSources.set(asset.id, source)
  }
  const checkRange = (assetId: string, sourceEndFrame: number) => {
    const duration = mediaSources.get(assetId)?.durationFrames
    if (duration === undefined || !Number.isSafeInteger(duration) || duration <= 0) {
      throw new Error('Missing measured media duration for asset ' + assetId + '.')
    }
    if (sourceEndFrame > duration) throw new Error('Media source range exceeds measured duration for asset ' + assetId + '.')
  }
  for (const track of plan.audio) checkRange(track.assetId, track.sourceInFrame + track.durationFrames)
  for (const shot of plan.shots) {
    for (const layer of shot.mediaLayers ?? []) {
      if (layer.kind === 'video') checkRange(layer.assetId, (layer.sourceInFrame ?? 0) + layer.durationFrames)
    }
  }
  return { ...composition(plan), mediaSources }
}

// Separate V2 JSON store: never embedded in or silently migrated into V1.x ZIPs.
export interface DirectorPlanStore { plan: DirectorPlan }
