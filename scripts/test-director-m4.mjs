import { strict as assert } from 'node:assert'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const cli = resolve('dist/cli/shotweft.js')
const ffmpeg = process.env.FFMPEG_PATH
const ffprobe = process.env.FFPROBE_PATH
assert(ffmpeg && ffprobe, 'Set FFMPEG_PATH and FFPROBE_PATH to the local LGPL builds.')
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.browsers')
const parent = resolve('.tmp/test-director-m4')
await mkdir(parent, { recursive: true })
const dir = await mkdtemp(join(parent, 'run-'))
const path = name => join(dir, name)
const fps = 30

function command(args, code = 0) {
  return exec(process.execPath, [cli, ...args], { timeout: 20 * 60_000, maxBuffer: 8 * 1024 * 1024 })
    .then(result => { assert.equal(code, 0, result.stderr); return JSON.parse(result.stdout) },
      error => { assert.equal(error.code, code, error.stdout + error.stderr); return JSON.parse(error.stderr) })
}

async function validate(name, plan) {
  await writeFile(path(name), JSON.stringify(plan) + '\n')
  return command(['director', 'validate', path(name)], 0)
}
async function reject(name, plan, pattern) {
  await writeFile(path(name), JSON.stringify(plan) + '\n')
  const result = await command(['director', 'validate', path(name)], 1)
  assert.match(result.error, pattern, name)
}

const base = JSON.parse(await readFile('demos/m4/plan.json', 'utf8'))
const clone = value => structuredClone(value)
const firstComponent = (plan, kind) => plan.shots.flatMap(shot => shot.visualElements).find(element => element.component === kind)

try {
  // Backward compatibility: existing plans still validate unchanged.
  await validate('m2.json', JSON.parse(await readFile('demos/m2/director-plan.json', 'utf8')))
  await validate('m1.json', JSON.parse(await readFile('public/director/demo-plan.json', 'utf8')))

  // Schema acceptance and rejection for the new animation/component surface.
  await validate('base.json', base)
  let broken = clone(base); delete firstComponent(broken, 'stat').value
  await reject('stat.json', broken, /Stat component requires a numeric value/)
  broken = clone(base); const pathEl = firstComponent(broken, 'path'); pathEl.pathData = 'M 1 2 L broken'
  await reject('path.json', broken, /must be a single SVG path/)
  broken = clone(base); const mapEl = firstComponent(broken, 'map'); delete mapEl.routes; delete mapEl.markers
  await reject('map.json', broken, /Map component requires routes or markers/)
  broken = clone(base); const statEl = firstComponent(broken, 'stat'); statEl.animation.keyframes = [{ frame: 40, opacity: 1 }, { frame: 20, opacity: 0 }]
  await reject('keyframes.json', broken, /strictly increasing/)
  broken = clone(base); firstComponent(broken, 'stat').animation.keyframes = [{ frame: 0, opacity: 1 }, { frame: 500, opacity: 0 }]
  await reject('keyframe-range.json', broken, /inside the element window/)
  broken = clone(base); firstComponent(broken, 'bullets').animation.stagger = { unit: 'item', frames: 40 }
  await reject('stagger.json', broken, /Stagger exceeds the element window/)
  broken = clone(base); firstComponent(broken, 'title').camera = { fromScale: 1, toScale: 1.1, fromX: 0.5, fromY: 0.5, toX: 0.5, toY: 0.5 }
  await reject('camera.json', broken, /Unrecognized key|camera/)
  broken = clone(base); firstComponent(broken, 'title').animation.enter.easing = 'bounce'
  await reject('easing.json', broken, /Invalid option|Invalid enum|expected one of/)
  broken = clone(base); firstComponent(broken, 'title').animation.random = true
  await reject('strict.json', broken, /Unrecognized key|Invalid input/)
  broken = clone(base)
  broken.transitions.find(transition => transition.kind === 'morph').sharedElementIds = ['morph-title', 'absent']
  await reject('morph.json', broken, /Morph needs matching shared graphic elements/)
  console.log('PASS existing plans still validate; 10 new rejection cases and the component plan are enforced')

  // Component reel exercising every registry entry, two multi-element morphs and a path morph.
  const reel = (() => {
    const specs = [
      ['title', { component: 'title', text: 'Component test', subtitle: 'M4', animation: { enter: { preset: 'blur', durationFrames: 8 } } }],
      ['chapter', { component: 'chapter', text: 'Chapter one', subtitle: '01', animation: { enter: { preset: 'rise', durationFrames: 8 } } }],
      ['bullets', { component: 'bullets', text: '', items: [{ id: 'a', label: 'First' }, { id: 'b', label: 'Second' }],
        animation: { enter: { preset: 'rise', durationFrames: 6 }, stagger: { unit: 'item', frames: 4 } } }],
      ['timeline', { component: 'timeline', text: '', items: [{ id: 't1', label: 'One' }, { id: 't2', label: 'Two' }, { id: 't3', label: 'Three' }],
        animation: { enter: { preset: 'fade', durationFrames: 6 }, stagger: { unit: 'item', frames: 4 } } }],
      ['path', { component: 'path', text: '', pathData: 'M 10 80 L 50 20 L 90 70', animation: { enter: { preset: 'fade', durationFrames: 18 } } }],
      ['stat', { component: 'stat', text: 'total', value: 42, suffix: ' km', animation: { enter: { preset: 'scale', durationFrames: 10 } } }],
      ['map', { component: 'map', text: '', routes: [{ id: 'r', points: [[10, 20], [60, 30], [100, 10]] }],
        markers: [{ id: 'm', lon: 10, lat: 20, label: 'Origin' }, { id: 'n', lon: 100, lat: 10, label: 'End' }],
        land: [{ id: 'l', points: [[5, 0], [110, 0], [110, 45], [5, 45]] }], projection: 'equirectangular',
        animation: { enter: { preset: 'fade', durationFrames: 18 } } }],
    ]
    const shots = [], segments = [], transitions = []
    const per = 22
    specs.forEach(([type, element], index) => {
      const start = index * per
      const segmentId = 'seg-' + index
      segments.push({ id: segmentId, text: type, startFrame: start, durationFrames: per })
      const shared = type === 'title' || type === 'chapter' ? [
        { id: 'shared-text', kind: 'text', sharedKey: 'shared', text: 'Shared', x: 0.06, y: 0.06, width: 0.2, height: 0.08,
          fontSize: 20, color: '#ffffff', background: '#17243d', borderRadius: 4, text: 'Shared' },
        { id: 'shared-bar', kind: 'box', sharedKey: 'shared-bar', text: '', x: 0.06, y: 0.15, width: 0.2, height: 0.02,
          fontSize: 10, color: '#ffcf73', background: '#ffcf73', borderRadius: 2 },
      ] : type === 'path' || type === 'stat' ? [
        { id: 'shared-path', kind: 'component', component: 'path', sharedKey: 'shape', text: '',
          pathData: type === 'path' ? 'M 10 80 L 50 20 L 90 70' : 'M 10 20 L 50 80 L 90 30',
          x: 0.72, y: 0.08, width: 0.2, height: 0.18, fontSize: 10, color: '#ffcf73', background: 'transparent', borderRadius: 0 },
      ] : []
      shots.push({ id: 'shot-' + index, scriptSegmentIds: [segmentId], purpose: type, startFrame: start, durationFrames: per,
        sceneType: 'graphic', camera: 'static', assetIds: [],
        visualElements: [{ id: 'el-' + index, text: '', x: 0.1, y: 0.28, width: 0.8, height: 0.5, fontSize: 40,
          color: '#ffffff', background: 'transparent', borderRadius: 0, ...element,
          ...(element.component ? { kind: 'component' } : {}) }, ...shared],
        rationale: 'M4 test shot',
        cueAnchors: [], presenterLayout: 'none', transition: index < specs.length - 1 ? 'trans-' + index : null })
      if (index < specs.length - 1) {
        if (index === 0) transitions.push({ id: 'trans-0', fromShotId: 'shot-0', toShotId: 'shot-1', kind: 'morph', durationFrames: 8,
          sharedElementId: 'shared', sharedElementIds: ['shared', 'shared-bar'] })
        else if (index === 4) transitions.push({ id: 'trans-4', fromShotId: 'shot-4', toShotId: 'shot-5', kind: 'morph', durationFrames: 8,
          sharedElementId: 'shape', sharedElementIds: ['shape'] })
        else transitions.push({ id: 'trans-' + index, fromShotId: 'shot-' + index, toShotId: 'shot-' + (index + 1), kind: 'cut',
          durationFrames: 0, sharedElementId: null })
      }
    })
    return { schemaVersion: 1, productionMode: 'script', originalScript: specs.map(s => s[0]).join('\n'), scriptSegments: segments,
      aspectRatio: '16:9', frameRate: { numerator: 30, denominator: 1 }, resolution: { width: 320, height: 180 },
      durationFrames: specs.length * per, scenes: [{ id: 'scene', title: 'Reel', startFrame: 0, durationFrames: specs.length * per,
        shotIds: shots.map(shot => shot.id) }],
      shots, narration: { text: specs.map(s => s[0]).join('\n'), assetId: null, scriptSegmentIds: segments.map(s => s.id), timing: 'estimated' },
      presenter: null, assets: [], captions: [], transitions, audio: [],
      style: { background: '#0f1b2d', foreground: '#ffffff', accent: '#ffcf73', fontFamily: 'sans-serif' }, reviewStatus: 'draft' }
  })()
  await validate('reel.json', reel)
  const first = await command(['video', 'export-remotion', path('reel.json'), '--output', path('reel-a.mp4')])
  const second = await command(['video', 'export-remotion', path('reel.json'), '--output', path('reel-b.mp4')])
  assert.equal(first.video.frameCount, reel.durationFrames)
  assert.deepEqual(first.video.audio.codec, 'aac')

  const frames = async file => (await exec(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', file, '-map', '0:v', '-f', 'framemd5', '-']))
    .stdout.split('\n').filter(line => line && !line.startsWith('#')).join('\n')
  assert.equal(await frames(path('reel-a.mp4')), await frames(path('reel-b.mp4')), 'renders must be frame-identical across runs')
  console.log('PASS every component renders through the CLI and two runs are frame-identical')

  await writeFile(path('quality.json'), JSON.stringify({ minCutsPerMinute: 0, stillRatio: 0.4 }))
  const reviewed = await exec(process.execPath, ['scripts/review-video.mjs', path('reel-a.mp4'), '--config', path('quality.json')], { env: process.env })
  const report = JSON.parse(reviewed.stdout)
  assert.equal(report.ok, true, JSON.stringify(report.failures))
  assert.ok(report.stillRatio < 0.6, 'component reel must not be a slide deck')
  console.log('PASS automated review accepts the motion of the component reel')
} finally {
  await rm(dir, { recursive: true, force: true })
}
