import { fitFontSize, plainCaption, revealText } from '../animation'
import type { ComponentProps } from './registry'

export function TitleCard({ element, ctx, width, height, accent }: ComponentProps) {
  const boxWidth = element.width * width
  const boxHeight = element.height * height
  const headline = plainCaption(element.text)
  const size = fitFontSize(headline, boxWidth, boxHeight * 0.62, element.fontSize)
  return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: size * 0.3, width: '100%', height: '100%', textAlign: 'center' }}>
    <div style={{ color: accent, fontSize: Math.max(12, size * 0.26), letterSpacing: size * 0.12, textTransform: 'uppercase' }}>
      {plainCaption(element.subtitle ?? 'ShotWeft')}
    </div>
    <div style={{ color: element.color, fontSize: size, fontWeight: 800, lineHeight: 1.12 }}>{revealText(headline, element.animation, ctx)}</div>
  </div>
}
