import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { assets } from './db'
import type { Asset } from './model'

const fileType: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp4: 'video/mp4', webm: 'video/webm',
}
export const allowedFiles = '.jpg,.jpeg,.png,.webp,.mp4,.webm'
const pictureLimit = 25 * 1024 * 1024
const videoLimit = 120 * 1024 * 1024

export const demoVideos = [
  { path: '/demo-media/waves.mp4', poster: '/demo-media/waves.jpg', name: '海岸浪涌', author: 'EJ Merl',
    source: 'https://www.pexels.com/video/stunning-aerial-view-of-oregon-coast-waves-31069202/' },
  { path: '/demo-media/coastal-mist.mp4', poster: '/demo-media/coastal-mist.jpg', name: '雾中的海岸', author: 'Chris',
    source: 'https://www.pexels.com/video/serene-oregon-coastline-with-foggy-rocks-31664993/' },
]

export function useAssets(projectId: string) {
  const [items, setItems] = useState<Asset[]>([])
  const [error, setError] = useState(false)
  useEffect(() => {
    const subscription = liveQuery(() => assets.where('projectId').equals(projectId).toArray()).subscribe({
      next: records => { setItems(records.sort((a, b) => b.created - a.created)); setError(false) },
      error: () => setError(true),
    })
    return () => subscription.unsubscribe()
  }, [projectId])
  return { items, error }
}

export function useBlobURL(blob?: Blob) {
  const [resource, setResource] = useState<{ blob: Blob; url: string }>()
  useEffect(() => {
    if (!blob) {
      setResource(undefined)
      return
    }
    const url = URL.createObjectURL(blob)
    setResource({ blob, url })
    return () => URL.revokeObjectURL(url)
  }, [blob])
  return resource?.blob === blob ? resource?.url : undefined
}

function imageBlob(source: CanvasImageSource, width: number, height: number, maxEdge: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('无法读取画面'))
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('无法保存画面')), 'image/webp', 0.88,
  ))
}

function waitForVideo(video: HTMLVideoElement, event: string, start: () => void) {
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: string) => {
      clearTimeout(timer)
      video.removeEventListener(event, onReady)
      video.removeEventListener('error', onError)
      if (error) reject(new Error(error))
      else resolve()
    }
    const onReady = () => finish()
    const onError = () => finish('浏览器无法解码该视频')
    const timer = window.setTimeout(() => finish('视频读取超时'), 12000)
    video.addEventListener(event, onReady, { once: true })
    video.addEventListener('error', onError, { once: true })
    try { start() } catch { finish('无法定位视频画面') }
  })
}

async function usingVideo<T>(blob: Blob, read: (video: HTMLVideoElement) => Promise<T>) {
  const url = URL.createObjectURL(blob)
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  try {
    await waitForVideo(video, 'loadeddata', () => { video.src = url })
    if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error('视频需要可读取的画面和有效时长')
    }
    return await read(video)
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

export async function prepareAsset(file: File, projectId: string, source?: string): Promise<Asset> {
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? ''
  const type = fileType[extension]
  if (!type || !file.size) throw new Error('请选择有效的 JPG、PNG、WebP、MP4 或 WebM 文件')
  const kind = type.startsWith('video/') ? 'video' : 'image'
  if (file.size > (kind === 'video' ? videoLimit : pictureLimit)) {
    throw new Error(kind === 'video' ? '视频不能超过 120 MB' : '图片不能超过 25 MB')
  }
  const blob = file.slice(0, file.size, type)
  const base = { id: crypto.randomUUID(), projectId, name: file.name, kind, blob, source, created: Date.now() } as const
  if (kind === 'video') return usingVideo(blob, async video => ({
    ...base, width: video.videoWidth, height: video.videoHeight, duration: video.duration,
    thumbnail: await imageBlob(video, video.videoWidth, video.videoHeight, 480),
  }))

  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode().catch(() => { throw new Error('无法解码该图片') })
    const width = image.naturalWidth
    const height = image.naturalHeight
    if (!width || !height || width * height > 60_000_000) throw new Error('图片尺寸无效或超过 6000 万像素')
    return { ...base, width, height, thumbnail: await imageBlob(image, width, height, 480) }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function extractFrame(asset: Asset, time: number): Promise<Asset> {
  return usingVideo(asset.blob, async video => {
    const frameTime = Math.max(0, Math.min(time, video.duration - 0.05))
    if (frameTime > 0.001) await waitForVideo(video, 'seeked', () => { video.currentTime = frameTime })
    const blob = await imageBlob(video, video.videoWidth, video.videoHeight, 1920)
    const thumbnail = await imageBlob(video, video.videoWidth, video.videoHeight, 480)
    const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight))
    return {
      id: crypto.randomUUID(), projectId: asset.projectId, kind: 'image', blob, thumbnail,
      width: Math.max(1, Math.round(video.videoWidth * scale)),
      height: Math.max(1, Math.round(video.videoHeight * scale)),
      name: asset.name.replace(/\.[^.]+$/, '') + ' · ' + frameTime.toFixed(2) + ' 秒帧.webp',
      source: asset.source, created: Date.now(),
    }
  })
}

