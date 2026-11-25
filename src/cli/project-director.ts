import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { z } from 'zod'
import { attachNarration } from '../core/director/audio'
import { compileDirectorPlanForProject, type DirectorMediaSource } from '../core/director/compiler'
import { parseDirectorPlan, referencedDirectorAssetIds, type DirectorAsset, type DirectorPlan } from '../core/director/plan'
import type { ProjectArchive } from '../core/project-archive'
import type { Asset } from '../model'
import { readDirectorPlan } from './director'
import { openFFprobe } from './ffmpeg'
import { assetMetadata, measureProjectAudio, openMediaTools, prepareProjectAssets, projectMediaExtension, readLocalJSON,
  requireProjectAsset, type MediaTools } from './project-assets'
import { updateProjectArchive, withProject, type ProjectArchiveUpdateOptions } from './project-file'
import type { RemotionRenderRequest } from './remotion-adapter'

const mappingSchema = z.array(z.strictObject({ planAssetId: z.string().min(1).max(160),
  projectAssetId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/) })).max(1000)

function embeddedPlan(archive: ProjectArchive) {
  if (!archive.project.direction) throw new Error('Project ZIP has no embedded DirectorPlan.')
  return parseDirectorPlan(archive.project.direction)
}

function durationFrames(seconds: number, plan: DirectorPlan) {
  return Math.floor((seconds + 0.0000005) * plan.frameRate.numerator / plan.frameRate.denominator)
}

function validateLinks(archive: ProjectArchive, plan: DirectorPlan) {
  const inventory = new Map<string, DirectorMediaSource>()
  const referenced = referencedDirectorAssetIds(plan)
  for (const link of plan.assets) {
    if (!link.projectAssetId) {
      if (referenced.has(link.id)) throw new Error('DirectorPlan asset has no project asset link: ' + link.id)
      continue
    }
    const asset = requireProjectAsset(archive, link.projectAssetId)
    if (asset.kind !== link.kind) throw new Error('Incompatible project asset kind for DirectorPlan asset ' + link.id + '.')
    inventory.set(asset.id, { kind: asset.kind,
      ...(asset.duration !== undefined && { durationFrames: durationFrames(asset.duration, plan) }) })
  }
  // Existing presenter archives remain readable; this command does not infer embedded audio metadata.
  if (plan.productionMode === 'script') compileDirectorPlanForProject(plan, { projectAssets: inventory })
}

export async function importProjectPlan(path: string, planFile: string, mapFile: string | undefined, options: ProjectArchiveUpdateOptions) {
  const plan = await readDirectorPlan(planFile)
  const records = mapFile === undefined ? [] : await readLocalJSON(mapFile, mappingSchema)
  const map = new Map<string, string>()
  const known = new Set(plan.assets.map(asset => asset.id))
  for (const { planAssetId, projectAssetId } of records) {
    if (!known.has(planAssetId) || map.has(planAssetId)) throw new Error('Unknown or duplicate DirectorPlan asset mapping: ' + planAssetId)
    map.set(planAssetId, projectAssetId)
  }
  const { project, ...receipt } = await updateProjectArchive(path, archive => {
    const assets = plan.assets.map(({ path: _exchangePath, ...asset }) => {
      const mapped = map.get(asset.id)
      if (mapped && asset.projectAssetId && mapped !== asset.projectAssetId) throw new Error('Conflicting links for DirectorPlan asset ' + asset.id + '.')
      const projectAssetId = mapped ?? asset.projectAssetId
      if (!projectAssetId) throw new Error('Missing project asset mapping for DirectorPlan asset ' + asset.id + '.')
      return { ...asset, projectAssetId }
    })
    const direction = parseDirectorPlan({ ...plan, assets })
    validateLinks(archive, direction)
    return { ...archive, project: { ...archive.project, direction, activeTimeline: 'director' } }
  }, options)
  return { ...receipt, durationFrames: project.direction!.durationFrames, assets: project.direction!.assets.map(({ id, projectAssetId }) => ({ id, projectAssetId })) }
}

export function showProjectPlan(path: string) {
  return withProject(path, archive => {
    const plan = embeddedPlan(archive)
    validateLinks(archive, plan)
    return { projectPath: resolve(path), valid: true, plan }
  })
}

type NarrationOrigin = NonNullable<DirectorPlan['narration']['origin']>
export async function attachProjectNarration(path: string, source: string, options: ProjectArchiveUpdateOptions & MediaTools & {
  root?: string; origin: NarrationOrigin;
}) {
  let narrationAsset!: ReturnType<typeof assetMetadata>
  const { project, ...receipt } = await updateProjectArchive(path, async (archive, media) => {
    const plan = embeddedPlan(archive)
    if (plan.productionMode !== 'script') throw new Error('CLI M1 narration attachment supports script-mode plans only.')
    let items = archive.items
    let asset: Asset
    let seconds: number
    if (options.root !== undefined) {
      const tools = await openMediaTools(options)
      const [imported] = await prepareProjectAssets([{ path: source }], options.root, archive.project.id, media, tools, items, true)
      asset = imported
      seconds = imported.duration!
      items = [...items, asset]
    } else {
      const existing = requireProjectAsset(archive, source)
      if (existing.kind !== 'audio') throw new Error('Narration requires a project audio asset.')
      const measured = await measureProjectAudio(existing, media.pathFor(existing.blob), await openFFprobe(options.ffprobe))
      asset = { ...existing, duration: measured }
      seconds = measured
      items = items.map(item => item.id === existing.id ? asset : item)
    }
    const oldNarration = plan.narration.assetId
    const oldLink = plan.assets.find(link => link.id === oldNarration && link.projectAssetId === asset.id)
    const link: DirectorAsset = oldLink ?? { id: 'narration-' + randomUUID(), kind: 'audio', projectAssetId: asset.id, description: 'Project narration' }
    let direction = attachNarration(plan, { asset: link, measuredDurationFrames: durationFrames(seconds, plan), origin: options.origin })
    if (oldNarration && !referencedDirectorAssetIds(direction).has(oldNarration)) {
      direction = parseDirectorPlan({ ...direction, assets: direction.assets.filter(entry => entry.id !== oldNarration) })
    }
    validateLinks({ ...archive, items }, direction)
    narrationAsset = assetMetadata(asset)
    return { ...archive, items, project: { ...archive.project, direction } }
  }, options)
  return { ...receipt, asset: narrationAsset, narration: project.direction!.narration, durationFrames: project.direction!.durationFrames }
}

export async function renderProjectPlan(path: string, options: Omit<RemotionRenderRequest, 'source'>) {
  return withProject(path, async (archive, media) => {
    const plan = embeddedPlan(archive)
    if (plan.productionMode !== 'script') throw new Error('CLI M1 project-native rendering supports script-mode plans only.')
    // Resolve only archive-owned media. Any carried exchange path is deliberately ignored.
    const referenced = referencedDirectorAssetIds(plan)
    const sources = new Map(plan.assets.filter(link => referenced.has(link.id)).map(link => {
      if (!link.projectAssetId) throw new Error('Missing project asset link for DirectorPlan asset ' + link.id + '.')
      const asset = requireProjectAsset(archive, link.projectAssetId)
      if (asset.kind !== link.kind) throw new Error('Incompatible project asset kind for DirectorPlan asset ' + link.id + '.')
      return [link.id, { path: media.pathFor(asset.blob), extension: projectMediaExtension(asset) }]
    }))
    const { RemotionRenderAdapter } = await import('./remotion-adapter')
    const result = await new RemotionRenderAdapter().renderExtracted(plan, options, asset => sources.get(asset.id)!)
    return { ...result, projectPath: resolve(path), durationFrames: plan.durationFrames }
  })
}
