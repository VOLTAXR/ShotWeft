import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { BlobReader, BlobWriter, TextReader, ZipReader, ZipWriter } from '@zip.js/zip.js'

const run = promisify(execFile)
const cli = fileURLToPath(new URL('../dist/cli/shotweft.js', import.meta.url))
const root = fileURLToPath(new URL('../', import.meta.url))

function execute(file, args, options = {}) {
  const child = run(file, args, { timeout: 120_000, maxBuffer: 16 * 1024 * 1024, ...options })
  child.child.stdin?.end()
  return child
}

async function tools() {
  const fixture = join(root, '.tmp/ffmpeg-lgpl/ffmpeg-n8.1-latest-linux64-lgpl-8.1/bin')
  const result = {}
  for (const name of ['ffmpeg', 'ffprobe']) {
    const variable = name.toUpperCase() + '_PATH'
    const explicit = process.env[variable]
    if (explicit !== undefined) {
      result[name] = resolve(explicit)
      await execute(result[name], ['-version'])
      continue
    }
    const local = join(fixture, name)
    try {
      await execute(local, ['-version'])
      result[name] = local
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      try {
        await execute(name, ['-version'])
        result[name] = name
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
        console.log('SKIP real video render: ' + name + ' is unavailable in the local fixture and on PATH. Set ' + variable + '.')
        return
      }
    }
  }
  return result
}

const fps = { numerator: 30_000, denominator: 1001 }
const landscape = { width: 640, height: 360, fps, durationFrames: 72, durationSeconds: 2.4024 }
const portrait = { width: 360, height: 640, fps: { numerator: 25, denominator: 1 }, durationFrames: 25, durationSeconds: 1 }
const track = (kind, clips, options) => ({ id: kind, kind, label: kind, visible: true, muted: false, clips, ...options })
const clip = (id, startFrame, durationFrames, data) => ({ id, startFrame, durationFrames, label: id, volume: 1, muted: false, ...data })
const textGraphic = { kind: 'text', text: "Title 50%: 'A' [literal]", x: 0.12, y: 0.1, width: 0.75, height: 0.2,
  opacity: 0.9, fontSize: 24, color: '#ffffff', align: 'left' }

function timeline(profile, tracks, subtitles = []) {
  const { width, height, fps } = profile
  return { schemaVersion: 1, width, height, fps, tracks, subtitles }
}

async function writeProject(zip, video, sources, thumbnail) {
  const project = { id: 'p3-render', title: 'Synthetic video render', updated: 1, frame: '16:9', archived: false, scenes: [], shots: [], video }
  const assets = sources.map(({ id, type, bytes, width, height }) => ({
    id, projectId: project.id, kind: type.split('/')[0], name: id, width, height, created: 1,
    originalType: type, originalBytes: bytes.length, thumbnailType: 'image/png', thumbnailBytes: thumbnail.length,
  }))
  const writer = new ZipWriter(new BlobWriter())
  await writer.add('project.json', new TextReader(JSON.stringify({
    format: 'ShotWeft', version: 1, project, assets, bundledPhotos: [],
  })))
  for (const [index, source] of sources.entries()) {
    await writer.add('media/' + index + '/original', new BlobReader(new Blob([source.bytes])))
    await writer.add('media/' + index + '/thumbnail', new BlobReader(new Blob([thumbnail])))
  }
  await writeFile(zip, Buffer.from(await (await writer.close()).arrayBuffer()))
}

async function assertRestored(zip, sources, thumbnail) {
  const reader = new ZipReader(new BlobReader(new Blob([await readFile(zip)])))
  try {
    const entries = new Map((await reader.getEntries()).map(entry => [entry.filename, entry]))
    for (const [index, { bytes }] of sources.entries()) {
      const entry = 'media/' + index + '/'
      const options = { checkSignature: true }
      assert.deepEqual(Buffer.from(await (await entries.get(entry + 'original').getData(new BlobWriter(), options)).arrayBuffer()), bytes)
      assert.deepEqual(Buffer.from(await (await entries.get(entry + 'thumbnail').getData(new BlobWriter(), options)).arrayBuffer()), thumbnail)
    }
  } finally {
    await reader.close()
  }
}

function assertProperties(video, expected) {
  assert.equal(video.codec, 'h264')
  assert.equal(video.pixelFormat, 'yuv420p')
  assert.equal(video.width, expected.width)
  assert.equal(video.height, expected.height)
  assert.equal(video.fps, expected.fps.numerator + '/' + expected.fps.denominator)
  assert.equal(video.frameCount, expected.durationFrames)
  assert(Math.abs(video.durationSeconds - expected.durationSeconds) < 0.00001)
  assert(Math.abs(video.audio.durationSeconds - expected.durationSeconds) <= 1 / 25)
  assert.deepEqual([video.audio.codec, video.audio.profile, video.audio.sampleRate, video.audio.channels], ['aac', 'LC', 48_000, 2])
}

async function inspectProbe(ffprobe, path, expected) {
  const { stdout } = await execute(ffprobe, ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', path])
  const { streams: [v, a], format } = JSON.parse(stdout)
  assert(format.format_name.split(',').includes('mp4'))
  assertProperties({
    codec: v.codec_name, pixelFormat: v.pix_fmt, width: v.width, height: v.height, fps: v.avg_frame_rate,
    frameCount: Number(v.nb_read_frames), durationSeconds: Number(v.duration),
    audio: { codec: a.codec_name, profile: a.profile, sampleRate: Number(a.sample_rate), channels: a.channels, durationSeconds: Number(a.duration) },
  }, expected)
  const bytes = await readFile(path)
  const atoms = []
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32BE(offset)
    assert(size >= 8)
    atoms.push(bytes.toString('ascii', offset + 4, offset + 8))
    offset += size
  }
  assert(atoms.includes('moov') && atoms.indexOf('moov') < atoms.indexOf('mdat'), 'MP4 must have faststart')
}

async function inspectComposition(ffmpeg, path) {
  const frames = [5, 6, 9, 17, 18, 29, 30, 33, 34, 35, 36, 59, 60]
  const { stdout: pixels } = await execute(ffmpeg, ['-v', 'error', '-i', path, '-vf',
    'select=' + frames.map(frame => 'eq(n\\,' + frame + ')').join('+'),
    '-fps_mode', 'passthrough', '-pix_fmt', 'rgb24', '-c:v', 'rawvideo', '-threads:v', '1', '-f', 'rawvideo', '-'], { encoding: 'buffer' })
  const { width, height } = landscape
  assert.equal(pixels.length, frames.length * width * height * 3)
  function pixel(frame, x, y) {
    const offset = ((frames.indexOf(frame) * height + y) * width + x) * 3
    return [...pixels.subarray(offset, offset + 3)]
  }
  function isInk(frame, left, top, right, bottom) {
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        if (Math.min(...pixel(frame, x, y)) > 150) return true
      }
    }
    return false
  }
  for (const frame of [5, 36, 60]) assert(Math.max(...pixel(frame, 20, 20)) < 16, 'Expected black gap at ' + frame)
  for (const frame of [6, 17, 30, 35]) assert(pixel(frame, 20, 20)[0] > 140, 'Expected main video at ' + frame)
  for (const frame of [18, 29]) assert(pixel(frame, 20, 20)[1] > 140, 'Expected B-roll at ' + frame)
  assert(isInk(9, 70, 36, 400, 108), 'Expected rendered text graphic')
  assert(!isInk(6, 70, 36, 400, 108), 'Text must wait for its start frame')
  for (const frame of [34, 59]) assert(isInk(frame, 130, 285, 510, 350), 'Expected burned-in caption at ' + frame)
  for (const frame of [33, 60]) assert(!isInk(frame, 130, 285, 510, 350), 'Caption must be outside frame ' + frame)
}

async function inspectAudio(ffmpeg, path, bands) {
  const { stdout: audio } = await execute(ffmpeg, ['-v', 'error', '-i', path, '-map', '0:a:0', '-ac', '1', '-f', 'f32le', '-'], { encoding: 'buffer' })
  for (const [start, end, signal] of bands) {
    const from = Math.round(start * 48_000)
    const to = Math.round(end * 48_000)
    let squared = 0
    for (let i = from; i < to; i++) squared += audio.readFloatLE(i * 4) ** 2
    const rms = Math.sqrt(squared / (to - from))
    assert(signal ? rms > 0.008 : rms < 0.001, 'Unexpected audio RMS ' + rms + ' in ' + start + '–' + end)
  }
}

async function browserRender(browser, url, source, directory, command, flags) {
  const page = await browser.newPage()
  try {
    await page.goto(url + '/#/project/before-the-tide/board')
    await page.getByRole('link', { name: 'Video', exact: true }).click()
    await page.getByRole('button', { name: 'Talking head', exact: true }).click()
    await page.getByLabel('Import media file', { exact: true }).setInputFiles(source)
    await page.getByText('Imported main.mp4', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Add media clip', exact: true }).click()
    await page.locator('[data-track-kind="main-video"] [data-start-frame="0"][data-end-frame="75"]').waitFor()
    await page.getByRole('link', { name: '分镜', exact: true }).click()
    await page.getByRole('button', { name: '导出', exact: true }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: '项目 ZIP 备份', exact: true }).click()
    const zip = join(directory, 'browser.zip')
    await (await download).saveAs(zip)
    const path = join(directory, 'browser.mp4')
    const { video } = await command(['video', 'render', zip, '--output', path, ...flags])
    assertProperties(video, { width: 1920, height: 1080, fps: { numerator: 30, denominator: 1 }, durationFrames: 75, durationSeconds: 2.5 })
    console.log('PASS browser-created timeline and ZIP → CLI render ' + JSON.stringify(video))
  } finally {
    await page.close()
  }
}

export async function testVideoRender(browser, url) {
  const binaries = await tools()
  if (!binaries) return
  const { ffmpeg, ffprobe } = binaries
  const flags = [ffmpeg === 'ffmpeg' ? [] : ['--ffmpeg', ffmpeg], ffprobe === 'ffprobe' ? [] : ['--ffprobe', ffprobe]].flat()
  await mkdir(join(root, '.tmp'), { recursive: true })
  const directory = await mkdtemp(join(root, '.tmp/video-render-test-'))
  const temporary = join(directory, 'work')
  const env = { ...process.env, SHOTWEFT_TMP: temporary }

  function cliRun(args, overrides) {
    return execute(process.execPath, [cli, ...args], { cwd: root, env: { ...env, ...overrides } })
  }
  async function command(args, overrides) {
    const { stdout, stderr } = await cliRun(args, overrides)
    assert.equal(stderr, '')
    assert.match(stdout, /^[^\r\n]+\n$/)
    return JSON.parse(stdout)
  }
  async function fails(args, expected, code = 1, overrides) {
    await assert.rejects(() => cliRun(args, overrides), error => {
      assert.equal(error.code, code)
      assert.equal(error.stdout, '')
      assert.match(error.stderr, /^[^\r\n]+\n$/)
      assert.match(JSON.parse(error.stderr).error, expected)
      return true
    })
  }

  try {
    async function generate(args, file) {
      await execute(ffmpeg, ['-v', 'error', '-nostdin', '-n', ...args, join(directory, file)])
    }
    const input = { width: 320, height: 180 }
    const main = join(directory, 'main.mp4')
    const voice = join(directory, 'voice.mp4')
    const image = join(directory, 'still.png')
    for (const [file, shade, tone] of [['main.mp4', 'red', 440], ['voice.mp4', 'blue', 880]]) {
      const variableRate = file === 'main.mp4' ? [
        '-vf', "drawbox=color=blue:t=fill:enable='lt(n,6)',select='not(between(n,10,30)*not(mod(n,2)))'",
        '-fps_mode', 'vfr',
      ] : []
      await generate(['-f', 'lavfi', '-i', 'color=c=' + shade + ':s=320x180:r=30',
        '-f', 'lavfi', '-i', 'sine=frequency=' + tone + ':sample_rate=48000',
        '-t', '2.5', ...variableRate, '-c:v', 'libopenh264', '-c:a', 'aac', '-pix_fmt', 'yuv420p'], file)
    }
    await generate(['-f', 'lavfi', '-i', 'color=c=0x00ff00:s=320x180', '-frames:v', '1', '-threads:v', '1'], 'still.png')
    const sources = [
      { id: 'main', type: 'video/mp4', ...input, bytes: await readFile(main) },
      { id: 'voice', type: 'video/mp4', ...input, bytes: await readFile(voice) },
      { id: 'still', type: 'image/png', ...input, bytes: await readFile(image) },
    ]
    const thumbnail = sources[2].bytes
    const zip = join(directory, 'landscape.zip')
    await writeProject(zip, timeline(landscape, [
      track('main-video', [clip('primary', 6, 30, { assetId: 'main', sourceInFrame: 6, sourceOutFrame: 36 })]),
      track('b-roll', [clip('insert', 18, 12, { assetId: 'still' })]),
      track('voice', [clip('narration', 38, 16, { assetId: 'voice', sourceInFrame: 5, sourceOutFrame: 21, volume: 0.75 })]),
      track('music', [clip('bed', 44, 20, { assetId: 'main', volume: 0.4 }), clip('muted', 64, 8, { assetId: 'voice', muted: true })]),
      track('graphics', [clip('lower-third', 9, 36, { graphic: textGraphic })]),
      track('captions', []),
    ], [{ id: 'cue', trackId: 'captions', startFrame: 34, endFrame: 60, text: 'Synthetic caption — 100%',
      style: { position: 'bottom', fontSize: 26, color: '#ffffff', background: '#151720cc' } }]), sources, thumbnail)
    const zipBytes = await readFile(zip)

    const output = join(directory, 'landscape.mp4')
    const render = ['video', 'render', zip, '--output', output]
    const invalid = join(directory, 'missing')
    const { video, ...result } = await command([...render, ...flags],
      Object.fromEntries([['FFMPEG_PATH', ffmpeg === 'ffmpeg' ? undefined : invalid], ['FFPROBE_PATH', ffprobe === 'ffprobe' ? undefined : invalid]]))
    assert.deepEqual(result, { path: output, projectPath: zip, timeline: landscape })
    assert.equal(video.path, output)
    assertProperties(video, landscape)
    await inspectProbe(ffprobe, output, landscape)
    await inspectComposition(ffmpeg, output)
    await inspectAudio(ffmpeg, output, [[0.03, 0.14, false], [0.25, 0.55, true], [1.24, 1.25, false],
      [1.33, 1.43, true], [1.52, 1.7, true], [1.87, 2.04, true], [2.25, 2.36, false]])
    console.log('PASS landscape render, independent ffprobe, faststart, frame-boundary pixels and audio windows ' + JSON.stringify(video))

    const portraitZIP = join(directory, 'portrait.zip')
    const portraitMP4 = join(directory, 'portrait.mp4')
    await writeProject(portraitZIP, timeline(portrait, [track('main-video', [clip('still', 0, 25, { assetId: 'still' })])]), [sources[2]], thumbnail)
    const envPaths = { FFMPEG_PATH: ffmpeg === 'ffmpeg' ? undefined : ffmpeg, FFPROBE_PATH: ffprobe === 'ffprobe' ? undefined : ffprobe }
    const vertical = await command(['video', 'render', portraitZIP, '--output', portraitMP4], envPaths)
    assertProperties(vertical.video, portrait)
    await inspectProbe(ffprobe, portraitMP4, portrait)
    await inspectAudio(ffmpeg, portraitMP4, [[0.1, 0.8, false]])
    console.log('PASS portrait render using environment overrides, independent ffprobe and silent AAC ' + JSON.stringify(vertical.video))

    const probeFlag = ffprobe === 'ffprobe' ? [] : ['--ffprobe', ffprobe]
    assert.deepEqual(await command(['video', 'verify', zip], { FFMPEG_PATH: invalid, FFPROBE_PATH: invalid }), { projectPath: zip, timeline: landscape })
    assert.deepEqual(await command(['video', 'verify', zip, '--video', output, ...probeFlag], { FFMPEG_PATH: invalid }), { ...result, video })
    await fails(['video', 'verify', zip, '--video', portraitMP4, ...probeFlag], /Expected 640x360/)
    await fails(['video', 'verify', zip, '--video', output, '--ffprobe', invalid], /ffprobe executable not found/)
    const outputBytes = await readFile(output)
    await fails([...render, ...flags], /EEXIST/)
    assert.deepEqual(await readFile(output), outputBytes)
    await fails(['video', 'render', zip], /--output/, 2)
    const failurePath = join(directory, 'failed.mp4')
    const failure = ['video', 'render', zip, '--output', failurePath, ...probeFlag]
    await fails([...failure, '--ffmpeg', invalid], /ffmpeg executable not found/)
    await fails([...failure, '--ffmpeg', process.execPath], /ffmpeg build check|Invalid ffmpeg/)
    const corruptZIP = join(directory, 'bad-media.zip')
    await writeProject(corruptZIP, timeline(portrait, [track('main-video', [clip('bad', 0, 25, { assetId: 'main' })])]),
      [{ ...sources[0], bytes: Buffer.from('invalid media') }], thumbnail)
    await fails(['video', 'render', corruptZIP, '--output', failurePath, ...flags], /ffprobe media probe/)
    await assert.rejects(readFile(failurePath), { code: 'ENOENT' })
    assert.deepEqual(await readdir(temporary), [], 'Project media and render working files must be cleaned up')
    assert(!(await readdir(directory)).some(name => name.endsWith('.shotweft-lock')), 'Output staging must be cleaned up')
    assert.deepEqual(await readFile(zip), zipBytes)
    for (const [index, path] of [main, voice, image].entries()) assert.deepEqual(await readFile(path), sources[index].bytes)
    const restored = join(directory, 'restored.zip')
    await command(['project', 'restore', zip, restored])
    assert.deepEqual((await command(['agent', 'verify', restored])).project.video, (await command(['project', 'show', zip])).video)
    await assertRestored(restored, sources, thumbnail)
    console.log('PASS video verify, incompatible output, invalid media and tool paths, no-overwrite, cleanup and byte-identical ZIP restore')

    if (browser) await browserRender(browser, url, main, directory, command, flags)
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 3 })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await testVideoRender()
