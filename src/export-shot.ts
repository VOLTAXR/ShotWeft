import Konva from 'konva'
import { annotationPosition, annotationShape } from './annotation-model'
import { coverCrop } from './canvas-geometry'
import { shotBackdrop } from './core/shot-backdrop'
import { defaultCrop, ratio, type Asset, type Frame, type Shot } from './model'

export async function renderShot(shot: Shot, frame: Frame, items: Map<string, Asset>, longEdge = 1920) {
  const source = shotBackdrop(shot, items)
  if (typeof source === 'string' || !source) return renderShotFrame(shot, frame, longEdge, source)
  const url = URL.createObjectURL(source)
  try {
    return await renderShotFrame(shot, frame, longEdge, url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function renderShotFrame(shot: Shot, frame: Frame, longEdge: number, url?: string) {
  const aspect = ratio(frame)
  const width = Math.round(aspect >= 1 ? longEdge : longEdge * aspect)
  const height = Math.round(width / aspect)
  let image: HTMLImageElement | undefined
  if (url) {
    image = new Image()
    image.src = url
    await image.decode()
  }
  const stage = new Konva.Stage({ container: document.createElement('div'), width, height })
  try {
    const layer = new Konva.Layer({ listening: false })
    stage.add(layer)
    layer.add(new Konva.Rect({ width, height, fill: '#171b21' }))
    if (image) layer.add(new Konva.Image({ image, width, height, crop: coverCrop(image, width, height, shot.crop ?? defaultCrop).bounds }))
    for (const item of shot.annotations ?? []) {
      if (item.hidden) continue
      const group = new Konva.Group(annotationPosition(item, width, height))
      const drawing = annotationShape(item)
      switch (drawing.type) {
        case 'Text': group.add(new Konva.Text(drawing.props)); break
        case 'Arrow': group.add(new Konva.Arrow(drawing.props)); break
        case 'Ellipse': group.add(new Konva.Ellipse(drawing.props)); break
        case 'Rect': group.add(new Konva.Rect(drawing.props)); break
        case 'Line': group.add(new Konva.Line(drawing.props)); break
      }
      layer.add(group)
    }
    return stage.toCanvas({ pixelRatio: 1 })
  } finally { stage.destroy() }
}

export function canvasBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('无法生成画面文件')), type, quality))
}

