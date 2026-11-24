import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { BlobReader, BlobWriter, TextReader, ZipReader, ZipWriter } from '@zip.js/zip.js'
import { createServer } from 'vite'

const execute = promisify(execFile)
const workRoot = resolve('.tmp/director-project')
await mkdir(workRoot, { recursive: true })
const work = await mkdtemp(join(workRoot, 'test-'))
const server = await createServer({ configFile: false, cacheDir: join(work, 'vite'),
  server: { middlewareMode: true, hmr: false, watch: null } })
const load = path => server.ssrLoadModule('/src/' + path)
const end = span => span.startFrame + span.durationFrames

function assertCoverage(spans, duration) {
  let cursor = 0
  for (const span of [...spans].sort((a, b) => a.startFrame - b.startFrame)) {
    assert.equal(span.startFrame, cursor)
    assert(Number.isInteger(span.durationFrames) && span.durationFrames > 0)
    cursor = end(span)
  }
  assert.equal(cursor, duration)
}

try {
  const [model, history, archive, planModule, planner, audio, remap, composition] = await Promise.all([
    load('model.ts'), load('db.ts'), load('core/project-archive.ts'), load('core/director/plan.ts'),
    load('core/director/planner.ts'), load('core/director/audio.ts'), load('core/director/remap.ts'), load('director/DirectorComposition.tsx'),
  ])
  const { parseDirectorPlan, referencedDirectorAssetIds } = planModule
  const legacy = JSON.parse(await readFile('scripts/fixtures/project-v1.0.json', 'utf8'))
  const photo = new Blob([await readFile('public/demo-media/before-the-tide.jpg')], { type: 'image/jpeg' })
  const wav = new Blob([await readFile('public/director/synthetic-tones.wav')], { type: 'audio/wav' })
  const rawZip = async (manifest, entries = []) => {
    const writer = new ZipWriter(new BlobWriter('application/zip'))
    const options = { level: 0, useWebWorkers: false }
    await writer.add('project.json', new TextReader(JSON.stringify(manifest)), options)
    for (const [name, blob] of entries) await writer.add(name, new BlobReader(blob), options)
    return writer.close()
  }
  const legacyZip = await rawZip(legacy, [['photos/0.jpg', photo]])
  assert.deepEqual((await archive.readProjectZIP(legacyZip)).project, legacy.project)
  assert.deepEqual(archive.readProjectManifest(legacy, 'JSON'), legacy)
  assert.equal(archive.projectManifest(legacy.project, []).version, 1)

  const project = model.newProject('Project with direction', '16:9')
  const baseAsset = { projectId: project.id, created: 0, thumbnail: photo }
  const items = [
    { ...baseAsset, id: '5d82-project-photo', kind: 'image', name: 'image.jpg', blob: photo, width: 640, height: 360 },
    { ...baseAsset, id: '4d82-project-voice', kind: 'audio', name: 'voice.wav', blob: wav, duration: 6 },
  ]
  const video = { schemaVersion: 1, fps: { numerator: 30, denominator: 1 }, width: 640, height: 360, tracks: [], subtitles: [] }
  const v2Project = { ...project, video, activeTimeline: 'video' }
  const loadPhoto = async () => { throw new Error('Unexpected bundled photo') }
  const v2 = await archive.readProjectZIP(await archive.writeProjectZIP(v2Project, items, loadPhoto))
  assert.equal(v2.manifest.version, 2)
  assert.deepEqual(v2.project, v2Project)
  assert.equal(v2.items[1].kind, 'audio')
  assert(!('direction' in model.demoProject()) && !('activeTimeline' in model.demoProject()))
  console.log('PASS V1.0 manifest/ZIP fixture, v2 project ZIP and unseeded demo fields')

  const estimated = planner.planFromScript({ script: 'The shoreline study begins.\n\nThe shoreline study continues.\n\nThe coast changes.',
    frameRate: { numerator: 30000, denominator: 1001 },
    mediaAssets: [{ id: 'coast', kind: 'image', projectAssetId: items[0].id, keywords: ['coast'] }],
  })
  const narration = { id: 'voice', kind: 'audio', projectAssetId: items[1].id, description: 'Synthetic test audio' }
  const plan = audio.attachNarration(estimated, { asset: narration, measuredDurationFrames: 179, origin: 'synthetic' })
  const embedded = { ...v2Project, direction: plan, activeTimeline: 'director' }
  const before = history.editState(v2Project)
  const after = history.editState(embedded)
  assert.deepEqual(history.applyEditState(embedded, before), v2Project)
  assert.deepEqual(history.applyEditState(v2Project, after), embedded)
  assert.deepEqual(history.applyEditState(embedded, { frame: project.frame, scenes: project.scenes, shots: project.shots }), project)
  const revised = { ...embedded, activeTimeline: 'video', direction: { ...plan, reviewStatus: 'needs-review' } }
  assert.deepEqual(history.applyEditState(revised, after), embedded)
  assert.deepEqual(history.applyEditState(embedded, history.editState(revised)), revised)
  console.log('PASS plan addition, edits, active-timeline switching and legacy snapshots through undo/redo state helpers')

  const ids = new Map(items.map((item, i) => [item.id, i + '-copied-asset']))
  const snapshot = structuredClone(plan)
  const remapped = remap.remapDirectorPlan(plan, ids)
  assert.deepEqual(plan, snapshot)
  assert.deepEqual(remapped, { ...plan, assets: plan.assets.map(asset => ({ ...asset, projectAssetId: ids.get(asset.projectAssetId) })) })
  assert.notStrictEqual(remapped.shots, plan.shots)
  assert.deepEqual(parseDirectorPlan(remapped), remapped)
  assert.throws(() => remap.remapDirectorPlan(plan, new Map()), /Cannot remap missing project asset/)
  assert.throws(() => model.duplicateProject(embedded), /Cannot remap missing project asset/)
  assert.deepEqual([...referencedDirectorAssetIds(remapped)].sort(), ['coast', 'voice'])
  const duplicate = model.duplicateProject(embedded, ids)
  assert.deepEqual(duplicate.direction, remapped)
  assert.equal(duplicate.activeTimeline, 'director')
  assert(duplicate.direction.assets.every(asset => [...ids.values()].includes(asset.projectAssetId)))
  console.log('PASS remap and project duplicate preserve internal IDs and source plan with zero dangling project refs')

  const zip = await archive.writeProjectZIP(embedded, items, loadPhoto)
  const read = await archive.readProjectZIP(zip)
  assert.equal(read.manifest.version, 3)
  assert.deepEqual(read.project, embedded)
  assert.equal(JSON.stringify(read.project.direction), JSON.stringify(plan))
  assert.deepEqual(await Promise.all(read.items.map(item => item.blob.arrayBuffer())), await Promise.all(items.map(item => item.blob.arrayBuffer())))
  const reader = new ZipReader(new BlobReader(zip))
  try {
    assert.deepEqual((await reader.getEntries()).map(entry => entry.filename).sort(),
      ['media/0/original', 'media/0/thumbnail', 'media/1/original', 'media/1/thumbnail', 'project.json'])
  } finally { await reader.close() }
  const manifest = () => structuredClone(read.manifest)
  const failures = [
    [data => { data.project.direction.assets[0].projectAssetId = '5-unknown' }, /matching project asset/],
    [data => { data.assets[0].projectId = 'foreign' }, /matching project asset/],
    [data => { data.project.direction.assets[0].projectAssetId = items[1].id }, /kind image/],
    [data => { data.project.direction.durationFrames++ }, /Invalid DirectorPlan/],
    [data => { data.version = 2 }, /version 3/],
  ]
  for (const [mutate, error] of failures) {
    const data = manifest(); mutate(data)
    assert.throws(() => archive.readProjectManifest(data, 'JSON'), error)
    await assert.rejects(archive.readProjectZIP(await rawZip(data)), error)
  }
  const pathOnly = manifest()
  delete pathOnly.project.direction.assets[0].projectAssetId
  pathOnly.project.direction.assets[0].path = 'coast.jpg'
  assert.deepEqual(archive.readProjectManifest(pathOnly, 'JSON').project.direction, pathOnly.project.direction)
  await assert.rejects(archive.readProjectZIP(await rawZip(pathOnly)), /Import it as a project asset/)
  await assert.rejects(archive.writeProjectZIP(pathOnly.project, items, loadPhoto), /Import it as a project asset/)
  console.log('PASS exact ZIP v3 round-trip and entry set, strict parsing, dangling/foreign/kind checks and JSON-only local paths')

  assert(estimated.narration.timing === 'estimated' && estimated.narration.assetId === null)
  assert(audio.estimateNarrationSeconds('这是用来测试的相当长的一段话。') > audio.estimateNarrationSeconds('Test.'))
  assert.equal(plan.narration.timing, 'actual')
  assert.equal(plan.narration.origin, 'synthetic')
  const withBed = parseDirectorPlan({ ...plan, audio: [...plan.audio, { id: 'bed', assetId: 'voice', startFrame: 15,
    sourceInFrame: 160, durationFrames: 19, volume: 0.2 }] })
  for (const target of [6, 37, 179, 241, 400]) {
    const scaled = audio.reflowDirectorPlan(withBed, target)
    for (const spans of [scaled.scriptSegments, scaled.scenes, scaled.shots, scaled.captions]) assertCoverage(spans, target)
    for (const shot of scaled.shots) {
      assert(shot.cueAnchors.every(({ frame }, index, cues) => frame >= shot.startFrame && frame < end(shot) &&
        Number.isInteger(frame) && (index === 0 || frame >= cues[index - 1].frame)))
    }
    const bed = scaled.audio.find(track => track.id === 'bed')
    assert.equal(bed.sourceInFrame, 160)
    assert(bed.sourceInFrame + bed.durationFrames <= 179)
    assert.equal(scaled.transitions.length, plan.transitions.length)
    assert.deepEqual(parseDirectorPlan(scaled), scaled)
  }
  assert.throws(() => audio.reflowDirectorPlan(plan, 1), /too short/)
  const offset = structuredClone(plan)
  offset.scriptSegments[0].durationFrames++
  offset.scriptSegments[1].startFrame++
  offset.scriptSegments[1].durationFrames--
  offset.captions[0].durationFrames++
  offset.captions[1].startFrame++
  offset.captions[1].durationFrames--
  const [firstSegment, secondSegment] = offset.scriptSegments
  const secondShot = offset.shots[1]
  secondShot.scriptSegmentIds.unshift(firstSegment.id)
  secondShot.cueAnchors = [{ scriptSegmentId: firstSegment.id, charOffset: 0, frame: secondShot.startFrame },
    ...secondShot.cueAnchors.map(cue => ({ ...cue, frame: Math.max(cue.frame, secondSegment.startFrame) }))]
  const compressed = audio.reflowDirectorPlan(offset, 4)
  for (const spans of [compressed.scriptSegments, compressed.scenes, compressed.shots, compressed.captions]) assertCoverage(spans, 4)
  assert(compressed.shots[1].startFrame < end(compressed.scriptSegments[0]))
  assert(compressed.shots[1].cueAnchors[0].frame < compressed.shots[1].cueAnchors[1].frame)
  const replacement = audio.attachNarration(withBed, { asset: { ...narration, id: 'replacement', path: 'replace.wav' },
    measuredDurationFrames: 86, sourceInFrame: 5, volume: 0.8 })
  assert.equal(replacement.durationFrames, 81)
  assert.equal(replacement.narration.trackId, plan.narration.trackId)
  assert.equal(replacement.narration.origin, 'unknown')
  assert.equal(replacement.audio.filter(track => track.assetId === 'voice').length, 1)
  assert.deepEqual(replacement.audio.find(track => track.id === replacement.narration.trackId),
    { id: plan.narration.trackId, assetId: 'replacement', startFrame: 0, durationFrames: 81, sourceInFrame: 5, volume: 0.8 })
  assert.deepEqual(plan, snapshot)
  console.log('PASS narration estimates, measured reflow, exact integer coverage, cue monotonicity and bounded track replacement')

  assert.throws(() => composition.resolveDirectorMedia({ plan, mediaSources: { coast: 'blob:coast' } }), /Missing media source.*voice/)
  assert.throws(() => composition.resolveDirectorMedia({ plan, localMedia: { coast: '../escape.jpg' } }), /pattern|invalid/i)
  assert.deepEqual([...composition.resolveDirectorMedia({ plan, mediaSources: { coast: 'blob:coast', voice: 'blob:voice' } })],
    [['coast', 'blob:coast'], ['voice', 'blob:voice']])
  const json = join(work, 'linked-plan.json')
  await writeFile(json, JSON.stringify(plan))
  const output = join(work, 'out.mp4')
  await assert.rejects(execute(process.execPath, [resolve('dist/cli/shotweft.js'), 'video', 'export-remotion', json, '--output', output]),
    error => error.code === 1 && /Project-asset source-checkout rendering is not yet supported.*relative path/.test(JSON.parse(error.stderr).error))
  await assert.rejects(readFile(output), { code: 'ENOENT' })
  console.log('PASS missing Player source and invalid bundle path fail; CLI project-only sources fail with a local-path remedy')
} finally {
  try { await server.close() } finally { await rm(work, { recursive: true, force: true }) }
}
