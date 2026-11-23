import { projectManifest, readProjectZIP, writeProjectZIP } from './core/project-archive'
import { importProject } from './db'
import { prepareAsset } from './media'
import { media, type Asset, type Project } from './model'

export function projectJSON(project: Project, items: Asset[]) {
  return new Blob([JSON.stringify(projectManifest(project, items), null, 2)], { type: 'application/json;charset=utf-8' })
}

export function projectZIP(project: Project, items: Asset[]) {
  return writeProjectZIP(project, items, async path => {
    const response = await fetch(path)
    if (!response.ok) throw new Error('无法读取项目内的示例照片')
    return response.blob()
  })
}

export async function restoreZIP(file: File) {
  const data = await readProjectZIP(file)
  const projectId = crypto.randomUUID()
  const restored = new Map<string, string>()
  const items: Asset[] = data.items.map(item => {
    const id = crypto.randomUUID()
    restored.set(item.id, id)
    return { ...item, id, projectId }
  })
  for (const [path, bytes] of data.photos) {
    const title = media.find(item => item.path === path)?.title ?? '示例照片'
    const file = new File([bytes], title + '.jpg', { type: 'image/jpeg' })
    const item = await prepareAsset(file, projectId)
    restored.set(path, item.id)
    items.push(item)
  }
  const coverAssetId = restored.get(data.project.coverAssetId ?? data.project.cover ?? '')
  const project: Project = {
    ...data.project, id: projectId, updated: Date.now(), archived: false, demo: false,
    title: data.project.title.slice(0, 110) + ' 恢复',
    coverAssetId, cover: coverAssetId ? undefined : data.project.cover,
    shots: data.project.shots.map(shot => ({
      ...shot, assetId: shot.assetId ? restored.get(shot.assetId) : restored.get(shot.media ?? ''),
      posterId: shot.posterId ? restored.get(shot.posterId) : undefined,
      media: restored.has(shot.media ?? '') ? undefined : shot.media,
    })),
  }
  await importProject(project, items)
  return project.id
}
