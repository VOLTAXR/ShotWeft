import { enterProgress, plainCaption, unitProgress } from '../animation'
import type { ComponentProps } from './registry'

export function TimelineScene({ element, ctx, accent }: ComponentProps) {
  const items = element.items ?? []
  const axis = enterProgress(element.animation, ctx)
  const labelSize = Math.max(14, element.fontSize * 0.5)
  const detailSize = Math.max(12, element.fontSize * 0.36)
  return <div style={{ position: 'relative', width: '100%', height: '100%' }}>
    <div style={{ position: 'absolute', left: '2%', right: '2%', top: '34%', height: 3, background: accent,
      transform: `scaleX(${axis})`, transformOrigin: 'left' }} />
    {items.map((item, index) => {
      const p = unitProgress(element.animation, ctx, index)
      const left = items.length === 1 ? 50 : 4 + (index * 92) / (items.length - 1)
      return <div key={item.id} style={{ position: 'absolute', left: left + '%', top: '34%', width: 0, opacity: p }}>
        <div style={{ position: 'absolute', transform: 'translate(-50%, -50%)', width: 14, height: 14, borderRadius: '50%',
          background: element.color, border: '3px solid ' + accent, boxSizing: 'border-box' }} />
        <div style={{ position: 'absolute', transform: 'translate(-50%, 14px)', whiteSpace: 'nowrap', textAlign: 'center',
          color: accent, fontSize: labelSize, fontWeight: 700 }}>{plainCaption(item.label)}</div>
        {item.detail && <div style={{ position: 'absolute', transform: 'translate(-50%, ' + (14 + labelSize * 1.5) + 'px)',
          whiteSpace: 'nowrap', textAlign: 'center', color: element.color, opacity: 0.72, fontSize: detailSize }}>
          {plainCaption(item.detail)}</div>}
      </div>
    })}
  </div>
}
