import { OffthreadVideo, useVideoConfig } from 'remotion'
import type { CSSProperties } from 'react'
import type { DirectorShot } from '../core/director/plan'

type Layout = DirectorShot['presenterLayout']

export function presenterStage(layout: Layout, width: number, height: number): CSSProperties | undefined {
  if (layout !== 'left' && layout !== 'right') return
  return { position: 'absolute', width, height, left: layout === 'left' ? width / 2 : 0, top: height / 4,
    transform: 'scale(0.5)', transformOrigin: 'top left' }
}

export function PresenterLayer({ layout, src, sourceInFrame }: { layout: Layout; src: string; sourceInFrame: number }) {
  const { width, height } = useVideoConfig()
  if (layout === 'none' || layout === 'b-roll') return null
  const portrait = width < height
  const pipWidth = Math.round(width * (portrait ? 0.41 : 0.31))
  const roundSize = Math.round(Math.min(width, height) * 0.34)
  const inset = Math.round(Math.min(width, height) * 0.045)
  const windowHeight = Math.round(height * 0.64)
  const geometry: Record<Exclude<Layout, 'none' | 'b-roll'>, CSSProperties> = {
    full: { inset: 0 },
    left: { left: 0, top: 0, width: width / 2, height },
    right: { right: 0, top: 0, width: width / 2, height },
    pip: { right: inset, bottom: height * 0.19, width: pipWidth, height: pipWidth * 9 / 16, borderRadius: inset / 2 },
    round: { right: inset, bottom: height * 0.19, width: roundSize, height: roundSize, borderRadius: '50%' },
    portrait: { right: inset, top: height * 0.08, width: Math.min(width * 0.48, windowHeight * 9 / 16),
      height: windowHeight, borderRadius: inset / 2 },
  }
  const floating = layout === 'pip' || layout === 'round' || layout === 'portrait'
  return <div data-presenter-video={layout} style={{ position: 'absolute', overflow: 'hidden', background: '#17243d',
    ...geometry[layout], ...(floating && { border: '2px solid #ffffff', boxShadow: '0 6px 22px #17243d66' }) }}>
    <OffthreadVideo src={src} trimBefore={sourceInFrame} muted
      style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
  </div>
}
