import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const button = (page, name) => page.getByRole('button', { name, exact: true })
const link = (page, name) => page.getByRole('link', { name, exact: true })
const text = (page, name) => page.getByRole('textbox', { name, exact: true })

async function changeTab(page, name, heading) {
  await link(page, name).click()
  await page.getByRole('heading', { name: heading, exact: true }).waitFor()
}

async function saved(page) {
  await page.getByText('已保存在本地', { exact: true }).waitFor()
}

async function dragAcross(page, first, target, axis = 'x') {
  const from = await first.boundingBox()
  const to = await target.boundingBox()
  assert(from && to)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  const offsetX = axis === 'x' ? Math.sign(to.x - from.x) * 15 : 0
  const offsetY = axis === 'y' ? Math.sign(to.y - from.y) * 14 : 0
  await page.mouse.move(to.x + to.width / 2 + offsetX, to.y + to.height / 2 + offsetY, { steps: 27 })
  await page.mouse.up()
}

async function waitForValue(locator, value) {
  const finish = Date.now() + 7000
  let current
  do {
    current = await locator.inputValue({ timeout: 500 }).catch(() => undefined)
    if (current === value) return
    await delay(50)
  } while (Date.now() < finish)
  assert.equal(current, value)
}

export async function testPhaseTwo(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('response', response => { if (response.status() >= 400) errors.push(response.status() + ' ' + response.url()) })

  try {
    await context.route(url + '/migration-fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Migration</title>' }))
    await page.goto(url + '/migration-fixture')
    await page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open('frameos-studio', 10)
      request.onupgradeneeded = () => {
        const database = request.result
        const projects = database.createObjectStore('projects', { keyPath: 'id' })
        projects.createIndex('updated', 'updated')
        database.createObjectStore('settings', { keyPath: 'id' }).add({ id: 'seeded' })
        projects.add({
          id: 'phase-one-project', title: '潮汐之前 · 导演工作稿', frame: '16:9', updated: Date.now(), archived: false,
          scenes: [{ id: 'old-scene', location: '旧海岸', setting: '外景', time: '日', description: '', dialogue: '', notes: '' }],
          shots: [{ id: 'old-shot', sceneId: 'old-scene', title: '旧镜头与底图', size: '远景', angle: '平视',
            movement: '固定', lens: '35mm', duration: 4, notes: '', media: '/demo-media/before-the-tide.jpg' }],
        })
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => { request.result.close(); resolve() }
    }))
    await page.goto(url)
    await link(page, '打开项目 潮汐之前 · 导演工作稿').click()
    await page.getByRole('heading', { name: '潮汐之前 · 导演工作稿', exact: true }).waitFor()
    await page.locator('.crop-surface').waitFor()
    await button(page, '镜头 01 旧镜头与底图').waitFor()
    await changeTab(page, '剧本', '剧本与场景')
    await button(page, '添加场景').click()
    const newScene = button(page, '02 未命名场景')
    const sceneId = await newScene.getAttribute('data-scene-id')
    await page.locator('.scene-form[data-scene-id="' + sceneId + '"]').getByRole('textbox', { name: '地点' }).fill('新海岸')
    await button(page, '02 新海岸').waitFor()
    await text(page, '对白').fill('等下一次退潮')
    await saved(page)
    await page.reload()
    await button(page, '02 新海岸').click()
    await waitForValue(text(page, '对白'), '等下一次退潮')
    await button(page, '排序场景 2').press('ArrowUp')
    await button(page, '01 新海岸').waitFor()
    await button(page, '02 旧海岸').click()
    await button(page, '删除场景').click()
    await button(page, '确认删除场景').click()
    await button(page, '02 旧海岸').waitFor({ state: 'hidden' })
    await changeTab(page, '分镜', '分镜画布')
    await waitForValue(page.getByRole('combobox', { name: '所属场景' }), '')
    await button(page, '撤销').click()
    await waitForValue(page.getByRole('combobox', { name: '所属场景' }), 'old-scene')
    console.log('PASS phase 1 migration, scene autosave, scene reordering, deletion and undo')

    await text(page, '镜头名称').fill('潮头近景')
    await button(page, '镜头 01 潮头近景').waitFor()
    await text(page, '景别').fill('特写')
    await text(page, '角度').fill('俯拍')
    await text(page, '运镜').fill('横移')
    await text(page, '焦距').fill('70mm')
    await text(page, '时长（秒）').fill('0.6')
    await text(page, '拍摄备注').fill('注意浪头位置')
    await button(page, '复制镜头').click()
    await button(page, '镜头 02 潮头近景 副本').waitFor()
    await button(page, '添加镜头').click()
    await button(page, '镜头 03 未命名镜头').waitFor()
    await dragAcross(page, button(page, '排序时间轴镜头 1'), button(page, '排序时间轴镜头 3'))
    await button(page, '镜头 03 潮头近景').waitFor()
    await saved(page)
    await button(page, '撤销').click()
    await button(page, '镜头 01 潮头近景').waitFor()
    await button(page, '重做').click()
    await button(page, '镜头 03 潮头近景').waitFor()
    await changeTab(page, '镜头', '镜头列表')
    await link(page, '潮头近景').waitFor()
    await dragAcross(page, button(page, '排序镜头 3'), button(page, '排序镜头 1'), 'y')
    await button(page, '镜头 01 潮头近景').waitFor()
    await saved(page)
    await page.keyboard.press('Control+z')
    await button(page, '镜头 03 潮头近景').waitFor()
    await page.screenshot({ path: 'docs/screenshots/04-shot-order.png', animations: 'disabled' })
    await button(page, '删除镜头 01').click()
    await button(page, '镜头 01 未命名镜头').waitFor()
    await button(page, '撤销').click()
    await button(page, '镜头 01 潮头近景 副本').waitFor()
    await page.reload()
    await button(page, '镜头 03 潮头近景').waitFor()
    await page.waitForFunction(() => !document.querySelector('button[aria-label="重做"]')?.disabled)
    console.log('PASS shot copy, mouse drag, shared order, undo/redo and refresh')

    await link(page, '潮头近景').click()
    await page.getByRole('heading', { name: '分镜画布' }).waitFor()
    await waitForValue(text(page, '焦距'), '70mm')
    await waitForValue(text(page, '拍摄备注'), '注意浪头位置')
    await changeTab(page, '素材', '素材库')
    const upload = page.getByLabel('上传素材文件')
    await upload.setInputFiles([
      resolve('public/demo-media/afterglow.jpg'), resolve('public/demo-media/waves.mp4'),
    ])
    await button(page, '预览 afterglow.jpg').waitFor()
    await button(page, '预览 waves.mp4').waitFor()
    await button(page, '预览 afterglow.jpg').click()
    await page.getByRole('img', { name: 'afterglow.jpg' }).waitFor()
    await button(page, '用于当前镜头').click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await changeTab(page, '分镜', '分镜画布')
    const surface = page.locator('.crop-surface')
    await surface.waitFor()
    const canvas = page.locator('.monitor-frame canvas').first()
    const original = await canvas.evaluate(element => element.toDataURL())
    const zoom = page.getByLabel('裁切缩放')
    await zoom.press('End')
    await saved(page)
    await waitForValue(zoom, '3')
    const zoomed = await canvas.evaluate(element => element.toDataURL())
    assert.notEqual(zoomed, original)
    const shotArea = await surface.boundingBox()
    assert(shotArea)
    await page.mouse.move(shotArea.x + shotArea.width / 2, shotArea.y + shotArea.height / 2)
    await page.mouse.down()
    await page.mouse.move(shotArea.x + shotArea.width * 0.62, shotArea.y + shotArea.height * 0.55, { steps: 12 })
    await page.mouse.up()
    await saved(page)
    const cropped = await canvas.evaluate(element => element.toDataURL())
    assert.notEqual(cropped, zoomed)
    await page.reload()
    await surface.waitFor()
    await waitForValue(zoom, '3')
    assert.equal(await canvas.evaluate(element => element.toDataURL()), cropped)
    await button(page, '撤销').click()
    await page.waitForFunction(zoomed => document.querySelector('.monitor-frame canvas')?.toDataURL() === zoomed, zoomed)
    await button(page, '重做').click()
    await page.waitForFunction(cropped => document.querySelector('.monitor-frame canvas')?.toDataURL() === cropped, cropped)
    await page.screenshot({ path: 'docs/screenshots/05-image-crop.png', animations: 'disabled' })
    console.log('PASS real JPEG upload, preview, canvas zoom/pan, persistence and undo')

    await button(page, '镜头 02 未命名镜头').click()
    await changeTab(page, '素材', '素材库')
    await button(page, '预览 waves.mp4').click()
    const player = page.getByLabel('素材视频')
    await player.waitFor()
    await player.evaluate(async video => { video.muted = true; await video.play() })
    await page.waitForFunction(() => {
      const video = document.querySelector('video[aria-label="素材视频"]')
      return video && video.currentTime > 0.3 && video.videoWidth > 100 && !video.paused
    })
    await button(page, '用于当前镜头').click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await button(page, '预览 waves.mp4').click()
    await page.waitForFunction(() => document.querySelector('video[aria-label="素材视频"]')?.readyState >= 2)
    await player.evaluate(video => { video.currentTime = 1.5 })
    await page.waitForFunction(() => {
      const video = document.querySelector('video[aria-label="素材视频"]')
      return video && !video.seeking && Math.abs(video.currentTime - 1.5) < 0.07
    })
    await button(page, '提取关键帧').click()
    await page.getByRole('dialog').getByText('关键帧已保存为分镜画面').waitFor()
    await page.screenshot({ path: 'docs/screenshots/06-video-keyframe.png', animations: 'disabled' })
    await button(page, '关闭').click()
    await page.getByRole('button', { name: /^预览 waves · 1\.50 秒帧/ }).waitFor()
    await changeTab(page, '分镜', '分镜画布')
    await page.locator('.crop-surface').waitFor()
    const frame = await canvas.evaluate(element => element.toDataURL())
    await page.reload()
    await page.locator('.crop-surface').waitFor()
    assert.equal(await canvas.evaluate(element => element.toDataURL()), frame)
    await changeTab(page, '预演', '动态预演')
    await button(page, '镜头 01 潮头近景 副本').click()
    await button(page, '播放').click()
    await page.waitForFunction(() => {
      const video = document.querySelector('video[aria-label="时间轴视频"]')
      return video && !video.paused && video.currentTime > 0.2
    })
    await button(page, '暂停').click()
    await page.waitForFunction(() => document.querySelector('video[aria-label="时间轴视频"]')?.paused)
    console.log('PASS real MP4 upload, playback, seeking, extraction, refresh and mixed sequence')

    await changeTab(page, '素材', '素材库')
    await upload.setInputFiles({ name: '损坏.mp4', mimeType: 'video/mp4', buffer: Buffer.from('invalid') })
    await page.getByRole('alert').filter({ hasText: /浏览器无法解码/ }).waitFor()
    await page.getByRole('button', { name: '预览示例 雾中的海岸' }).click()
    await page.waitForFunction(() => document.querySelector('video[aria-label="素材视频"]')?.videoWidth > 100)
    await button(page, '导入示例视频').click()
    await page.getByRole('heading', { name: '雾中的海岸.mp4' }).waitFor()
    await button(page, '关闭').click()
    await button(page, '预览 雾中的海岸.mp4').waitFor()
    console.log('PASS corrupt upload feedback and locally bundled video')

    await button(page, '项目操作').click()
    await button(page, '复制项目').click()
    await page.getByRole('heading', { name: '潮汐之前 · 导演工作稿 副本', exact: true }).waitFor()
    await button(page, '镜头 02 未命名镜头').click()
    await page.locator('.crop-surface').waitFor()
    assert.equal(await canvas.evaluate(element => element.toDataURL()), frame)
    await changeTab(page, '素材', '素材库')
    await button(page, '预览 waves.mp4').waitFor()
    console.log('PASS duplicate remaps persisted image, video and extracted-frame references')

    assert.deepEqual(errors, [], 'Phase 2 browser must report no console or request errors')
  } catch (error) {
    await page.screenshot({ path: '.tmp/phase2-failure.png', fullPage: true }).catch(() => {})
    if (errors.length) console.error(errors)
    throw error
  } finally {
    await context.close()
  }
}






