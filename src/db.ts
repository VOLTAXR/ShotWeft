import Dexie, { type EntityTable } from 'dexie'
import type { ArchiveMetadata, ProjectSnapshot } from './project-snapshot'
import { demoProject, duplicateProject, type Asset, type Project } from './model'

type EditState = Pick<Project, 'frame' | 'scenes' | 'shots' | 'video' | 'direction' | 'activeTimeline'> & { audioImports?: string[] }
type History = { id: string; past: EditState[]; future: EditState[]; group?: string }

const db = new Dexie('frameos-studio') as Dexie & {
  projects: EntityTable<Project, 'id'>
  settings: EntityTable<{ id: string; archiveMetadata?: ArchiveMetadata; undoneAudioIds?: string[] }, 'id'>
  assets: EntityTable<Asset, 'id'>
  history: EntityTable<History, 'id'>
}
db.version(1).stores({ projects: 'id, updated', settings: 'id' })
db.version(2).stores({ assets: 'id, projectId', history: 'id' })

export const { projects, assets, history } = db
const limit = 40
const archiveKey = (id: string) => 'archive:' + id
const audioUndoKey = (id: string) => 'audio-undo:' + id

export function editState({ frame, scenes, shots, video, direction, activeTimeline }: Project, audioImports?: string[]): EditState {
  return { frame, scenes, shots, ...(video && { video }), ...(direction && { direction }), ...(activeTimeline && { activeTimeline }),
    ...(audioImports?.length && { audioImports }) }
}

export function applyEditState(project: Project, { frame, scenes, shots, video, direction, activeTimeline }: EditState): Project {
  const next = { ...project, frame, scenes, shots, video, direction, activeTimeline }
  if (video === undefined) delete next.video
  if (direction === undefined) delete next.direction
  if (activeTimeline === undefined) delete next.activeTimeline
  return next
}

function undoneAudio(future: EditState[]) {
  return new Set(future.flatMap(edit => edit.audioImports ?? []))
}

function timelineAssetIds(video: Project['video']) {
  return new Set(video?.tracks.flatMap(track => track.clips.map(clip => clip.assetId).filter(id => id !== undefined)))
}

export function readAssets(id: string) {
  return db.transaction('r', assets, db.settings, async () => {
    // Keep media observers stable when an edit only changes storyboard or timeline history.
    const hidden = new Set((await db.settings.get(audioUndoKey(id)))?.undoneAudioIds)
    return (await assets.where('projectId').equals(id).toArray()).filter(asset => !hidden.has(asset.id))
  })
}

export function initialize() {
  return db.transaction('rw', projects, db.settings, async () => {
    if (await db.settings.get('seeded')) return
    await projects.add(demoProject())
    await db.settings.add({ id: 'seeded' })
  })
}

async function requireProject(id: string) {
  const project = await projects.get(id)
  if (!project) throw new Error('找不到项目')
  return project
}

export function revise(id: string, apply: (project: Project) => Project) {
  return db.transaction('rw', projects, async () => {
    const project = await requireProject(id)
    await projects.put({ ...apply(project), id, updated: Date.now() })
  })
}

export function editProject(id: string, apply: (project: Project) => Project, group?: string, imported: Asset[] = []) {
  return db.transaction('rw', projects, history, assets, db.settings, async () => {
    const project = await requireProject(id)
    const next = apply(project)
    if (next === project && !imported.length) return
    if (imported.length) await assets.bulkAdd(imported)
    const audioImports = imported.filter(asset => asset.kind === 'audio').map(asset => asset.id)
    if (next === project && !audioImports.length) return
    const state = await history.get(id) ?? { id, past: [], future: [] }
    const discarded = undoneAudio(state.future)
    if (next.video && next.video !== project.video) {
      const previous = timelineAssetIds(project.video)
      const added = [...timelineAssetIds(next.video)].filter(id => !previous.has(id))
      if (added.length) {
        const records = await assets.bulkGet(added)
        if (records.some(asset => !asset || asset.projectId !== id || discarded.has(asset.id))) {
          throw new Error('A timeline asset is no longer available in this project.')
        }
      }
    }
    if (next.direction && next.direction !== project.direction) {
      const linked = next.direction.assets.flatMap(asset => asset.projectAssetId === undefined ? [] :
        [{ id: asset.projectAssetId, kind: asset.kind }])
      const records = linked.length ? await assets.bulkGet(linked.map(asset => asset.id)) : []
      if (records.some((asset, index) => !asset || asset.projectId !== id || discarded.has(asset.id) || asset.kind !== linked[index].kind)) {
        throw new Error('A DirectorPlan asset is missing from this project or has an incompatible kind.')
      }
    }
    if (discarded.size) {
      await assets.bulkDelete([...discarded])
      await db.settings.delete(audioUndoKey(id))
    }
    if (audioImports.length) group = undefined
    const past = group && group === state.group ? state.past : [...state.past, editState(project, audioImports)].slice(-limit)
    await history.put({ id, past, future: [], group })
    await projects.put({ ...next, id, updated: Date.now() })
  })
}

export function restoreEdit(id: string, direction: 'undo' | 'redo') {
  return db.transaction('rw', projects, history, db.settings, async () => {
    const project = await requireProject(id)
    const state = await history.get(id)
    if (!state) return
    const source = direction === 'undo' ? state.past : state.future
    const target = source.at(-1)
    if (!target) return
    const { audioImports } = target
    const opposite = editState(project, audioImports)
    const past = direction === 'undo' ? source.slice(0, -1) : [...state.past, opposite].slice(-limit)
    const future = direction === 'redo' ? source.slice(0, -1) : [...state.future, opposite].slice(-limit)
    if (audioImports?.length) {
      const hidden = undoneAudio(future)
      if (hidden.size) await db.settings.put({ id: audioUndoKey(id), undoneAudioIds: [...hidden] })
      else await db.settings.delete(audioUndoKey(id))
    }
    await projects.put({ ...applyEditState(project, target), updated: Date.now() })
    await history.put({ id, past, future })
  })
}

export function copyProject(id: string) {
  return db.transaction('rw', projects, assets, db.settings, async () => {
    const original = await requireProject(id)
    const copies = (await readAssets(id)).map(asset => ({ asset, id: crypto.randomUUID() }))
    const ids = new Map(copies.map(({ asset, id }) => [asset.id, id]))
    const project = duplicateProject(original, ids)
    if (project.coverAssetId) project.coverAssetId = ids.get(project.coverAssetId)
    project.shots = project.shots.map(shot => ({
      ...shot, assetId: shot.assetId ? ids.get(shot.assetId) : undefined,
      posterId: shot.posterId ? ids.get(shot.posterId) : undefined,
    }))
    if (copies.length) await assets.bulkAdd(copies.map(({ asset, id }) => ({ ...asset, id, projectId: project.id })))
    const metadata = await db.settings.get(archiveKey(id))
    if (metadata) await db.settings.add({ ...metadata, id: archiveKey(project.id) })
    await projects.add(project)
    return project.id
  })
}

export function deleteProject(id: string) {
  return db.transaction('rw', projects, history, assets, db.settings, async () => {
    await assets.where('projectId').equals(id).delete()
    await history.delete(id)
    await db.settings.bulkDelete([archiveKey(id), audioUndoKey(id)])
    await projects.delete(id)
  })
}


export function readProject(id: string): Promise<ProjectSnapshot> {
  return db.transaction('r', projects, assets, db.settings, async () => ({
    project: await requireProject(id),
    items: await readAssets(id),
    archiveMetadata: (await db.settings.get(archiveKey(id)))?.archiveMetadata,
  }))
}

export function importProject(project: Project, items: Asset[], archiveMetadata?: ArchiveMetadata) {
  return db.transaction('rw', projects, assets, db.settings, async () => {
    await projects.add(project)
    if (items.length) await assets.bulkAdd(items)
    if (archiveMetadata) await db.settings.add({ id: archiveKey(project.id), archiveMetadata })
  })
}

