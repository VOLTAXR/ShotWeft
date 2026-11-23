import { useEffect, useRef, useState } from 'react'
import { Image as KonvaImage, Layer, Line, Rect, Stage } from 'react-konva'
import { ImageOff } from 'lucide-react'
import type { Annotation, CanvasTool } from './annotation-model'
import { CanvasAnnotations, useCanvasTools } from './canvas-annotations'
import { coverCrop } from './canvas-geometry'
import { defaultCrop, ratio, type Crop, type Frame } from './model'

const fit = (value: number) => Math.max(0, Math.min(1, value))

export function Monitor({ frame, source, grid, safe, center, zoom, crop = defaultCrop, onCrop, video, annotations, tool = 'crop', selected, onSelect, onCreate, onAnnotation }: {
  frame: Frame
  source?: string
  grid: boolean
  safe: boolean
  center: boolean
  zoom: number
  crop?: Crop
  onCrop?: (crop: Crop, commit: boolean) => void
  annotations: Annotation[]
  tool?: CanvasTool
  selected?: string
  onSelect?: (id?: string) => void
  onCreate?: (item: Annotation) => void
  onAnnotation?: (id: string, patch: Partial<Annotation>) => void
  video?: { source: string; time: number; playing: boolean; key: string }
}) {
  const host = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; crop: Crop } | undefined>(undefined)
  const [loaded, setLoaded] = useState<{ image: HTMLImageElement; source: string }>()
  const [failed, setFailed] = useState<string>()
  const [size, setSize] = useState({ width: 1, height: 1 })

  useEffect(() => {
    if (!source) return
    const image = new Image()
    image.onload = () => setLoaded({ image, source })
    image.onerror = () => setFailed(source)
    image.src = source
    return () => { image.onload = null; image.onerror = null }
  }, [source])

  useEffect(() => {
    if (!host.current) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])

  const aspect = ratio(frame)
  const width = Math.max(1, Math.floor(Math.min(size.width, size.height * aspect) * zoom))
  const height = Math.max(1, Math.floor(width / aspect))
  const image = loaded?.source === source ? loaded?.image : undefined
  const geometry = image ? coverCrop(image, width, height, crop) : undefined
  const { scale, availableX, availableY } = geometry ?? { scale: 1, availableX: 0, availableY: 0 }
  const { draft, events } = useCanvasTools({ width, height, tool, onSelect, onCreate })

  function shift(x: number, y: number, origin: Crop) {
    return {
      ...origin,
      x: availableX ? fit(origin.x - x / Math.max(1, availableX * scale)) : origin.x,
      y: availableY ? fit(origin.y - y / Math.max(1, availableY * scale)) : origin.y,
    }
  }

  return <div className="monitor-space">
    <div ref={host} className="monitor-fit">
      <div className="monitor-frame" data-tool={tool} style={{ width, height }}>
        <div role="img" aria-label={'分镜画布 ' + frame}>
          <Stage width={width} height={height} {...events}>
            <Layer listening={false}>
              <Rect width={width} height={height} fill="#171b21" />
              {image && <KonvaImage image={image} width={width} height={height}
                crop={geometry?.bounds} />}
              {grid && [1 / 3, 2 / 3].map(position => <Line key={position}
                points={[position * width, 0, position * width, height]} stroke="rgba(255,255,255,.36)" strokeWidth={1} />)}
              {grid && [1 / 3, 2 / 3].map(position => <Line key={position}
                points={[0, position * height, width, position * height]} stroke="rgba(255,255,255,.36)" strokeWidth={1} />)}
              {safe && <Rect x={width * 0.08} y={height * 0.08} width={width * 0.84}
                height={height * 0.84} stroke="#e0eaff" strokeWidth={1} dash={[6, 5]} />}
              {center && <Line points={[width / 2 - 14, height / 2, width / 2 + 14, height / 2]} stroke="#fff" strokeWidth={1} />}
              {center && <Line points={[width / 2, height / 2 - 14, width / 2, height / 2 + 14]} stroke="#fff" strokeWidth={1} />}
            </Layer>
            <CanvasAnnotations items={annotations} draft={draft} width={width} height={height} selected={selected}
              editable={tool === 'select' && !!onSelect} aboveVideo={!!video} onSelect={onSelect} onEdit={onAnnotation} />
          </Stage>
        </div>
        {video && <PreviewVideo key={video.key} source={video.source} time={video.time} playing={video.playing} crop={crop} />}
        {!video && !image && <div className="image-empty"><ImageOff size={24} /><span>{failed === source && source ? '照片加载失败' : source ? '正在加载照片' : '此镜头暂无画面'}</span></div>}
        {tool === 'crop' && onCrop && image && !video && <div className="crop-surface" tabIndex={0} role="group"
          aria-label="画布裁切区域，支持拖动和方向键"
          onPointerDown={event => {
            if (event.button !== 0) return
            drag.current = { x: event.clientX, y: event.clientY, crop }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={event => {
            const start = drag.current
            if (start) onCrop(shift(event.clientX - start.x, event.clientY - start.y, start.crop), false)
          }}
          onPointerUp={event => {
            const start = drag.current
            drag.current = undefined
            if (start) onCrop(shift(event.clientX - start.x, event.clientY - start.y, start.crop), true)
          }}
          onPointerCancel={() => {
            if (drag.current) onCrop(drag.current.crop, false)
            drag.current = undefined
          }}
          onKeyDown={event => {
            let x = 0
            let y = 0
            if (event.key === 'ArrowLeft') x = -8
            else if (event.key === 'ArrowRight') x = 8
            else if (event.key === 'ArrowUp') y = -8
            else if (event.key === 'ArrowDown') y = 8
            else return
            event.preventDefault()
            onCrop(shift(x, y, crop), true)
          }} />}
      </div>
    </div>
  </div>
}

function PreviewVideo({ source, time, playing, crop }: { source: string; time: number; playing: boolean; crop: Crop }) {
  const player = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState(false)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const video = player.current
    if (!video || !ready) return
    const target = Math.min(time, Math.max(0, video.duration - 0.04))
    if (Math.abs(video.currentTime - target) > (playing ? 0.28 : 0.04)) video.currentTime = target
    if (playing && time < video.duration && video.paused) void video.play().catch(() => setError(true))
    if ((!playing || time >= video.duration) && !video.paused) video.pause()
  }, [time, playing, ready])

  return <>
    <video ref={player} src={source} muted playsInline preload="auto" aria-label="时间轴视频"
      className="sequence-video" style={{ objectPosition: (crop.x * 100) + '% ' + (crop.y * 100) + '%', transformOrigin: (crop.x * 100) + '% ' + (crop.y * 100) + '%', scale: crop.zoom }}
      onLoadedData={() => setReady(true)} onError={() => setError(true)} />
    {error && <span className="sequence-error" role="alert">当前视频无法播放</span>}
  </>
}




