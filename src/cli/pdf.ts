import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { shotBackdrop } from '../core/shot-backdrop'
import type { ProjectArchive } from '../core/project-archive'

export async function verifyPDF(source: string) {
  const path = resolve(source)
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK)
  let bytes: Buffer
  try {
    if (!(await file.stat()).isFile()) throw new Error('PDF 必须为普通文件：' + path)
    const header = Buffer.alloc(5)
    await file.read(header, 0, header.length, 0)
    if (!header.equals(Buffer.from('%PDF-'))) throw new Error('文件缺少 %PDF- 文件头：' + path)
    bytes = await file.readFile()
  } finally {
    await file.close()
  }

  // A recoverable parser warning still means this CLI check should fail with one JSON error.
  const { log, warn } = console
  let pages: number
  let title: string | null
  try {
    // pdf-lib can recover truncated PDFs that have lost the final EOF marker.
    const end = bytes.lastIndexOf('%%EOF')
    if (end < 0 || !/^[\0\t\n\f\r ]*$/.test(bytes.subarray(end + 5).toString('latin1'))) {
      throw new Error('缺少有效的 PDF 文件结束标记')
    }
    const { PDFDocument } = await import('pdf-lib')
    console.log = console.warn = () => { throw new Error('PDF 解析异常') }
    const pdf = await PDFDocument.load(bytes, { throwOnInvalidObject: true, updateMetadata: false })
    pages = pdf.getPageCount()
    title = pdf.getTitle() ?? null
  } catch {
    throw new Error('PDF 损坏或无法读取：' + path)
  } finally {
    console.log = log
    console.warn = warn
  }
  if (!pages) throw new Error('PDF 没有页面：' + path)
  return { path, bytes: bytes.length, pages, title }
}

export async function exportPDF({ project, items, photos }: ProjectArchive, destination: string) {
  const { chromium } = await import('playwright')
  const assets = new Map(items.map(item => [item.id, item]))
  const images = new Map<string, Blob>()
  const urls = new Map<Blob, string>()
  const backdrops: [string, string][] = []
  const origin = 'https://shotweft.invalid'

  for (const shot of project.shots) {
    const source = shotBackdrop(shot, assets)
    const image = typeof source === 'string' ? photos.get(source) : source
    if (source && !image) throw new Error('项目缺少引用的示例照片')
    if (!image) continue
    let url = urls.get(image)
    if (!url) {
      url = origin + '/image/' + images.size
      urls.set(image, url)
      images.set(url, image)
    }
    backdrops.push([shot.id, url])
  }

  const browser = await chromium.launch().catch(error => {
    throw new Error('无法启动 Chromium。请运行 npx playwright install chromium --only-shell。\n' + error.message)
  })
  try {
    const page = await browser.newPage()
    await page.route('**/*', async route => {
      const url = route.request().url()
      if (url === origin + '/') {
        await route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
        return
      }
      const image = images.get(url)
      if (image) {
        await route.fulfill({ contentType: image.type, body: Buffer.from(await image.arrayBuffer()) })
      } else await route.abort()
    })
    await page.goto(origin)
    await page.addScriptTag({ path: fileURLToPath(new URL('./render.js', import.meta.url)) })
    const file = await open(destination, 'wx', 0o600)
    try {
      await page.exposeFunction('writeShotWeftPDFChunk', (chunk: Uint8Array) => file.writeFile(chunk))
      const size = await page.evaluate(
        ({ project, backdrops }) => window.renderShotWeftPDF(project, backdrops), { project, backdrops },
      )
      if (!size || (await file.stat()).size !== size) throw new Error('PDF 传输不完整')
    } finally {
      await file.close()
    }
  } finally {
    await browser.close()
  }
}
