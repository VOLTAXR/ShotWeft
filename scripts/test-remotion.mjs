import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createServer } from 'vite'
const execute = promisify(execFile)
const root = process.cwd(), work = resolve('.tmp/v2/remotion-tests')
await mkdir(work, { recursive: true })
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.browsers')
process.env.TMPDIR = work
const { chromium } = await import('playwright')
const server = await createServer({ cacheDir: '.tmp/v2/vite-cache', server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } })
let browser
const demo = JSON.parse(await readFile('public/director/demo-plan.json', 'utf8'))
const clone = () => structuredClone(demo)
const layered = clone()
layered.assets.push(
  { id: 'coast', kind: 'image', path: 'coast.jpg', description: 'Local coast photograph' },
  { id: 'mist', kind: 'video', path: 'mist.mp4', description: 'Local coastal mist video with synthetic test soundtrack' },
  { id: 'waves', kind: 'image', path: 'waves.jpg', description: 'Local waves photograph' },
)
Object.assign(layered.shots[2], {
  sceneType: 'split', assetIds: ['coast', 'mist', 'waves'],
  mediaLayers: [
    { id: 'backdrop', assetId: 'coast', kind: 'image', startFrame: 125, durationFrames: 50 },
    { id: 'insert', assetId: 'mist', kind: 'video', startFrame: 135, durationFrames: 40, sourceInFrame: 60, fit: 'contain',
      region: { x: 400 / 640, y: 0, width: 180 / 640, height: 320 / 360 } },
  ],
  visualElements: [layered.shots[2].visualElements[0], {
    id: 'waves-photo', kind: 'image', assetId: 'waves', fit: 'cover', opacity: 1,
    x: 0.25, y: 0, width: 0.25, height: 0.25, text: '', color: '#ffffff', background: '#000000', fontSize: 12, borderRadius: 0,
  }],
})
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const cli = resolve('dist/cli/shotweft.js')
function toneAmplitude(samples, from, frequency) {
  let sine = 0, cosine = 0, count = 0
  const start = Math.round(from * 48000)
  const stop = start + 19200
  for (let i = start; i < stop; i++) {
    const sample = samples.readFloatLE(i * 4)
    sine += sample * Math.sin(2 * Math.PI * frequency * i / 48000)
    cosine += sample * Math.cos(2 * Math.PI * frequency * i / 48000)
    count++
  }
  return 2 * Math.hypot(sine, cosine) / count
}
async function command(args, expected = 0) {
  let result
  try { result = { ...await execute(process.execPath, [cli, ...args], { cwd: root, env: process.env, maxBuffer: 1024 * 1024, timeout: 600_000 }), code: 0 } }
  catch (error) { result = error }
  assert.equal(result.code, expected, result.stderr)
  const data = expected === 0 ? result.stdout : result.stderr
  assert.match(data, /^[^\r\n]+\n$/, 'CLI must emit exactly one JSON line')
  assert.equal(expected === 0 ? result.stderr : result.stdout, '')
  return JSON.parse(data)
}
try {
  const [{ parseDirectorPlan }, { compileDirectorPlan }, morph] = await Promise.all([
    server.ssrLoadModule('/src/core/director/plan.ts'), server.ssrLoadModule('/src/core/director/compiler.ts'), server.ssrLoadModule('/src/director/morph.ts'),
  ])
  assert.deepEqual(parseDirectorPlan(demo), demo)
  assert.deepEqual(demo.shots.map(s => s.sceneType), ['title', 'chart', 'quote'])
  assert.equal(demo.scenes.length, 3)
  assert.equal(compileDirectorPlan(demo).durationInFrames, 180)
  const invalid = [
    [p => { p.schemaVersion = 2 }, /schemaVersion/],
    [p => { p.shots[1].id = p.shots[0].id }, /Duplicate shot/],
    [p => { p.shots[1].startFrame++ }, /coverage/],
    [p => { p.scenes[1].startFrame-- }, /coverage/],
    [p => { p.scenes[1].shotIds = ['shot-0'] }, /membership/],
    [p => { p.scenes[0].shotIds = ['unknown'] }, /Unknown shot/],
    [p => { p.scriptSegments[0].durationFrames-- }, /coverage/],
    [p => { p.shots[0].durationFrames = -1 }, /durationFrames/],
    [p => { p.durationFrames = 2 ** 53 }, /durationFrames/],
    [p => { p.frameRate.denominator = 0 }, /denominator/],
    [p => { p.frameRate = { numerator: 60, denominator: 2 } }, /reduced rational/],
    [p => { p.frameRate.numerator = 121 }, /fps/],
    [p => { p.resolution.width++ }, /Resolution/],
    [p => { p.resolution.height = 720 }, /aspectRatio/],
    [p => { p.shots[0].assetIds = ['missing'] }, /Unknown asset/],
    [p => { p.shots[0].visualElements[0].x = 0.99 }, /bounds/],
    [p => { p.shots[0].visualElements[0].style = { animation: 'evil' } }, /Unrecognized/],
    [p => { p.execute = 'process.exit()' }, /Unrecognized/],
    [p => { p.assets[0].path = '../secret.wav' }, /path/],
    [p => { p.assets[0].path = '/etc/secret.wav' }, /path/],
    [p => { p.assets[0].path = 'https://example.com/a.wav' }, /path/],
    [p => { p.assets[0].path = 'a%2fwav.wav' }, /path/],
    [p => { p.assets[0].path = 'file.wav?x=1' }, /path/],
    [p => { p.assets[0].kind = 'image' }, /extension|audio asset/],
    [p => { p.audio[0].assetId = 'missing' }, /audio asset/],
    [p => { p.audio[0].durationFrames++ }, /duration/],
    [p => { p.transitions[0].toShotId = 'shot-2' }, /adjacent/],
    [p => { p.transitions[0].sharedElementId = 'missing' }, /Morph/],
    [p => { p.transitions[0].durationFrames = 61 }, /Morph/],
    [p => { p.shots[0].transition = 'missing' }, /transition/],
    [p => { p.productionMode = 'presenter' }, /Presenter/],
    [p => { p.captions = [{ id: 'c', scriptSegmentId: 'unknown', text: 'x', startFrame: 0, durationFrames: 1 }] }, /caption/],
  ]
  for (const [mutate, error] of invalid) { const plan = clone(); mutate(plan); assert.throws(() => parseDirectorPlan(plan), error) }
  console.log('PASS strict schema: 3-scene coverage, IDs, reduced rational fps, even aspect resolution, references, bounds and safe paths (' + invalid.length + ' rejection cases)')
  for (const change of [
    a => { a.scriptSegmentId = 'unknown' }, a => { a.scriptSegmentId = 'segment-1' }, a => { a.charOffset = 999 },
    a => { a.frame = 60 }, a => { a.frame = -1 }, a => { a.frame = 0.5 },
  ]) { const p = clone(); change(p.shots[0].cueAnchors[0]); assert.throws(() => parseDirectorPlan(p), /cue|frame|Invalid cue/) }
  const unicode = clone(); unicode.scriptSegments[0].text = 'A😀B'; unicode.shots[0].cueAnchors[0].charOffset = 2
  assert.doesNotThrow(() => parseDirectorPlan(unicode))
  unicode.shots[0].cueAnchors[0].charOffset = 3
  assert.throws(() => parseDirectorPlan(unicode), /cue anchor/)
  const rational = clone(); rational.frameRate = { numerator: 30000, denominator: 1001 }
  assert.equal(compileDirectorPlan(rational).fps, 30000 / 1001)
  const portrait = clone(); portrait.aspectRatio = '9:16'; portrait.resolution = { width: 360, height: 640 }
  assert.deepEqual([compileDirectorPlan(portrait).width, compileDirectorPlan(portrait).height], [360, 640])
  const unsupported = clone(); unsupported.shots[0].camera = 'slow-push'
  assert.throws(() => compileDirectorPlan(unsupported), /M1/)
  console.log('PASS cue anchors enforce Unicode character and half-open segment/shot ranges; landscape, portrait and rational metadata compile')
  for (const [i, boundary] of [[0, 60], [1, 120]]) {
    const from = demo.shots[i].visualElements[0], to = demo.shots[i + 1].visualElements[0]
    const before = morph.sharedElementsAtFrame(demo, boundary - 18)[0]
    const mid = morph.sharedElementsAtFrame(demo, boundary - 9)[0]
    const after = morph.sharedElementsAtFrame(demo, boundary)[0]
    for (const key of ['x', 'y', 'width', 'height', 'fontSize', 'borderRadius']) {
      assert.equal(before[key], from[key]); assert.equal(after[key], to[key]); assert(Math.abs(mid[key] - (from[key] + to[key]) / 2) < 1e-9)
    }
    assert.equal(mid.sharedKey, 'idea'); assert.equal(mid.text, '3')
    assert.deepEqual(morph.sharedElementsAtFrame(demo, boundary - 9), morph.sharedElementsAtFrame(demo, boundary - 9))
  }
  assert.deepEqual(morph.sharedElementsAtFrame(demo, 180), [])
  console.log('PASS shared-element morph preserves identity and interpolates geometry, font and radius at both boundaries')
  await server.listen()
  const url = server.resolvedUrls.local[0]
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = [], external = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (!request.url().startsWith(url) && !request.url().startsWith('data:')) external.push(request.url()) })
  await page.goto(url + '#/project/before-the-tide/video')
  await page.getByRole('button', { name: 'Director demo (Remotion)', exact: true }).click()
  await page.getByRole('dialog').waitFor()
  await page.locator('[data-scene-type="title"]').waitFor()
  assert.equal(await page.locator('[data-shared-key="idea"]').count(), 1)
  const audio = page.locator('audio[src="/director/synthetic-tones.wav"]')
  await audio.waitFor({ state: 'attached' })
  await page.waitForFunction(() => [...document.querySelectorAll('audio')].some(a => a.readyState >= 2))
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'detached' })
  assert.equal(await page.locator('audio').count(), 0)
  await page.getByRole('button', { name: 'Talking head', exact: true }).click()
  await page.getByRole('region', { name: 'Video timeline', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Director demo (Remotion)', exact: true }).click()
  await page.locator('[data-scene-type="title"]').waitFor()
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Director control must fit narrow workspace')
  // Test actual Player ref seeking with the same shared component, without product-only test hooks.
  const harness = `<html><body><div id="root"></div><script type="module">
    import React from 'react'; import {createRoot} from 'react-dom/client'; import {Player} from '@remotion/player';
    import {DirectorComposition} from '/src/director/DirectorComposition.tsx';
    const withMedia = location.search === '?media';
    const plan = await (await fetch(withMedia ? './player-media.json' : '/director/demo-plan.json')).json();
    const mediaSources = withMedia ? {tone:'/director/synthetic-tones.wav', coast:'/demo-media/before-the-tide.jpg', mist:'/demo-media/coastal-mist.mp4', waves:'/demo-media/waves.jpg'} : undefined;
    const ref = React.createRef();
    window.seekDirector = frame => ref.current.seekTo(frame);
    createRoot(document.getElementById('root')).render(React.createElement(Player,{ref, component:DirectorComposition,inputProps:{plan,mediaSources},durationInFrames:180,fps:30,compositionWidth:640,compositionHeight:360,controls:true}));
  </script></body></html>`
  await writeFile(join(work, 'player.html'), harness)
  await page.goto(url + '.tmp/v2/remotion-tests/player.html')
  await page.locator('[data-scene-type="title"]').waitFor()
  for (const [frame, type] of [[51, 'title'], [60, 'chart'], [111, 'chart'], [120, 'quote'], [179, 'quote']]) {
    await page.evaluate(f => window.seekDirector(f), frame)
    await page.locator('[data-director-frame="' + frame + '"] [data-scene-type="' + type + '"]').waitFor()
    const element = await page.locator('[data-shared-key="idea"]').evaluate(e => ({ x: parseFloat(e.style.left), width: parseFloat(e.style.width) }))
    const expected = morph.sharedElementsAtFrame(demo, frame)[0]
    assert(Math.abs(element.x - expected.x * 640) < 0.001)
    assert(Math.abs(element.width - expected.width * 640) < 0.001)
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, [])
  await page.screenshot({ path: join(work, 'player-quote.png') })
  await writeFile(join(work, 'player-media.json'), JSON.stringify(layered))
  await page.goto(url + '.tmp/v2/remotion-tests/player.html?media')
  await page.locator('[data-scene-type="title"]').waitFor()
  await page.evaluate(() => window.seekDirector(150))
  await page.waitForFunction(() => {
    const video = document.querySelector('video[src^="/demo-media/coastal-mist.mp4"]')
    const image = document.querySelector('img[src="/demo-media/before-the-tide.jpg"]')
    return video?.muted && video.readyState >= 2 && Math.abs(video.currentTime - 2.5) < 0.1 && image?.naturalWidth > 0
  })
  await page.evaluate(() => window.seekDirector(178))
  await page.locator('video').waitFor({ state: 'detached' })
  assert.deepEqual(errors, []); assert.deepEqual(external, [])
  console.log('PASS Player displays resolved local image/video at the frame-driven source offset and mutes B-roll')
  await page.close(); await browser.close(); browser = null
  console.log('PASS real Player mounting, local audio load, frame seeking through all 3 scenes and morphs, modal cleanup, native timeline and 390 px layout')
  const validated = await command(['director', 'validate', 'public/director/demo-plan.json'])
  assert.equal(validated.shots, 3)
  await command(['director', 'validate'], 2)
  await command(['video', 'export-remotion', 'public/director/demo-plan.json'], 2)
  await writeFile(join(work, 'invalid.json'), '{"schemaVersion":1,"execute":"alert(1)"}')
  await command(['director', 'validate', join(work, 'invalid.json')], 1)
  await writeFile(join(work, 'malformed.json'), '{')
  await command(['director', 'validate', join(work, 'malformed.json')], 1)
  console.log('PASS non-interactive director CLI JSON and exit codes 0/1/2')
  const ffmpeg = process.env.FFMPEG_PATH, ffprobe = process.env.FFPROBE_PATH
  assert(ffmpeg && ffprobe, 'Real render requires explicit local LGPL FFMPEG_PATH and FFPROBE_PATH; no skip is reported as pass')
  const browserPath = process.env.SHOTWEFT_BROWSER ?? chromium.executablePath()
  const planHash = digest(await readFile('public/director/demo-plan.json'))
  const audioHash = digest(await readFile('public/director/synthetic-tones.wav'))
  await copyFile('public/demo-media/before-the-tide.jpg', join(work, 'coast.jpg'))
  await copyFile('public/demo-media/waves.jpg', join(work, 'waves.jpg'))
  // Copy the real video picture and give its otherwise silent clip a detectable test soundtrack.
  await execute(ffmpeg, ['-v', 'error', '-y', '-i', 'public/demo-media/coastal-mist.mp4', '-i', 'public/director/synthetic-tones.wav',
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-shortest', join(work, 'mist.mp4')])
  async function rgb(input, filter) {
    const { stdout } = await execute(ffmpeg, ['-v', 'error', '-i', input, '-vf', filter, '-frames:v', '1', '-pix_fmt', 'rgb24',
      '-f', 'rawvideo', '-'], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 })
    return stdout
  }
  function pixelDistance(a, b) {
    assert.equal(a.length, b.length)
    assert(a.length > 0)
    return a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0) / a.length
  }
  const outputs = []
  for (const [name, plan] of [['landscape', demo], ['portrait', portrait], ['real-media', layered]]) {
    const input = join(work, name + '.json'), output = join(work, name + '.mp4')
    await writeFile(input, JSON.stringify(plan)); await copyFile('public/director/synthetic-tones.wav', join(work, 'synthetic-tones.wav'))
    await rm(output, { force: true })
    const args = ['video', 'export-remotion', input, '--output', output, '--browser', browserPath]
    const result = await command(args)
    assert.equal(result.engine, 'remotion-frames-lgpl-ffmpeg')
    const { stdout } = await execute(ffprobe, ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', output])
    const probe = JSON.parse(stdout)
    await writeFile(join(work, name + '-ffprobe.json'), stdout)
    const [video, sound] = probe.streams
    assert.equal(video.codec_name, 'h264'); assert.equal(video.pix_fmt, 'yuv420p')
    assert.equal(video.width, plan.resolution.width); assert.equal(video.height, plan.resolution.height)
    assert.equal(video.avg_frame_rate, '30/1'); assert.equal(video.nb_read_frames, '180'); assert.equal(Number(video.duration), 6)
    assert.equal(sound.codec_name, 'aac'); assert.equal(sound.channels, 2); assert.equal(sound.sample_rate, '48000')
    assert(Math.abs(Number(sound.duration) - 6) < 0.04)
    // Decode audio independently: the intended three tone frequencies must survive the export.
    const { stdout: samples } = await execute(ffmpeg, ['-v', 'error', '-i', output, '-map', '0:a:0', '-ac', '1', '-f', 'f32le', '-'], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 })
    for (const [from, frequency] of [[0.5, 220], [2.5, 330], [4.5, 440]]) {
      assert(toneAmplitude(samples, from, frequency) > 0.03, 'Missing synthetic tone ' + frequency)
    }
    // Independent picture sampling confirms moving shared geometry, not only static frame metadata.
    const frameXs = name === 'portrait' ? [169, 204, 265] : [300, 360, 470]
    const { stdout: pixels } = await execute(ffmpeg, ['-v', 'error', '-i', output, '-vf', 'select=eq(n\\,42)+eq(n\\,51)+eq(n\\,60)', '-fps_mode', 'passthrough', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 })
    assert.equal(pixels.length, 3 * video.width * video.height * 3)
    // Save representative decoded frames for human inspection.
    await execute(ffmpeg, ['-v', 'error', '-y', '-i', output, '-vf', 'select=eq(n\\,51)', '-frames:v', '1', join(work, name + '-morph.png')])
    for (let i = 0; i < 3; i++) {
      const y = Math.round([0.33, 0.26, 0.19][i] * video.height)
      const offset = ((i * video.height + y) * video.width + frameXs[i]) * 3
      assert(pixels[offset] > 180 && pixels[offset + 1] > 130 && pixels[offset + 2] < 160, 'Expected moving gold shared element at frame ' + [42, 51, 60][i])
    }
    if (name === 'real-media') {
      const frame = n => `select=eq(n\\,${n})`
      const imageCrop = 'crop=160:96:32:120'
      const videoCrop = 'crop=156:256:412:32'
      const overlayCrop = 'crop=144:74:168:8'
      const [picture, coast, videoPicture, videoSource, videoUntrimmed, overlay, waves, beforeImage, beforeVideo] = await Promise.all([
        rgb(output, frame(150) + ',' + imageCrop),
        rgb(join(work, 'coast.jpg'), 'scale=640:360:force_original_aspect_ratio=increase,crop=640:360,' + imageCrop),
        rgb(output, frame(150) + ',' + videoCrop),
        rgb(join(work, 'mist.mp4'), frame(75) + ',scale=180:320,crop=156:256:12:32'),
        rgb(join(work, 'mist.mp4'), frame(15) + ',scale=180:320,crop=156:256:12:32'),
        rgb(output, frame(150) + ',' + overlayCrop),
        rgb(join(work, 'waves.jpg'), 'scale=160:90,crop=144:74:8:8'),
        rgb(output, frame(124) + ',' + imageCrop),
        rgb(output, frame(134) + ',' + videoCrop),
      ])
      const videoDifference = pixelDistance(videoPicture, videoSource)
      assert(pixelDistance(picture, coast) < 12, 'Image layer pixels must match the coast JPEG')
      assert(pixelDistance(beforeImage, coast) > 20, 'Image layer must respect its start frame')
      assert(videoDifference < 12, `Video region must match the clip source frame (pixel difference ${videoDifference})`)
      assert(videoDifference < pixelDistance(videoPicture, videoUntrimmed), 'Video must respect its source offset')
      assert(pixelDistance(beforeVideo, videoSource) > videoDifference + 10, 'Video layer must respect its start frame')
      assert(pixelDistance(overlay, waves) < 12, 'Asset-backed visual element must match the waves JPEG')
      assert(toneAmplitude(samples, 4.6, 330) < 0.015, 'B-roll audio must stay muted under the explicit soundtrack')
      await execute(ffmpeg, ['-v', 'error', '-y', '-i', output, '-vf', frame(150), '-frames:v', '1', join(work, 'real-media.png')])
      console.log('PASS decoded image layer, trimmed video region and asset-backed visual match their sources, with explicit audio preserved and B-roll muted')
    }
    const hash = digest(await readFile(output))
    assert.match((await command(args, 1)).error, /EEXIST/)
    assert.equal(digest(await readFile(output)), hash)
    outputs.push(result)
    console.log('PASS real Remotion ' + name + ' MP4: ' + JSON.stringify(result.video))
  }
  await writeFile(join(work, 'render-evidence.json'), JSON.stringify(outputs, null, 2))
  const failure = join(work, 'failed.mp4')
  await rm(failure, { force: true })
  await command(['video', 'export-remotion', join(work, 'landscape.json'), '--output', failure, '--browser', join(work, 'missing-browser')], 1)
  await assert.rejects(readFile(failure), { code: 'ENOENT' })
  const outside = join(root, '.tmp/v2/outside.wav'), linked = join(work, 'linked.wav')
  await copyFile('public/director/synthetic-tones.wav', outside); await rm(linked, { force: true }); await symlink(outside, linked)
  const escaped = clone(); escaped.assets[0].path = 'linked.wav'
  await writeFile(join(work, 'escape.json'), JSON.stringify(escaped))
  assert.match((await command(['video', 'export-remotion', join(work, 'escape.json'), '--output', failure], 1)).error, /symlink escapes/)
  await rm(linked)
  const tooLong = clone(); tooLong.audio[0].sourceInFrame = 1
  await writeFile(join(work, 'long-audio.json'), JSON.stringify(tooLong))
  assert.match((await command(['video', 'export-remotion', join(work, 'long-audio.json'), '--output', failure], 1)).error, /source range/)
  const badMedia = structuredClone(layered)
  const badInput = join(work, 'bad-media.json')
  badMedia.assets.find(asset => asset.id === 'coast').path = 'missing-coast.jpg'
  await writeFile(badInput, JSON.stringify(badMedia))
  const badMediaArgs = ['video', 'export-remotion', badInput, '--output', failure]
  assert.match((await command(badMediaArgs, 1)).error, /Missing local media for asset coast/)
  badMedia.assets.find(asset => asset.id === 'coast').path = 'coast.jpg'
  badMedia.shots[2].mediaLayers[1].sourceInFrame = 149
  await writeFile(badInput, JSON.stringify(badMedia))
  assert.match((await command(badMediaArgs, 1)).error, /source range exceeds measured duration for asset mist/)
  await assert.rejects(readFile(failure), { code: 'ENOENT' })
  const targetLink = join(work, 'existing-link.mp4')
  await rm(targetLink, { force: true }); await symlink(join(work, 'landscape.mp4'), targetLink)
  assert.match((await command(['video', 'export-remotion', join(work, 'landscape.json'), '--output', targetLink], 1)).error, /EEXIST/)
  await rm(targetLink)
  assert.equal(digest(await readFile('public/director/demo-plan.json')), planHash)
  assert.equal(digest(await readFile('public/director/synthetic-tones.wav')), audioHash)
  assert(!(await readdir(work)).some(n => n.endsWith('.shotweft-lock')))
  assert(!(await readdir('.tmp')).some(n => n.startsWith('director-render-')))
  console.log('PASS staged publication refuses existing files/symlinks, source bytes unchanged, unsafe symlinks and bad audio/browser fail cleanly; no temporary render directories remain')
} finally {
  if (browser) await browser.close()
  await server.close()
}
