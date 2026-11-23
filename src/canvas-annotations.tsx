import { useLayoutEffect, useRef, useState } from 'react'
import { Arrow, Ellipse, Group, Layer, Line, Rect, Text, Transformer } from 'react-konva'
import type Konva from 'konva'
import { annotationLabels, annotationPosition, annotationShape, type Annotation, type CanvasTool } from './annotation-model'

type Point = { x: number; y: number }
type Event = Konva.KonvaEventObject<PointerEvent>

export function useCanvasTools({ width, height, tool, onSelect, onCreate }: {
  width: number
  height: number
  tool: CanvasTool
  onSelect?: (id?: string) => void
  onCreate?: (item: Annotation) => void
}) {
  const gesture = useRef<{ pointer: number; start: Point; current: Point; item: Annotation } | undefined>(undefined)
  const [draft, setDraft] = useState<Annotation>()
  const unit = 1000 / width
  const position = (event: Event) => {
    const point = event.target.getStage()?.getPointerPosition()
    if (!point) return
    return { x: Math.max(0, Math.min(width, point.x)), y: Math.max(0, Math.min(height, point.y)) }
  }

  function update(point: Point) {
    const active = gesture.current
    if (!active) return
    const item = active.item
    const start = active.start
    const dx = (point.x - start.x) * unit
    const dy = (point.y - start.y) * unit
    if (item.type === 'pen') {
      const distance = Math.hypot(point.x - active.current.x, point.y - active.current.y)
      if (distance < 2 || item.points.length >= 8000) return item
      active.item = { ...item, points: [...item.points, dx, dy] }
    } else if (item.type === 'arrow') {
      active.item = { ...item, points: [0, 0, dx, dy] }
    } else {
      active.item = { ...item, x: Math.min(start.x, point.x) / width, y: Math.min(start.y, point.y) / height,
        width: Math.abs(dx), height: Math.abs(dy) }
    }
    active.current = point
    return active.item
  }

  const events = {
    onPointerDown: (event: Event) => {
      if (event.evt.button !== 0 || tool === 'crop') return
      if (tool === 'select') {
        if (event.target === event.target.getStage()) onSelect?.()
        return
      }
      if (!onCreate || gesture.current) return
      const point = position(event)
      if (!point) return
      const item: Annotation = {
        id: crypto.randomUUID(), type: tool, name: annotationLabels[tool],
        x: point.x / width, y: point.y / height, width: 0, height: 0, scaleX: 1, scaleY: 1,
        opacity: 1, color: tool === 'text' ? '#ffffff' : '#5295ff',
        hidden: false, locked: false, text: tool === 'text' ? '标注文案' : '', points: [0, 0],
      }
      if (tool === 'text') { onCreate(item); return }
      gesture.current = { pointer: event.evt.pointerId, start: point, current: point, item }
      if (event.evt.target instanceof HTMLElement) event.evt.target.setPointerCapture(event.evt.pointerId)
      setDraft(item)
    },
    onPointerMove: (event: Event) => {
      if (gesture.current?.pointer !== event.evt.pointerId) return
      const point = position(event)
      if (point) setDraft(update(point))
    },
    onPointerUp: (event: Event) => {
      const active = gesture.current
      if (!active || active.pointer !== event.evt.pointerId) return
      const point = position(event) ?? active.current
      const item = update(point)
      gesture.current = undefined
      setDraft(undefined)
      if (item && (item.type === 'pen' ? item.points.length > 2 : Math.hypot(point.x - active.start.x, point.y - active.start.y) >= 5)) onCreate?.(item)
    },
    onPointerCancel: () => { gesture.current = undefined; setDraft(undefined) },
  }
  return { draft, events }
}

function Mark({ item }: { item: Annotation }) {
  const drawing = annotationShape(item)
  switch (drawing.type) {
    case 'Text': return <Text {...drawing.props} />
    case 'Arrow': return <Arrow {...drawing.props} />
    case 'Rect': return <Rect {...drawing.props} />
    case 'Ellipse': return <Ellipse {...drawing.props} />
    case 'Line': return <Line {...drawing.props} />
  }
}

export function CanvasAnnotations({ items, draft, width, height, selected, editable, aboveVideo, onSelect, onEdit }: {
  items: Annotation[]
  draft?: Annotation
  width: number
  height: number
  selected?: string
  editable: boolean
  aboveVideo: boolean
  onSelect?: (id: string) => void
  onEdit?: (id: string, patch: Partial<Annotation>) => void
}) {
  const transform = useRef<Konva.Transformer>(null)
  const selectedItem = items.find(item => item.id === selected)
  useLayoutEffect(() => {
    const tool = transform.current
    if (!tool) return
    const node = selectedItem && !selectedItem.hidden && !selectedItem.locked
      ? tool.getLayer()?.findOne((item: Konva.Node) => item.id() === selectedItem.id) : undefined
    tool.nodes(node ? [node] : [])
    tool.forceUpdate()
    tool.getLayer()?.batchDraw()
  }, [selectedItem, editable, width, height])

  return <Layer name={aboveVideo ? 'annotations-over-video' : 'annotations'} listening={editable}>
    {items.map(item => !item.hidden && <Group key={item.id} id={item.id} {...annotationPosition(item, width, height)}
      draggable={editable && !item.locked}
      onPointerDown={editable ? event => { event.cancelBubble = true; onSelect?.(item.id) } : undefined}
      onDragEnd={event => onEdit?.(item.id, { x: event.target.x() / width, y: event.target.y() / height })}
      onTransformEnd={event => onEdit?.(item.id, {
        x: event.target.x() / width, y: event.target.y() / height,
        scaleX: event.target.scaleX() * 1000 / width, scaleY: event.target.scaleY() * 1000 / width,
      })}>
      <Mark item={item} />
    </Group>)}
    {draft && <Group {...annotationPosition(draft, width, height)} listening={false}><Mark item={draft} /></Group>}
    {editable && <Transformer ref={transform} rotateEnabled={false} flipEnabled={false} keepRatio={false}
      enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
      anchorSize={9} anchorCornerRadius={2} anchorStroke="#2459ed" borderStroke="#5295ff" padding={3}
      boundBoxFunc={(oldBox, newBox) => newBox.width < Math.min(8, oldBox.width) || newBox.height < Math.min(8, oldBox.height) ? oldBox : newBox} />}
  </Layer>
}



