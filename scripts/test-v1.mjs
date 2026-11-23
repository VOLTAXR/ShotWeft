import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { BlobReader, BlobWriter, TextReader, TextWriter, ZipReader, ZipWriter } from '@zip.js/zip.js'

const shot1 = '镜头 01 雾中的海岸'
const shot2 = '镜头 02 穿过松林'
const directory = 'docs/screenshots/v1.0'
const button = (page, name) => page.getByRole('button', { name, exact: true })
const link = (page, name) => page.getByRole('link', { name, exact: true })
const shotTab = (page, name, heading) => link(page, name).click().then(() =>
  page.getByRole('heading', { name: heading, exact: true }).waitFor(),
)

async function saved(page) {
  await page.getByText('已保存在本地', { exact: true }).waitFor()
}

async function renderShotReady(page) {
  await page.waitForFunction(() => {
    const screen = document.querySelector('.monitor-frame')
    return screen?.getBoundingClientRect().width > 100 && !screen.querySelector('.image-empty')
  })
}

async function downloadBackup(page) {
  await button(page, '导出').click()
  const download = page.waitForEvent('download')
  await button(page, '项目 ZIP 备份').click()
  await (await download).saveAs('.tmp/v1.0-workflow.zip')
}

async function omittedPhotoZip(original) {
  const reader = new ZipReader(new BlobReader(new Blob([original])))
  const writer = new ZipWriter(new BlobWriter('application/zip'))
  try {
    for (const entry of await reader.getEntries()) {
      if (entry.directory || entry.filename.startsWith('photos/')) continue
      if (entry.filename === 'project.json') {
        const data = JSON.parse(await entry.getData(new TextWriter()))
        data.bundledPhotos = []
        await writer.add(entry.filename, new TextReader(JSON.stringify(data)), { level: 0, useWebWorkers: false })
      } else {
        await writer.add(entry.filename, new BlobReader(await entry.getData(new BlobWriter())), { level: 0, useWebWorkers: false })
      }
    }
    const bad = await writer.close()
    return Buffer.from(await bad.arrayBuffer())
  } finally { await reader.close() }
}

export async function testV1(browser, url) {
  await mkdir(directory, { recursive: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  const page = await context.newPage()
  const errors = []
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('response', response => { if (response.status() >= 400) errors.push(response.status() + ' ' + response.url()) })
  const capture = name => page.screenshot({ path: directory + '/' + name + '.png', animations: 'disabled' })

  try {
    await page.goto(url)
    await page.getByRole('heading', { name: '项目工作台' }).waitFor()
    assert.match(await page.title(), /FrameOS Studio V1\.0/)
    await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0))
    await capture('01-workspace')
    await button(page, '新建项目').click()
    await page.getByRole('textbox', { name: '项目名称' }).fill('海岸拍摄计划')
    await page.getByRole('radio', { name: '16:9' }).check()
    await capture('02-new-project')
    await button(page, '取消').click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })

    await link(page, '打开工作台').click()
    await page.getByRole('heading', { name: '分镜画布' }).waitFor()
    await renderShotReady(page)
    await button(page, '项目操作').click()
    await button(page, '重命名').waitFor()
    await page.getByRole('heading', { name: '分镜画布' }).click()
    await button(page, '重命名').waitFor({ state: 'hidden' })
    await button(page, '导出').click()
    await button(page, '当前镜头 PNG').waitFor()
    await page.keyboard.press('Escape')
    await button(page, '当前镜头 PNG').waitFor({ state: 'hidden' })
    assert(await button(page, '导出').evaluate(element => document.activeElement === element))

    await page.getByLabel('预演进度').fill('3.5')
    await page.waitForFunction(() => Number(document.querySelector('.playhead')?.dataset.position) > 3)
    await page.getByLabel('时长（秒）').fill('1')
    await page.waitForFunction(() => Number(document.querySelector('.playhead')?.dataset.position) <= 1)
    assert.equal(await button(page, shot1).getAttribute('aria-pressed'), 'true')
    await saved(page)
    await page.getByLabel('时长（秒）').fill('5')
    await page.getByLabel('时长（秒）').press('Tab')
    await saved(page)
    console.log('PASS V1.0 menu dismissal, keyboard focus and trimmed shot time')

    await shotTab(page, '剧本', '剧本与场景')
    await capture('03-script')
    await shotTab(page, '镜头', '镜头列表')
    await capture('04-shot-list')
    await shotTab(page, '分镜', '分镜画布')
    await renderShotReady(page)
    const surface = page.locator('.monitor-frame .konvajs-content')
    const area = await surface.boundingBox()
    await button(page, '添加文字').click()
    await page.mouse.click(area.x + area.width * 0.12, area.y + area.height * 0.19)
    await page.getByLabel('标注文字').fill('海平线取景')
    await page.getByLabel('图层名称').fill('取景说明')
    await button(page, '选择图层 取景说明').waitFor()
    await button(page, '绘制矩形').click()
    await page.mouse.move(area.x + area.width * 0.34, area.y + area.height * 0.39)
    await page.mouse.down()
    await page.mouse.move(area.x + area.width * 0.62, area.y + area.height * 0.72, { steps: 14 })
    await page.mouse.up()
    await button(page, '选择图层 矩形').waitFor()
    await capture('05-annotation')
    await button(page, '选择图层 取景说明').click()
    await page.getByLabel('标注文字').waitFor()
    await capture('06-layers')

    await shotTab(page, '素材', '素材库')
    await page.getByLabel('上传素材文件').setInputFiles([resolve('public/demo-media/afterglow.jpg'), resolve('public/demo-media/waves.mp4')])
    await button(page, '预览 waves.mp4').waitFor()
    await capture('07-media')
    await button(page, '预览 afterglow.jpg').click()
    await button(page, '用于当前镜头').click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await shotTab(page, '分镜', '分镜画布')
    await button(page, '镜头').click()
    await button(page, '裁切工具').click()
    await renderShotReady(page)
    await page.getByLabel('裁切缩放').press('ArrowRight')
    await saved(page)
    await capture('08-image-crop')

    await button(page, shot2).click()
    await shotTab(page, '素材', '素材库')
    await button(page, '预览 waves.mp4').click()
    await button(page, '用于当前镜头').click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await button(page, '预览 waves.mp4').click()
    const video = page.getByLabel('素材视频')
    await video.evaluate(video => new Promise(resolve => {
      video.addEventListener('seeked', resolve, { once: true })
      video.currentTime = 1.4
    }))
    await button(page, '提取关键帧').click()
    await page.getByRole('dialog').getByText('关键帧已保存为分镜画面').waitFor()
    await capture('09-video-frame')
    await button(page, '关闭').click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await shotTab(page, '预演', '动态预演')
    await button(page, '播放').click()
    await page.waitForFunction(() => document.querySelector('video[aria-label="时间轴视频"]')?.currentTime > 0.2)
    await button(page, '暂停').click()
    await capture('10-preview')

    await button(page, '导出').click()
    await button(page, '当前镜头原始视频').waitFor()
    await capture('11-export')
    await page.keyboard.press('Escape')
    await downloadBackup(page)
    const backup = await readFile('.tmp/v1.0-workflow.zip')
    const reader = new ZipReader(new BlobReader(new Blob([backup])))
    const manifest = (await reader.getEntries()).find(entry => entry.filename === 'project.json')
    const payload = JSON.parse(await manifest.getData(new TextWriter()))
    await reader.close()
    assert.equal(payload.softwareVersion, 'V1.0')
    assert.equal(payload.version, 1)

    await link(page, '项目').click()
    const archive = page.getByLabel('ZIP 备份文件')
    await archive.setInputFiles({ name: '缺少照片.zip', mimeType: 'application/zip', buffer: await omittedPhotoZip(backup) })
    await page.getByRole('alert').filter({ hasText: 'ZIP 缺少项目引用的示例照片' }).waitFor()
    await archive.setInputFiles(resolve('.tmp/v1.0-workflow.zip'))
    await page.getByRole('heading', { name: '潮汐之前 恢复', exact: true }).waitFor()
    await renderShotReady(page)
    await capture('12-restored')
    assert.deepEqual(errors, [])
    console.log('PASS V1.0 real browser workflow, screenshot evidence, video frame and ZIP recovery')
  } catch (error) {
    await page.screenshot({ path: '.tmp/v1.0-browser-failure.png', fullPage: true }).catch(() => {})
    if (errors.length) console.error(errors)
    throw error
  } finally { await context.close() }
}
