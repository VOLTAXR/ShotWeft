import assert from 'node:assert/strict'
import { readFile, truncate, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BlobReader, BlobWriter, TextReader, TextWriter, ZipReader, ZipWriter } from '@zip.js/zip.js'

const button = (page, name) => page.getByRole('button', { name, exact: true })
const link = (page, name) => page.getByRole('link', { name, exact: true })
const block = (page, kind, start, end) =>
  page.locator(`[data-track-kind="${kind}"] [data-start-frame="${start}"][data-end-frame="${end}"]`)

async function enterFrame(page, label, value) {
  const field = page.getByRole('spinbutton', { name: label, exact: true })
  await field.fill(String(value))
  await field.press('Enter')
}

async function readZIP(path) {
  const reader = new ZipReader(new BlobReader(new Blob([await readFile(path)])))
  try {
    const entries = new Map((await reader.getEntries()).map(entry => [entry.filename, entry]))
    const manifest = JSON.parse(await entries.get('project.json').getData(new TextWriter(), { checkSignature: true }))
    entries.delete('project.json')
    const files = new Map()
    for (const [name, entry] of entries) files.set(name, await entry.getData(new BlobWriter(), { checkSignature: true }))
    return { manifest, files }
  } finally {
    await reader.close()
  }
}

async function exportZIP(page, path) {
  await button(page, '导出').click()
  const download = page.waitForEvent('download')
  await button(page, '项目 ZIP 备份').click()
  await (await download).saveAs(path)
  return readZIP(path)
}

async function checkMedia(archive, sources) {
  const { manifest, files } = archive
  assert.equal(manifest.version, 2)
  const items = manifest.assets.filter(asset => asset.kind === 'audio')
  assert.equal(items.length, sources.length)
  const thumbnails = new Map()
  for (const source of sources) {
    const asset = items.find(item => item.name === source.name)
    assert(asset)
    assert.equal(asset.projectId, manifest.project.id)
    assert.equal(asset.width, undefined)
    assert.equal(asset.height, undefined)
    assert.equal(asset.originalType, source.type)
    assert.equal(asset.originalBytes, source.bytes.length)
    assert(Math.abs(asset.duration - source.duration) < 0.08, source.name + ' duration: ' + asset.duration)
    const index = manifest.assets.indexOf(asset)
    assert.deepEqual(Buffer.from(await files.get('media/' + index + '/original').arrayBuffer()), source.bytes)
    assert.equal(asset.thumbnailType, 'image/png')
    const thumbnail = Buffer.from(await files.get('media/' + index + '/thumbnail').arrayBuffer())
    assert.deepEqual(thumbnail.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    assert.equal(thumbnail.length, asset.thumbnailBytes)
    assert.deepEqual([thumbnail.readUInt32BE(16), thumbnail.readUInt32BE(20)], [320, 144])
    thumbnails.set(asset.name, thumbnail)
  }
  assert.equal([...files.keys()].filter(name => name.endsWith('/original')).length, manifest.assets.length)
  return thumbnails
}

async function rejectBadUploads(page, upload, sources, directory) {
  const [wav, mp3, m4a] = sources
  const unsupported = Buffer.from(wav.bytes)
  unsupported.writeUInt16LE(0xffff, 20)
  await upload.setInputFiles([
    { name: 'wrong-mime.wav', mimeType: mp3.type, buffer: wav.bytes },
    { name: 'wrong-extension.aac', mimeType: m4a.type, buffer: m4a.bytes },
    { name: 'wrong-signature.m4a', mimeType: m4a.type, buffer: wav.bytes },
    { name: 'bad-frame.mp3', mimeType: mp3.type, buffer: Buffer.from([0xff, 0xfb, 0xfc, 0x00, 0, 0]) },
    { name: 'truncated.wav', mimeType: wav.type, buffer: wav.bytes.subarray(0, 44) },
    { name: 'empty.wav', mimeType: wav.type, buffer: Buffer.alloc(0) },
    { name: 'unsupported.wav', mimeType: wav.type, buffer: unsupported },
  ])
  const error = page.getByRole('alert').filter({ hasText: 'wrong-mime.wav' })
  await error.waitFor()
  const message = await error.textContent()
  for (const expected of [
    'wrong-mime.wav · The MIME type does not match', 'wrong-extension.aac · Choose a WAV, MP3, or M4A',
    'wrong-signature.m4a · Invalid M4A file signature', 'bad-frame.mp3 · Invalid MP3 file signature',
    'truncated.wav · Invalid WAV file signature', 'empty.wav · Audio files must be between',
    'unsupported.wav · This browser could not decode the audio',
  ]) assert(message.includes(expected), message)
  const large = join(directory, 'large.wav')
  await writeFile(large, '')
  await truncate(large, 60 * 1024 * 1024 + 1)
  await upload.setInputFiles(large)
  await page.getByRole('alert').filter({ hasText: 'large.wav · Audio files must be between' }).waitFor()
}

async function checkPreview(page, source) {
  await button(page, 'Preview ' + source.name).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('img', { name: 'Waveform placeholder' }).waitFor()
  await dialog.getByText(new RegExp(source.id.toUpperCase() + ' · 3\\.\\d+ s · [\\d,]+ bytes')).waitFor()
  const preview = dialog.locator('audio[controls]')
  const element = await preview.elementHandle()
  await page.waitForFunction(audio => audio.readyState >= 1, element)
  const url = await element.evaluate(audio => audio.src)
  await element.evaluate(audio => audio.play())
  await page.waitForFunction(audio => !audio.paused && audio.currentTime > 0.1, element)
  await element.evaluate(audio => {
    audio.pause()
    audio.currentTime = 1.25
  })
  await page.waitForFunction(audio => audio.paused && !audio.seeking && Math.abs(audio.currentTime - 1.25) < 0.05, element)
  await element.evaluate(audio => audio.play())
  await button(page, '关闭').click()
  await dialog.waitFor({ state: 'hidden' })
  assert(await element.evaluate(audio => audio.paused && !audio.hasAttribute('src')))
  assert(await page.evaluate(url => fetch(url).then(() => false, () => true), url), 'Closed preview must revoke its object URL')
}

async function checkTimelinePlayback(page, voice, music) {
  const player = page.getByRole('region', { name: 'Video preview' })
  const voiceAudio = player.locator(`audio[aria-label="${voice.name}"]`)
  const musicAudio = player.locator(`audio[aria-label="${music.name}"]`)
  await enterFrame(page, 'Playhead frame', 45)
  const outgoing = await voiceAudio.elementHandle()
  const bed = await musicAudio.elementHandle()
  await page.waitForFunction(([voice, music]) => voice.paused && music.paused && !voice.seeking && !music.seeking &&
    Math.abs(voice.currentTime - 1.5) < 0.02 && Math.abs(music.currentTime - 0.9) < 0.02, [outgoing, bed])
  assert.equal(await outgoing.evaluate(audio => audio.volume), 0.4)
  const mute = page.getByRole('checkbox', { name: 'Muted', exact: true })
  await mute.click()
  await page.waitForFunction(name => document.querySelector(`.video-frame audio[aria-label="${name}"]`)?.muted, voice.name)
  await mute.click()
  await page.waitForFunction(name => document.querySelector(`.video-frame audio[aria-label="${name}"]`)?.muted === false, voice.name)
  await button(page, 'Mute Music').click()
  await page.waitForFunction(name => document.querySelector(`.video-frame audio[aria-label="${name}"]`)?.muted, music.name)
  await button(page, 'Unmute Music').click()
  await page.waitForFunction(name => document.querySelector(`.video-frame audio[aria-label="${name}"]`)?.muted === false, music.name)
  await button(page, 'Play video').click()
  await page.waitForFunction(() => {
    const audio = [...document.querySelectorAll('.video-frame audio')]
    return audio.length === 2 && audio.every(element => !element.paused && element.currentTime > 0.95)
  })
  const playingVoice = await voiceAudio.elementHandle()
  await enterFrame(page, 'Playhead frame', 95)
  await button(page, 'Play video').waitFor()
  await voiceAudio.waitFor({ state: 'detached' })
  assert(await playingVoice.evaluate(audio => audio.paused && !audio.hasAttribute('src')))
  await page.waitForFunction(name => {
    const audio = document.querySelector(`.video-frame audio[aria-label="${name}"]`)
    return audio?.paused && !audio.seeking && Math.abs(audio.currentTime - 77 / 30) < 0.03
  }, music.name)
  await button(page, 'Play video').click()
  await page.waitForFunction(name => {
    const audio = document.querySelector(`.video-frame audio[aria-label="${name}"]`)
    return audio && !audio.paused && audio.currentTime > 2.6
  }, music.name)
  await button(page, 'Play video').waitFor()
  await page.waitForFunction(() => [...document.querySelectorAll('.video-frame audio')].every(audio => audio.paused))
}

async function checkBrowserCopies(page, archive, sources, directory, command) {
  const { manifest, files } = archive
  const annotation = {
    id: 'annotation-p5', type: 'text', name: 'Note', text: 'P5 preserved', x: 0.2, y: 0.2, width: 1, height: 1,
    scaleX: 1, scaleY: 1, opacity: 1, color: '#ffffff', hidden: false, locked: false, points: [],
  }
  manifest.project.shots[0].annotations = [annotation]
  manifest.extraEnvelope = { revision: 5 }
  manifest.project.extraProject = ['preserved', 5]
  manifest.assets[0].extraAsset = { preserved: true }
  manifest.project.video.tracks.find(track => track.kind === 'voice').clips[0].extraClip = { preserved: true }
  const path = join(directory, 'browser-audio-metadata.zip')
  const writer = new ZipWriter(new BlobWriter())
  await writer.add('project.json', new TextReader(JSON.stringify(manifest)))
  for (const [name, blob] of files) await writer.add(name, new BlobReader(blob))
  await writeFile(path, Buffer.from(await (await writer.close()).arrayBuffer()))
  const cliTarget = join(directory, 'browser-audio-cli-copy.zip')
  await command(['project', 'restore', path, cliTarget])
  assert.deepEqual((await readZIP(cliTarget)).manifest, manifest)

  await link(page, '项目').click()
  await page.getByLabel('ZIP 备份文件', { exact: true }).setInputFiles(path)
  await page.getByRole('heading', { name: manifest.project.title + ' 恢复', exact: true }).waitFor()
  const restored = await exportZIP(page, join(directory, 'browser-audio-restore.zip'))
  await button(page, '项目操作').click()
  await button(page, '复制项目').click()
  await page.getByRole('heading', { name: manifest.project.title + ' 恢复 副本', exact: true }).waitFor()
  const duplicate = await exportZIP(page, join(directory, 'browser-audio-duplicate.zip'))
  const baseline = await checkMedia(archive, sources)
  let previous = manifest
  for (const copy of [restored, duplicate]) {
    const { manifest: current } = copy
    assert.deepEqual(await checkMedia(copy, sources), baseline)
    assert.deepEqual(current.extraEnvelope, manifest.extraEnvelope)
    assert.deepEqual(current.project.extraProject, manifest.project.extraProject)
    assert.notEqual(current.project.id, previous.project.id)
    assert.deepEqual(current.project.scenes, manifest.project.scenes)
    assert.deepEqual(current.project.shots.map(shot => shot.id), manifest.project.shots.map(shot => shot.id))
    const [note] = current.project.shots[0].annotations
    assert.deepEqual({ ...note, id: annotation.id }, annotation)
    for (const original of manifest.assets) {
      const item = current.assets.find(asset => asset.name === original.name)
      assert.deepEqual(item.extraAsset, original.extraAsset)
      const prior = previous.assets.find(asset => asset.name === original.name)
      assert.notEqual(item.id, prior.id)
      const uses = video => video.tracks.flatMap(track => track.clips.filter(clip => clip.assetId === item.id)
        .map(({ id, assetId, ...range }) => ({ ...range, track: track.kind })))
      const sameReferences = structuredClone(manifest.project.video)
      for (const track of sameReferences.tracks) {
        for (const clip of track.clips) if (clip.assetId === original.id) clip.assetId = item.id
      }
      assert.deepEqual(uses(current.project.video), uses(sameReferences))
    }
    previous = current
  }
}

export async function testAudioWorkflow(browser, url, sources, directory, command) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.goto(url + '/#/project/before-the-tide/media')
    await page.getByRole('heading', { name: 'Audio 0', exact: true }).waitFor()
    const upload = page.getByLabel('上传素材文件', { exact: true })
    await rejectBadUploads(page, upload, sources, directory)
    assert.equal(await page.locator('.audio-tile').count(), 0)
    await upload.setInputFiles(sources.map(({ name, type, bytes }) => ({
      name, mimeType: type === 'audio/mp4' ? 'audio/x-m4a' : type, buffer: bytes,
    })))
    for (const source of sources) await checkPreview(page, source)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    const library = await exportZIP(page, join(directory, 'browser-audio-library.zip'))
    const thumbnails = await checkMedia(library, sources)
    const [first, ...rest] = [...thumbnails.values()]
    for (const thumbnail of rest) assert.deepEqual(thumbnail, first)
    assert.equal(library.manifest.project.video, undefined)
    await button(page, '撤销').click()
    await page.getByRole('heading', { name: 'Audio 0', exact: true }).waitFor()
    const legacy = await exportZIP(page, join(directory, 'browser-audio-undone.zip'))
    assert.equal(legacy.manifest.version, 1)
    assert.deepEqual(legacy.manifest.assets, [])
    await page.reload()
    await button(page, '重做').click()
    await page.getByRole('heading', { name: 'Audio 3', exact: true }).waitFor()

    const [voice, music] = sources
    assert.equal(music.bytes.toString('ascii', 0, 3), 'ID3')
    const tagEnd = 10 + music.bytes.subarray(6, 10).reduce((size, byte) => size * 128 + byte, 0)
    await upload.setInputFiles({ name: 'frame-sync.mp3', mimeType: music.type, buffer: music.bytes.subarray(tagEnd) })
    await button(page, 'Preview frame-sync.mp3').waitFor()
    await button(page, '撤销').click()
    await button(page, 'Preview frame-sync.mp3').waitFor({ state: 'detached' })
    await link(page, 'Video').click()
    await button(page, 'Talking head').click()
    const destinations = page.getByLabel('Destination track', { exact: true })
    const assets = page.getByLabel('Media asset', { exact: true })
    await destinations.waitFor()
    assert(await button(page, '重做').isDisabled())
    console.log('PASS 390 px audio library, WAV/MP3/M4A metadata and native playback/seek, MPEG frame sync, strict import rejection, thumbnails, and persistent undo/redo')
    for (const label of ['Presenter', 'B-roll', 'Graphics']) {
      await destinations.selectOption({ label })
      for (const { name } of sources) assert.equal(await assets.getByRole('option', { name, exact: true }).count(), 0)
    }
    await destinations.selectOption({ label: 'Voice' })
    await assets.selectOption({ label: voice.name })
    await button(page, 'Add media clip').click()
    await block(page, 'voice', 0, 90).waitFor()
    await destinations.selectOption({ label: 'Music' })
    await assets.selectOption({ label: music.name })
    await button(page, 'Add media clip').click()
    await block(page, 'music', 0, 90).waitFor()
    await enterFrame(page, 'Start frame', 18)
    await block(page, 'music', 18, 108).waitFor()
    await block(page, 'voice', 0, 90).click()
    await enterFrame(page, 'Edit step (frames)', 3)
    await button(page, 'Trim start').click()
    await block(page, 'voice', 3, 90).waitFor()
    await button(page, 'Trim end').click()
    await block(page, 'voice', 3, 87).waitFor()
    await enterFrame(page, 'Playhead frame', 30)
    await button(page, 'Split at playhead').click()
    await block(page, 'voice', 3, 30).waitFor()
    await block(page, 'voice', 30, 87).waitFor()
    await enterFrame(page, 'Volume (%)', 40)
    await checkTimelinePlayback(page, voice, music)
    await block(page, 'voice', 30, 87).click()
    await button(page, 'Delete clip').click()
    await block(page, 'voice', 30, 87).waitFor({ state: 'detached' })
    await button(page, '撤销').click()
    await block(page, 'voice', 30, 87).waitFor()
    await button(page, '重做').click()
    await block(page, 'voice', 30, 87).waitFor({ state: 'detached' })
    await button(page, '撤销').click()
    await block(page, 'voice', 30, 87).waitFor()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    const archive = await exportZIP(page, join(directory, 'browser-audio-timeline.zip'))
    assert.deepEqual(await checkMedia(archive, sources), thumbnails)
    assert.deepEqual(archive.manifest.project.shots, library.manifest.project.shots)
    assert.deepEqual(archive.manifest.project.scenes, library.manifest.project.scenes)
    const voiceClips = archive.manifest.project.video.tracks.find(track => track.kind === 'voice').clips
    const assetId = library.manifest.assets.find(asset => asset.name === voice.name).id
    assert.deepEqual(voiceClips.map(item => [item.assetId, item.startFrame, item.sourceInFrame, item.sourceOutFrame, item.volume]),
      [[assetId, 3, 3, 30, 1], [assetId, 30, 30, 87, 0.4]])
    console.log('PASS integer audio clip move/trim/split/delete, overlap, clip gain and mute, track mute, live seek cleanup, reload, undo/redo and 390 px timeline')

    await checkBrowserCopies(page, archive, sources, directory, command)
    assert.deepEqual(errors, [])
    console.log('PASS audio and timeline ZIP v2, CLI and browser restore/copy, remapped audio references, original bytes, thumbnails, scene/shot IDs, annotations and unknown metadata')
  } finally {
    await context.close()
  }
}
