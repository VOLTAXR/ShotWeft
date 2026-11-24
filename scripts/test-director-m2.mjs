import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { createServer } from 'vite'

const execute = promisify(execFile)
const cli = resolve('dist/cli/shotweft.js')
const workRoot = resolve('.tmp/director-m2')
await mkdir(workRoot, { recursive: true })
const work = await mkdtemp(join(workRoot, 'test-'))
const server = await createServer({ configFile: false, cacheDir: join(work, 'vite'),
  server: { middlewareMode: true, hmr: false, watch: null } })

async function command(args, expected = 0) {
  let result
  try { result = { ...await execute(process.execPath, [cli, ...args], { timeout: 30_000 }), code: 0 } }
  catch (error) { result = error }
  assert.equal(result.code, expected, result.stderr)
  assert.equal(expected === 0 ? result.stderr : result.stdout, '')
  const output = expected === 0 ? result.stdout : result.stderr
  assert.match(output, /^[^\r\n]+\n$/, 'CLI must emit exactly one JSON line')
  return JSON.parse(output)
}

function checkTiling(script, expected) {
  assert.equal(script.originalScript, expected)
  assert.equal(script.segments.map(segment => segment.text).join(''), expected)
  const source = Array.from(expected)
  let cursor = 0
  for (const { text, charStart, charEnd } of script.segments) {
    assert.equal(charStart, cursor)
    assert.equal(charEnd - charStart, Array.from(text).length)
    assert.equal(source.slice(charStart, charEnd).join(''), text)
    cursor = charEnd
  }
  assert.equal(cursor, source.length)
}

function checkCoverage(items, durationFrames) {
  let cursor = 0
  for (const item of items) {
    assert.equal(item.startFrame, cursor)
    assert(Number.isInteger(item.durationFrames) && item.durationFrames > 0)
    cursor += item.durationFrames
  }
  assert.equal(cursor, durationFrames)
}

try {
  const [{ importScript, scriptByteLimit }, { planFromScript, regenerateShot },
    { parseDirectorPlan }, { compileDirectorPlan, compileDirectorPlanForProject }] = await Promise.all([
    server.ssrLoadModule('/src/core/director/script.ts'), server.ssrLoadModule('/src/core/director/planner.ts'),
    server.ssrLoadModule('/src/core/director/plan.ts'), server.ssrLoadModule('/src/core/director/compiler.ts'),
  ])

  const source = ' \r\n# 海湾观察 🌊\r\n正文混合 English.  \r\n\t\r\nEXT. COAST - DAY\r\nA gull passes.\r\n\r\n'
  const expected = [' \r\n# 海湾观察 🌊\r\n', '正文混合 English.  \r\n\t\r\n', 'EXT. COAST - DAY\r\n', 'A gull passes.\r\n\r\n']
  const bytes = new TextEncoder().encode('\uFEFF' + source)
  const pasted = importScript('\uFEFF' + source)
  for (const [format, imported] of [['paste', pasted], ['txt', importScript(bytes, 'txt')], ['markdown', importScript(bytes, 'markdown')]]) {
    assert.equal(imported.format, format)
    assert.equal(imported.title, '海湾观察 🌊')
    checkTiling(imported, source)
    assert.deepEqual(imported.segments.map(segment => segment.text), expected)
    assert.deepEqual(imported.segments.map(segment => segment.id), pasted.segments.map(segment => segment.id))
  }
  assert.deepEqual(importScript(bytes, 'markdown'), importScript(bytes, 'markdown'))
  const underline = importScript('Coastal survey\r\n=====\r\nNo blank line before the body.\r\n', 'markdown')
  assert.equal(underline.title, 'Coastal survey')
  assert.equal(underline.segments.length, 2)

  const chunks = [' 第一段 😀 \r\n', '  Second segment.\r\n\r\n', '结尾  ']
  for (const data of [chunks, { title: 'Provided title', segments: chunks }, { segments: chunks.map(text => ({ text })) },
    { lines: chunks.map((text, i) => ({ id: 'incoming-' + i, text })) }]) {
    const imported = importScript('\uFEFF' + JSON.stringify(data, null, 2), 'json')
    assert.equal(imported.title, data.title)
    checkTiling(imported, chunks.join(''))
    assert.deepEqual(imported.segments.map(segment => segment.text), chunks)
    assert.deepEqual(imported.segments, importScript(JSON.stringify(chunks), 'json').segments)
  }
  for (const key of ['script', 'text']) checkTiling(importScript(JSON.stringify({ [key]: source }), 'json'), source)
  assert.notEqual(importScript('Repeat.\n\nRepeat.').segments[0].id, importScript('Repeat.\n\nRepeat.').segments[1].id)
  const long = 'Dr. Rivera measured 3.14 liters per day. '.repeat(35) + '潮位有所回落。🌊  '
  const sentenceParts = importScript(long)
  checkTiling(sentenceParts, long)
  assert(sentenceParts.segments.length > 1)
  assert(sentenceParts.segments.slice(0, -1).every(segment => segment.text.endsWith('day. ')))
  assert.equal(importScript('没有断句'.repeat(200)).segments.length, 1)
  assert.equal(importScript('x'.repeat(scriptByteLimit)).originalScript.length, scriptByteLimit)
  for (const input of ['中'.repeat(Math.floor(scriptByteLimit / 3) + 1), new Uint8Array(scriptByteLimit + 1)]) {
    assert.throws(() => importScript(input), /1 MiB/)
  }
  assert.throws(() => importScript(Uint8Array.of(0xc3, 0x28)), /UTF-8/)
  assert.throws(() => importScript('\uFEFF \r\n'), /empty/)
  for (const input of ['{', '{}', '[]', '[""]', '{"lines":["invalid"]}', '{"segments":[{"text":1}]}',
    '{"script":"one","text":"two"}', '{"title":5,"text":"a"}', '["\\uD800","\\uDC00"]']) {
    assert.throws(() => importScript(input, 'json'), /script|unicode/i)
  }
  console.log('PASS TXT, Markdown, JSON and paste fidelity, Unicode offsets, stable IDs and bounded UTF-8')

  const script = [
    '# Coast survey',
    'Coastal erosion exposes new layers along the cliff.',
    'The Coastal erosion survey tracks this shoreline over time.',
    '🌊 样本增长 42%，涨幅明显。',
    '“Every observation needs context,” said the survey lead.',
    '礁石上的潮池反射光线。',
    '离岸涌浪裹挟泥沙。',
    '潮池和涌浪展示两种不同地貌。',
    'Field notes describe sediment patterns after the storm and compare seasonal observations with visual records. '.repeat(9),
  ].join('\n\n')
  const mediaAssets = [
    { id: 'pools', kind: 'image', projectAssetId: '5d82-project-image', keywords: ['潮池'] },
    { id: 'swell', kind: 'video', path: 'samples/swell.mp4', keywords: ['涌浪'], sourceDurationFrames: 900 },
    { id: 'unmatched', kind: 'image', path: 'other.png', keywords: ['waterfall'] },
  ]
  const frameRate = { numerator: 30000, denominator: 1001 }
  const options = { script: importScript(script, 'markdown'), title: 'Field survey', frameRate, aspectRatio: '9:16', mediaAssets }
  const plan = planFromScript(options)
  assert.deepEqual(plan, planFromScript(structuredClone(options)))
  assert.deepEqual(planFromScript('Plain text.'), planFromScript(importScript('Plain text.')))
  assert.deepEqual(parseDirectorPlan(plan), plan)
  assert.equal(plan.originalScript, script)
  assert.equal(plan.scenes[0].title, options.title)
  assert.deepEqual(plan.resolution, { width: 720, height: 1280 })
  assert.deepEqual(plan.frameRate, frameRate)
  const fps = frameRate.numerator / frameRate.denominator
  assert(plan.durationFrames / fps >= 60)
  assert(plan.shots.every(shot => shot.durationFrames / fps >= 1))
  for (const spans of [plan.scriptSegments, plan.scenes, plan.shots, plan.captions]) checkCoverage(spans, plan.durationFrames)
  checkTiling({ originalScript: plan.originalScript, segments: plan.scriptSegments }, script)
  assert.deepEqual(plan.shots.slice(0, 8).map(shot => shot.sceneType), ['title', 'graphic', 'graphic', 'chart', 'quote', 'image', 'video', 'split'])
  assert.deepEqual(plan.shots.slice(5, 8).map(shot => shot.assetIds), [['pools'], ['swell'], ['pools', 'swell']])
  assert.deepEqual(plan.shots[7].visualElements.filter(el => el.assetId).map(el => [el.kind, el.assetId]),
    [['image', 'pools'], ['video', 'swell']])
  assert(plan.shots[1].assetNeeds[0].keywords.includes('Coastal'))
  assert.deepEqual(plan.assets[0], { id: 'pools', kind: 'image', projectAssetId: '5d82-project-image', description: '潮池' })
  assert(plan.narration.timing === 'estimated' && plan.narration.assetId === null && !plan.audio.length)
  assert.equal(plan.reviewStatus, 'draft')

  for (const [i, shot] of plan.shots.entries()) {
    const segment = plan.scriptSegments[i]
    assert.deepEqual(shot.scriptSegmentIds, [segment.id])
    assert(shot.purpose && shot.rationale && shot.continuity.previous && shot.continuity.next && shot.visualElements.length)
    assert.equal(shot.continuity.previousShotId, plan.shots[i - 1]?.id ?? null)
    assert.equal(shot.continuity.nextShotId, plan.shots[i + 1]?.id ?? null)
    assert.equal(plan.captions[i].text, segment.text)
    assert(shot.cueAnchors.length)
    for (const anchor of shot.cueAnchors) {
      assert.equal(anchor.scriptSegmentId, segment.id)
      assert(anchor.frame >= shot.startFrame && anchor.frame < shot.startFrame + shot.durationFrames)
      assert(Array.from(segment.text)[anchor.charOffset]?.trim())
    }
    if (i < plan.shots.length - 1) assert(plan.transitions.some(t => t.id === shot.transition && t.toShotId === plan.shots[i + 1].id))
    else assert.equal(shot.transition, null)
  }
  const chartSegment = Array.from(plan.scriptSegments[3].text)
  assert(plan.shots[3].cueAnchors.some(anchor => chartSegment.slice(anchor.charOffset, anchor.charOffset + 3).join('') === '42%'))
  assert.equal(plan.transitions[0].kind, 'cut')
  assert.equal(plan.transitions[1].kind, 'morph')
  assert(plan.shots.slice(1, 3).every(shot => shot.visualElements.some(el => el.sharedKey === plan.transitions[1].sharedElementId && el.text === 'coastal erosion')))
  for (const morph of plan.transitions.filter(transition => transition.kind === 'morph')) {
    const pair = [morph.fromShotId, morph.toShotId].map(id => plan.shots.find(shot => shot.id === id))
    const phrase = pair[0].visualElements.find(el => el.sharedKey === morph.sharedElementId).text
    assert(pair.every(shot => plan.scriptSegments.find(s => s.id === shot.scriptSegmentIds[0]).text.toLowerCase().includes(phrase)))
  }
  console.log('PASS deterministic plan exceeds 60 seconds with exact coverage, contextual shot types, cue anchors and grounded continuity')

  const locked = structuredClone(plan)
  locked.shots[1].locked = true
  assert.strictEqual(regenerateShot(locked, 'shot-1'), locked)
  const original = structuredClone(locked)
  const regenerated = regenerateShot(locked, 'shot-2')
  assert.deepEqual(locked, original)
  assert.deepEqual(regenerated, regenerateShot(original, 'shot-2'))
  assert.notDeepEqual(locked.shots[2].visualElements, regenerated.shots[2].visualElements)
  assert.notDeepEqual(regenerateShot(regenerated, 'shot-2').shots[2].visualElements, regenerated.shots[2].visualElements)
  assert.strictEqual(locked.shots[1], regenerated.shots[1])
  assert.deepEqual({ ...regenerated, shots: regenerated.shots.map((shot, i) =>
    i === 2 ? { ...shot, visualElements: locked.shots[i].visualElements } : shot) }, original)
  assert.deepEqual(parseDirectorPlan(regenerated), regenerated)
  assert.throws(() => regenerateShot(locked, 'unknown'), /Unknown shot/)
  console.log('PASS deterministic shot regeneration respects locks, references and timeline coverage')

  const layered = structuredClone(plan)
  const video = layered.shots[6]
  video.mediaLayers = [{ id: 'wave-layer', assetId: 'swell', kind: 'video', startFrame: video.startFrame,
    durationFrames: video.durationFrames, sourceInFrame: 20 }]
  const sources = {
    projectAssets: new Map([['5d82-project-image', { kind: 'image' }]]),
    localAssets: new Map([['samples/swell.mp4', { kind: 'video', durationFrames: 900 }]]),
  }
  assert.throws(() => compileDirectorPlanForProject(layered), /Missing media for asset pools/)
  assert.throws(() => compileDirectorPlanForProject(layered, { ...sources, localAssets: new Map() }), /Missing media for asset swell/)
  assert.throws(() => compileDirectorPlanForProject(layered, { ...sources,
    localAssets: new Map([['samples/swell.mp4', { kind: 'video', durationFrames: 20 }]]) }), /source range exceeds measured/)
  assert.throws(() => compileDirectorPlanForProject(layered, { ...sources,
    projectAssets: new Map([['5d82-project-image', { kind: 'video' }]]) }), /media kind/)
  assert.deepEqual(compileDirectorPlanForProject(layered, sources).plan, layered)
  const wrongRange = structuredClone(layered)
  wrongRange.shots[6].mediaLayers[0].sourceInFrame = 900
  assert.throws(() => parseDirectorPlan(wrongRange), /source range/)
  for (const [mutate, error] of [
    [p => { p.shots[6].mediaLayers[0].startFrame-- }, /layer range/],
    [p => { p.shots[6].mediaLayers[0].assetId = 'missing' }, /matching shot asset/],
    [p => { p.shots[6].visualElements[1].assetId = 'missing' }, /matching shot media asset/],
    [p => { p.shots[6].visualElements[1].opacity = 1.1 }, /opacity/],
    [p => { p.assets[0].projectAssetId = '../escape' }, /projectAssetId/],
    [p => { delete p.assets[0].projectAssetId }, /path or projectAssetId/],
    [p => { p.assets[1].path = 'samples/swell.jpg' }, /extension/],
    [p => { p.scriptSegments[1].charStart++ }, /character offsets/],
  ]) {
    const candidate = structuredClone(layered)
    mutate(candidate)
    assert.throws(() => parseDirectorPlan(candidate), error)
  }
  const presenterDraft = planFromScript({ script: 'An introduction.', mode: 'presenter' })
  assert.equal(presenterDraft.presenter, null)
  assert.throws(() => compileDirectorPlanForProject(presenterDraft), /Missing presenter media/)
  const presenter = planFromScript({ script: 'An introduction.', mode: 'presenter', presenterAssetId: 'speaker',
    mediaAssets: [{ id: 'speaker', kind: 'video', projectAssetId: '8a-presenter' }] })
  presenter.shots[0].presenterLayout = 'round'
  assert.throws(() => compileDirectorPlanForProject(presenter), /Missing media for asset speaker/)
  assert.equal(compileDirectorPlanForProject(presenter, {
    projectAssets: new Map([['8a-presenter', { kind: 'video' }]]),
  }).plan.shots[0].presenterLayout, 'round')
  assert.throws(() => compileDirectorPlan(presenter), /M1/)
  console.log('PASS project compiler resolves local and project media, bounds explicit source ranges and rejects missing presenter media')

  const m1 = JSON.parse(await readFile('public/director/demo-plan.json', 'utf8'))
  assert.deepEqual(parseDirectorPlan(m1), m1)
  assert.equal(compileDirectorPlan(m1).durationInFrames, 180)
  m1.shots[0].camera = 'slow-push'
  assert.throws(() => compileDirectorPlan(m1), /M1/)
  console.log('PASS M1 fixture parses deeply equal and M1 compiler still rejects slow-push')

  const scriptPath = join(work, 'script.MD')
  const output = join(work, 'director.json')
  await writeFile(scriptPath, bytes)
  const overview = await execute(process.execPath, [cli, 'director', '--help'])
  assert.match(overview.stdout, /shotweft director generate <script> --output <plan.json>/)
  const generateHelp = await execute(process.execPath, [cli, 'director', 'generate', '--help'])
  assert.match(generateHelp.stdout, /^director generate <script> --output <plan.json> .*--fps <rational>/m)
  const args = ['director', 'generate', scriptPath, '--output', output, '--title', 'CLI Plan', '--aspect', '9:16', '--fps', '30000/1001']
  const result = await command(args)
  assert.equal(result.path, output)
  assert.equal(result.provider, 'offline')
  const saved = await readFile(output, 'utf8')
  const generated = JSON.parse(saved)
  checkTiling({ originalScript: generated.originalScript, segments: generated.scriptSegments }, source)
  assert.equal(generated.scenes[0].title, 'CLI Plan')
  assert.deepEqual(generated.frameRate, frameRate)
  assert.equal((await command(['director', 'validate', output])).valid, true)
  assert.match((await command(args, 1)).error, /EEXIST/)
  assert.equal(await readFile(output, 'utf8'), saved)
  const presenterOutput = join(work, 'presenter.json')
  const jsonSource = join(work, 'script.json')
  await writeFile(jsonSource, JSON.stringify({ lines: chunks.map(text => ({ text })) }))
  await command(['director', 'generate', jsonSource, '--output', presenterOutput, '--mode', 'presenter'])
  assert.equal((await command(['director', 'validate', presenterOutput])).productionMode, 'presenter')
  const mediaOutput = join(work, 'media.json')
  await writeFile(mediaOutput, JSON.stringify(layered))
  assert.equal((await command(['director', 'validate', mediaOutput])).valid, true)
  await writeFile(mediaOutput, JSON.stringify(wrongRange))
  assert.match((await command(['director', 'validate', mediaOutput], 1)).error, /source range/)
  const missing = join(work, 'missing.txt')
  await command(['director', 'generate', missing, '--output', join(work, 'should-not-exist.json')], 1)
  await command(['director', 'generate', scriptPath], 2)
  for (const flags of [['--fps', '60/2'], ['--fps', '1/0'], ['--aspect', '4:3'], ['--mode', 'unknown'], ['--provider', 'fake']]) {
    await command(['director', 'generate', scriptPath, '--output', join(work, 'should-not-exist.json'), ...flags], 2)
  }
  await command(['director', 'validate'], 2)
  await writeFile(jsonSource, '{')
  await command(['director', 'generate', jsonSource, '--output', join(work, 'should-not-exist.json')], 1)
  const files = await readdir(work)
  assert(!files.some(file => file.endsWith('.shotweft-lock') || file === 'should-not-exist.json'))
  console.log('PASS CLI generation and validation, offline presenter draft, atomic no-overwrite, one-line JSON and exit codes 0/1/2')
} finally {
  try { await server.close() } finally { await rm(work, { recursive: true, force: true }) }
}
