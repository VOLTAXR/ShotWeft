import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PDFDocument } from 'pdf-lib'

const button = (page, name) => page.getByRole('button', { name, exact: true })
const link = (page, name) => page.getByRole('link', { name, exact: true })
const projectId = 'before-the-tide'

async function getProject(page, id = projectId) {
  return page.evaluate(id => new Promise((resolve, reject) => {
    const request = indexedDB.open('frameos-studio')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const query = db.transaction('projects').objectStore('projects').get(id)
      query.onsuccess = () => { db.close(); resolve(query.result) }
      query.onerror = () => { db.close(); reject(query.error) }
    }
  }), id)
}

async function persisted(page, condition, label) {
  for (let i = 0; i < 70; i++) {
    const draft = await getProject(page)
    if (draft && condition(draft)) return draft
    await new Promise(resolve => setTimeout(resolve, 75))
  }
  throw Error('Database did not persist ' + label)
}

async function drag(page, x1, y1, x2, y2) {
  await page.mouse.move(x1, y1)
  await page.mouse.down()
  await page.mouse.move(x2, y2, { steps: 16 })
  await page.mouse.up()
}

const surface = page => page.locator('.monitor-frame .konvajs-content')

async function draw(page, label, x, y, endX, endY) {
  await button(page, label).click()
  const box = await surface(page).boundingBox()
  assert(box)
  if (endX === undefined) await page.mouse.click(box.x + x * box.width, box.y + y * box.height)
  else await drag(page, box.x + x * box.width, box.y + y * box.height, box.x + endX * box.width, box.y + endY * box.height)
}

async function exportFile(page, option, path) {
  await button(page, '导出').click()
  const result = page.waitForEvent('download', { timeout: 18000 })
  await button(page, option).click()
  await (await result).saveAs(path)
}

async function fit(page, aspect) {
  await page.waitForFunction(aspect => {
    const box = document.querySelector('.monitor-frame')?.getBoundingClientRect()
    const well = document.querySelector('.monitor-fit')?.getBoundingClientRect()
    return box && well && box.width > 100 && box.height > 100 &&
      Math.abs(box.width / box.height - aspect) < 0.035 &&
      box.width <= well.width + 1 && box.height <= well.height + 1 &&
      (box.width >= well.width - 3 || box.height >= well.height - 3) &&
      document.documentElement.scrollWidth <= innerWidth
  }, aspect)
}

export async function testPhaseThree(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  const page = await context.newPage()
  const errors = []
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('response', response => { if (response.status() >= 400) errors.push(response.status() + ' ' + response.url()) })
  try {
    await page.goto(url + '/#/project/' + projectId)
    await fit(page, 2.39)
    await draw(page, '添加文字', 0.11, 0.18)
    await page.getByLabel('标注文字').fill('海岸取景 · 清晨')
    await page.getByLabel('图层名称').fill('海岸场记')
    await persisted(page, p => p.shots[0].annotations?.[0].name === '海岸场记', 'text layer')
    await draw(page, '绘制箭头', 0.57, 0.28, 0.83, 0.56)
    await draw(page, '绘制矩形', 0.19, 0.40, 0.42, 0.76)
    await draw(page, '绘制椭圆', 0.51, 0.53, 0.64, 0.78)
    await draw(page, '自由绘制', 0.72, 0.78, 0.91, 0.82)
    const state = await persisted(page, p => p.shots[0].annotations?.length === 5, 'all five annotation types')
    assert.deepEqual(state.shots[0].annotations.map(item => item.type), ['text', 'arrow', 'rectangle', 'ellipse', 'pen'])
    assert(state.shots[0].annotations.at(-1).points.length > 4)

    await button(page, '选择图层 矩形').click()
    const rect = state.shots[0].annotations[2]
    const box = await surface(page).boundingBox()
    assert(box)
    const x = box.x + rect.x * box.width
    const y = box.y + rect.y * box.height
    const bottom = y + rect.height * box.width / 1000
    await drag(page, x + 1, (y + bottom) / 2, x + 46, (y + bottom) / 2 - 19)
    const moved = await persisted(page, p => p.shots[0].annotations[2].x > rect.x + 0.02, 'canvas drag')
    const movedRect = moved.shots[0].annotations[2]
    const cornerX = box.x + movedRect.x * box.width + movedRect.width * box.width / 1000 + 3
    const cornerY = box.y + movedRect.y * box.height + movedRect.height * box.width / 1000 + 3
    await drag(page, cornerX, cornerY, cornerX + 45, cornerY + 23)
    await persisted(page, p => p.shots[0].annotations[2].scaleX > 1.08, 'transformer resize')
    await button(page, '撤销').click()
    await persisted(page, p => p.shots[0].annotations[2].scaleX === 1, 'undo scale')
    await button(page, '重做').click()
    await persisted(page, p => p.shots[0].annotations[2].scaleX > 1.08, 'redo scale')
    console.log('PASS all annotation tools, moving, resizing, undo and redo')

    await button(page, '锁定图层 矩形').click()
    await page.getByRole('button', { name: '删除图层', exact: true, disabled: true }).waitFor()
    await button(page, '解锁图层 矩形').click()
    await button(page, '锁定图层 矩形').waitFor()
    await button(page, '隐藏图层 自由绘制').click()
    await button(page, '显示图层 自由绘制').waitFor()
    await button(page, '显示图层 自由绘制').click()
    await page.getByLabel('不透明度').press('ArrowLeft')
    await persisted(page, p => p.shots[0].annotations[2].opacity === 0.99, 'layer opacity')
    await button(page, '图层上移').click()
    await persisted(page, p => p.shots[0].annotations[3].id === rect.id, 'layer order')
    await button(page, '删除图层').click()
    await persisted(page, p => p.shots[0].annotations.length === 4, 'delete annotation')
    await button(page, '撤销').click()
    await persisted(page, p => p.shots[0].annotations.length === 5, 'restore annotation')
    await button(page, '镜头 02 穿过松林').click()
    await page.getByText('从画布工具栏添加标注').waitFor()
    await button(page, '镜头 01 雾中的海岸').click()
    await button(page, '选择图层 海岸场记').waitFor()
    await page.reload()
    await fit(page, 2.39)
    await button(page, '图层').click()
    await button(page, '选择图层 海岸场记').waitFor()
    await button(page, '选择图层 矩形').click()
    assert.equal(await page.getByLabel('不透明度').inputValue(), '99')
    await button(page, '选择图层 海岸场记').click()
    await page.screenshot({ path: 'docs/screenshots/07-annotated-canvas-1440.png', animations: 'disabled' })
    console.log('PASS layer order, visibility, lock, opacity, rename, persistence and shot isolation')

    const panel = page.locator('.inspector')
    const widthBefore = (await panel.boundingBox()).width
    await page.getByRole('separator', { name: '调整属性面板宽度' }).press('ArrowLeft')
    await page.waitForFunction(old => document.querySelector('.inspector').getBoundingClientRect().width > old + 8, widthBefore)
    await button(page, '折叠镜头属性').click()
    await panel.waitFor({ state: 'hidden' })
    await button(page, '镜头属性').click()
    await panel.waitFor()
    const timeline = page.getByRole('region', { name: '时间轴' })
    const height = (await timeline.boundingBox()).height
    const handle = await page.getByRole('separator', { name: '调整时间轴高度' }).boundingBox()
    await drag(page, handle.x + handle.width / 2, handle.y + handle.height / 2, handle.x + handle.width / 2, handle.y + handle.height / 2 - 51)
    await page.waitForFunction(old => document.querySelector('.timeline-pro').getBoundingClientRect().height >= old + 36, height)
    await page.locator('.timeline-ruler').click({ position: { x: 75, y: 12 } })
    await page.waitForFunction(() => Number(document.querySelector('.playhead')?.dataset.position) > 0.2)
    await page.getByLabel('画幅', { exact: true }).selectOption('9:16')
    await fit(page, 9 / 16)
    await page.getByLabel('画幅', { exact: true }).selectOption('16:9')
    await fit(page, 16 / 9)
    await page.setViewportSize({ width: 1920, height: 1080 })
    await fit(page, 16 / 9)
    await page.screenshot({ path: 'docs/screenshots/08-workspace-1920.png', animations: 'disabled' })
    const split = await readFile('.tmp/in-app-viewport.json', 'utf8').then(JSON.parse).catch(() => ({ width: 1042, height: 871 }))
    await page.setViewportSize(split)
    await fit(page, 16 / 9)
    await page.screenshot({ path: 'docs/screenshots/09-workspace-split.png', fullPage: true, animations: 'disabled' })
    console.log('PASS aspect ratios, pane resizing, ruler and split viewport ' + split.width + 'x' + split.height)

    await page.setViewportSize({ width: 1440, height: 900 })
    await link(page, '素材').click()
    await page.getByLabel('上传素材文件').setInputFiles([
      resolve('public/demo-media/afterglow.jpg'), resolve('public/demo-media/waves.mp4'),
    ])
    await button(page, '预览 afterglow.jpg').click()
    await button(page, '用于当前镜头').click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await exportFile(page, '当前镜头 PNG', '.tmp/phase3-shot.png')
    const png = await readFile('.tmp/phase3-shot.png')
    assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a')
    assert.equal(png.readUInt32BE(16), 1920)
    assert.equal(png.readUInt32BE(20), 1080)
    assert(png.length > 100_000)

    await button(page, '镜头 02 穿过松林').click()
    await button(page, '预览 waves.mp4').click()
    await button(page, '用于当前镜头').click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await exportFile(page, '当前镜头原始视频', '.tmp/phase3-video.mp4')
    assert.deepEqual(await readFile('.tmp/phase3-video.mp4'), await readFile('public/demo-media/waves.mp4'))

    await exportFile(page, '项目 JSON', '.tmp/phase3-project.json')
    const json = JSON.parse(await readFile('.tmp/phase3-project.json', 'utf8'))
    assert.equal(json.project.id, projectId)
    assert.equal(json.assets.length, 2)
    assert.equal(json.project.shots[0].annotations.length, 5)
    assert.equal(json.project.shots[0].annotations[0].text, '海岸取景 · 清晨')
    await exportFile(page, '分镜表 PDF', '.tmp/phase3-board.pdf')
    const pdf = await PDFDocument.load(await readFile('.tmp/phase3-board.pdf'))
    assert.equal(pdf.getPageCount(), 2)
    await exportFile(page, '项目 ZIP 备份', '.tmp/phase3-backup.zip')
    assert.equal((await readFile('.tmp/phase3-backup.zip')).toString('hex', 0, 4), '504b0304')
    console.log('PASS real edited project PNG, original video, JSON, two-page PDF and ZIP downloads')

    await link(page, '项目').click()
    const zip = page.getByLabel('ZIP 备份文件')
    await zip.setInputFiles({ name: 'broken.zip', mimeType: 'application/zip', buffer: Buffer.from('broken') })
    await page.getByRole('alert').filter({ hasText: /恢复失败/ }).waitFor()
    await zip.setInputFiles(resolve('.tmp/phase3-backup.zip'))
    await page.getByRole('heading', { name: '潮汐之前 恢复', exact: true }).waitFor()
    const restoredId = new URL(page.url()).hash.split('/')[2]
    assert.notEqual(restoredId, projectId)
    const restored = await getProject(page, restoredId)
    assert.equal(restored.shots[0].annotations.length, 5)
    assert.notEqual(restored.shots[0].assetId, json.project.shots[0].assetId)
    assert.equal((await getProject(page)).title, '潮汐之前')
    assert(restored.coverAssetId)
    await exportFile(page, '当前镜头 PNG', '.tmp/phase3-restored-shot.png')
    assert.deepEqual(await readFile('.tmp/phase3-restored-shot.png'), png)
    await button(page, '镜头 02 穿过松林').click()
    await exportFile(page, '当前镜头原始视频', '.tmp/phase3-restored-video.mp4')
    assert.deepEqual(await readFile('.tmp/phase3-restored-video.mp4'), await readFile('public/demo-media/waves.mp4'))
    console.log('PASS ZIP restore as a new project, restored media and invalid ZIP feedback')
    assert.deepEqual(errors, [])
  } catch (error) {
    await page.screenshot({ path: '.tmp/phase3-failure.png', fullPage: true }).catch(() => {})
    if (errors.length) console.error(errors)
    throw error
  } finally { await context.close() }
}




