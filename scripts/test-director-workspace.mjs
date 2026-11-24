import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { preview } from 'vite'

const work = resolve('.tmp/director-workspace')
await mkdir(work, { recursive: true })
process.env.TEMP = work
process.env.TMP = work
process.env.TMPDIR = work
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.browsers')
await access('dist/index.html').catch(() => { throw new Error('Run npm run build before npm run test:director-workspace.') })
const { chromium } = await import('playwright')

function syntheticWav(seconds) {
  const sampleRate = 8000
  const samples = seconds * sampleRate
  const bytes = Buffer.alloc(44 + samples * 2)
  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(bytes.length - 8, 4)
  bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(sampleRate, 24)
  bytes.writeUInt32LE(sampleRate * 2, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(samples * 2, 40)
  for (let sample = 0; sample < samples; sample++) {
    bytes.writeInt16LE(Math.round(2500 * Math.sin(2 * Math.PI * 220 * sample / sampleRate)), 44 + sample * 2)
  }
  return bytes
}

const wavPath = join(work, 'synthetic-tone.wav')
const wav = syntheticWav(4)
await writeFile(wavPath, wav)
const server = await preview({ preview: { host: '127.0.0.1', port: 0 } })
const base = new URL(server.resolvedUrls.local[0]).origin
const projectId = 'before-the-tide'

function projectData(page, directionAssetToRemove) {
  return page.evaluate(({ id, remove }) => new Promise((resolve, reject) => {
    const request = indexedDB.open('frameos-studio')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction(['projects', 'assets'], remove ? 'readwrite' : 'readonly')
      const assets = transaction.objectStore('assets')
      const project = transaction.objectStore('projects').get(id)
      const records = assets.index('projectId').getAll(id)
      if (remove) assets.delete(remove)
      transaction.oncomplete = () => { db.close(); resolve({ project: project.result, assets: records.result }) }
      transaction.onabort = () => { db.close(); reject(transaction.error) }
    }
  }), { id: projectId, remove: directionAssetToRemove })
}

const button = (host, name) => host.getByRole('button', { name, exact: true })
const label = (host, name) => host.getByLabel(name, { exact: true })
const visibleText = (host, text) => host.getByText(text, { exact: typeof text === 'string' }).waitFor({ state: 'visible' })

async function assertNoOverflow(page) {
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    page: document.documentElement.scrollWidth,
    panels: [...document.querySelectorAll('.director-layout .video-panel, .director-setup')]
      .filter(panel => panel.getBoundingClientRect().right > innerWidth + 1 || panel.scrollWidth > panel.clientWidth + 1)
      .map(panel => panel.getAttribute('aria-label')),
  }))
  assert(layout.page <= layout.viewport, JSON.stringify(layout))
  assert.deepEqual(layout.panels, [], JSON.stringify(layout))
}

let browser
try {
  browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const external = []
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== base) {
      external.push(url.href)
      return route.abort()
    }
    return route.continue()
  })
  await context.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL)
    const revoke = URL.revokeObjectURL.bind(URL)
    window.directorURLAudit = { created: new Set(), revoked: new Set() }
    URL.createObjectURL = blob => {
      const url = create(blob)
      window.directorURLAudit.created.add(url)
      return url
    }
    URL.revokeObjectURL = url => {
      window.directorURLAudit.revoked.add(url)
      revoke(url)
    }
  })
  const page = await context.newPage()
  page.setDefaultTimeout(10_000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('response', response => { if (response.status() >= 400) errors.push(response.status() + ' ' + response.url()) })

  try {
    await page.goto(base + '/#/project/' + projectId + '/video')
    const setup = page.getByRole('form', { name: 'Create Director plan' })
    const director = page.getByRole('region', { name: 'Director workspace' })
    const player = director.getByRole('region', { name: 'Director preview' })
    const legacy = page.getByRole('region', { name: 'Video timeline' })
    const switcher = page.getByRole('group', { name: 'Video editor' })
    await setup.waitFor()
    await page.getByRole('heading', { name: 'Choose a template' }).waitFor()
    await switcher.waitFor({ state: 'detached' })
    await page.setViewportSize({ width: 390, height: 844 })
    await assertNoOverflow(page)
    await page.setViewportSize({ width: 1440, height: 900 })

    const script = label(setup, 'Script')
    const scriptFile = label(setup, 'Script file (TXT, Markdown, JSON)')
    await scriptFile.setInputFiles({ name: 'test.txt', mimeType: 'text/plain', buffer: Buffer.from('Plain text narration.') })
    await page.waitForFunction(() => document.querySelector('.director-setup textarea')?.value === 'Plain text narration.')
    await scriptFile.setInputFiles({
      name: 'test.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
        title: 'JSON title', lines: [{ text: 'First line.\n\n' }, { text: '第二行。' }],
      })),
    })
    await page.waitForFunction(() => document.querySelector('.director-setup textarea')?.value === 'First line.\n\n第二行。')
    assert.equal(await label(setup, 'Title').inputValue(), 'JSON title')
    await scriptFile.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{') })
    await visibleText(setup, 'Invalid script JSON.')
    assert.equal(await script.inputValue(), 'First line.\n\n第二行。')

    const original = '# Coast briefing\r\n\r\n  Check the water before departure.\r\n\r\nWatch the shoreline to stay oriented. 海岸。 \r\n'
    await scriptFile.setInputFiles({ name: 'coast.md', mimeType: 'text/markdown', buffer: Buffer.from(original) })
    await page.waitForFunction(text => document.querySelector('.director-setup textarea')?.value === text, original.replaceAll('\r\n', '\n'))
    await label(setup, 'Title').fill('Coast workshop')
    await label(setup, 'Aspect ratio').selectOption('9:16')
    await label(setup, 'FPS numerator').fill('60')
    await label(setup, 'FPS denominator').fill('2')
    await button(setup, 'Generate Director plan').click()
    await visibleText(setup, /reduced rational/)
    await label(setup, 'FPS numerator').fill('30000')
    await label(setup, 'FPS denominator').fill('1001')
    await button(setup, 'Generate Director plan').click()
    await director.waitFor()
    await player.locator('[data-director-frame="0"]').waitFor()
    await visibleText(director, /Timing: Estimated · Narration: Unknown/)
    await legacy.waitFor({ state: 'detached' })
    await switcher.waitFor({ state: 'detached' })
    const generated = (await projectData(page)).project
    assert.equal(generated.activeTimeline, 'director')
    assert.equal(generated.video, undefined)
    assert.equal(generated.direction.originalScript, original)
    assert.equal(generated.direction.narration.text, original)
    assert.deepEqual(generated.direction.audio, [])
    assert.deepEqual(generated.direction.frameRate, { numerator: 30000, denominator: 1001 })
    assert.deepEqual(generated.direction.resolution, { width: 720, height: 1280 })
    await director.getByRole('heading', { name: 'Coast workshop' }).waitFor()
    console.log('PASS local TXT, JSON and Markdown import, validation, verbatim source and rational portrait plan generation')

    const shot = director.locator('[data-shot-id="shot-1"]')
    const before = generated.direction.shots[1]
    await shot.click()
    assert.equal(await shot.getAttribute('aria-pressed'), 'true')
    await player.locator('[data-director-frame="' + before.startFrame + '"]').waitFor()
    const purpose = label(director, 'Purpose')
    await purpose.fill('Show ')
    await purpose.pressSequentially('the coast')
    await visibleText(shot, 'Show the coast')
    await button(page, '撤销').click()
    await visibleText(shot, before.purpose)
    assert.equal(await purpose.inputValue(), before.purpose)
    await button(page, '重做').click()
    await visibleText(shot, 'Show the coast')

    const primary = label(director, 'Primary text')
    const tooLong = 'a'.repeat(241)
    await primary.fill(tooLong)
    await visibleText(director, /expected string to have <=240 characters/i)
    assert.equal(await primary.getAttribute('aria-invalid'), 'true')
    assert.equal(await primary.inputValue(), tooLong)
    assert.equal((await projectData(page)).project.direction.shots[1].visualElements[0].text, before.visualElements[0].text)
    await primary.fill('Read the coast')
    await visibleText(player, 'Read the coast')
    await label(director, 'Rationale').fill('Establish the shoreline as a reference.')
    await label(director, 'Continuity from previous shot').fill('Continue from the opening.')
    await label(director, 'Continuity to next shot').fill('Lead into the route.')
    await label(director, 'Scene type').selectOption('quote')
    await player.locator('[data-scene-type="quote"]').waitFor()
    await label(director, 'Camera').selectOption('slow-push')
    await visibleText(player, /requires static cameras/)
    assert.equal((await projectData(page)).project.direction.shots[1].camera, 'slow-push')
    await label(director, 'Camera').selectOption('static')
    await player.locator('[data-director-frame="' + before.startFrame + '"]').waitFor()

    await button(director, 'Lock shot').click()
    await visibleText(shot, 'Locked')
    const locked = (await projectData(page)).project.direction
    await button(director, 'Regenerate shot').click()
    await visibleText(director, 'This shot is locked. Unlock it before regenerating.')
    assert.deepEqual((await projectData(page)).project.direction, locked)
    await button(director, 'Unlock shot').click()
    await visibleText(shot, 'Unlocked')
    await button(director, 'Regenerate shot').click()
    await visibleText(director, 'Regenerated shot-1.')
    const edited = (await projectData(page)).project.direction
    assert.notEqual(edited.shots[1].visualElements[0].color, locked.shots[1].visualElements[0].color)
    assert.equal(edited.shots[1].purpose, 'Show the coast')
    assert.equal(edited.shots[1].rationale, 'Establish the shoreline as a reference.')
    assert.equal(edited.shots[1].continuity.previous, 'Continue from the opening.')
    assert.equal(edited.shots[1].continuity.next, 'Lead into the route.')
    assert.deepEqual(edited.shots[0], locked.shots[0])
    console.log('PASS shot selection seeks the Player, live inspector edits validate, undo groups typing, and regeneration honors locks')

    const openMedia = page.getByRole('link', { name: '素材', exact: true })
    await openMedia.click()
    await label(page, '上传素材文件').setInputFiles([
      resolve('public/demo-media/coastal-trail.jpg'), resolve('public/demo-media/coastal-mist.mp4'),
    ])
    await button(page, '预览 coastal-trail.jpg').waitFor()
    await button(page, '预览 coastal-mist.mp4').waitFor()
    await page.getByRole('link', { name: 'Video', exact: true }).click()
    await shot.click()
    const media = label(director, 'Project image or video')
    await media.selectOption({ label: 'coastal-trail.jpg' })
    await button(director, 'Add media layer').click()
    await visibleText(director, 'Added coastal-trail.jpg to shot-1.')
    await media.selectOption({ label: 'coastal-mist.mp4' })
    await label(director, 'Layer placement').selectOption('b-roll')
    await button(director, 'Add media layer').click()
    await visibleText(director, 'Added coastal-mist.mp4 to shot-1.')
    await page.waitForFunction(() => {
      const player = document.querySelector('.director-player')
      return player?.querySelector('img[src^="blob:"]')?.naturalWidth > 0 &&
        [...player.querySelectorAll('video[src^="blob:"]')].some(video => video.readyState >= 2 && video.muted)
    })
    await media.selectOption({ label: 'coastal-trail.jpg' })
    await label(director, 'Layer placement').selectOption('overlay')
    await button(director, 'Add media layer').click()
    await visibleText(director, 'Added coastal-trail.jpg to shot-1.')
    const mapped = (await projectData(page)).project.direction
    const layers = mapped.shots[1].mediaLayers
    assert.deepEqual(layers.map(layer => layer.kind), ['image', 'video', 'image'])
    assert.equal(layers[2].assetId, layers[0].assetId)
    assert.equal(layers[2].fit, 'contain')
    assert(layers[2].region.width < 1)
    assert.equal(mapped.assets.length, 2)
    assert(mapped.assets.every(asset => asset.projectAssetId && !asset.path))
    console.log('PASS imported project image and video render through blob URLs in the shared Player, with B-roll muted')

    const importAudio = label(director, 'Import narration (WAV, MP3, M4A)')
    await label(director, 'Narration origin').selectOption('synthetic')
    await importAudio.setInputFiles(wavPath)
    const measured = Math.floor(4 * 30000 / 1001)
    await visibleText(director, new RegExp('Timing: Actual · Narration: Synthetic · ' + measured + ' frames'))
    const actual = (await projectData(page)).project.direction
    assert.equal(actual.durationFrames, measured)
    assert.notEqual(actual.shots[1].startFrame, before.startFrame)
    assert.equal(actual.audio[0].durationFrames, measured)
    assert.equal(actual.narration.origin, 'synthetic')
    assert.equal(actual.originalScript, original)
    await player.locator('[data-director-frame="' + actual.shots[1].startFrame + '"]').waitFor()
    const audio = player.locator('audio[src^="blob:"]')
    await audio.waitFor({ state: 'attached' })
    const audioURL = await audio.getAttribute('src')
    const digest = await page.evaluate(async url => {
      const bytes = await (await fetch(url)).arrayBuffer()
      const hash = await crypto.subtle.digest('SHA-256', bytes)
      return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
    }, audioURL)
    assert.equal(digest, createHash('sha256').update(wav).digest('hex'))
    await button(page, '撤销').click()
    await visibleText(director, /Timing: Estimated · Narration: Unknown/)
    await audio.waitFor({ state: 'detached' })
    await page.waitForFunction(url => window.directorURLAudit.revoked.has(url), audioURL)
    await button(page, '重做').click()
    await visibleText(director, /Timing: Actual · Narration: Synthetic/)
    await audio.waitFor({ state: 'attached' })
    assert.deepEqual((await projectData(page)).project.direction, actual)
    await page.reload()
    await visibleText(director, /Timing: Actual · Narration: Synthetic/)
    await shot.click()
    await visibleText(shot, 'Show the coast')
    await player.locator('[data-director-frame="' + actual.shots[1].startFrame + '"]').waitFor()
    await audio.waitFor({ state: 'attached' })
    console.log('PASS synthetic WAV import preserves bytes, reflows shot starts and duration, and persists linked media through undo, redo and reload')

    await page.setViewportSize({ width: 390, height: 844 })
    await assertNoOverflow(page)
    await page.screenshot({ path: join(work, 'director-390.png'), fullPage: true })
    await button(page, 'Create legacy timeline').click()
    const template = page.getByRole('dialog', { name: 'Create legacy timeline' })
    await button(template, 'Talking head').click()
    await legacy.waitFor()
    await director.waitFor({ state: 'detached' })
    await template.waitFor({ state: 'detached' })
    assert.equal(await button(switcher, 'Legacy timeline').getAttribute('aria-pressed'), 'true')
    const withLegacy = (await projectData(page)).project
    assert.equal(withLegacy.activeTimeline, 'video')
    assert.deepEqual(withLegacy.direction, actual)
    await button(switcher, 'Director plan').click()
    await director.waitFor()
    await legacy.waitFor({ state: 'detached' })
    await shot.click()
    await page.waitForFunction(() => {
      const preview = document.querySelector('.director-player')
      return preview && ['img', 'video', 'audio'].every(tag => preview.querySelector(tag + '[src^="blob:"]'))
    })
    // Remotion adds a time fragment to video URLs. The browser owns the underlying blob URL.
    const urls = await player.locator('img[src^="blob:"], video[src^="blob:"], audio[src^="blob:"]')
      .evaluateAll(elements => [...new Set(elements.map(element => element.src.split('#', 1)[0]))])
    assert.equal(urls.length, 3)
    assert(await page.evaluate(sources => sources.every(url =>
      window.directorURLAudit.created.has(url) && !window.directorURLAudit.revoked.has(url)), urls))
    await button(player, 'Play video').click()
    await page.waitForFunction(() => [...document.querySelectorAll('.director-player audio[src^="blob:"]')].some(sound => !sound.paused))
    const playing = await audio.elementHandle()
    await button(switcher, 'Legacy timeline').click()
    await director.waitFor({ state: 'detached' })
    await legacy.waitFor()
    assert(await playing.evaluate(element => element.paused), 'Unmounting the Player must stop playback')
    await playing.dispose()
    await page.waitForFunction(sources => sources.every(url =>
      window.directorURLAudit.created.has(url) && window.directorURLAudit.revoked.has(url)), urls)
    await assertNoOverflow(page)
    await page.reload()
    await legacy.waitFor()
    await director.waitFor({ state: 'detached' })
    assert.deepEqual((await projectData(page)).project.video, withLegacy.video)
    await button(switcher, 'Director plan').click()
    await director.waitFor()
    await legacy.waitFor({ state: 'detached' })
    await assertNoOverflow(page)
    console.log('PASS 390 px layouts, explicit editor creation and exclusive switching, persisted active editor, playback stop and URL revocation')

    const removed = actual.assets.find(asset => asset.kind === 'image').projectAssetId
    await projectData(page, removed)
    await page.reload()
    await visibleText(player, /Missing media for asset/)
    await player.locator('[data-director-frame]').waitFor({ state: 'detached' })
    assert.deepEqual(external, [])
    assert.deepEqual(errors, [])
    console.log('PASS missing project media reports a visible error, with zero external requests or browser errors')
  } catch (error) {
    await page.screenshot({ path: join(work, 'failure.png'), fullPage: true }).catch(() => {})
    throw error
  }
} finally {
  if (browser) await browser.close()
  await server.close()
}
