import { Img, OffthreadVideo } from 'remotion'

type MediaLayerProps = {
  kind: 'image' | 'video'
  src: string
  region?: { x: number; y: number; width: number; height: number }
  fit?: 'contain' | 'cover'
  opacity?: number
  sourceInFrame?: number
  durationFrames: number
  borderRadius?: number
}

export function MediaLayer({ kind, src, region = { x: 0, y: 0, width: 1, height: 1 }, fit = 'cover', opacity = 1,
  sourceInFrame = 0, durationFrames, borderRadius }: MediaLayerProps) {
  const style = { width: '100%', height: '100%', objectFit: fit, display: 'block' }
  return <div style={{ position: 'absolute', left: `${region.x * 100}%`, top: `${region.y * 100}%`,
    width: `${region.width * 100}%`, height: `${region.height * 100}%`, overflow: 'hidden', opacity, borderRadius }}>
    {kind === 'image' ? <Img src={src} style={style} /> :
      <OffthreadVideo src={src} style={style} trimBefore={sourceInFrame} trimAfter={sourceInFrame + durationFrames} muted />}
  </div>
}
