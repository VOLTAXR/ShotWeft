import type { DirectorPlan } from './plan'

/** Rewrite project asset IDs while preserving all of the plan's own IDs. */
export function remapDirectorPlan(plan: DirectorPlan, assetIds?: ReadonlyMap<string, string>): DirectorPlan {
  const copy = structuredClone(plan)
  for (const asset of copy.assets) {
    if (asset.projectAssetId === undefined) continue
    const id = assetIds?.get(asset.projectAssetId)
    if (id === undefined) throw new Error('Cannot remap missing project asset ' + asset.projectAssetId + ' for DirectorPlan asset ' + asset.id + '.')
    asset.projectAssetId = id
  }
  return copy
}
