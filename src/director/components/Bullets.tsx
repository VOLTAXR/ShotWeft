import { plainCaption, unitProgress } from '../animation'
import type { ComponentProps } from './registry'

export function Bullets({ element, ctx, accent }: ComponentProps) {
  type Line = { id: string; label: string; detail?: string }
  const lines: Line[] = element.items?.length
    ? element.items
    : plainCaption(element.text).split(/\n|\s*[;；]\s*/).filter(Boolean).map((label, index) => ({ id: 'line-' + index, label }))
  const size = Math.max(10, element.fontSize * 0.62)
  return <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: size * 0.9,
    width: '100%', height: '100%', paddingLeft: size * 0.2 }}>
    {lines.map((item, index) => {
      const p = unitProgress(element.animation, ctx, index)
      const detail = item.detail
      return <div key={item.id} style={{ display: 'flex', gap: size * 0.7, alignItems: 'flex-start', opacity: p,
        transform: `translateY(${(1 - p) * 14}px)` }}>
        <div style={{ width: size * 0.42, height: size * 0.42, marginTop: size * 0.34, borderRadius: '50%',
          background: accent, flex: '0 0 auto' }} />
        <div>
          <div style={{ color: element.color, fontSize: size, fontWeight: 650, lineHeight: 1.3 }}>{plainCaption(item.label)}</div>
          {detail && <div style={{ color: element.color, opacity: 0.72, fontSize: size * 0.74, marginTop: size * 0.2 }}>{plainCaption(detail)}</div>}
        </div>
      </div>
    })}
    {!lines.length && <div style={{ color: element.color, fontSize: size, opacity: 0.6 }}>{plainCaption(element.text)}</div>}
  </div>
}
