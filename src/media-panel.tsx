import { AnimatePresence, motion } from 'motion/react'
import { AudioLines, Film, Image, Upload } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { allowedFiles, demoVideos, extractFrame, prepareAsset, prepareDemoVideo, releaseMedia, useBlobURL } from './media'
import { audioFormats, isAudioFormat } from './core/audio-format'
import { media, type Asset, type Shot } from './model'
import { enter, leave, Modal, timing, visible } from './ui'

type Demo = typeof demoVideos[number]
type Selection = { asset: Asset } | { sample: Demo }

function audioDetails(asset: Extract<Asset, { kind: 'audio' }>) {
  const type = asset.blob.type
  return [isAudioFormat(type) ? audioFormats[type].label : 'Audio',
    asset.duration.toFixed(2) + ' s', asset.blob.size.toLocaleString('en') + ' bytes'].join(' · ')
}

function Tile({ asset, onClick }: { asset: Asset; onClick: () => void }) {
  const thumbnail = useBlobURL(asset.thumbnail)
  const audio = asset.kind === 'audio'
  return <button type="button" className={'asset-tile' + (audio ? ' audio-tile' : '')} onClick={onClick}
    aria-label={(audio ? 'Preview ' : '预览 ') + asset.name}>
    {thumbnail && <img src={thumbnail} alt="" />}
    <span className="asset-tag">{audio ? <><AudioLines size={14} /> Audio</> :
      asset.kind === 'video' ? <><Film size={14} /> 视频</> : <><Image size={14} /> 图片</>}</span>
    <strong title={asset.name}>{asset.name}</strong>
    <small>{audio ? audioDetails(asset) :
      asset.width + ' × ' + asset.height + (asset.duration ? ' · ' + asset.duration.toFixed(1) + ' 秒' : '')}</small>
  </button>
}

function AssetGrid({ items, onPreview, empty }: { items: Asset[]; onPreview: (asset: Asset) => void; empty: string }) {
  return <div className="asset-grid">
    <AnimatePresence initial={false} mode="popLayout">
      {items.map(item => <motion.div layout key={item.id} initial={enter} animate={visible} exit={leave} transition={timing}>
        <Tile asset={item} onClick={() => onPreview(item)} />
      </motion.div>)}
    </AnimatePresence>
    {!items.length && <motion.div className="media-empty" initial={enter} animate={visible} exit={leave}>
      <Image size={23} /><p>{empty}</p>
    </motion.div>}
  </div>
}

export function ShotThumb({ source, thumbnail }: { source?: string; thumbnail?: Blob }) {
  const url = useBlobURL(thumbnail) ?? source
  return url ? <img src={url} alt="" draggable={false} /> : <Image size={19} />
}

export function MediaPanel({ projectId, items, failed, shot, onSave, onAttach, onDemo, onFrame }: {
  projectId: string
  items: Asset[]
  failed: boolean
  shot?: Shot
  onSave: (imported: Asset[]) => Promise<boolean>
  onAttach: (asset: Asset) => Promise<boolean>
  onDemo: (path: string) => Promise<boolean>
  onFrame: (video: Asset, frame: Asset) => Promise<boolean>
}) {
  const input = useRef<HTMLInputElement>(null)
  const [task, setTask] = useState(false)
  const [notice, setNotice] = useState<{ message: string; error?: boolean }>()
  const [preview, setPreview] = useState<Selection>()
  const [previewError, setPreviewError] = useState(false)
  const [canCapture, setCanCapture] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const audio = useRef<HTMLAudioElement>(null)

  const asset = preview && 'asset' in preview ? preview.asset : undefined
  const sample = preview && 'sample' in preview ? preview.sample : undefined
  const source = useBlobURL(asset?.blob) ?? sample?.path
  const audioThumbnail = useBlobURL(asset?.kind === 'audio' ? asset.thumbnail : undefined)

  useLayoutEffect(() => {
    const element = audio.current
    if (element) return () => releaseMedia(element)
  }, [source])

  function open(selection: Selection) {
    setPreviewError(false)
    setCanCapture(false)
    setPreview(selection)
  }

  async function importFiles(files: File[]) {
    if (!files.length) return
    setTask(true)
    setNotice(undefined)
    const imported: Asset[] = []
    const errors: string[] = []
    for (const file of files) {
      try {
        imported.push(await prepareAsset(file, projectId))
      } catch (error) {
        const reason = error instanceof Error ? error.message : '读取失败'
        errors.push(file.name + ' · ' + reason)
      }
    }
    if (imported.length && !await onSave(imported)) errors.push('写入浏览器存储失败')
    setNotice({ message: errors.length ? errors.join('；') : '已导入 ' + imported.length + ' 个素材', error: !!errors.length })
    setTask(false)
  }

  async function importSample(sample: Demo) {
    const existing = items.find(item => item.kind === 'video' && item.source === sample.source)
    if (existing) {
      open({ asset: existing })
      return
    }
    setTask(true)
    try {
      const entry = await prepareDemoVideo(sample, projectId)
      if (!await onSave([entry])) throw new Error('写入浏览器存储失败')
      setNotice({ message: '已导入示例视频' })
      open({ asset: entry })
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : '示例视频读取失败', error: true })
    } finally {
      setTask(false)
    }
  }

  async function saveFrame() {
    if (!asset || !video.current || video.current.readyState < 2) return
    setTask(true)
    try {
      video.current.pause()
      const frame = await extractFrame(asset, video.current.currentTime)
      if (!await onFrame(asset, frame)) throw new Error('写入浏览器存储失败')
      setNotice({ message: shot?.assetId === asset.id ? '关键帧已保存为分镜画面' : '关键帧已保存到素材库' })
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : '关键帧提取失败', error: true })
    } finally {
      setTask(false)
    }
  }

  const renderingVideo = asset?.kind === 'video' || !!sample
  const visual = items.filter(item => item.kind !== 'audio')
  const sounds = items.filter(item => item.kind === 'audio')
  return <section className="document-panel media-panel">
    <div className="section-heading">
      <div><h2>素材库</h2><p>图片、视频与分镜关键帧</p></div>
      <button type="button" className="button primary" disabled={task} onClick={() => input.current?.click()}><Upload size={16} /> 上传素材</button>
      <input ref={input} className="visually-hidden" tabIndex={-1} type="file" multiple accept={allowedFiles} aria-label="上传素材文件"
        onChange={event => { void importFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} />
    </div>
    <AnimatePresence mode="wait">
      {(task || notice || failed) && <motion.p key={task ? 'loading' : notice?.message ?? 'error'}
        initial={enter} animate={visible} exit={leave} transition={timing} role={notice?.error || failed ? 'alert' : 'status'}
        className={'asset-message ' + (notice?.error || failed ? 'asset-error' : '')}>
        {task ? '正在处理素材' : failed ? '无法读取项目素材' : notice?.message}
      </motion.p>}
    </AnimatePresence>
    <div className="asset-group"><h3>项目素材 <span>{visual.length}</span></h3>
      <AssetGrid items={visual} onPreview={asset => open({ asset })} empty="上传 JPG、PNG、WebP、MP4 或 WebM" />
    </div>
    <div className="asset-group"><h3><AudioLines size={16} /> Audio <span>{sounds.length}</span></h3>
      <AssetGrid items={sounds} onPreview={asset => open({ asset })} empty="Upload WAV, MP3, or M4A (up to 60 MiB)." />
    </div>
    <div className="asset-group"><h3>示例素材</h3><div className="asset-grid">
      {demoVideos.map(demo => <button key={demo.path} className="asset-tile" type="button" aria-label={'预览示例 ' + demo.name}
        onClick={() => open({ sample: demo })}>
        <img src={demo.poster} alt="" /><span className="asset-tag"><Film size={14} /> 视频</span><strong>{demo.name}</strong><small>{demo.author} · Pexels</small>
      </button>)}
      {media.map(demo => <button key={demo.path} className="asset-tile" type="button" disabled={!shot}
        aria-label={'将示例图片用于镜头 ' + demo.title} onClick={async () => {
          if (await onDemo(demo.path)) setNotice({ message: '示例图片已用于当前镜头' })
        }}>
        <img src={demo.path} alt="" /><span className="asset-tag"><Image size={14} /> 图片</span><strong>{demo.title}</strong><small>{demo.author} · 用于当前镜头</small>
      </button>)}
    </div></div>
    <Modal open={!!preview} onClose={() => {
      audio.current?.pause()
      setPreview(undefined)
    }} title={asset?.name ?? sample?.name ?? '素材预览'}
      description={asset?.kind === 'audio' ? audioDetails(asset) :
        asset ? asset.width + ' × ' + asset.height : sample ? sample.author + ' · Pexels' : '图片和视频'} className="media-dialog">
      {source && (renderingVideo
        ? <video key={source} ref={video} className="media-preview" aria-label="素材视频" src={source}
            controls playsInline preload="auto" onLoadedData={() => setCanCapture(true)} onSeeking={() => setCanCapture(false)} onSeeked={() => setCanCapture(true)} onError={() => setPreviewError(true)} />
        : asset?.kind === 'audio' ? <>
          {audioThumbnail && <img className="media-preview" src={audioThumbnail} alt="Waveform placeholder" />}
          <audio key={source} ref={audio} className="audio-controls" aria-label="Audio preview" src={source}
            controls preload="metadata" onError={() => setPreviewError(true)} />
        </>
        : <img className="media-preview" src={source} alt={asset?.name ?? ''} onError={() => setPreviewError(true)} />)}
      {previewError && <p className="asset-message asset-error" role="alert">
        {asset?.kind === 'audio' ? 'This browser could not play the audio codec.' : '浏览器无法播放该素材'}
      </p>}
      {task && <p className="preview-message" role="status">正在处理素材</p>}
      {notice && !sample && !task && <p className={'preview-message ' + (notice.error ? 'asset-error' : '')} role={notice.error ? 'alert' : 'status'}>{notice.message}</p>}
      <div className="modal-actions">
        {(sample || asset?.source) && <a className="button secondary" href={sample?.source ?? asset?.source} target="_blank" rel="noreferrer">素材来源</a>}
        {sample && <button type="button" className="button primary" disabled={task || previewError}
          onClick={() => { void importSample(sample) }}>导入示例视频</button>}
        {asset?.kind === 'video' && <button type="button" className="button secondary" disabled={task || previewError || !source || !canCapture}
          onClick={() => { void saveFrame() }}>提取关键帧</button>}
        {asset && asset.kind !== 'audio' && <button type="button" className="button primary" disabled={!shot || task || previewError} onClick={async () => {
          if (await onAttach(asset)) setPreview(undefined)
        }}>用于当前镜头</button>}
      </div>
    </Modal>
  </section>
}


