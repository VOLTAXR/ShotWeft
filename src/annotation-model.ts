export const annotationTypes = ['text', 'arrow', 'rectangle', 'ellipse', 'pen'] as const
export type AnnotationType = typeof annotationTypes[number]
export type CanvasTool = 'crop' | 'select' | AnnotationType

export const annotationLabels: Record<AnnotationType, string> = {
  text: '文字', arrow: '箭头', rectangle: '矩形', ellipse: '椭圆', pen: '自由绘制',
}

export interface Annotation {
  id: string
  type: AnnotationType
  name: string
  x: number
  y: number
  width: number
  height: number
  scaleX: number
  scaleY: number
  color: string
  opacity: number
  hidden: boolean
  locked: boolean
  text: string
  points: number[]
}

export function annotationShape(item: Annotation) {
  const stroke = { stroke: item.color, strokeWidth: 5, shadowColor: '#182031', shadowBlur: 5, shadowOpacity: 0.65 }
  switch (item.type) {
    case 'text': return { type: 'Text' as const, props: {
      text: item.text, fill: item.color, fontSize: 34, fontStyle: 'bold', fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif',
      shadowColor: '#111823', shadowBlur: 6, shadowOpacity: 0.8, lineHeight: 1.18,
    } }
    case 'arrow': return { type: 'Arrow' as const, props: {
      ...stroke, points: item.points, fill: item.color, pointerLength: 21, pointerWidth: 20,
      lineCap: 'round' as const, lineJoin: 'round' as const, hitStrokeWidth: 22,
    } }
    case 'rectangle': return { type: 'Rect' as const, props: { ...stroke, width: item.width, height: item.height, cornerRadius: 3, hitStrokeWidth: 18 } }
    case 'ellipse': return { type: 'Ellipse' as const, props: {
      ...stroke, x: item.width / 2, y: item.height / 2, radiusX: item.width / 2, radiusY: item.height / 2, hitStrokeWidth: 18,
    } }
    case 'pen': return { type: 'Line' as const, props: {
      ...stroke, points: item.points, lineCap: 'round' as const, lineJoin: 'round' as const, hitStrokeWidth: 22,
    } }
  }
}

export function annotationPosition(item: Annotation, width: number, height: number) {
  return { x: item.x * width, y: item.y * height, scaleX: item.scaleX * width / 1000,
    scaleY: item.scaleY * width / 1000, opacity: item.opacity }
}

