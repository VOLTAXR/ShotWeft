import { parseDirectorPlan, type DirectorPlan } from './plan'

export const compositionRegistry = Object.freeze({ director: 'ShotWeftDirector' })

export function compileDirectorPlan(value: unknown) {
  const plan = parseDirectorPlan(value)
  const fps = plan.frameRate.numerator / plan.frameRate.denominator
  if (plan.productionMode !== 'script' || plan.presenter || plan.shots.some(s => s.presenterLayout !== 'none' || s.assetIds.length || s.camera !== 'static')) {
    throw new Error('M1 renders script graphics and local audio only; presenter and visual media rendering are not implemented.')
  }
  if (plan.narration.assetId && !plan.audio.some(a => a.assetId === plan.narration.assetId)) throw new Error('Narration audio must be scheduled in audio.')
  return { id: compositionRegistry.director, width: plan.resolution.width, height: plan.resolution.height,
    fps, durationInFrames: plan.durationFrames, plan }
}

// Separate V2 JSON store: never embedded in or silently migrated into V1.x ZIPs.
export interface DirectorPlanStore { plan: DirectorPlan }
