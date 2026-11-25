import { strict as assert } from 'node:assert'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { BlobReader, BlobWriter, ZipReader } from '@zip.js/zip.js'

const exec = promisify(execFile)
const run = (bin, args) => exec(bin, args, { timeout: 360_000, maxBuffer: 4 * 1024 * 1024 })
const parent = resolve('.tmp/cli-m1')
await mkdir(parent, { recursive: true })
const dir = await mkdtemp(join(parent, 'acceptance-'))
const path = name => join(dir, name)
const zip = path('project.zip'), root = resolve('demos/m2/media')
const render = process.argv.includes('--render')
const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg'
const ffprobe = process.env.FFPROBE_PATH ?? 'ffprobe'
const cliArgs = args => [resolve('dist/cli/shotweft.js'), ...args]
let assertions = 0
async function cli(...args) {
  const { stdout, stderr } = await run(process.execPath, cliArgs(args))
  assert.match(stdout, /^[^\r\n]+\n$/); assert.equal(stderr, '')
  return JSON.parse(stdout)
}
async function fails(code, match, ...args) {
  await assert.rejects(run(process.execPath, cliArgs(args)), error => {
    assert.equal(error.code, code, error.stderr)
    assert.equal(error.stdout, ''); assert.match(error.stderr, /^[^\r\n]+\n$/)
    const body = JSON.parse(error.stderr); assert.deepEqual(Object.keys(body), ['error']); assert.match(body.error, match)
    return true
  }); assertions++
}
const json = (name, value) => writeFile(path(name), JSON.stringify(value))
const digest = data => createHash('sha256').update(data).digest('hex')
const revision = async () => {
  const { revision } = await cli('project', 'revision', zip)
  assert.equal(revision, digest(await readFile(zip)))
  return revision
}
const guard = rev => ['--expected-revision', rev]
async function dry(rev, ...args) {
  const result = await cli(...args, ...guard(rev), '--dry-run')
  assert.equal(result.previousRevision, rev); assert.equal(result.dryRun, true)
  assert.equal(result.changed, true); assert.equal(result.committed, false)
  assert.notEqual(result.revision, rev); assert.equal(await revision(), rev)
  return result
}
async function commit(rev, ...args) {
  const result = await cli(...args, ...guard(rev))
  assert.equal(result.previousRevision, rev); assert.equal(result.dryRun, false)
  assert.equal(result.changed, true); assert.equal(result.committed, true)
  assert.notEqual(result.revision, rev); assert.equal(await revision(), result.revision)
  return result
}
async function transcode(input, output, args, before = []) {
  await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', ...before, '-i', input, ...args, path(output)])
}
async function verifyOriginals(files, expectedVersion) {
  const reader = new ZipReader(new BlobReader(new Blob([await readFile(zip)])))
  try {
    const entries = new Map((await reader.getEntries()).map(e => [e.filename, e]))
    const bytes = async name => Buffer.from(await (await entries.get(name).getData(new BlobWriter(), { checkSignature: true })).arrayBuffer())
    const data = JSON.parse((await bytes('project.json')).toString('utf8'))
    assert.equal(data.version, expectedVersion)
    for (const [i, asset] of data.assets.entries()) {
      const expected = await readFile(files[asset.name]); assert.deepEqual(await bytes(`media/${i}/original`), expected)
      const thumbnail = await bytes(`media/${i}/thumbnail`)
      assert.equal(thumbnail.subarray(1, 4).toString(), 'PNG'); assert.equal(asset.thumbnailBytes, thumbnail.length)
      if (['coast.jpg', 'broll.mp4'].includes(asset.name)) assert.equal(asset.license, 'Pexels License')
    }
    return data
  } finally { await reader.close() }
}

try {
  const original = JSON.parse(await readFile('demos/m2/director-plan.json', 'utf8'))
  const { originalScript } = original
  // A contiguous, verbatim excerpt preserves the demo's existing image-to-chart Morph.
  const scriptSegments = original.scriptSegments.slice(0, 3)
  const script = originalScript.slice(0, scriptSegments.at(-1).charEnd)
  const duration = scriptSegments.at(-1).startFrame + scriptSegments.at(-1).durationFrames
  const shots = original.shots.slice(0, 3)
  delete shots[2].continuity
  Object.assign(shots[2], { transition: null, assetIds: ['broll'], mediaLayers: [{ id: 'cli-broll', assetId: 'broll', kind: 'video',
    startFrame: shots[2].startFrame + 60, durationFrames: 90, fit: 'cover', sourceInFrame: 0 }] })
  const plan = { ...original, originalScript: script, scriptSegments, durationFrames: duration, shots, audio: [],
    scenes: [{ ...original.scenes[0], durationFrames: duration, shotIds: shots.map(s => s.id) }],
    narration: { text: script, assetId: null, scriptSegmentIds: scriptSegments.map(s => s.id), timing: 'estimated' },
    captions: original.captions.slice(0, 3), transitions: original.transitions.slice(0, 2),
    assets: original.assets.filter(a => ['coast', 'broll'].includes(a.id)).map(({ projectAssetId, ...asset }) => asset),
  }
  await json('exchange-plan.json', plan)
  await cli('director', 'validate', path('exchange-plan.json'))
  await transcode(join(root, 'narration.m4a'), 'narration.m4a', ['-t', '23.5', '-c:a', 'aac', '-f', 'ipod'])
  await cli('project', 'create', zip, '--title', 'CLI M1 Coastal Excerpt')
  const initial = await revision()
  await fails(1, /no embedded DirectorPlan/, 'director', 'show-project', zip)
  await json('batch.json', [
    { path: 'coast.jpg', license: 'Pexels License', source: 'https://www.pexels.com/photo/rocky-ocean-coastline-in-oregon-usa-15726088/' },
    { path: 'broll.mp4', license: 'Pexels License', source: 'https://www.pexels.com/video/serene-oregon-coastline-with-foggy-rocks-31664993/' },
  ])
  const assetImport = ['asset', 'import', zip, path('batch.json'), '--root', root]
  await fails(2, /expected-revision/, ...assetImport)
  await fails(2, /SHA-256/, ...assetImport, ...guard('wrong'))
  await json('invalid.json', [{ path: 'coast.jpg', typo: true }])
  await fails(2, /Invalid JSON input/, 'asset', 'import', zip, path('invalid.json'), '--root', root, ...guard(initial))
  await json('traversal.json', [{ path: '../coast.jpg' }])
  await fails(1, /within --root/, 'asset', 'import', zip, path('traversal.json'), '--root', root, ...guard(initial))
  await mkdir(path('source'))
  if (process.platform !== 'win32') {
    await symlink(join(root, 'coast.jpg'), path('source/escape.jpg'))
    await json('escape.json', [{ path: 'escape.jpg' }])
    await fails(1, /symlink escapes/, 'asset', 'import', zip, path('escape.json'), '--root', path('source'), ...guard(initial))
  }
  await transcode(join(root, 'coast.jpg'), 'valid.png', ['-vf', 'scale=320:-2', '-frames:v', '1', '-threads', '1'])
  await writeFile(path('fake.jpg'), (await readFile(path('valid.png'))))
  await json('atomic-failure.json', [{ path: 'valid.png' }, { path: 'fake.jpg' }])
  await fails(1, /file signature/, 'asset', 'import', zip, path('atomic-failure.json'), '--root', dir, ...guard(initial))
  await writeFile(path('x.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  await json('svg.json', [{ path: 'x.svg' }])
  await fails(1, /Unsupported media extension/, 'asset', 'import', zip, path('svg.json'), '--root', dir, ...guard(initial))
  assert.deepEqual(await cli('asset', 'list', zip), []); assert.equal(await revision(), initial)
  await dry(initial, ...assetImport)
  const imported = await commit(initial, ...assetImport)
  await fails(1, /Revision conflict/, ...assetImport, ...guard(initial))
  const [coast, broll] = imported.assets
  assert.deepEqual(await cli('asset', 'list', zip), imported.assets)
  assert.deepEqual(await cli('asset', 'show', zip, coast.id), coast)
  const originals = { 'coast.jpg': join(root, 'coast.jpg'), 'broll.mp4': join(root, 'broll.mp4') }
  await verifyOriginals(originals, 1)
  console.log('PASS batch guarding, strict input, traversal, rollback, byte identity and stable asset IDs')

  const map = [coast, broll].map((asset, index) => ({ planAssetId: plan.assets[index].id, projectAssetId: asset.id }))
  const direct = ['director', 'import-plan', zip, path('exchange-plan.json')]
  await fails(1, /Missing project asset mapping/, ...direct, ...guard(imported.revision))
  await json('bad-map.json', [map[0], { ...map[1], projectAssetId: coast.id }])
  await fails(1, /Incompatible project asset kind/, ...direct, '--map', path('bad-map.json'), ...guard(imported.revision))
  const badRange = structuredClone(plan)
  delete badRange.assets.find(asset => asset.id === 'broll').sourceDurationFrames
  badRange.shots[2].mediaLayers[0].sourceInFrame = 150
  await json('out-of-range.json', badRange)
  await json('map.json', map)
  await fails(1, /range exceeds measured duration/, 'director', 'import-plan', zip, path('out-of-range.json'), '--map', path('map.json'), ...guard(imported.revision))
  const command = [...direct, '--map', path('map.json')]
  await dry(imported.revision, ...command)
  const mapped = await commit(imported.revision, ...command)
  const { plan: embedded, valid } = await cli('director', 'show-project', zip)
  assert.equal(valid, true)
  assert.deepEqual(embedded, { ...plan, assets: plan.assets.map(({ path: _path, ...a }, i) => ({ ...a, projectAssetId: map[i].projectAssetId })) })
  await fails(1, /DirectorPlan.asset coast/, 'asset', 'remove', zip, coast.id, ...guard(mapped.revision))
  console.log('PASS strict ZIP plan mapping, exact script/timing preservation and referenced removal refusal')

  const attach = ['director', 'attach-narration', zip, 'narration.m4a', '--root', dir, '--origin', 'synthetic']
  await fails(2, /origin/, 'director', 'attach-narration', zip, coast.id, ...guard(mapped.revision))
  await fails(1, /requires a project audio asset/, 'director', 'attach-narration', zip, coast.id, '--origin', 'imported', ...guard(mapped.revision))
  await dry(mapped.revision, ...attach)
  const attached = await commit(mapped.revision, ...attach)
  assert.equal(attached.narration.timing, 'actual'); assert.equal(attached.narration.origin, 'synthetic')
  assert.equal(attached.durationFrames, Math.floor((attached.asset.duration + 0.0000005) * 30))
  assert.notEqual(attached.durationFrames, mapped.durationFrames)
  originals['narration.m4a'] = path('narration.m4a')
  const reused = await commit(attached.revision, 'director', 'attach-narration', zip, attached.asset.id, '--origin', 'synthetic')
  const finalPlan = (await cli('director', 'show-project', zip)).plan
  assert.equal(finalPlan.originalScript, script); assert.equal(finalPlan.narration.assetId, attached.narration.assetId)
  assert.equal(finalPlan.audio.length, 1); assert.equal(finalPlan.assets.length, 3); assert.equal(finalPlan.captions.length, 3)
  assert.equal(finalPlan.transitions.filter(t => t.kind === 'morph').length, 1)
  assert.equal((await verifyOriginals(originals, 3)).project.activeTimeline, 'director')
  console.log('PASS atomic narration import/attachment, measured ranges, provenance and no duplicate track')

  await transcode(path('valid.png'), 'valid.webp', ['-frames:v', '1', '-c:v', 'libwebp', '-threads', '1'])
  await transcode(join(root, 'broll.mp4'), 'valid.webm', ['-t', '0.3', '-an', '-c:v', 'libvpx-vp9', '-threads', '2'])
  await transcode(path('narration.m4a'), 'valid.wav', ['-t', '0.3', '-c:a', 'pcm_s16le'])
  await transcode(path('narration.m4a'), 'valid.mp3', ['-t', '0.3', '-c:a', 'libmp3lame'])
  const extras = ['valid.png', 'valid.webp', 'valid.webm', 'valid.wav', 'valid.mp3']
  await json('other-formats.json', extras.map(path => ({ path })))
  const added = await commit(reused.revision, 'asset', 'import', zip, path('other-formats.json'), '--root', dir)
  assert.deepEqual(added.assets.map(a => a.mimeType), ['image/png', 'image/webp', 'video/webm', 'audio/wav', 'audio/mpeg'])
  await verifyOriginals({ ...originals, ...Object.fromEntries(extras.map(file => [file, path(file)])) }, 3)
  let rev = added.revision
  for (const asset of added.assets) {
    const remove = ['asset', 'remove', zip, asset.id]
    await dry(rev, ...remove)
    rev = (await commit(rev, ...remove)).revision
  }
  await verifyOriginals(originals, 3)
  assert.equal((await cli('asset', 'list', zip)).length, 3)
  console.log('PASS PNG/WebP/WebM/WAV/MP3 content checks, thumbnail and dry-run/unreferenced removal')

  if (render) {
    // Rendering must not depend on the former exchange plan or mapping files.
    await rm(path('exchange-plan.json')); await rm(path('map.json'))
    const mp4 = path('project.mp4')
    const command = ['director', 'render', zip, '--output', mp4]
    const metadata = await cli(...command)
    const { stdout } = await run(ffprobe, ['-v', 'error', '-show_entries',
      'format=duration:stream=codec_name,width,height,r_frame_rate,nb_frames,pix_fmt,sample_rate,channels', '-of', 'json', mp4])
    await writeFile(path('ffprobe.json'), stdout)
    const probe = JSON.parse(stdout)
    assert.equal(probe.streams.length, 2)
    const [video, audio] = probe.streams
    assert.deepEqual(video, { codec_name: 'h264', width: 1280, height: 720, pix_fmt: 'yuv420p', r_frame_rate: '30/1', nb_frames: String(finalPlan.durationFrames) })
    assert.equal(audio.codec_name, 'aac'); assert.equal(audio.sample_rate, '48000'); assert.equal(audio.channels, 2)
    assert.ok(Math.abs(Number(probe.format.duration) - finalPlan.durationFrames / 30) < 0.06)
    await run(ffmpeg, ['-v', 'error', '-xerror', '-i', mp4, '-map', '0', '-f', 'null', '-'])
    const outputHash = digest(await readFile(mp4))
    await fails(1, /EEXIST/, ...command)
    assert.equal(digest(await readFile(mp4)), outputHash)
    assert.equal(await revision(), rev)
    await json('receipt.json', { projectRevision: rev, rendered: metadata, negativeCases: assertions })
    console.log('PASS ZIP-native render, independent FFprobe and full decode, no overwrite, unchanged ZIP revision')
    console.log(dir)
  }
  assert.ok(!(await readdir(dir)).some(name => name.endsWith('.shotweft-lock')))
} finally {
  if (!render) await rm(dir, { recursive: true, force: true })
}
