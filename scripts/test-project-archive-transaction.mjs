import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { createServer } from 'vite'

const exec = promisify(execFile)
const root = resolve('.tmp/cli-m0')
await mkdir(root, { recursive: true })
const work = await mkdtemp(join(root, 'transactions-'))
process.env.SHOTWEFT_TMP ??= join(work, 'media-temp')
const mediaBaseline = await readdir(process.env.SHOTWEFT_TMP).catch(error => {
  if (error.code === 'ENOENT') return []
  throw error
})
const cli = resolve('dist/cli/shotweft.js')
const server = await createServer({ configFile: false, cacheDir: join(work, 'vite'),
  server: { middlewareMode: true, hmr: false, watch: null } })
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const projectPath = resolve('demos/m2/project.zip')
const sourceHash = hash(await readFile(projectPath))
const primaryPhoto = '/demo-media/before-the-tide.jpg'
const extraPhoto = '/demo-media/coastal-trail.jpg'

async function json(expected, ...args) {
  const result = await exec(process.execPath, [cli, ...args], { timeout: 45_000 })
    .then(result => ({ ...result, code: 0 }), error => error)
  assert.equal(result.code, expected, result.stderr)
  assert.equal(expected ? result.stdout : result.stderr, '')
  const output = expected ? result.stderr : result.stdout
  assert.match(output, /^[^\r\n]+\n$/)
  return JSON.parse(output)
}
const revision = async file => (await json(0, 'project', 'revision', file)).revision
const operations = async (name, ops) => {
  const file = join(work, name + '.json')
  await writeFile(file, JSON.stringify(ops))
  return file
}

try {
  const { withProject, writeProjectFile, updateProjectArchive } = await server.ssrLoadModule('/src/cli/project-file.ts')
  async function snapshot(file) {
    return withProject(file, async ({ project, manifest, items, photos }) => ({ project, manifest,
      items: await Promise.all(items.map(async ({ id, blob, thumbnail }) =>
        [id, hash(Buffer.from(await blob.arrayBuffer())), hash(Buffer.from(await thumbnail.arrayBuffer()))])),
      photos: await Promise.all([...photos].map(async ([path, bytes]) => [path, hash(Buffer.from(await bytes.arrayBuffer()))])),
    }))
  }
  const files = []
  for (const version of [1, 2, 3]) {
    const file = join(work, `v${version}.zip`)
    files.push(file)
    await withProject(projectPath, async archive => {
      const project = { ...archive.project, cover: primaryPhoto, futureProject: { preserved: true } }
      if (version !== 3) {
        delete project.direction
        delete project.activeTimeline
      }
      const items = archive.items.filter(item => version !== 1 || item.kind !== 'audio')
        .map(item => ({ ...item, futureAsset: ['unchanged'] }))
      const photos = new Map(await Promise.all([primaryPhoto, extraPhoto].map(async path =>
        [path, new Blob([await readFile('public' + path)], { type: 'image/jpeg' })])))
      const manifest = { ...archive.manifest, version, bundledPhotos: [...photos.keys()], extension: { nested: ['future', null, 1] } }
      await writeProjectFile(file, { project, items, photos, manifest })
    })
    const before = await snapshot(file)
    assert.equal(before.manifest.version, version)
    const oldHash = hash(await readFile(file))
    assert.equal(await revision(file), oldHash)
    const legacy = await json(0, 'project', 'update', file, '--title', 'Transaction V' + version, '--expected-revision', oldHash.toUpperCase())
    assert.equal(legacy.title, 'Transaction V' + version)
    assert.equal('revision' in legacy, false)
    const after = await snapshot(file)
    assert.equal(after.manifest.version, version)
    assert.deepEqual(after.manifest.extension, before.manifest.extension)
    assert.deepEqual(after.project.futureProject, before.project.futureProject)
    assert.deepEqual(after.project.direction, before.project.direction)
    assert.deepEqual(after.manifest.assets.map(item => item.futureAsset), before.manifest.assets.map(item => item.futureAsset))
    assert.deepEqual(after.items, before.items)
    assert.deepEqual(after.photos, before.photos)
  }
  console.log('PASS ZIP v1/v2/v3, byte-identical originals, thumbnails and photos, embedded plan and unknown fields')

  const [v1, v2, v3] = files
  const initial = await snapshot(v3)
  const batch = await operations('batch', [
    { op: 'project.update', patch: { title: 'Atomic edit', archived: true } },
    { op: 'scene.add', as: 'newScene', patch: { location: 'Outer pier' } },
    { op: 'shot.add', as: 'newShot', patch: { sceneId: { ref: 'newScene' }, title: 'Wide' } },
    { op: 'scene.update', id: { ref: 'newScene' }, patch: { notes: 'Scene note' } },
    { op: 'scene.move', id: { ref: 'newScene' }, position: 1 },
    { op: 'shot.update', id: { ref: 'newShot' }, patch: { duration: 4.5 } },
    { op: 'shot.move', id: { ref: 'newShot' }, position: 1 },
    { op: 'director.plan.replace', plan: { ...initial.project.direction, reviewStatus: 'needs-review' } },
    { op: 'project.activeTimeline.set', timeline: 'director' },
    { op: 'scene.add', as: 'discardScene' },
    { op: 'shot.add', as: 'discardShot', patch: { sceneId: { ref: 'discardScene' } } },
    { op: 'scene.delete', id: { ref: 'discardScene' } },
    { op: 'shot.delete', id: { ref: 'discardShot' } },
  ])
  const original = await readFile(v3)
  const base = hash(original)
  const dry = await json(0, 'project', 'apply', v3, batch, '--expected-revision', base, '--dry-run')
  assert.deepEqual([dry.dryRun, dry.changed, dry.committed, dry.previousRevision], [true, true, false, base])
  assert.notEqual(dry.revision, base)
  assert.deepEqual(await readFile(v3), original)
  const commit = await json(0, 'project', 'apply', v3, batch, '--expected-revision', base)
  assert.deepEqual([commit.dryRun, commit.changed, commit.committed, commit.previousRevision], [false, true, true, base])
  assert.equal(commit.revision, hash(await readFile(v3)))
  assert.equal(commit.operations.length, 13)
  const { project, items, photos } = await snapshot(v3)
  assert.equal(project.title, 'Atomic edit')
  assert.equal(project.scenes[0].id, commit.operations[1].id)
  assert.equal(project.scenes[0].notes, 'Scene note')
  assert.equal(project.shots[0].id, commit.operations[2].id)
  assert.equal(project.shots[0].duration, 4.5)
  assert.equal(project.shots[0].sceneId, project.scenes[0].id)
  assert.equal(project.direction.reviewStatus, 'needs-review')
  assert.deepEqual(items, initial.items)
  assert.deepEqual(photos, initial.photos)
  const noOp = await operations('noop', [{ op: 'scene.move', id: project.scenes[0].id, position: 1 }])
  const noOpResult = await json(0, 'project', 'apply', v3, noOp)
  assert.deepEqual([noOpResult.revision, noOpResult.changed, noOpResult.committed], [commit.revision, false, false])
  console.log('PASS ordered atomic batch, real IDs, earlier aliases, dry-run bytes and no-op revision')

  const unchanged = await readFile(v3)
  const rollback = await operations('rollback', [{ op: 'project.update', patch: { title: 'Do not write' } },
    { op: 'shot.update', id: project.shots[0].id, patch: { sceneId: 'missing' } }])
  assert.match((await json(1, 'project', 'apply', v3, rollback)).error, /Operation 2.*Unknown scene/)
  const badRef = structuredClone(project.direction)
  badRef.assets.find(asset => asset.projectAssetId).projectAssetId = 'missing-media'
  const invalidPlan = await operations('invalid-ref', [{ op: 'director.plan.replace', plan: badRef }])
  assert.match((await json(1, 'project', 'apply', v3, invalidPlan)).error, /matching project asset/)
  const badPlan = await operations('invalid-plan', [{ op: 'director.plan.replace', plan: {} }])
  assert.match((await json(1, 'project', 'apply', v3, badPlan)).error, /Operation 1/)
  assert.match((await json(1, 'project', 'apply', v3, batch, '--expected-revision', base)).error, /Revision conflict/)
  assert.match((await json(1, 'shot', 'delete', v3, project.shots[0].id, '--expected-revision', base)).error, /Revision conflict/)
  await mkdir(v3 + '.shotweft-lock')
  try {
    assert.match((await json(1, 'project', 'apply', v3, batch)).error, /文件正在写入|锁/)
    assert.deepEqual(await readdir(v3 + '.shotweft-lock'), [])
  } finally {
    await rm(v3 + '.shotweft-lock', { recursive: true })
  }
  assert.deepEqual(await readFile(v3), unchanged)
  assert.equal(await revision(v3), commit.revision)
  await assert.rejects(updateProjectArchive(v3, archive => ({ ...archive,
    items: archive.items.map(item => item.kind === 'audio'
      ? { ...item, blob: new Blob(['not real M4A'], { type: item.blob.type }) } : item),
  })), /格式|签名|audio|m4a/i)
  assert.deepEqual(await readFile(v3), unchanged)
  await assert.rejects(lstat(v3 + '.shotweft-lock'), { code: 'ENOENT' })
  console.log('PASS mid-batch rollback, invalid project references, staged media rejection, stale revision and existing lock')

  const originalV2 = await snapshot(v2)
  const marker = Buffer.from('replacement thumbnail')
  await updateProjectArchive(v2, async archive => {
    const photos = new Map(archive.photos)
    photos.delete(extraPhoto)
    return { project: archive.project, items: archive.items.map((item, index) => index === 0
      ? { ...item, thumbnail: new Blob([marker], { type: item.thumbnail.type }) } : item), photos }
  })
  const afterV2 = await snapshot(v2)
  assert.deepEqual(afterV2.manifest.extension, originalV2.manifest.extension)
  assert.deepEqual(afterV2.items.map(item => item.slice(0, 2)), originalV2.items.map(item => item.slice(0, 2)))
  assert.equal(afterV2.items[0][2], hash(marker))
  assert.deepEqual(afterV2.photos, originalV2.photos.filter(([path]) => path === primaryPhoto))
  await assert.rejects(updateProjectArchive(v2, archive => ({ ...archive, photos: new Map() })), /photos/)
  assert.deepEqual(await snapshot(v2), afterV2)
  const remove = await operations('remove-plan', [{ op: 'director.plan.remove' }])
  await json(0, 'project', 'apply', v3, remove)
  const withoutDirector = await snapshot(v3)
  assert.equal(withoutDirector.manifest.version, 3)
  assert.equal(withoutDirector.project.activeTimeline, undefined)
  assert.equal(withoutDirector.project.direction, undefined)
  console.log('PASS archive callback can replace thumbnail, remove photo and preserve unknown metadata and other bytes')

  const corrupt = join(work, 'corrupt.zip')
  const data = await readFile(v2)
  const offset = data.indexOf(marker)
  assert(offset >= 0, 'Find stored thumbnail entry for CRC corruption')
  data[offset] ^= 0xff
  await writeFile(corrupt, data)
  await json(1, 'project', 'apply', corrupt, batch)
  assert.deepEqual(await readFile(corrupt), data)
  const malformed = await operations('malformed', { op: 'project.update' })
  const unknown = await operations('unknown', [{ op: 'run', command: 'should not run' }])
  const extra = await operations('extra', [{ op: 'scene.add', patch: { id: 'forged' } }])
  const overflow = await operations('overflow', Array.from({ length: 101 }, () => ({ op: 'director.plan.remove' })))
  for (const invalid of [malformed, unknown, extra, overflow]) assert.match((await json(2, 'project', 'apply', v1, invalid)).error, /Invalid project operations/)
  assert.match((await json(2, 'project', 'apply', v1, batch, '--expected-revision', 'abc')).error, /SHA-256/)
  await json(2, 'scene', 'update', v1, 'unused', '--expected-revision', await revision(v1))
  if (process.platform !== 'win32') {
    const alias = join(work, 'legacy-symbolic.zip')
    await symlink(v1, alias)
    const scene = await json(0, 'scene', 'add', alias, '--location', 'Legacy output')
    const shot = await json(0, 'shot', 'add', alias, '--scene', scene.id, '--title', 'Legacy shot')
    assert.equal(shot.title, 'Legacy shot')
    assert.equal((await json(0, 'shot', 'update', alias, shot.id, '--title', 'Revised shot')).id, shot.id)
    assert((await lstat(alias)).isSymbolicLink())
  }
  const racing = join(work, 'race.zip')
  await copyFile(v1, racing)
  const next = join(work, 'external.zip')
  await copyFile(v2, next)
  await assert.rejects(updateProjectArchive(racing, async archive => {
    await rename(next, racing)
    return { ...archive, project: { ...archive.project, title: 'Do not overwrite external writer' } }
  }), /Revision conflict/)
  assert.equal(await revision(racing), await revision(v2))
  assert.equal(hash(await readFile(projectPath)), sourceHash)
  const currentMedia = await readdir(process.env.SHOTWEFT_TMP)
  assert.deepEqual(currentMedia.sort(), mediaBaseline.sort())
  assert(!(await readdir(work)).some(name => name.endsWith('.shotweft-lock')))
  console.log('PASS CRC corruption, strict inputs, JSON/exit codes, legacy symlink, external revision change and cleanup')
} finally {
  await server.close()
  await rm(work, { recursive: true, force: true })
}
