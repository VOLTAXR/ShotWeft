import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BlobReader, BlobWriter, TextReader, ZipReader, ZipWriter } from '@zip.js/zip.js'
import { createServer } from 'vite'

const root = new URL('../', import.meta.url)
const file = path => readFile(new URL(path, root))
const fps30 = { numerator: 30, denominator: 1 }
const ntsc = { numerator: 30000, denominator: 1001 }

function testFrameMathAndTemplates(video, schema) {
  const { frameToSeconds, secondsToFrame, applyVideoTemplate, videoTemplateIds, timelineDurationFrames } = video
  const templates = {
    'talking-head': [1920, 1080, 30, ['main-video', 'b-roll', 'voice', 'captions']],
    educational: [1920, 1080, 30, ['main-video', 'b-roll', 'voice', 'graphics']],
    'short-form': [1080, 1920, 30, ['main-video', 'b-roll', 'voice', 'music', 'captions']],
    documentary: [1920, 1080, 24, ['main-video', 'b-roll', 'voice', 'music', 'graphics']],
    'cinematic-title': [1920, 804, 24, ['main-video', 'graphics', 'music']],
  }
  assert.deepEqual(videoTemplateIds, Object.keys(templates))
  for (const [id, [width, height, fps, kinds]] of Object.entries(templates)) {
    const timeline = schema.parse(applyVideoTemplate(id))
    assert.deepEqual([timeline.width, timeline.height, timeline.fps], [width, height, { numerator: fps, denominator: 1 }])
    assert.deepEqual(timeline.template, { id, revision: 1 })
    assert.deepEqual(timeline.tracks.map(track => track.kind), kinds)
    assert(timeline.tracks.every(track => track.label && track.visible && !track.muted))
    assert.equal(timelineDurationFrames(timeline), 0)
    timeline.tracks[0].label = 'Edited'
    const another = applyVideoTemplate(id)
    assert.notEqual(another.tracks[0].label, 'Edited')
    assert.notEqual(another.tracks[0].id, timeline.tracks[0].id)
  }
  assert.equal(secondsToFrame(1.5, fps30), 45)
  assert.equal(frameToSeconds(45, fps30), 1.5)
  assert.equal(frameToSeconds(30000, ntsc), 1001)
  assert.equal(secondsToFrame(1001, ntsc), 30000)
  assert.equal(secondsToFrame(frameToSeconds(810123, ntsc), ntsc), 810123)
  assert.throws(() => frameToSeconds(1.5, ntsc), /integer frame/)
  assert.throws(() => secondsToFrame(-0.001, fps30), /frame range/)
  assert.throws(() => secondsToFrame(Number.MAX_SAFE_INTEGER, fps30), /frame range/)
  console.log('PASS video frame math, five editable presets, and integer frame boundaries')
}

function testSubtitles({ parseSRT, parseVTT }) {
  const srt = '\uFEFF1\r\n00:00:00,000 --> 00:00:01,000\r\n 海边\r\nSecond line  \r\n\r\n2\r\n00:00:01,000 --> 00:00:02,050\r\nNext'
  const vtt = 'WEBVTT Captions\nLanguage: en\n\nNOTE comment\nignored\n\nSTYLE\n::cue { color: white }\n\n' +
    'intro\n00:00.000 --> 00:01.001 align:center\n<i>First</i>\nSecond\n\n00:00:01.001 --> 00:00:02.002\nNext'
  const fields = ({ trackId, startFrame, endFrame, text }) => [trackId, startFrame, endFrame, text]
  const cues = parseSRT(srt, 'caption-track', fps30)
  assert.deepEqual(cues.map(fields), [
    ['caption-track', 0, 30, ' 海边\nSecond line  '], ['caption-track', 30, 62, 'Next'],
  ])
  assert(cues[0].id && cues[1].id && cues[0].id !== cues[1].id)
  assert.deepEqual(parseVTT(vtt, 'other-track', ntsc).map(fields), [
    ['other-track', 0, 30, '<i>First</i>\nSecond'], ['other-track', 30, 60, 'Next'],
  ])
  assert.throws(() => parseSRT('1\n00:61:00,000 --> 00:00:01,000\nBad', 'track', fps30), /Line 2: invalid timestamp/)
  assert.throws(() => parseSRT('one\n00:00:00,000 --> 00:00:01,000\nBad', 'track', fps30), /SRT cue number/)
  assert.throws(() => parseSRT('1\n00:00:00,000 --> 00:00:00,001\nShort', 'track', fps30), /does not span a frame/)
  assert.throws(() => parseVTT('00:00.000 --> 00:01.000\nBad', 'track', fps30), /WEBVTT header/)
  assert.throws(() => parseVTT('WEBVTT\n\n00:01.000 --> 00:00.000\nBad', 'track', fps30), /end must follow/)
  assert.throws(() => parseVTT('WEBVTT\n\n00:00.000 --> 00:01.000', 'track', fps30), /text is missing/)
  assert.throws(() => parseVTT('WEBVTT\n\n00:00.000 --> 00:01.000\nFirst\n00:01.000 --> 00:02.000\nSecond', 'track', fps30), /blank line between cues/)
  console.log('PASS SRT and WebVTT multilingual multiline text, exact time snapping, and malformed input errors')
}

function projectWithVideo(project, video) {
  const timeline = video.applyVideoTemplate('talking-head')
  const [main, bRoll, voice, captions] = timeline.tracks
  const clip = { id: 'clip-1', assetId: 'footage', startFrame: 0, durationFrames: 30, volume: 1, muted: false, label: 'First' }
  main.clips.push(clip, { ...clip, id: 'clip-2', startFrame: 30, sourceInFrame: 5, sourceOutFrame: 35 })
  bRoll.clips.push({ ...clip, id: 'b-roll-1', startFrame: 5, muted: true })
  voice.clips.push({ ...clip, id: 'voice-1', volume: 0 }, { ...clip, id: 'voice-2', startFrame: 5, volume: 0.5 })
  timeline.tracks.push({ id: 'titles', kind: 'graphics', label: 'Titles', muted: true, visible: false, clips: [{
    id: 'title-card', startFrame: 0, durationFrames: 15, volume: 0, muted: true, label: 'Opening title',
    graphic: { kind: 'text', text: 'Dawn', x: 0.1, y: 0.1, width: 0.8, height: 0.4, opacity: 1, color: '#ffffff', fontSize: 36, align: 'center' },
  }] })
  timeline.subtitles.push({ id: 'cue-1', trackId: captions.id, startFrame: 0, endFrame: 30, text: 'First cue' }, {
    id: 'cue-2', trackId: captions.id, startFrame: 30, endFrame: 90, text: 'Second cue',
    style: { position: 'bottom', background: '#00000088' },
  })
  const { cover, ...legacy } = project
  return {
    ...legacy, coverAssetId: clip.assetId, video: timeline,
    shots: project.shots.map(({ media, ...shot }) => ({ ...shot, assetId: clip.assetId })),
  }
}

function testValidation(video, schema, archive, project, item) {
  const { activeClipsAtFrame, activeCuesAtFrame, clipEndFrame, timelineDurationFrames } = video
  const { video: timeline } = project
  assert.deepEqual(schema.parse(timeline), timeline)
  assert.equal(clipEndFrame(timeline.tracks[0].clips[0]), 30)
  assert.deepEqual(activeClipsAtFrame(timeline.tracks[0], 30).map(clip => clip.id), ['clip-2'])
  assert.deepEqual(activeClipsAtFrame(timeline.tracks[2], 5).map(clip => clip.id), ['voice-1', 'voice-2'])
  assert.deepEqual(activeClipsAtFrame(timeline.tracks[0], 60), [])
  assert.deepEqual(activeCuesAtFrame(timeline, 30).map(cue => cue.id), ['cue-2'])
  assert.deepEqual(activeCuesAtFrame(timeline, 90), [])
  assert.equal(timelineDurationFrames(timeline), 90)

  const firstClip = timeline => timeline.tracks[0].clips[0]
  const changes = [
    [value => { value.tracks[0].clips.reverse()[0].startFrame = 29 }, /Visual clips.*overlap/],
    [value => { value.subtitles[1].startFrame = 29 }, /Cues.*overlap/],
    [value => { value.subtitles[0].trackId = value.tracks[0].id }, /caption track/],
    [value => { value.subtitles[0].trackId = 'missing' }, /caption track/],
    [value => { value.subtitles[0].endFrame = 0 }, /end must follow/],
    [value => { delete firstClip(value).assetId }, /require an asset ID/],
    [value => { firstClip(value).volume = 1.01 }, /volume/],
    [value => { firstClip(value).volume = -0.01 }, /volume/],
    [value => { firstClip(value).muted = 'false' }, /muted/],
    [value => { value.tracks[0].visible = 1 }, /visible/],
    [value => { value.tracks[0].kind = 'effects' }, /kind/],
    [value => { firstClip(value).startFrame = -1 }, /startFrame/],
    [value => { firstClip(value).startFrame = 0.5 }, /startFrame/],
    [value => { firstClip(value).startFrame = Number.MAX_SAFE_INTEGER + 1 }, /startFrame/],
    [value => { firstClip(value).durationFrames = 0 }, /durationFrames/],
    [value => { firstClip(value).startFrame = Number.MAX_SAFE_INTEGER }, /end must be a safe integer/],
    [value => { firstClip(value).sourceOutFrame = 10 }, /Source range/],
    [value => { value.tracks[1].id = value.tracks[0].id }, /Duplicate track ID/],
    [value => { value.tracks[1].clips[0].id = firstClip(value).id }, /Duplicate clip ID/],
    [value => { value.subtitles[1].id = value.subtitles[0].id }, /Duplicate cue ID/],
    [value => { value.fps.denominator = 0 }, /denominator/],
    [value => { value.fps = { numerator: 60, denominator: 2 } }, /reduced rational/],
    [value => { value.width++ }, /even dimension/],
  ]
  for (const [change, error] of changes) {
    const value = structuredClone(timeline)
    change(value)
    assert.throws(() => schema.parse(value), error)
  }
  const futureTemplate = { ...timeline, template: { id: 'future-preset', revision: 9 } }
  assert.deepEqual(schema.parse(futureTemplate), futureTemplate)

  const manifest = archive.projectManifest(project, [item])
  for (const assetId of ['unknown', '/demo-media/before-the-tide.jpg']) {
    const invalid = structuredClone(manifest)
    firstClip(invalid.project.video).assetId = assetId
    assert.throws(() => archive.readProjectManifest(invalid, 'JSON'), /Missing project asset.*clip-1/)
  }
  const wrongOwner = structuredClone(manifest)
  wrongOwner.assets[0].projectId = 'other-project'
  assert.throws(() => archive.readProjectManifest(wrongOwner, 'JSON'), /Missing project asset/)
  const wrongKind = structuredClone(manifest)
  Object.assign(wrongKind.assets[0], { kind: 'image', originalType: 'image/jpeg' })
  delete wrongKind.project.video.tracks[0].clips[1].sourceInFrame
  delete wrongKind.project.video.tracks[0].clips[1].sourceOutFrame
  assert.throws(() => archive.readProjectManifest(wrongKind, 'JSON'), /Incompatible asset for voice/)
  const trimmedStill = structuredClone(wrongKind)
  firstClip(trimmedStill.project.video).sourceInFrame = 0
  assert.throws(() => archive.readProjectManifest(trimmedStill, 'JSON'), /Still images cannot have source trim points/)
  console.log('PASS video schema validates IDs, asset types and ownership, frame and volume bounds, and track-local overlap')
}

async function testArchives(archive, legacy, project, item) {
  const options = { level: 0, useWebWorkers: false }
  const legacyWriter = new ZipWriter(new BlobWriter())
  await legacyWriter.add('project.json', new TextReader(JSON.stringify(legacy)), options)
  const photo = new Blob([await file('public/demo-media/before-the-tide.jpg')], { type: 'image/jpeg' })
  await legacyWriter.add('photos/0.jpg', new BlobReader(photo), options)
  const old = await archive.readProjectZIP(await legacyWriter.close())
  assert.deepEqual(old.manifest, legacy)
  assert(!Object.hasOwn(old.project, 'video'))
  assert.equal(old.photos.get(legacy.project.cover).size, photo.size)

  const loadPhoto = () => assert.fail('Only assets should be used in the timeline ZIP')
  const zip = await archive.writeProjectZIP(project, [item], loadPhoto)
  const reader = new ZipReader(new BlobReader(zip))
  try {
    assert.deepEqual((await reader.getEntries()).map(entry => entry.filename), [
      'project.json', 'media/0/original', 'media/0/thumbnail',
    ])
  } finally {
    await reader.close()
  }
  const loaded = await archive.readProjectZIP(zip)
  assert.equal(loaded.manifest.version, 1)
  assert.deepEqual(loaded.project, project)
  assert.deepEqual(await loaded.items[0].blob.arrayBuffer(), await item.blob.arrayBuffer())
  assert.deepEqual(await loaded.items[0].thumbnail.arrayBuffer(), await item.thumbnail.arrayBuffer())

  const invalid = structuredClone(project)
  invalid.video.tracks[0].clips[0].assetId = 'missing'
  await assert.rejects(archive.writeProjectZIP(invalid, [item], loadPhoto), /Missing project asset/)
  console.log('PASS V1.0 ZIP reads and video round-trips in manifest v1 with one original and one thumbnail for the shared asset')
  return zip
}

async function testBrowserPersistence(browser, url, project, zip) {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.route(url + '/video-model-test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Video model</title>' }))
    await page.goto(url + '/video-model-test')
    const result = await page.evaluate(async ({ bytes, project }) => {
      async function digest(blob) {
        return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))]
      }
      const { restoreZIP } = await import('/src/backup.ts')
      const { copyProject, readProject, editProject, restoreEdit, history, importProject } = await import('/src/db.ts')
      const zipBytes = Uint8Array.from(atob(bytes), character => character.charCodeAt(0))
      const restoreId = await restoreZIP(new File([zipBytes], 'project.zip', { type: 'application/zip' }))
      const copyId = await copyProject(restoreId)
      const snapshots = await Promise.all([readProject(restoreId), readProject(copyId)])
      const copies = await Promise.all(snapshots.map(async snapshot => ({
        project: snapshot.project,
        items: await Promise.all(snapshot.items.map(async ({ id, projectId, blob, thumbnail }) => ({
          id, projectId,
          original: await digest(blob), thumbnail: await digest(thumbnail),
        }))),
      })))

      const { video, ...oldProject } = project
      await importProject(oldProject, [])
      await editProject(project.id, current => ({ ...current, video }), undefined,
        snapshots[0].items.map(item => ({ ...item, id: 'footage', projectId: project.id })))
      const createdHistory = await history.get(project.id)
      await editProject(project.id, current => ({ ...current, video: { ...current.video, width: 1280 } }))
      const editedHistory = await history.get(project.id)
      const states = []
      for (const direction of ['undo', 'undo', 'redo', 'redo']) {
        await restoreEdit(project.id, direction)
        const { project: current } = await readProject(project.id)
        states.push({ hasVideo: Object.hasOwn(current, 'video'), video: current.video })
      }
      return { copies, createdHistory, editedHistory, states }
    }, { bytes: Buffer.from(await zip.arrayBuffer()).toString('base64'), project })

    const digest = async path => createHash('sha256').update(await file(path)).digest()
    const original = await digest('public/demo-media/coastal-mist.mp4')
    const thumbnail = await digest('public/demo-media/coastal-mist.jpg')
    let previous = project
    const timelineIds = ({ video }) => [
      ...video.tracks.flatMap(track => [track.id, ...track.clips.map(clip => clip.id)]),
      ...video.subtitles.map(cue => cue.id),
    ]
    for (const { project: current, items: [item, ...extras] } of result.copies) {
      assert.notEqual(current.id, previous.id)
      assert.notEqual(item.id, previous.coverAssetId)
      assert.equal(item.projectId, current.id)
      assert.deepEqual(extras, [])
      assert.deepEqual(Buffer.from(item.original), original)
      assert.deepEqual(Buffer.from(item.thumbnail), thumbnail)
      assert.deepEqual(current.scenes, project.scenes)
      assert.deepEqual(current.shots.map(shot => Object.fromEntries(Object.entries(shot).filter(([, value]) => value !== undefined))),
        project.shots.map(shot => ({ ...shot, assetId: item.id })))
      assert.equal(current.coverAssetId, item.id)
      assert.equal(timelineIds(current).length, timelineIds(previous).length)
      assert(timelineIds(current).every(id => !timelineIds(previous).includes(id)))
      const sameTimeline = structuredClone(current.video)
      for (const [index, track] of sameTimeline.tracks.entries()) {
        const source = previous.video.tracks[index]
        const actualTrackId = track.id
        track.id = source.id
        for (const cue of sameTimeline.subtitles) if (cue.trackId === actualTrackId) cue.trackId = source.id
        for (const [clipIndex, clip] of track.clips.entries()) {
          clip.id = source.clips[clipIndex].id
          if (clip.assetId) {
            assert.equal(clip.assetId, item.id)
            clip.assetId = previous.coverAssetId
          }
        }
      }
      sameTimeline.subtitles.forEach((cue, index) => { cue.id = previous.video.subtitles[index].id })
      assert.deepEqual(sameTimeline, previous.video)
      previous = current
    }
    assert(!Object.hasOwn(result.createdHistory.past[0], 'video'))
    assert.deepEqual(result.editedHistory.past[1].video, project.video)
    assert.deepEqual(result.states.map(({ hasVideo, video }) => [hasVideo, video?.width]), [
      [true, 1920], [false, undefined], [true, 1920], [true, 1280],
    ])
    console.log('PASS browser restore and duplicate remap video IDs without altering media or scene/shot IDs; IndexedDB undo and redo restore video state')
  } finally {
    await context.close()
  }
}

export async function testVideoModel(browser) {
  const server = await createServer({
    root: fileURLToPath(root), cacheDir: '.tmp/video-vite-cache',
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
  })
  try {
    const [video, { videoTimelineSchema }, subtitles, archive] = await Promise.all([
      '/src/video-model.ts', '/src/core/video-schema.ts', '/src/video-subtitles.ts', '/src/core/project-archive.ts',
    ].map(path => server.ssrLoadModule(path)))
    testFrameMathAndTemplates(video, videoTimelineSchema)
    testSubtitles(subtitles)
    const legacy = JSON.parse(await file('scripts/fixtures/project-v1.0.json'))
    const project = projectWithVideo(legacy.project, video)
    const item = {
      id: 'footage', projectId: project.id, kind: 'video', name: 'coastal-mist.mp4', width: 640, height: 360, created: project.updated,
      blob: new Blob([await file('public/demo-media/coastal-mist.mp4')], { type: 'video/mp4' }),
      thumbnail: new Blob([await file('public/demo-media/coastal-mist.jpg')], { type: 'image/jpeg' }),
    }
    testValidation(video, videoTimelineSchema, archive, project, item)
    const zip = await testArchives(archive, legacy, project, item)
    await server.listen()
    await testBrowserPersistence(browser, new URL(server.resolvedUrls.local[0]).origin, project, zip)
  } finally {
    await server.close()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= fileURLToPath(new URL('.browsers', root))
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  try {
    await testVideoModel(browser)
  } finally {
    await browser.close()
  }
}
