import { archiveMetadata, projectManifest, readProjectZIP, writeProjectZIP } from './core/project-archive'
import { importProject } from './db'
import { prepareAsset } from './media'
import { media, type Asset, type Project } from './model'
import type { ArchiveMetadata } from './project-snapshot'
import { regenerateTimelineIds } from './video-model'

export function projectJSON(project: Project, items: Asset[], metadata?: ArchiveMetadata) {
  return new Blob([JSON.stringify(projectManifest(project, items, metadata), null, 2)], { type: 'application/json;charset=utf-8' })
}

export function projectZIP(project: Project, items: Asset[], metadata?: ArchiveMetadata) {
  return writeProjectZIP(project, items, async path => {
    const response = await fetch(path)
    if (!response.ok) throw new Error('无法读取项目内的示例照片')
    return response.blob()
  }, metadata)
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
  const photos = new Map<string, string>()
  for (const [path, bytes] of data.photos) {
    const title = media.find(item => item.path === path)?.title ?? '示例照片'
    const file = new File([bytes], title + '.jpg', { type: 'image/jpeg' })
    const item = await prepareAsset(file, projectId)
    photos.set(path, item.id)
    items.push(item)
  }
  const coverAssetId = data.project.coverAssetId ? restored.get(data.project.coverAssetId) : photos.get(data.project.cover ?? '')
  const project: Project = {
    ...data.project, id: projectId, updated: Date.now(), archived: false, demo: false,
    title: data.project.title.slice(0, 110) + ' 恢复',
    coverAssetId, cover: coverAssetId ? undefined : data.project.cover,
    shots: data.project.shots.map(shot => ({
      ...shot, assetId: shot.assetId ? restored.get(shot.assetId) : photos.get(shot.media ?? ''),
      posterId: shot.posterId ? restored.get(shot.posterId) : undefined,
      media: photos.has(shot.media ?? '') ? undefined : shot.media,
    })),
    ...(data.project.video && { video: regenerateTimelineIds(data.project.video, restored) }),
  }
  await importProject(project, items, data.manifest && archiveMetadata(data.manifest))
  return project.id
}
