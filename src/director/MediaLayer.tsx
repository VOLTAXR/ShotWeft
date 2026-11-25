import { Img, OffthreadVideo, interpolate, useCurrentFrame } from 'remotion'
import type { ElementAnimation } from '../core/director/plan'
import { elementAnimationStyle } from './animation'

type Camera = { fromScale: number; toScale: number; fromX: number; fromY: number; toX: number; toY: number;
  easing?: 'linear' | 'easeOut' | 'easeInOut' | 'springSmooth' | 'springSnappy' }

type MediaLayerProps = {
  kind: 'image' | 'video'
  src: string
  region?: { x: number; y: number; width: number; height: number }
  fit?: 'contain' | 'cover'
  opacity?: number
  sourceInFrame?: number
  durationFrames: number
  borderRadius?: number
  animation?: ElementAnimation
  camera?: Camera
}

export function MediaLayer({ kind, src, region = { x: 0, y: 0, width: 1, height: 1 }, fit = 'cover', opacity = 1,
  sourceInFrame = 0, durationFrames, borderRadius, animation, camera }: MediaLayerProps) {
  const frame = useCurrentFrame()
  const motion = animation ? elementAnimationStyle({ animation } as never, { frame, fps: 30, durationFrames }) : undefined
  // Ken Burns drift is linear by design (steady camera, no acceleration).
  const progress = camera ? interpolate(frame, [0, Math.max(1, durationFrames)], [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0
  const scale = camera ? interpolate(progress, [0, 1], [camera.fromScale, camera.toScale]) : 1
  const originX = camera ? interpolate(progress, [0, 1], [camera.fromX, camera.toX]) : 0.5
  const originY = camera ? interpolate(progress, [0, 1], [camera.fromY, camera.toY]) : 0.5
  const style = { width: '100%', height: '100%', objectFit: fit, display: 'block',
    transform: camera ? `scale(${scale})` : undefined, transformOrigin: camera ? `${originX * 100}% ${originY * 100}%` : undefined }
  return <div style={{ position: 'absolute', left: `${region.x * 100}%`, top: `${region.y * 100}%`,
    width: `${region.width * 100}%`, height: `${region.height * 100}%`, overflow: 'hidden',
    opacity: opacity * (motion?.opacity ?? 1), borderRadius,
    transform: motion && (motion.translateX || motion.translateY || motion.scale !== 1)
      ? `translate(${motion.translateX}px, ${motion.translateY}px) scale(${motion.scale})` : undefined,
    filter: motion?.blur ? `blur(${motion.blur}px)` : undefined, clipPath: motion?.clipPath }}>
    {kind === 'image' ? <Img src={src} style={style} /> :
      <OffthreadVideo src={src} style={style} trimBefore={sourceInFrame} trimAfter={sourceInFrame + durationFrames} muted />}
  </div>
}
