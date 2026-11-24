import assert from 'node:assert/strict'
import { resolve } from 'node:path'

const button = (page, name) => page.getByRole('button', { name, exact: true })
const link = (page, name) => page.getByRole('link', { name, exact: true })
const track = (page, kind) => page.locator(`[data-track-kind="${kind}"]`)

async function enterNumber(page, label, value) {
  const field = page.getByRole('spinbutton', { name: label, exact: true })
  await field.fill(String(value))
  await field.press('Enter')
}

async function expectBlock(row, start, end) {
  const block = row.locator(`[data-start-frame="${start}"][data-end-frame="${end}"]`)
  await block.waitFor()
  return block
}

async function readProject(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('frameos-studio')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction(['projects', 'assets'])
      const project = transaction.objectStore('projects').get('before-the-tide')
      const assets = transaction.objectStore('assets').index('projectId').count('before-the-tide')
      transaction.oncomplete = () => { db.close(); resolve({ project: project.result, assetCount: assets.result }) }
      transaction.onabort = () => { db.close(); reject(transaction.error) }
    }
  }))
}

export async function testVideoWorkspace(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const errors = []
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })

  try {
    await page.goto(url + '/#/project/before-the-tide/board')
    const board = page.getByRole('heading', { name: '分镜画布', exact: true })
    const storyboardTimeline = page.getByRole('region', { name: '时间轴', exact: true })
    await board.waitFor()
    await storyboardTimeline.getByRole('button', { name: '镜头 01 雾中的海岸', exact: true }).waitFor()
    const legacy = (await readProject(page)).project
    assert.equal(legacy.video, undefined)

    const chooser = page.getByRole('heading', { name: 'Choose a template', exact: true })
    await link(page, 'Video').click()
    await chooser.waitFor()
    await page.reload()
    await chooser.waitFor()
    assert.equal((await readProject(page)).project.video, undefined)
    assert.deepEqual(await page.locator('[data-template]').evaluateAll(items => items.map(item => item.dataset.template)),
      ['talking-head', 'educational', 'short-form', 'documentary', 'cinematic-title'])
    await button(page, 'Talking head').click()
    const videoTimeline = page.getByRole('region', { name: 'Video timeline' })
    await videoTimeline.waitFor()
    assert.deepEqual((await page.locator('[data-track-kind]').evaluateAll(rows => rows.map(row => row.dataset.trackKind))).sort(),
      ['b-roll', 'captions', 'graphics', 'main-video', 'music', 'voice'])
    await page.getByText('1920 × 1080 · 16:9 · 30 fps', { exact: true }).waitFor()
    await page.getByText('shotweft video render project.zip --output final.mp4', { exact: true }).waitFor()
    await button(page, '撤销').click()
    await chooser.waitFor()
    assert.equal((await readProject(page)).project.video, undefined)
    await button(page, '重做').click()
    await videoTimeline.waitFor()
    const created = (await readProject(page)).project.video
    assert.deepEqual(created.template, { id: 'talking-head', revision: 1 })
    await page.reload()
    await videoTimeline.waitFor()
    assert.deepEqual((await readProject(page)).project.video, created)
    console.log('PASS Video route, five templates, six tracks, creation undo/redo, legacy storyboard, and reload')

    await page.getByLabel('Demo video', { exact: true }).selectOption({ label: 'Coastal Mist' })
    await button(page, 'Import demo video').click()
    await page.getByText('Imported Coastal Mist.mp4', { exact: true }).waitFor()
    await button(page, 'Import demo video').click()
    await page.getByText('Demo video is already in Project media.', { exact: true }).waitFor()
    assert.equal((await readProject(page)).assetCount, 1)
    await button(page, 'Add media clip').click()
    const main = track(page, 'main-video')
    await expectBlock(main, 0, 90)
    const preview = page.getByRole('region', { name: 'Video preview' })
    const movie = preview.locator('video[aria-label="Coastal Mist.mp4"]')
    await movie.waitFor()
    await page.waitForFunction(() => document.querySelector('.video-frame video')?.readyState >= 2)
    await button(page, 'Mute Presenter').click()
    await button(page, 'Unmute Presenter').waitFor()
    assert.equal(await movie.evaluate(element => element.muted), true)
    await button(page, 'Unmute Presenter').click()
    await button(page, 'Mute Presenter').waitFor()
    await button(page, 'Play video').click()
    await page.waitForFunction(() => {
      const video = document.querySelector('.video-frame video')
      const frame = document.querySelector('[aria-label="Playhead frame"]')
      return video && !video.paused && video.currentTime > 0 && Number(frame.value) >= 3
    })
    await button(page, 'Pause video').click()
    await enterNumber(page, 'Playhead frame', 12)
    await page.waitForFunction(() => Math.abs(document.querySelector('.video-frame video')?.currentTime - 0.4) < 0.01)
    await button(page, 'Full screen').click()
    await page.waitForFunction(() => document.fullscreenElement?.classList.contains('video-preview'))
    await button(page, 'Exit full screen').click()
    await page.waitForFunction(() => !document.fullscreenElement)

    await page.getByLabel('Import media file', { exact: true }).setInputFiles(resolve('public/demo-media/coastal-trail.jpg'))
    await page.getByText('Imported coastal-trail.jpg', { exact: true }).waitFor()
    await page.getByLabel('Destination track', { exact: true }).selectOption({ label: 'Voice' })
    assert.equal(await page.getByLabel('Media asset', { exact: true }).getByRole('option', { name: 'coastal-trail.jpg' }).count(), 0)
    await page.getByLabel('Destination track', { exact: true }).selectOption({ label: 'Graphics' })
    assert.equal(await page.getByLabel('Media asset', { exact: true }).getByRole('option', { name: 'Coastal Mist.mp4' }).count(), 0)
    await page.getByLabel('Destination track', { exact: true }).selectOption({ label: 'B-roll' })
    await button(page, 'Add media clip').click()
    await preview.getByRole('img', { name: 'coastal-trail.jpg' }).waitFor()
    await button(page, 'Hide B-roll').click()
    await preview.getByRole('img', { name: 'coastal-trail.jpg' }).waitFor({ state: 'hidden' })
    await button(page, 'Show B-roll').click()
    await preview.getByRole('img', { name: 'coastal-trail.jpg' }).waitFor()
    assert.equal((await readProject(page)).assetCount, 2)

    await button(page, 'Add lower third').click()
    await page.getByRole('textbox', { name: 'Graphic text', exact: true }).fill('Avery · Host')
    await preview.getByText('Avery · Host', { exact: true }).waitFor()
    await button(page, 'Add subtitle').click()
    await page.getByRole('textbox', { name: 'Subtitle text', exact: true }).fill('Welcome to the coast')
    await enterNumber(page, 'Cue start frame', 5)
    await expectBlock(track(page, 'captions'), 5, 72)
    await enterNumber(page, 'Cue end frame', 45)
    await expectBlock(track(page, 'captions'), 5, 45)
    await page.getByLabel('Caption position', { exact: true }).selectOption('top')
    await enterNumber(page, 'Caption font size', 62)
    await page.getByLabel('Caption color', { exact: true }).fill('#ffd000')
    await page.getByLabel('Caption background', { exact: true }).fill('#152740')
    const caption = preview.locator('.video-caption-top').getByText('Welcome to the coast', { exact: true })
    await caption.waitFor()
    await button(page, 'Hide Captions').click()
    await caption.waitFor({ state: 'hidden' })
    await button(page, 'Show Captions').click()
    await caption.waitFor()
    await enterNumber(page, 'Playhead frame', 45)
    await caption.waitFor({ state: 'hidden' })

    const subtitleFile = page.getByLabel('Import subtitle file', { exact: true })
    await subtitleFile.setInputFiles({
      name: 'closing.srt', mimeType: 'text/plain',
      buffer: Buffer.from('1\n00:00:03,000 --> 00:00:04,000\nImported SRT\n'),
    })
    await expectBlock(track(page, 'captions'), 90, 120)
    await subtitleFile.setInputFiles({
      name: 'closing.vtt', mimeType: 'text/vtt',
      buffer: Buffer.from('WEBVTT\n\n00:04.000 --> 00:05.000\nImported VTT\n'),
    })
    const vtt = await expectBlock(track(page, 'captions'), 120, 150)
    await vtt.click()
    await preview.getByText('Imported VTT', { exact: true }).waitFor()
    await button(page, 'Delete subtitle').click()
    await vtt.waitFor({ state: 'hidden' })
    await button(page, '撤销').click()
    await expectBlock(track(page, 'captions'), 120, 150)
    console.log('PASS real video playback, frame seek, fullscreen, media reuse and compatibility, overlays, and SRT/VTT captions')

    await (await expectBlock(main, 0, 90)).click()
    await page.getByRole('textbox', { name: 'Clip label', exact: true }).fill('Presenter take')
    await enterNumber(page, 'Source in frame', 5)
    await expectBlock(main, 0, 85)
    await enterNumber(page, 'Source out frame', 65)
    await expectBlock(main, 0, 60)
    await enterNumber(page, 'Volume (%)', 35)
    const muted = page.getByRole('checkbox', { name: 'Muted', exact: true })
    await muted.click()
    await muted.and(page.locator(':checked')).waitFor()
    await enterNumber(page, 'Playhead frame', 20)
    await button(page, 'Split at playhead').click()
    await expectBlock(main, 0, 20)
    await expectBlock(main, 20, 60)
    await enterNumber(page, 'Edit step (frames)', 2)
    await button(page, 'Trim start').click()
    await expectBlock(main, 22, 60)
    await button(page, 'Trim end').click()
    await expectBlock(main, 22, 58)
    await button(page, 'Move right').click()
    await expectBlock(main, 24, 60)
    await button(page, 'Move left').click()
    await expectBlock(main, 22, 58)
    await page.reload()
    await videoTimeline.waitFor()
    const restored = (await readProject(page)).project
    const savedClips = restored.video.tracks.find(item => item.kind === 'main-video').clips
    assert.deepEqual(savedClips.map(({ startFrame, durationFrames, sourceInFrame, sourceOutFrame, label, volume, muted }) =>
      [startFrame, durationFrames, sourceInFrame, sourceOutFrame, label, volume, muted]),
    [[0, 20, 5, 25, 'Presenter take', 0.35, true], [22, 36, 27, 63, 'Presenter take', 0.35, true]])
    assert.deepEqual(restored.video.subtitles[0].style, {
      position: 'top', fontSize: 62, color: '#ffd000', background: '#152740dd',
    })
    assert.deepEqual(restored.shots, legacy.shots)
    assert.deepEqual(restored.scenes, legacy.scenes)
    await (await expectBlock(main, 0, 20)).click()
    await enterNumber(page, 'Edit step (frames)', 3)
    await button(page, 'Move right').click()
    await page.getByText('Visual clips on a track cannot overlap', { exact: true }).waitFor()
    await expectBlock(main, 0, 20)

    const right = await expectBlock(main, 22, 58)
    await right.click()
    await button(page, 'Delete clip').click()
    await right.waitFor({ state: 'hidden' })
    await button(page, '撤销').click()
    await right.waitFor()
    await button(page, '重做').click()
    await right.waitFor({ state: 'hidden' })
    await page.reload()
    await expectBlock(main, 0, 20)
    assert.equal(await right.count(), 0)

    await link(page, '素材').click()
    await button(page, '预览 Coastal Mist.mp4').waitFor()
    await button(page, '预览示例 雾中的海岸').click()
    await button(page, '导入示例视频').click()
    await page.getByRole('dialog').getByRole('heading', { name: 'Coastal Mist.mp4', exact: true }).waitFor()
    assert.equal((await readProject(page)).assetCount, 2)
    await button(page, '关闭').click()
    await link(page, 'Video').click()
    await page.setViewportSize({ width: 390, height: 844 })
    await videoTimeline.waitFor()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Video workspace must fit at 390 px')
    await (await expectBlock(main, 0, 20)).click()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Video inspector must fit at 390 px')
    await link(page, '分镜').click()
    await board.waitFor()
    await storyboardTimeline.getByRole('button', { name: '镜头 01 雾中的海岸', exact: true }).waitFor()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    assert.deepEqual(errors, [], 'The browser must report no errors')
    console.log('PASS integer clip edits, overlap protection, undo/redo, reload, and 390 px Video and storyboard layout')
  } finally {
    await context.close()
  }
}
