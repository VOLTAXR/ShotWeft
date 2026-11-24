import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { createServer } from 'vite'

const execute = promisify(execFile)
const cli = resolve('dist/cli/shotweft.js')
const demo = resolve('demos/m3')
const root = resolve('.tmp/m3')
await mkdir(root, { recursive: true })
const work = await mkdtemp(join(root, 'render-'))
const media = join(work, 'fixture')
await mkdir(media, { recursive: true })
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.browsers')
const { chromium } = await import('playwright')
const browserPath = process.env.SHOTWEFT_BROWSER ?? chromium.executablePath()
const { FFMPEG_PATH: ffmpeg, FFPROBE_PATH: ffprobe } = process.env
assert(ffmpeg && ffprobe, 'Use explicit local LGPL FFMPEG_PATH and FFPROBE_PATH for the M3 render.')
const server = await createServer({
  cacheDir: join(work, 'vite'),
  // The harness is generated under .tmp, which Vite's initial HTML scan skips.
  // Prebundle its dependencies so the first load doesn't encounter stale optimized chunks.
  optimizeDeps: { include: ['react', 'react/jsx-dev-runtime', 'react-dom/client', 'remotion', '@remotion/player'] },
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
})
let browser

async function cliJSON(args, expected = 0) {
  const result = await execute(process.execPath, [cli, ...args], { timeout: 20 * 60_000 })
    .then(value => ({ ...value, code: 0 }), error => error)
  assert.equal(result.code, expected, result.stderr)
  assert.equal(expected ? result.stdout : result.stderr, '')
  const output = expected ? result.stderr : result.stdout
  assert.match(output, /^[^\r\n]+\n$/)
  return JSON.parse(output)
}

const writeJSON = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
const presenter = join(media, 'presenter.mp4')
const broll = join(media, 'b-roll.mp4')
const transcriptPath = join(media, 'transcript.json')
const planPath = join(work, 'director-plan.json')
const output = join(work, 'm3-synthetic.mp4')

try {
  const [{ alignTranscript }, { wordTokens }, { importScript }, { planFromScript }, { reflowDirectorPlan },
    { parseDirectorPlan }, { openFFmpeg }] = await Promise.all([
    '/src/core/presenter/alignment.ts', '/src/core/presenter/tokens.ts', '/src/core/director/script.ts',
    '/src/core/director/planner.ts', '/src/core/director/audio.ts', '/src/core/director/plan.ts', '/src/cli/ffmpeg.ts',
  ].map(path => server.ssrLoadModule(path)))
  await openFFmpeg(ffmpeg) // Enforce the LGPL executable and encoder before generating any media.
  await copyFile(join(demo, 'fixture/presenter.mp4'), presenter)
  // The B-roll has its own test tone to make accidental audio leakage measurable.
  await execute(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-n', '-f', 'lavfi', '-i', 'smptebars=size=640x360:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000', '-t', '6', '-pix_fmt', 'yuv420p',
    '-c:v', 'libopenh264', '-c:a', 'aac', broll])

  const script = importScript(await readFile(join(demo, 'fixture/script.md')), 'markdown')
  const [heading, ...spoken] = script.segments
  assert.match(heading.text, /^# /)
  assert.equal(spoken.length, 4)
  // Passage boundaries are rounded from local silence detection on the SAPI audio.
  // Subdivision into characters is synthetic interpolation, with no ASR involved.
  const passages = [[.2, 5.86], [6.7, 12.12], [12.97, 16.76], [17.61, 22.39]]
  const transcript = {
    schemaVersion: 1, source: 'synthetic', language: 'zh-CN', durationSeconds: 23.119, text: spoken.map(segment => segment.text).join(''),
    words: spoken.flatMap((segment, i) => {
      const tokens = wordTokens(segment.text)
      const [start, finish] = passages[i]
      const at = index => index === tokens.length ? finish : start + (finish - start) * index / tokens.length
      return tokens.map((token, index) => ({ text: token.text, charStart: segment.charStart - heading.charEnd + token.charStart,
        charEnd: segment.charStart - heading.charEnd + token.charEnd, startSeconds: at(index), endSeconds: at(index + 1) }))
    }),
  }
  await writeJSON(transcriptPath, transcript)
  const durationFrames = 693
  const drafted = reflowDirectorPlan(planFromScript({ script, mode: 'presenter', presenterAssetId: 'synthetic-pattern',
    mediaAssets: [{ id: 'synthetic-pattern', path: 'fixture/presenter.mp4', kind: 'video' }] }), durationFrames)
  const layouts = ['full', 'full', 'pip', 'left', 'b-roll']
  const draftedWithLayout = parseDirectorPlan({
    ...drafted, resolution: { width: 640, height: 360 },
    style: { ...drafted.style, background: '#ffffff', foreground: '#17243d', accent: '#2563eb' },
    presenter: { ...drafted.presenter, name: 'Synthetic test pattern and SAPI voice', audio: 'embedded', volume: 0.65, sourceInFrame: 0 },
    narration: { ...drafted.narration, origin: 'synthetic' },
    assets: [
      { ...drafted.assets[0], description: 'Non-human FFmpeg testsrc2 paired with synthetic Windows SAPI Huihui speech.', sourceDurationFrames: durationFrames },
      { id: 'synthetic-b-roll', kind: 'video', path: 'fixture/b-roll.mp4', description: 'Synthetic SMPTE color bars and a test tone that stays muted.',
        sourceDurationFrames: 180 },
    ],
    shots: drafted.shots.map((shot, index) => ({
      ...shot, sceneType: 'graphic', presenterLayout: layouts[index],
      visualElements: [{
        id: 'passage-panel', kind: 'text', text: ['合成夹具', '合成夹具', '逐词时间与字幕', '检查帧同步', ''][index],
        x: 0.08, y: 0.35, width: 0.58, height: 0.24, fontSize: 29, color: '#164282', background: '#e6f0ff', borderRadius: 12,
      }],
    })),
    transitions: drafted.transitions.map(transition => ({ ...transition, kind: 'cut', durationFrames: 0, sharedElementId: null })),
    layoutTimeline: drafted.shots.map(({ startFrame, durationFrames }, index) => ({ startFrame, durationFrames, layout: layouts[index] })),
  })
  const { plan: aligned, report } = alignTranscript(draftedWithLayout, transcript, {
    keywords: ['人工合成', '字幕', '逐词时间', '帧同步', '真人'],
    appearance: {
      style: { color: '#ffffff', background: '#17243d', keywordColor: '#9dc9ff', fontSize: 19 },
      safeArea: { top: 0.06, right: 0.06, bottom: 0.075, left: 0.06 },
    },
  })
  const plan = parseDirectorPlan({ ...aligned, shots: aligned.shots.map((shot, i) => i < layouts.length - 1 ? shot : ({
    ...shot, assetIds: ['synthetic-b-roll'], sceneType: 'video',
    visualElements: [{ ...shot.visualElements[0], id: 'color-bars', assetId: 'synthetic-b-roll', kind: 'video',
      fit: 'cover', opacity: 1, x: 0, y: 0, width: 1, height: 1, borderRadius: 0 }],
  })) })
  assert.equal(plan.originalScript, script.originalScript)
  assert.equal(report.matchRate, 1)
  assert.equal(plan.audio.length, 0)
  await writeJSON(planPath, plan)

  const validation = await cliJSON(['director', 'validate-presenter', planPath, '--ffprobe', ffprobe])
  assert.deepEqual(validation.layouts.map(span => span.layout), ['full', 'pip', 'left', 'b-roll'])
  assert.deepEqual(validation.warnings, [])
  const missingPlan = join(work, 'missing-test-presenter.json')
  const silentPlan = join(work, 'silent-test-presenter.json')
  const silent = join(media, 'silent-test-video.mp4')
  try {
    await writeJSON(missingPlan, { ...plan, assets: [{
      ...plan.assets[0], path: 'fixture/missing-test-presenter.mp4',
    }, plan.assets[1]] })
    assert.match((await cliJSON(['director', 'validate-presenter', missingPlan, '--ffprobe', ffprobe], 1)).error, /Missing local media.*presenter/)
    await execute(ffmpeg, ['-v', 'error', '-n', '-i', presenter, '-map', '0:v:0', '-c', 'copy', silent])
    await writeJSON(silentPlan, { ...plan, assets: [{ ...plan.assets[0], path: 'fixture/silent-test-video.mp4' }, plan.assets[1]] })
    assert.match((await cliJSON(['director', 'validate-presenter', silentPlan, '--ffprobe', ffprobe], 1)).error, /playable audio stream/)
    assert.match((await cliJSON(['video', 'export-remotion', silentPlan, '--output', join(work, 'silent-should-fail.mp4'),
      '--ffmpeg', ffmpeg, '--ffprobe', ffprobe, '--browser', browserPath], 1)).error, /playable audio stream/)
  } finally {
    await Promise.all([missingPlan, silentPlan, silent].map(path => rm(path, { force: true })))
  }
  const renderArgs = ['video', 'export-remotion', planPath, '--output', output,
    '--ffmpeg', ffmpeg, '--ffprobe', ffprobe, '--browser', browserPath]
  console.log('Rendering synthetic M3 fixture with local Chromium and LGPL FFmpeg.')
  const rendered = await cliJSON(renderArgs)
  assert.deepEqual([rendered.video.width, rendered.video.height, rendered.video.frameCount, rendered.video.fps],
    [640, 360, durationFrames, '30/1'])
  const probe = JSON.parse((await execute(ffprobe, ['-v', 'error', '-show_streams', '-of', 'json', output])).stdout)
  assert.deepEqual(probe.streams.map(stream => [stream.codec_type, stream.codec_name]), [['video', 'h264'], ['audio', 'aac']])
  assert.equal(Number(probe.streams[1].sample_rate), 48000)
  assert.equal(probe.streams[1].channels, 2)

  const spanFrames = validation.layouts.map(span => span.startFrame + 40)
  const frames = (await execute(ffmpeg, ['-v', 'error', '-i', output, '-vf',
    'select=' + spanFrames.map(frame => `eq(n\\,${frame})`).join('+'), '-fps_mode', 'passthrough',
    '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 })).stdout
  const frameBytes = 640 * 360 * 3
  assert.equal(frames.length, frameBytes * 4)
  const pixel = (frame, x, y) => {
    const index = frame * frameBytes + (640 * y + x) * 3
    return [...frames.subarray(index, index + 3)]
  }
  const diff = (a, b) => a.reduce((sum, channel, i) => sum + Math.abs(channel - b[i]), 0)
  const white = [255, 255, 255]
  assert(diff(pixel(0, 30, 100), white) > 100 && diff(pixel(0, 610, 130), white) > 100, 'full bleed test pattern')
  assert(diff(pixel(1, 40, 45), white) < 30 && diff(pixel(1, 550, 210), white) > 100, 'PiP overlay on white stage')
  assert(diff(pixel(2, 30, 100), white) > 100 && diff(pixel(2, 615, 70), white) < 30, 'presenter left with complementary stage')
  assert(diff(pixel(3, 50, 35), [190, 190, 190]) < 45 && diff(pixel(3, 585, 35), [0, 0, 190]) < 60,
    'SMPTE bars fill the B-roll frame')

  const rms = async (path, start, duration) => {
    const samples = (await execute(ffmpeg, ['-v', 'error', '-i', path, '-ss', String(start), '-t', String(duration),
      '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { encoding: 'buffer' })).stdout
    assert(samples.length > 0)
    let squares = 0
    for (let index = 0; index < samples.length; index += 4) squares += samples.readFloatLE(index) ** 2
    return Math.sqrt(squares / (samples.length / 4))
  }
  for (const time of [2, 8, 14, 19]) {
    const [actual, original] = await Promise.all([rms(output, time, 1), rms(presenter, time, 1)])
    assert(original > 0.001)
    // FFmpeg's mono-to-stereo conversion uses -3 dB per channel, which the mono fold-down retains.
    const relative = actual / original
    assert(relative > 0.40 && relative < 0.75, 'one attenuated presenter voice during every layout: ' + relative)
  }
  const [tail, sourceTail] = await Promise.all([rms(output, 22.6, .35), rms(presenter, 22.6, .35)])
  assert(tail < Math.max(0.001, 2 * sourceTail), 'embedded B-roll test tone must stay muted')
  assert.match((await cliJSON(renderArgs, 1)).error, /存在/)
  console.log('PASS decoded full, PiP, split and B-roll frames, one attenuated AAC voice, muted B-roll, staged no-overwrite')

  await server.listen()
  browser = await chromium.launch({ executablePath: browserPath })
  const page = await browser.newPage()
  page.on('pageerror', error => console.error('Presenter Player error:', error.message))
  page.on('response', response => {
    if (response.status() >= 400 && !new URL(response.url()).pathname.endsWith('/favicon.ico')) {
      console.error('Presenter Player HTTP error:', response.status(), new URL(response.url()).pathname)
    }
  })
  const url = new URL(server.resolvedUrls.local[0]).origin
  const probePlan = structuredClone(plan)
  const alternate = ['full', 'full', 'round', 'right', 'portrait']
  probePlan.layoutTimeline.forEach((span, i) => { span.layout = alternate[i] })
  await writeFile(join(work, 'player.json'), JSON.stringify(probePlan))
  const playerData = { source: '/@fs' + presenter, broll: '/@fs' + broll }
  const harness = `<html><body><div id="root"></div><script type="module">
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {DirectorPreview} from '/src/director/DirectorPreview.tsx';
    const {source, broll} = ${JSON.stringify(playerData)};
    const [input, video, cutaway] = await Promise.all([fetch('./player.json').then(res => res.json()),
      fetch(source).then(res => res.blob()), fetch(broll).then(res => res.blob())]);
    const plan = {...input, assets: input.assets.map((asset, index) => ({...asset, projectAssetId: 'video-' + index}))};
    const projectAssets = [video, cutaway].map((blob, index) => ({id: 'video-' + index, kind: 'video', duration: index ? 6 : 23.119, blob}));
    const ref = React.createRef();
    window.seekM3 = frame => ref.current.seekTo(frame);
    createRoot(document.getElementById('root')).render(React.createElement(DirectorPreview, {plan, projectAssets, playerRef: ref}));
  </script></body></html>`
  await writeFile(join(work, 'player.html'), harness)
  await page.goto(url + '/' + relative(process.cwd(), join(work, 'player.html')).replaceAll('\\', '/'))
  await page.waitForFunction(() => document.querySelector('[data-presenter-video="full"] video') || document.querySelector('[role="alert"]'),
    undefined, { timeout: 90_000 })
  const error = await page.getByRole('alert').allTextContents()
  assert.deepEqual(error, [], 'project Player must resolve presenter video and audio')
  for (const [index, layout] of ['full', 'round', 'right', 'portrait'].entries()) {
    await page.evaluate(frame => window.seekM3(frame), spanFrames[index])
    const container = page.locator('[data-presenter-video="' + layout + '"]')
    await container.locator('video').waitFor()
    assert(await container.locator('video').evaluate(video => video.muted))
    if (layout === 'round') {
      const bounds = await container.boundingBox()
      assert(Math.abs(bounds.width - bounds.height) < 1)
      assert.equal(await container.evaluate(element => getComputedStyle(element).borderRadius), '50%')
    }
  }
  const voice = page.locator('audio[src^="blob:"]')
  await voice.waitFor({ state: 'attached' })
  assert.equal(await voice.count(), 1)
  console.log('PASS browser Player uses the shared presenter layouts and one embedded audio element for project video')
  console.log('Synthetic test pattern and SAPI speech:', output)
} finally {
  await browser?.close()
  await server.close()
}
