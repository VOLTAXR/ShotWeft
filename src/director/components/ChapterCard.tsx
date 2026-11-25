import { fitFontSize, plainCaption, revealText } from '../animation'
import type { ComponentProps } from './registry'

export function ChapterCard({ element, ctx, width, height, accent }: ComponentProps) {
  const boxWidth = element.width * width
  const boxHeight = element.height * height
  const title = plainCaption(element.text)
  const size = fitFontSize(title, boxWidth * 0.78, boxHeight * 0.5, element.fontSize)
  return <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.5, width: '100%', height: '100%' }}>
    <div style={{ color: accent, fontSize: size * 1.8, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
      opacity: Math.min(1, size > 0 ? 1 : 1) }}>{plainCaption(element.subtitle ?? '01')}</div>
    <div style={{ width: 4, alignSelf: 'stretch', background: accent, opacity: 0.8, transformOrigin: 'top' }} />
    <div style={{ color: element.color, fontSize: size, fontWeight: 750, lineHeight: 1.15 }}>{revealText(title, element.animation, ctx)}</div>
  </div>
}
