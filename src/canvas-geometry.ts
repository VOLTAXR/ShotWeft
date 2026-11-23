import type { Crop } from './model'

export function coverCrop(image: HTMLImageElement, width: number, height: number, crop: Crop) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * crop.zoom
  const sourceWidth = Math.min(image.naturalWidth, width / scale)
  const sourceHeight = Math.min(image.naturalHeight, height / scale)
  const availableX = Math.max(0, image.naturalWidth - sourceWidth)
  const availableY = Math.max(0, image.naturalHeight - sourceHeight)
  return {
    scale, availableX, availableY,
    bounds: { x: availableX * crop.x, y: availableY * crop.y, width: sourceWidth, height: sourceHeight },
  }
}

