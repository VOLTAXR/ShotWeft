import { interpolate } from 'remotion'
import { enterProgress, fitFontSize, plainCaption } from '../animation'
import type { ComponentProps } from './registry'

export function StatCard({ element, ctx, width, height, accent }: ComponentProps) {
  const progress = enterProgress(element.animation, ctx)
  const value = interpolate(progress, [0, 1], [0, element.value ?? 0])
  const decimals = element.decimals ?? 0
  const formatted = value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  const label = plainCaption(element.text)
  const boxWidth = element.width * width
  const boxHeight = element.height * height
  const size = fitFontSize((element.prefix ?? '') + formatted + (element.suffix ?? ''), boxWidth, boxHeight * 0.62, element.fontSize)
  return <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
    width: '100%', height: '100%', textAlign: 'center', gap: size * 0.16 }}>
    <div style={{ color: accent, fontSize: size, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
      {(element.prefix ?? '') + formatted + (element.suffix ?? '')}
    </div>
    <div style={{ color: element.color, fontSize: Math.max(12, size * 0.24), opacity: 0.9 }}>{label}</div>
  </div>
}
