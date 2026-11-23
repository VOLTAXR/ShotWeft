import { PDFDocument } from 'pdf-lib'
import { productName } from '../release.json'
import { canvasBlob } from './export-shot'
import { clock, number, type Project, type Shot } from './model'

const font = '"Segoe UI", "Microsoft YaHei", sans-serif'
const perPage = 4
const pageWidth = 1190
const pageHeight = 842
const margin = 54

function wrap(context: CanvasRenderingContext2D, text: string, width: number, limit: number) {
  const lines = ['']
  for (const character of text) {
    const index = lines.length - 1
    const line = lines[index] + character
    if (character !== '\n' && context.measureText(line).width < width) {
      lines[index] = line
      continue
    }
    if (lines.length === limit) {
      const trimmed = lines[index]
      lines[index] = trimmed.slice(0, Math.max(0, trimmed.length - 2)) + '…'
      break
    }
    lines.push(character === '\n' ? '' : character)
  }
  return lines
}

export async function storyboardPDF(project: Project, renderFrame: (shot: Shot, longEdge: number) => Promise<HTMLCanvasElement>) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(project.title + ' · 分镜表')
  pdf.setCreator(productName)
  const scenes = new Map(project.scenes.map(scene => [scene.id, scene]))
  const pages = Math.max(1, Math.ceil(project.shots.length / perPage))
  await document.fonts.ready
  for (let page = 0; page < pages; page++) {
    const canvas = document.createElement('canvas')
    canvas.width = pageWidth * 2
    canvas.height = pageHeight * 2
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法生成分镜表')
    context.scale(2, 2)
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, pageWidth, pageHeight)
    context.fillStyle = '#2459ed'
    context.fillRect(margin, 54, 24, 4)
    context.font = 'bold 30px ' + font
    context.fillStyle = '#171e2a'
    context.fillText(wrap(context, project.title, 900, 1)[0], margin, 96)
    context.font = '16px ' + font
    context.fillStyle = '#536583'
    context.fillText('分镜表  /  ' + project.frame + '  /  ' + project.shots.length + ' 个镜头', margin, 129)
    const slice = project.shots.slice(page * perPage, (page + 1) * perPage)
    if (!slice.length) context.fillText('此项目暂无镜头', margin, 190)

    for (const [i, shot] of slice.entries()) {
      const y = 156 + i * 147
      const frame = await renderFrame(shot, 640)
      context.fillStyle = '#eff2f7'
      context.fillRect(margin, y, pageWidth - margin * 2, 1)
      context.fillStyle = '#f0f3f8'
      context.fillRect(margin, y + 9, 230, 127)
      const scale = Math.min(230 / frame.width, 127 / frame.height)
      const width = frame.width * scale
      const height = frame.height * scale
      context.drawImage(frame, margin + (230 - width) / 2, y + 9 + (127 - height) / 2, width, height)
      const left = margin + 254
      const span = pageWidth - margin - left
      context.fillStyle = '#2459ed'
      context.font = 'bold 15px ' + font
      context.fillText(number(page * perPage + i) + '  /  ' + shot.duration + ' 秒', left, y + 26)
      context.fillStyle = '#171e2a'
      context.font = 'bold 21px ' + font
      context.fillText(wrap(context, shot.title, span, 1)[0], left, y + 54)
      context.fillStyle = '#42546e'
      context.font = '15px ' + font
      const scene = scenes.get(shot.sceneId)
      const details = [scene && (scene.setting + ' ' + scene.location), shot.size, shot.angle, shot.movement, shot.lens].filter(Boolean).join(' · ')
      context.fillText(wrap(context, details, span, 1)[0], left, y + 80)
      if (shot.notes) wrap(context, shot.notes, span, 2).forEach((line, n) => context.fillText(line, left, y + 103 + n * 19))
      frame.width = 0
    }

    context.fillStyle = '#536583'
    context.font = '14px ' + font
    context.fillText(productName, margin, 792)
    context.textAlign = 'right'
    const duration = clock(project.shots.reduce((total, shot) => total + shot.duration, 0))
    context.fillText(duration + '   /   ' + (page + 1) + ' / ' + pages, pageWidth - margin, 792)
    const image = await pdf.embedJpg(await (await canvasBlob(canvas, 'image/jpeg', 0.94)).arrayBuffer())
    const sheet = pdf.addPage([841.89, 595.28])
    sheet.drawImage(image, { x: 0, y: 0, width: sheet.getWidth(), height: sheet.getHeight() })
  }
  return new Blob([Uint8Array.from(await pdf.save())], { type: 'application/pdf' })
}


