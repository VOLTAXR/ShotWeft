import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { audioExtension, audioFormats, validateAudioSignature } from './core/audio-format'
import { readAssets } from './db'
import type { Asset } from './model'

const fileType: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp4: 'video/mp4', webm: 'video/webm',
}
const audioTypes = Object.entries(audioFormats).map(([type, format]) => ({ type: type as keyof typeof audioFormats, ...format }))
export const allowedFiles = ['.jpg,.jpeg,.png,.webp,.mp4,.webm', ...audioTypes.map(format => '.' + format.extension)].join(',')
const pictureLimit = 25 * 1024 * 1024
const videoLimit = 120 * 1024 * 1024

export const demoVideos = [
  { path: '/demo-media/waves.mp4', poster: '/demo-media/waves.jpg', name: '海岸浪涌', englishName: 'Coastal Waves', author: 'EJ Merl',
    source: 'https://www.pexels.com/video/stunning-aerial-view-of-oregon-coast-waves-31069202/' },
  { path: '/demo-media/coastal-mist.mp4', poster: '/demo-media/coastal-mist.jpg', name: '雾中的海岸', englishName: 'Coastal Mist', author: 'Chris',
    source: 'https://www.pexels.com/video/serene-oregon-coastline-with-foggy-rocks-31664993/' },
]

export async function prepareDemoVideo(demo: typeof demoVideos[number], projectId: string, name = demo.name) {
  const response = await fetch(demo.path)
  if (!response.ok) throw new Error('示例视频读取失败')
  const file = new File([await response.blob()], name + '.mp4', { type: 'video/mp4' })
  return prepareAsset(file, projectId, demo.source)
}

export function useAssets(projectId: string) {
  const [items, setItems] = useState<Asset[]>([])
  const [error, setError] = useState(false)
  useEffect(() => {
    const subscription = liveQuery(() => readAssets(projectId)).subscribe({
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

export function measuredMediaFrames(seconds: number | undefined, { numerator, denominator }: { numerator: number; denominator: number }) {
  if (seconds === undefined || !Number.isFinite(seconds)) return undefined
  return Math.floor(seconds * numerator / denominator)
}

export function releaseMedia(element: HTMLMediaElement) {
  element.pause()
  element.removeAttribute('src')
  element.load()
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

async function audioDuration(blob: Blob) {
  const audio = document.createElement('audio')
  if (!audio.canPlayType(blob.type)) throw new Error('This browser does not support the audio format.')
  const url = URL.createObjectURL(blob)
  audio.preload = 'auto'
  try {
    // loadeddata confirms the browser can decode audio beyond the container metadata.
    await new Promise<void>((resolve, reject) => {
      const finish = (message?: string) => {
        clearTimeout(timer)
        audio.removeEventListener('loadeddata', ready)
        audio.removeEventListener('error', failed)
        if (message) reject(new Error(message))
        else resolve()
      }
      const ready = () => finish()
      const failed = () => finish('This browser could not decode the audio. The file may be corrupt or use an unsupported codec.')
      const timer = window.setTimeout(() => finish('Audio metadata could not be read in time.'), 12000)
      audio.addEventListener('loadeddata', ready)
      audio.addEventListener('error', failed)
      audio.src = url
    })
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) throw new Error('Audio requires a finite, positive duration.')
    return audio.duration
  } finally {
    releaseMedia(audio)
    URL.revokeObjectURL(url)
  }
}

function audioThumbnail() {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 144
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('Could not create the audio placeholder.'))
  context.fillStyle = '#17243d'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#9cbbff'
  const bars = [12, 28, 20, 43, 60, 33, 49, 75, 92, 51, 33, 66, 83, 55, 32, 57, 34, 23, 39, 15]
  bars.forEach((height, index) => context.fillRect(41 + index * 12, (144 - height) / 2, 6, height))
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('Could not save the audio placeholder.')), 'image/png',
  ))
}

export async function prepareAsset(file: File, projectId: string, source?: string): Promise<Asset> {
  const extension = audioExtension(file.name) ?? ''
  const audio = audioTypes.find(format => format.extension === extension)
  const base = { id: crypto.randomUUID(), projectId, name: file.name, source, created: Date.now() }
  if (audio) {
    if (file.type !== audio.type && !audio.aliases.some(alias => alias === file.type)) {
      throw new Error('The MIME type does not match the ' + audio.label + ' extension.')
    }
    await validateAudioSignature(file, audio.type)
    const blob = file.slice(0, file.size, audio.type)
    const duration = await audioDuration(blob)
    return { ...base, kind: 'audio', blob, duration, thumbnail: await audioThumbnail() }
  }
  const type = fileType[extension]
  if (!type && file.type.startsWith('audio/')) throw new Error('Choose a WAV, MP3, or M4A audio file.')
  if (!type || !file.size) throw new Error('请选择有效的 JPG、PNG、WebP、MP4 或 WebM 文件')
  const kind = type.startsWith('video/') ? 'video' : 'image'
  if (file.size > (kind === 'video' ? videoLimit : pictureLimit)) {
    throw new Error(kind === 'video' ? '视频不能超过 120 MB' : '图片不能超过 25 MB')
  }
  const blob = file.slice(0, file.size, type)
  if (kind === 'video') return usingVideo(blob, async video => ({
    ...base, kind, blob, width: video.videoWidth, height: video.videoHeight, duration: video.duration,
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
    return { ...base, kind, blob, width, height, thumbnail: await imageBlob(image, width, height, 480) }
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

