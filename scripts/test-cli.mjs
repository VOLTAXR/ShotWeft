import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { BlobReader, BlobWriter, TextReader, Uint8ArrayReader, ZipReader, ZipWriter } from '@zip.js/zip.js'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'

const exec = promisify(execFile)
const cli = fileURLToPath(new URL('../dist/cli/shotweft.js', import.meta.url))

function execute(args, options) {
  const pending = exec(process.execPath, [cli, ...args], { maxBuffer: 16 * 1024 * 1024, ...options })
  pending.child.stdin.end()
  return pending
}

async function jsonCommand(args, options) {
  const { stdout, stderr } = await execute(args, options)
  assert.equal(stderr, '')
  assert.match(stdout, /^[^\r\n]+\n$/)
  return JSON.parse(stdout)
}

function command(...args) {
  return jsonCommand(args)
}

function fails(code, message, ...args) {
  return failsWithOptions(code, message, args)
}

async function failsWithOptions(code, message, args, options) {
  await assert.rejects(() => jsonCommand(args, options), error => {
    assert.equal(error.code, code)
    assert.equal(error.stdout, '')
    assert.match(error.stderr, /^[^\r\n]+\n$/)
    const payload = JSON.parse(error.stderr)
    assert.deepEqual(Object.keys(payload), ['error'])
    assert.match(payload.error, message)
    return true
  })
}

async function testHelp() {
  const usage = {
    project: ['create', 'show', 'update', 'restore'],
    scene: ['list', 'show', 'add', 'update', 'move', 'delete'],
    shot: ['list', 'show', 'add', 'update', 'move', 'delete'],
    export: ['json', 'pdf', 'zip'],
    agent: ['storyboard', 'verify'],
    video: ['render', 'verify'],
  }
  const fullUsage = Object.entries(usage).flatMap(([group, actions]) => actions.map(action => group + ' ' + action))
  const cases = [
    [['--help'], fullUsage],
    [['-h'], fullUsage],
    ...Object.entries(usage).map(([group, actions]) => [[group, '--help'], actions.map(action => group + ' ' + action)]),
    [['project', 'create', '--help'], ['project create']],
    [['agent', 'storyboard', '--help'], ['agent storyboard']],
    [['agent', 'verify', '--help'], ['agent verify']],
    [['video', 'render', '--help'], ['video render']],
    [['video', 'verify', '--help'], ['video verify']],
    [['export', 'zip', '--help'], ['export zip']],
    [['project', 'create', '--help', 'file'], ['project create']],
    [['shot', 'update', 'file', '-h', 'id'], ['shot update']],
  ]
  for (const [args, expected] of cases) {
    const { stdout, stderr } = await execute(args)
    assert.equal(stderr, '')
    assert.match(stdout, /^ShotWeft CLI v/)
    const commands = [...stdout.matchAll(/^([a-z]+ [a-z]+) </gm)].map(match => match[1])
    assert.deepEqual(commands, expected, args.join(' '))
  }
  await fails(2, /未知镜头操作.*updat/, 'shot', 'updat', 'file', 'id', '--help')
  await fails(2, /未知命令.*nonsense/, 'nonsense', '--help')
  await fails(2, /Unknown option.*--bogus/, 'project', 'create', '--bogus', '--help')
  await fails(2, /位置参数/, 'project', 'show', '--', 'file', '--help')
  console.log('PASS scoped CLI help, positional arguments around help, and strict command and option parsing')
}

async function testContract(directory, projectPath, project) {
  const invalidJSON = join(directory, '无效.json')
  const missing = join(directory, '不存在.zip')
  const output = join(directory, '错误恢复.zip')
  await writeFile(invalidJSON, '{"project":')
  await fails(1, /JSON 格式无效/, 'project', 'restore', invalidJSON, output)
  await fails(1, /文件不存在/, 'project', 'show', missing)
  await fails(1, /文件不存在/, 'project', 'restore', missing, output)
  await assert.rejects(readFile(output), { code: 'ENOENT' })

  await fails(2, /Unknown option.*--bogus/, 'project', 'show', projectPath, '--bogus')
  await fails(2, /位置参数/, 'project', 'show', projectPath, 'extra')
  await fails(2, /位置参数/, 'project', 'show')
  await fails(2, /子命令/, 'project')
  await fails(2, /--title/, 'project', 'create', output)
  await fails(2, /--setting/, 'scene', 'add', projectPath, '--setting', '室内')
  await fails(2, /--archived/, 'project', 'update', projectPath, '--archived', 'yes')
  await fails(2, /画幅/, 'project', 'update', projectPath, '--frame', '4:3')
  const shot = project.shots[0].id
  for (const invalid of ['abc', '0', '-1', '3601']) {
    await fails(2, /--duration/, 'shot', 'update', projectPath, shot, '--duration=' + invalid)
  }
  for (const [collection, items] of [['scene', project.scenes], ['shot', project.shots]]) {
    for (const invalid of ['1.5', '0', String(items.length + 1)]) {
      await fails(2, /--position/, collection, 'move', projectPath, items[0].id, '--position', invalid)
    }
  }

  const pipedZIP = join(directory, '管道导出.zip')
  for (const args of [['export', 'json'], ['agent', 'verify'], ['export', 'zip']]) {
    const options = args[1] === 'zip' ? ['--output', pipedZIP] : []
    const child = spawn(process.execPath, [cli, ...args, projectPath, ...options], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
    const closed = once(child, 'close')
    // Close the read end before the CLI writes, even if the JSON fits in one pipe buffer.
    child.stdout.destroy()
    assert.deepEqual(await closed, [0, null])
    assert.equal(stderr, '')
  }
  assert.deepEqual(await command('project', 'show', pipedZIP), project)

  const temporary = join(directory, 'media-temp')
  const shown = await execute(['project', 'show', projectPath], {
    env: { ...process.env, SHOTWEFT_TMP: temporary },
  })
  assert.equal(shown.stderr, '')
  assert.deepEqual(JSON.parse(shown.stdout), project)
  assert.deepEqual(await readdir(temporary), [])
  console.log('PASS CLI exit codes, single-line JSON errors, argument boundaries, closed stdout, and media temp override')
}

async function assertUnchangedMove(collection, file, item) {
  const before = await readFile(file)
  const { updated } = await command('project', 'show', file)
  assert.deepEqual(await command(collection, 'move', file, item.id, '--position', '1'), item)
  assert.deepEqual(await readFile(file), before)
  assert.equal((await command('project', 'show', file)).updated, updated)
}

async function testSymlinkUpdate(directory, source, project) {
  const target = join(directory, '链接目标.zip')
  const shortcut = join(directory, '项目链接.zip')
  const linkTarget = basename(target)
  await command('project', 'restore', source, target)
  const before = await readFile(target)
  await symlink(linkTarget, shortcut, 'file')
  const { id } = project.shots[0]
  const title = '通过符号链接更新'
  const updated = await command('shot', 'update', shortcut, id, '--title', title)
  assert.equal(updated.title, title)
  assert((await lstat(shortcut)).isSymbolicLink())
  assert.equal(await readlink(shortcut), linkTarget)
  assert.notDeepEqual(await readFile(target), before)
  const { project: edited } = await command('agent', 'verify', target)
  assert.deepEqual(edited.shots[0], updated)
  assert.deepEqual(await command('project', 'show', shortcut), edited)
  console.log('PASS shot update through a ZIP symlink preserves the link and edits its target')
}

async function mediaFiles(path) {
  const reader = new ZipReader(new BlobReader(new Blob([await readFile(path)])))
  try {
    const files = new Map()
    for (const entry of await reader.getEntries()) {
      if (entry.directory || entry.filename === 'project.json') continue
      const blob = await entry.getData(new BlobWriter(), { checkSignature: true, useWebWorkers: false })
      files.set(entry.filename, Buffer.from(await blob.arrayBuffer()))
    }
    return files
  } finally {
    await reader.close()
  }
}

async function testZIPVerification(directory, source, manifest) {
  const copy = join(directory, '含素材副本.zip')
  const temporary = resolve(directory, 'zip-media-temp')
  const options = { env: { ...process.env, SHOTWEFT_TMP: temporary } }
  assert.deepEqual(await jsonCommand(['export', 'zip', source, '--output', copy], options), { path: resolve(copy) })
  assert.deepEqual(await readdir(temporary), [])
  assert.deepEqual(await command('export', 'json', copy), manifest)
  const media = await mediaFiles(source)
  assert.deepEqual(await mediaFiles(copy), media)
  const { project } = manifest
  assert.deepEqual(await jsonCommand(['agent', 'verify', copy], options), {
    path: resolve(copy), project, summary: {
      scenes: project.scenes.length, shots: project.shots.length,
      duration: project.shots.reduce((sum, shot) => sum + shot.duration, 0),
    },
  })
  assert.deepEqual(await readdir(temporary), [])

  const invalid = join(directory, '无效.zip')
  const unpublished = join(directory, '未发布.zip')
  await writeFile(invalid, '无效 ZIP')
  await failsWithOptions(1, /./, ['agent', 'verify', invalid], options)
  assert.deepEqual(await readdir(temporary), [])
  // A locally saved ZIP from an interrupted download can still have a valid ZIP header.
  const corrupt = await readFile(source)
  await writeFile(invalid, corrupt.subarray(0, 64))
  await failsWithOptions(1, /./, ['project', 'restore', invalid, unpublished], options)
  await assert.rejects(lstat(unpublished), { code: 'ENOENT' })
  assert.deepEqual(await readdir(temporary), [])
  async function writeInvalidZIP(path, data, extra) {
    const writer = new ZipWriter(new BlobWriter())
    const options = { level: 0, useWebWorkers: false }
    await writer.add('project.json', new TextReader(JSON.stringify(data)), options)
    for (const [name, bytes] of media) await writer.add(name, new Uint8ArrayReader(bytes), options)
    if (extra?.endsWith('/')) await writer.add(extra, undefined, { ...options, directory: true })
    else if (extra) await writer.add(extra, new Uint8ArrayReader(media.get('media/0/original')), options)
    await writeFile(path, Buffer.from(await (await writer.close()).arrayBuffer()))
  }
  const invalidRelation = structuredClone(manifest)
  invalidRelation.project.shots[0].sceneId = 'missing-scene'
  await writeInvalidZIP(invalid, invalidRelation)
  await fails(1, /关联无效/, 'agent', 'verify', invalid)
  await writeInvalidZIP(invalid, manifest, 'extra.bin')
  await fails(1, /不支持的条目/, 'agent', 'verify', invalid)
  const incorrectSize = structuredClone(manifest)
  incorrectSize.assets[0].originalBytes--
  await writeInvalidZIP(invalid, incorrectSize)
  await fails(1, /素材缺失或大小无效/, 'agent', 'verify', invalid)

  const fixture = resolve(directory, 'zip-paths')
  const output = join(fixture, 'output')
  await mkdir(output, { recursive: true })
  const archive = join(output, 'input.zip')
  const restore = ['project', 'restore', archive, join(output, 'restored.zip')]
  for (const entry of ['../escape.bin', 'media/../../escape.bin', join(fixture, 'absolute.bin').replaceAll('\\', '/'), '__MACOSX/']) {
    await writeInvalidZIP(archive, manifest, entry)
    // ZIP parsing can reject an unsafe filename before ShotWeft checks its entry whitelist.
    await failsWithOptions(1, /Unsafe filename|不支持的条目/, restore, { ...options, cwd: output })
    assert.deepEqual((await readdir(fixture, { recursive: true })).sort(), ['output', join('output', 'input.zip')], entry)
    assert.deepEqual(await readdir(temporary), [], entry)
  }
  console.log('PASS ZIP restore rejects traversal, absolute paths, and __MACOSX without writing files')

  const offset = corrupt.indexOf(media.get('media/0/original'))
  assert(offset > 0, 'Expected a stored ZIP media entry')
  corrupt[offset] ^= 1
  await writeFile(invalid, corrupt)
  const before = (await readdir(directory)).sort()
  await failsWithOptions(1, /CRC32/, ['agent', 'verify', invalid], options)
  assert.deepEqual(await readdir(temporary), [])
  await failsWithOptions(1, /CRC32/, ['export', 'zip', invalid, '--output', unpublished], options)
  assert.deepEqual(await readdir(temporary), [])
  assert.deepEqual((await readdir(directory)).sort(), before)
  assert.deepEqual(await readFile(invalid), corrupt)
  console.log('PASS ZIP export preserves media and manifest; verify checks ZIP format, relations, whitelist, media sizes, CRC, and temp cleanup on failure')
}

async function renderedPages(path) {
  const pdf = await PDFDocument.load(await readFile(path))
  const pages = pdf.getPages().map(page => {
    const image = page.node.Resources().lookup(PDFName.of('XObject'))
      .entries().map(([, ref]) => pdf.context.lookup(ref)).find(object =>
        object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'))
    assert(image && image.contents.length > 10_000)
    return Buffer.from(image.contents)
  })
  return { pdf, pages }
}

async function downloadJSON(page) {
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '项目 JSON', exact: true }).click()
  return pending
}

async function testAgentWorkflow(directory, zip, project) {
  const working = join(directory, '导入.zip')
  assert.deepEqual(await command('project', 'restore', zip, working), { path: resolve(working), project })
  const json = join(directory, '已编辑.json')
  const copy = join(directory, '已编辑.zip')
  const pdf = join(directory, '已编辑.pdf')
  const [{ id: shot }] = project.shots
  const [{ id: scene }] = project.scenes
  await command('shot', 'update', working, shot, '--title', '潮水推来船票', '--duration', '9.5')
  await command('scene', 'update', working, scene, '--location', '渡口外侧')
  assert.deepEqual(await command('export', 'json', working, '--output', json), { path: resolve(json) })
  const manifest = JSON.parse(await readFile(json, 'utf8'))
  assert.equal(manifest.project.shots[0].title, '潮水推来船票')
  assert.equal(manifest.project.shots[0].duration, 9.5)
  assert.equal(manifest.project.scenes[0].location, '渡口外侧')
  assert.deepEqual(await command('export', 'zip', working, '--output', copy), { path: resolve(copy) })
  assert.deepEqual(await command('export', 'json', copy), manifest)
  const duration = project.shots.slice(1).reduce((sum, item) => sum + item.duration, 9.5)
  const verified = { path: resolve(copy), project: manifest.project, summary: { scenes: 4, shots: 12, duration } }
  assert.deepEqual(await command('agent', 'verify', copy), verified)
  assert.deepEqual(await command('export', 'pdf', copy, '--output', pdf), { path: resolve(pdf) })
  const { pdf: rendered } = await renderedPages(pdf)
  const pdfBytes = await readFile(pdf)
  const metadata = { path: resolve(pdf), bytes: pdfBytes.length, pages: rendered.getPageCount(), title: '候潮灯 · 分镜表' }
  assert.deepEqual(await jsonCommand(['agent', 'verify', copy, '--pdf', pdf], {
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(directory, 'missing-browsers') },
  }), { ...verified, pdf: metadata })

  const restored = join(directory, '继续编辑.zip')
  assert.deepEqual((await command('project', 'restore', copy, restored)).project, manifest.project)
  const updated = await command('shot', 'update', restored, shot, '--title', '船票背面的红点', '--duration', '11.5')
  const continued = await command('agent', 'verify', restored)
  assert.equal(continued.path, resolve(restored))
  assert.deepEqual(continued.summary, { ...verified.summary, duration: duration + 2 })
  assert.deepEqual(continued.project.shots[0], updated)
  assert.equal(continued.project.shots[0].title, '船票背面的红点')
  assert.deepEqual(await command('agent', 'verify', copy), verified)
  console.log('PASS non-interactive Agent workflow: import, edits, JSON/ZIP/PDF export, verification, restore, and continued editing')

  const copyBytes = await readFile(copy)
  await fails(1, /EEXIST/, 'export', 'zip', working, '--output', copy)
  assert.deepEqual(await readFile(copy), copyBytes)
  const locked = join(directory, '锁定.zip')
  await mkdir(locked + '.shotweft-lock')
  await fails(1, /正在写入/, 'export', 'zip', working, '--output', locked)
  await rm(locked + '.shotweft-lock', { recursive: true })
  await assert.rejects(readFile(locked), { code: 'ENOENT' })
  await fails(2, /--output/, 'export', 'zip', working)
  await fails(2, /--output/, 'export', 'zip', working, '--output=')
  await fails(2, /--pdf/, 'agent', 'verify', copy, '--pdf=')
  const otherPDF = join(directory, '外部.pdf')
  await fails(1, /文件不存在/, 'agent', 'verify', copy, '--pdf', otherPDF)
  const blankPDF = await PDFDocument.create()
  await writeFile(otherPDF, await blankPDF.save({ addDefaultPage: false }))
  await fails(1, /没有页面/, 'agent', 'verify', copy, '--pdf', otherPDF)
  blankPDF.addPage()
  const untitled = await blankPDF.save()
  await writeFile(otherPDF, untitled)
  assert.deepEqual((await command('agent', 'verify', copy, '--pdf', otherPDF)).pdf,
    { path: resolve(otherPDF), bytes: untitled.length, pages: 1, title: null })
  for (const [bytes, message] of [
    ['这不是 PDF', /%PDF-/],
    ['%PDF-1.7\n%%EOF\n', /损坏/],
    [pdfBytes.subarray(0, pdfBytes.lastIndexOf('%%EOF')), /损坏/],
  ]) {
    await writeFile(otherPDF, bytes)
    await fails(1, message, 'agent', 'verify', copy, '--pdf', otherPDF)
  }
  assert.deepEqual(await readFile(copy), copyBytes)
  assert.deepEqual(await readFile(pdf), pdfBytes)
  console.log('PASS ZIP export refuses existing and locked outputs; verify rejects missing, non-PDF, damaged, and zero-page PDFs')
}

async function testAgent(browser, url) {
  const directory = await mkdtemp('.tmp/agent-')
  let context
  try {
    const script = join(directory, '剧本.txt')
    const zip = join(directory, '候潮灯.zip')
    const pdf = join(directory, '候潮灯.pdf')
    const args = ['agent', 'storyboard', script, zip, '--title', '候潮灯']
    await writeFile(script, `\uFEFF1. 外景 旧码头 - 清晨
阿槐把一只铜纸鹤搁在系缆桩上。潮水冲上台阶，又退回去；铜纸鹤翅尖的红线挂住了一枚旧船票。
她向桥底探身，拾起船票，又用衣角擦干日期。票根背面印着灯塔的轮廓，塔尖有一处手写的红点。
阿槐：原来你还留着这张票。
备注：先听到松动的缆绳。

2. 内景 渡口候船室 — 日
停摆的挂钟下只剩一把空椅子。
阿槐: 这班船还开吗？
（候船室没有回声。）

场景三 外景 礁石滩 黄昏
阿槐沿着退潮露出的石脊走向灯塔。
老孟：最后一块石头是松的。
旁注：海风突然停了。

INT. LIGHTHOUSE - NIGHT
老孟拧亮灯，阿槐把船票压在灯座下。
阿槐：把灯留给下一班船吧。
NOTE: 窗外出现一道白光。
`.replaceAll('\n', '\r\n'))

    const { path, pdf: pdfOutput, project, summary } = await command(...args, '--pdf', pdf)
    assert.equal(path, resolve(zip))
    assert.equal(pdfOutput, resolve(pdf))
    assert.equal(project.title, '候潮灯')
    assert.equal(project.frame, '16:9')
    assert.equal(project.shots.length, 12)
    assert.deepEqual(project.scenes.map(({ setting, location, time }) => [setting, location, time]), [
      ['外景', '旧码头', '清晨'], ['内景', '渡口候船室', '日'], ['外景', '礁石滩', '黄昏'], ['内景', 'LIGHTHOUSE', 'NIGHT'],
    ])
    for (const scene of project.scenes) {
      assert(scene.description && scene.dialogue && scene.notes)
      assert(!scene.description.includes('阿槐：'))
    }
    assert.equal(project.scenes[1].dialogue, '阿槐: 这班船还开吗？')
    const scenes = new Set(project.scenes.map(scene => scene.id))
    const shotCounts = project.scenes.map(scene => project.shots.filter(shot => shot.sceneId === scene.id).length)
    assert(shotCounts.slice(1).every(count => count > 0 && count < shotCounts[0]))
    for (const shot of project.shots) {
      assert(shot.title.trim() && scenes.has(shot.sceneId))
      assert(shot.duration >= 1 && shot.duration <= 8 && Number.isInteger(shot.duration * 2))
    }
    assert.deepEqual(summary, { scenes: 4, shots: 12, duration: project.shots.reduce((sum, shot) => sum + shot.duration, 0) })
    assert.deepEqual((await command('export', 'json', zip)).project, project)
    const rendered = await renderedPages(pdf)
    assert(rendered.pdf.getPageCount() >= 1)
    assert.equal(rendered.pdf.getTitle(), project.title + ' · 分镜表')

    const repeat = await command('agent', 'storyboard', script, join(directory, '重复.zip'), '--title', project.title)
    const structure = ({ scenes, shots }) => ({
      scenes: scenes.map(({ id, ...scene }) => scene),
      shots: shots.map(({ id, sceneId, ...shot }) => ({ ...shot, scene: scenes.findIndex(scene => scene.id === sceneId) })),
    })
    assert.equal(repeat.pdf, undefined)
    assert.deepEqual(structure(repeat.project), structure(project))
    console.log('PASS Agent four-scene script, 12 deterministic shots, and paired PDF image streams > 10 KB')
    await testAgentWorkflow(directory, zip, project)

    const zipBytes = await readFile(zip)
    const pdfBytes = await readFile(pdf)
    const blockedZip = join(directory, '阻止.zip')
    const unusedPDF = join(directory, '未创建.pdf')
    await fails(1, /EEXIST/, ...args)
    await fails(1, /EEXIST/, ...args, '--pdf', unusedPDF)
    await fails(1, /EEXIST/, 'agent', 'storyboard', script, blockedZip, '--title', project.title, '--pdf', pdf)
    await assert.rejects(readFile(blockedZip), { code: 'ENOENT' })
    await assert.rejects(readFile(unusedPDF), { code: 'ENOENT' })
    assert.deepEqual(await readFile(zip), zipBytes)
    assert.deepEqual(await readFile(pdf), pdfBytes)
    for (const invalid of ['0', '1.5', '51', 'abc']) await fails(2, /--shots/, ...args, '--shots', invalid)
    await fails(2, /--title/, 'agent', 'storyboard', script, blockedZip)
    await fails(2, /120/, ...args, '--title', '字'.repeat(121))
    await fails(2, /画幅/, ...args, '--frame', '4:3')
    const invalidScript = join(directory, '无效.txt')
    const invalidInput = ['agent', 'storyboard', invalidScript, blockedZip, '--title', project.title]
    await fails(1, /剧本文件不存在/, ...invalidInput)
    await writeFile(invalidScript, '')
    await fails(1, /剧本文件为空/, ...invalidInput)
    await writeFile(invalidScript, '\uFEFF  \r\n')
    await fails(1, /剧本文件为空/, ...invalidInput)
    await writeFile(invalidScript, Buffer.from([0xc0, 0xaf]))
    await fails(1, /UTF-8 纯文本/, ...invalidInput)
    await writeFile(invalidScript, '文字\0')
    await fails(1, /UTF-8 纯文本/, ...invalidInput)
    await writeFile(invalidScript, Buffer.alloc(1024 * 1024 + 1, 65))
    await fails(1, /超过 1 MB/, ...invalidInput)
    assert(!(await readdir(directory)).some(name => name.endsWith('.shotweft-lock')))
    await assert.rejects(readFile(blockedZip), { code: 'ENOENT' })

    const extra = join(directory, '减镜.txt')
    await writeFile(extra, 'EXT. BEACH - DAY\n白浪打上岸。\n内景：旧仓库 / 夜\n罗丘：找到灯芯了。')
    const merged = await command('agent', 'storyboard', extra, join(directory, '减镜.zip'), '--title', '减镜', '--shots', '1', '--frame', '2.39:1')
    assert.equal(merged.project.frame, '2.39:1')
    assert.equal(merged.project.shots.length, 1)
    assert.equal(merged.project.scenes.length, 1)
    assert.equal(merged.project.scenes[0].location, 'BEACH')
    assert.equal(merged.project.scenes[0].setting, '外景')
    assert.equal(merged.project.scenes[0].dialogue, '罗丘：找到灯芯了。')
    assert.equal(merged.project.scenes[0].notes, '内景：旧仓库 / 夜')
    const unmerged = await command('agent', 'storyboard', extra, join(directory, '两镜.zip'), '--title', '两镜', '--shots', '2')
    assert.equal(unmerged.project.scenes[1].location, '旧仓库')
    assert.equal(unmerged.project.scenes[1].setting, '内景')
    assert.equal(unmerged.project.scenes[1].time, '夜')

    const noHeading = join(directory, '无场景标题.txt')
    const longBody = Buffer.from('字'.repeat(19_999) + '🪶' + '字'.repeat(1_000))
    await writeFile(noHeading, Buffer.concat([longBody, Buffer.alloc(1024 * 1024 - longBody.length, 32)]))
    const fallback = await command('agent', 'storyboard', noHeading, join(directory, '单场.zip'), '--title', '单场', '--shots', '50')
    assert.equal(fallback.project.scenes.length, 1)
    assert.equal(fallback.project.scenes[0].time, '日')
    assert.equal(fallback.project.scenes[0].description, '字'.repeat(19_999))
    assert.equal(fallback.project.shots.length, 50)
    assert(fallback.project.shots.every(shot => shot.title.trim() && shot.sceneId === fallback.project.scenes[0].id))
    console.log('PASS Agent input errors, no-clobber outputs, merged scenes, and 1–50 shot boundaries')

    context = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto(url)
    await page.getByLabel('ZIP 备份文件').setInputFiles(resolve(zip))
    await page.getByRole('heading', { name: '候潮灯 恢复', exact: true }).waitFor()
    await page.getByRole('img', { name: '分镜画布 16:9' }).locator('canvas').first().waitFor()
    await page.getByRole('link', { name: '镜头', exact: true }).click()
    await page.getByRole('heading', { name: '镜头列表' }).waitFor()
    const shotLinks = page.locator('.shot-list .shot-row a')
    assert.deepEqual(await shotLinks.allTextContents(), project.shots.map(shot => shot.title))
    await shotLinks.first().click()
    const name = page.getByRole('textbox', { name: '镜头名称', exact: true })
    await name.fill('铜纸鹤停在缆桩上')
    await name.press('Tab')
    await page.getByRole('button', { name: '镜头 01 铜纸鹤停在缆桩上', exact: true }).waitFor()
    const editedJSON = join(directory, '网页修订.json')
    await (await downloadJSON(page)).saveAs(editedJSON)
    const edited = JSON.parse(await readFile(editedJSON, 'utf8')).project
    assert.notEqual(edited.id, project.id)
    assert.equal(edited.shots.length, 12)
    assert.deepEqual(structure(edited), structure({
      ...project, shots: [{ ...project.shots[0], title: '铜纸鹤停在缆桩上' }, ...project.shots.slice(1)],
    }))
    console.log('PASS Agent ZIP browser restore, 12 readable shots, and edited JSON export')
  } finally {
    try {
      await context?.close()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
}

export async function testCLI(browser, url) {
  await testHelp()
  const directory = await mkdtemp('.tmp/cli-')
  const source = '.tmp/phase3-backup.zip'
  const webJSON = JSON.parse(await readFile('.tmp/phase3-project.json', 'utf8'))
  const projectPath = join(directory, '剪辑版.zip')
  const pdfPath = join(directory, '分镜.pdf')
  const outputJSON = join(directory, '分镜.json')
  const context = await browser.newContext()
  try {
    const restored = await command('project', 'restore', source, projectPath)
    assert.deepEqual(restored.project, webJSON.project)
    await testContract(directory, projectPath, restored.project)
    assert.deepEqual(await command('export', 'json', projectPath, '--json'), webJSON)
    await fails(1, /EEXIST/, 'project', 'restore', source, projectPath)
    await fails(1, /请使用项目 ZIP/, 'project', 'restore', '.tmp/phase3-project.json', join(directory, '缺少素材.zip'))
    await command('export', 'pdf', projectPath, '--output', pdfPath)
    const webPDF = await renderedPages('.tmp/phase3-board.pdf')
    const cliPDF = await renderedPages(pdfPath)
    assert.equal(cliPDF.pdf.getPageCount(), 2)
    assert.equal(cliPDF.pdf.getTitle(), webPDF.pdf.getTitle())
    assert.deepEqual(cliPDF.pages, webPDF.pages)

    await command('project', 'update', projectPath, '--title', '潮汐之前 剪辑版', '--frame', '9:16', '--archived', 'true')
    const scene = await command('scene', 'add', projectPath, '--location', '灯塔', '--setting', '内景')
    await command('scene', 'update', projectPath, scene.id, '--dialogue', '听见潮声了吗？')
    await command('scene', 'move', projectPath, scene.id, '--position', '1')
    const [movedScene] = await command('scene', 'list', projectPath)
    assert.equal(movedScene.id, scene.id)
    assert.equal((await command('scene', 'show', projectPath, scene.id)).dialogue, '听见潮声了吗？')
    const shot = await command('shot', 'add', projectPath, '--scene', scene.id, '--title', '灯塔内景')
    await command('shot', 'update', projectPath, shot.id, '--duration', '2.5', '--lens', '85mm')
    await command('shot', 'move', projectPath, shot.id, '--position', '1')
    const [movedShot] = await command('shot', 'list', projectPath)
    assert.equal(movedShot.id, shot.id)
    assert.equal((await command('shot', 'show', projectPath, shot.id)).duration, 2.5)

    await assertUnchangedMove('scene', projectPath, movedScene)
    await assertUnchangedMove('shot', projectPath, movedShot)
    console.log('PASS same-position scene and shot moves preserve ZIP bytes and project.updated')

    const beforeFailure = await readFile(projectPath)
    await fails(1, /找不到场景/, 'shot', 'update', projectPath, shot.id, '--scene', 'invalid')
    await mkdir(projectPath + '.shotweft-lock')
    await fails(1, /正在写入/, 'scene', 'delete', projectPath, scene.id)
    await rm(projectPath + '.shotweft-lock', { recursive: true })
    assert.deepEqual(await readFile(projectPath), beforeFailure)

    await command('scene', 'delete', projectPath, scene.id)
    assert.equal((await command('shot', 'show', projectPath, shot.id)).sceneId, '')
    await command('shot', 'delete', projectPath, shot.id)
    await command('export', 'json', projectPath, '--output', outputJSON)
    const edited = JSON.parse(await readFile(outputJSON, 'utf8'))
    assert.equal(edited.project.archived, true)
    assert.equal(edited.project.frame, '9:16')
    assert.deepEqual(edited.project.shots, webJSON.project.shots)
    assert.deepEqual(edited.assets, webJSON.assets)
    assert.deepEqual(await mediaFiles(projectPath), await mediaFiles(source))
    assert.deepEqual((await command('project', 'show', source)), webJSON.project)
    await testZIPVerification(directory, source, webJSON)
    await testSymlinkUpdate(directory, source, restored.project)

    const created = join(directory, '新建.zip')
    const restoredJSON = join(directory, '从JSON恢复.zip')
    const json = join(directory, '新建.json')
    const project = await command('project', 'create', created, '--title', '灯塔')
    assert.equal(project.shots[0].sceneId, project.scenes[0].id)
    await command('export', 'json', created, '--output', json)
    assert.deepEqual((await command('project', 'restore', json, restoredJSON)).project, project)

    const page = await context.newPage()
    await page.goto(url)
    await page.getByLabel('ZIP 备份文件').setInputFiles(resolve(projectPath))
    await page.getByRole('heading', { name: '潮汐之前 剪辑版 恢复', exact: true }).waitFor()
    await page.getByRole('img', { name: '分镜画布 9:16' }).locator('canvas').first().waitFor()
    const roundTrip = JSON.parse(await readFile(await (await downloadJSON(page)).path(), 'utf8'))
    assert.notEqual(roundTrip.project.id, edited.project.id)
    assert.equal(roundTrip.project.archived, false)
    assert.equal(roundTrip.project.shots[0].annotations.length, 5)
    assert.equal(roundTrip.assets.filter(asset => asset.kind === 'video').length, 1)

    await page.goto(url + '/#/project/before-the-tide')
    await page.getByRole('heading', { name: '潮汐之前', exact: true }).waitFor()
    const demoJSON = join(directory, '示例.json')
    const demoZIP = join(directory, '示例.zip')
    await (await downloadJSON(page)).saveAs(demoJSON)
    await command('project', 'restore', demoJSON, demoZIP)
    assert.deepEqual(await command('export', 'json', demoZIP), JSON.parse(await readFile(demoJSON, 'utf8')))
    assert.deepEqual([...(await mediaFiles(demoZIP)).keys()].sort(), ['photos/0.jpg', 'photos/1.jpg', 'photos/2.jpg'])
    console.log('PASS ShotWeft CLI edits, JSON, PDF parity, file locking, and real browser ZIP round trip')
  } finally {
    await context.close()
    await rm(directory, { recursive: true, force: true })
  }
  await testAgent(browser, url)
}
