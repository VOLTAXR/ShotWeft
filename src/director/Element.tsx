import type { VisualElement } from '../core/director/plan'

export function Element({ element, width, height }: { element: VisualElement; width: number; height: number }) {
  return <div data-shared-key={element.sharedKey} style={{ position: 'absolute', left: element.x * width, top: element.y * height,
    width: element.width * width, height: element.height * height, borderRadius: element.borderRadius,
    color: element.color, background: element.background, fontSize: element.fontSize, fontWeight: 750,
    display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', whiteSpace: 'pre-wrap', overflow: 'hidden' }}>
    {element.kind !== 'box' && element.text}
  </div>
}
