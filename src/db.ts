import Dexie, { type EntityTable } from 'dexie'
import type { ProjectSnapshot } from './project-snapshot'
import { demoProject, duplicateProject, type Asset, type Project } from './model'

type EditState = Pick<Project, 'frame' | 'scenes' | 'shots'>
type History = { id: string; past: EditState[]; future: EditState[]; group?: string }

const db = new Dexie('frameos-studio') as Dexie & {
  projects: EntityTable<Project, 'id'>
  settings: EntityTable<{ id: string }, 'id'>
  assets: EntityTable<Asset, 'id'>
  history: EntityTable<History, 'id'>
}
db.version(1).stores({ projects: 'id, updated', settings: 'id' })
db.version(2).stores({ assets: 'id, projectId', history: 'id' })

export const { projects, assets, history } = db
const limit = 40

function editState({ frame, scenes, shots }: Project): EditState {
  return { frame, scenes, shots }
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
  return db.transaction('rw', projects, history, assets, async () => {
    const project = await requireProject(id)
    const next = apply(project)
    if (next === project && !imported.length) return
    if (imported.length) await assets.bulkAdd(imported)
    if (next === project) return
    const state = await history.get(id) ?? { id, past: [], future: [] }
    const past = group && group === state.group ? state.past : [...state.past, editState(project)].slice(-limit)
    await history.put({ id, past, future: [], group })
    await projects.put({ ...next, id, updated: Date.now() })
  })
}

export function restoreEdit(id: string, direction: 'undo' | 'redo') {
  return db.transaction('rw', projects, history, async () => {
    const project = await requireProject(id)
    const state = await history.get(id)
    if (!state) return
    const source = direction === 'undo' ? state.past : state.future
    const target = source.at(-1)
    if (!target) return
    const past = direction === 'undo' ? source.slice(0, -1) : [...state.past, editState(project)].slice(-limit)
    const future = direction === 'redo' ? source.slice(0, -1) : [...state.future, editState(project)].slice(-limit)
    await projects.put({ ...project, ...target, updated: Date.now() })
    await history.put({ id, past, future })
  })
}

export function copyProject(id: string) {
  return db.transaction('rw', projects, assets, async () => {
    const project = duplicateProject(await requireProject(id))
    const copies = (await assets.where('projectId').equals(id).toArray()).map(asset => ({
      ...asset, id: crypto.randomUUID(), projectId: project.id, previous: asset.id,
    }))
    const ids = new Map(copies.map(asset => [asset.previous, asset.id]))
    if (project.coverAssetId) project.coverAssetId = ids.get(project.coverAssetId)
    project.shots = project.shots.map(shot => ({
      ...shot, assetId: shot.assetId ? ids.get(shot.assetId) : undefined,
      posterId: shot.posterId ? ids.get(shot.posterId) : undefined,
    }))
    if (copies.length) await assets.bulkAdd(copies.map(({ previous: _previous, ...asset }) => asset))
    await projects.add(project)
    return project.id
  })
}

export function deleteProject(id: string) {
  return db.transaction('rw', projects, history, assets, async () => {
    await assets.where('projectId').equals(id).delete()
    await history.delete(id)
    await projects.delete(id)
  })
}


export function readProject(id: string): Promise<ProjectSnapshot> {
  return db.transaction('r', projects, assets, async () => ({
    project: await requireProject(id),
    items: await assets.where('projectId').equals(id).toArray(),
  }))
}

export function importProject(project: Project, items: Asset[]) {
  return db.transaction('rw', projects, assets, async () => {
    await projects.add(project)
    if (items.length) await assets.bulkAdd(items)
  })
}

