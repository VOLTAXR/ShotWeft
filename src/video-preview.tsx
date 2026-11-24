import { Maximize, Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useBlobURL } from './media'
import type { Asset } from './model'
import { IconButton } from './ui'
import { activeClipsAtFrame, activeCuesAtFrame, captionDefaults, frameToSeconds, type VideoClip, type VideoTimeline } from './video-model'

function SourceLayer({ asset, time, playing, gain, visible }: {
  asset: Asset; time: number; playing: boolean; gain: number; visible: boolean
}) {
  const source = useBlobURL(asset.blob)
  const poster = useBlobURL(visible && asset.kind === 'video' ? asset.thumbnail : undefined)
  const video = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const element = video.current
    if (!element || failed) return
    const sync = () => {
      if (element.readyState < 1) return
      const target = Math.min(time, Math.max(0, element.duration - 0.001))
      if (Math.abs(element.currentTime - target) > (playing ? 0.12 : 0.0001)) element.currentTime = target
    }
    sync()
    element.addEventListener('loadedmetadata', sync)
    return () => element.removeEventListener('loadedmetadata', sync)
  }, [time, playing, source, failed])

  useEffect(() => {
    const element = video.current
    if (element) element.volume = gain
  }, [source, gain, failed])

  useEffect(() => {
    const element = video.current
    if (!element) return
    if (playing) void element.play().catch(() => { /* Playback may be pending on browser media policy. */ })
    else element.pause()
    return () => element.pause()
  }, [source, playing, failed])

  if (asset.kind === 'image') return source && visible ? <img src={source} alt={asset.name} /> : null
  return <>
    {poster && <img src={poster} alt="" />}
    {source && !failed && <video ref={video} src={source} poster={poster} playsInline preload="auto" muted={gain === 0}
      className={visible ? undefined : 'video-source-hidden'} aria-hidden={!visible} aria-label={visible ? asset.name : undefined}
      onError={() => setFailed(true)} />}
  </>
}

function aspectLabel(width: number, height: number) {
  let a = width
  let b = height
  while (b) [a, b] = [b, a % b]
  return width / a + ':' + height / a
}

export function VideoPreview({ timeline, assets, frame, duration, playing, onPlay, onSeek }: {
  timeline: VideoTimeline; assets: Map<string, Asset>; frame: number; duration: number; playing: boolean
  onPlay: () => void; onSeek: (frame: number) => void
}) {
  const screen = useRef<HTMLElement>(null)
  const [fullScreen, setFullScreen] = useState(false)
  const [screenError, setScreenError] = useState(false)
  const [seekDraft, setSeekDraft] = useState<string>()
  const { width, height, fps } = timeline
  const cues = activeCuesAtFrame(timeline, frame)

  useEffect(() => {
    const sync = () => setFullScreen(document.fullscreenElement === screen.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  async function toggleFullScreen() {
    try {
      if (fullScreen) await document.exitFullscreen()
      else if (screen.current?.requestFullscreen) await screen.current.requestFullscreen()
      else throw new Error('Fullscreen unavailable')
      setScreenError(false)
    } catch {
      setScreenError(true)
    }
  }

  function drawClip(clip: VideoClip, visible: boolean, muted: boolean) {
    if (clip.graphic && visible) {
      const graphic = clip.graphic
      return <div key={clip.id} className="video-graphic" style={{
        left: graphic.x * 100 + '%', top: graphic.y * 100 + '%', width: graphic.width * 100 + '%',
        height: graphic.height * 100 + '%', opacity: graphic.opacity, textAlign: graphic.align,
        fontSize: graphic.fontSize / width * 100 + 'cqw',
        ...(graphic.kind === 'box' ? { background: graphic.color } : { color: graphic.color }),
      }}>{graphic.kind === 'text' && graphic.text}</div>
    }
    const asset = clip.assetId && assets.get(clip.assetId)
    if (!asset || (!visible && asset.kind === 'image')) return null
    return <SourceLayer key={clip.id} asset={asset} playing={playing} visible={visible}
      gain={muted || clip.muted ? 0 : clip.volume} time={frameToSeconds((clip.sourceInFrame ?? 0) + (frame - clip.startFrame), fps)} />
  }

  const layers = [...timeline.tracks.filter(track => track.kind === 'main-video'),
    ...timeline.tracks.filter(track => track.kind !== 'main-video' && track.kind !== 'captions')]
  return <section className="video-panel video-preview" aria-label="Video preview" ref={screen}
    style={{ '--video-ratio': width / height } as CSSProperties}>
    <header className="video-panel-head">
      <h3>Preview</h3>
      <span>{width} × {height} · {aspectLabel(width, height)} · {fps.numerator}{fps.denominator !== 1 && '/' + fps.denominator} fps</span>
    </header>
    <div className="video-screen">
      <div className="video-frame">
        {!duration && <p className="video-preview-empty">Add media, a graphic, or a subtitle to preview.</p>}
        {layers.map(track => activeClipsAtFrame(track, frame).map(clip =>
          drawClip(clip, track.visible && track.kind !== 'voice' && track.kind !== 'music', track.muted)))}
        {timeline.tracks.filter(track => track.kind === 'captions' && track.visible).map(track =>
          cues.filter(cue => cue.trackId === track.id).map(cue => {
            const style = { ...captionDefaults, ...cue.style }
            return <div key={cue.id} className={'video-caption video-caption-' + style.position} style={{
              fontSize: style.fontSize / width * 100 + 'cqw', color: style.color,
            }}><span style={{ backgroundColor: style.background }}>{cue.text}</span></div>
          }))}
      </div>
    </div>
    <div className="video-transport">
      <IconButton label={playing ? 'Pause video' : 'Play video'} onClick={onPlay} disabled={!duration}>
        {playing ? <Pause size={17} /> : <Play size={17} />}
      </IconButton>
      <input aria-label="Seek video frame" type="range" min={0} max={Math.max(1, duration - 1)} step={1} value={frame}
        disabled={duration <= 1} onChange={event => onSeek(event.currentTarget.valueAsNumber)} />
      <label className="video-frame-field">Frame
        <input aria-label="Playhead frame" type="number" min={0} max={Math.max(0, duration - 1)} step={1}
          disabled={!duration} value={seekDraft ?? frame} onChange={event => setSeekDraft(event.currentTarget.value)}
          onBlur={event => {
            const entered = event.currentTarget.valueAsNumber
            setSeekDraft(undefined)
            if (Number.isSafeInteger(entered) && entered !== frame) onSeek(entered)
          }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
      </label>
      <span className="video-time">{frameToSeconds(frame, fps).toFixed(3)} s</span>
      <IconButton label={fullScreen ? 'Exit full screen' : 'Full screen'} onClick={() => { void toggleFullScreen() }}><Maximize size={17} /></IconButton>
    </div>
    {screenError && <p className="video-notice" role="alert">Full screen is unavailable in this browser.</p>}
  </section>
}
