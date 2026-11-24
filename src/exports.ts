import { readProject } from './db'
import { productName } from '../release.json'

export type ExportKind = 'png' | 'pdf' | 'json' | 'zip' | 'video'

function download(blob: Blob, title: string, extension: string) {
  const name = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().slice(0, 120) || productName
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name + '.' + extension
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export async function exportProject(id: string, kind: ExportKind, shotId?: string) {
  const { project, items, archiveMetadata } = await readProject(id)
  if (kind === 'zip' || kind === 'json') {
    const { projectZIP, projectJSON } = await import('./backup')
    const blob = kind === 'zip' ? await projectZIP(project, items, archiveMetadata) : projectJSON(project, items, archiveMetadata)
    download(blob, project.title, kind)
    return
  }
  const assets = new Map(items.map(item => [item.id, item]))
  if (kind === 'pdf') {
    const [{ storyboardPDF }, { renderShot }] = await Promise.all([import('./storyboard-pdf'), import('./export-shot')])
    const pdf = await storyboardPDF(project, (shot, longEdge) => renderShot(shot, project.frame, assets, longEdge))
    download(pdf, project.title + ' 分镜表', kind)
    return
  }
  const shot = project.shots.find(shot => shot.id === shotId)
  if (!shot) throw new Error('请选择要导出的镜头')
  if (kind === 'video') {
    const clip = assets.get(shot.assetId ?? '')
    if (clip?.kind !== 'video') throw new Error('当前镜头没有关联视频')
    download(clip.blob, project.title + ' ' + shot.title, clip.blob.type === 'video/webm' ? 'webm' : 'mp4')
    return
  }
  const { renderShot, canvasBlob } = await import('./export-shot')
  download(await canvasBlob(await renderShot(shot, project.frame, assets)), project.title + ' ' + shot.title, kind)
}


