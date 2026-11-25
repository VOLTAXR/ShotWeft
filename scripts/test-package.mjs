import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const windows = process.platform === 'win32'
const temporary = join(root, '.tmp')
const pathKey = Object.keys(process.env).find(key => /^path$/i.test(key)) ?? 'PATH'
const log = []

function run(command, args, { logStdout = true, ...options }) {
  log.push('$ ' + [command, ...args].map(value => JSON.stringify(value)).join(' ') + '\n' + options.cwd)
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code, signal) => {
      log.push(`exit: ${code ?? signal}\n${logStdout ? stdout.replaceAll('\0', '\n') : ''}${stderr}`)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${basename(command)} exited with ${code ?? signal}`))
    })
  })
}

async function copyWorkingTree(source, env) {
  const { stdout } = await run('git', ['ls-files', '-z', '-co', '--exclude-standard'], { cwd: root, env })
  const excluded = new Set(['.git', 'node_modules', 'dist', '.tmp', '.browsers', '.npm-cache'])
  for (const file of new Set(stdout.split('\0').filter(Boolean))) {
    if (file.split('/').some(part => excluded.has(part))) continue
    const from = join(root, file)
    const info = await lstat(from).catch(error => {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error
    })
    if (!info || info.isDirectory()) continue
    const target = join(source, file)
    await mkdir(dirname(target), { recursive: true })
    await cp(from, target, { verbatimSymlinks: true })
  }
}

async function checkTarball(tgz, source, env) {
  const tar = windows ? 'tar.exe' : 'tar'
  const { stdout } = await run(tar, ['-tzf', tgz], { cwd: source, env })
  const files = new Set(stdout.trim().split(/\r?\n/))
  const photos = (await readdir(join(source, 'public', 'demo-media'))).filter(name => name.endsWith('.jpg'))
  const outputs = await readdir(join(source, 'dist', 'cli'))
  assert(photos.length, 'Expected at least one demo JPEG in source')
  assert(outputs.includes('shotweft.js') && outputs.includes('render.js'), 'Expected CLI entry and PDF renderer')
  const allowed = new Set([
    'README.md', 'package.json', 'docs/AGENT.md', 'docs/MEDIA_SOURCES.md', 'docs/RELEASE_NOTES_V1.5.md',
    'public/THIRD_PARTY_NOTICES.txt',
    ...outputs.filter(name => name.endsWith('.js')).map(name => 'dist/cli/' + name),
    ...photos.map(name => 'public/demo-media/' + name),
  ].map(path => 'package/' + path))
  for (const file of allowed) {
    assert(files.has(file), 'Missing from npm tarball: ' + file)
  }
  const repository = resolve(root).replaceAll('\\', '/').toLowerCase()
  const repositoryPaths = [repository]
  const drive = /^([a-z]):(\/.*)$/.exec(repository)
  const wsl = /^\/mnt\/([a-z])(\/.*)$/.exec(repository)
  if (drive) repositoryPaths.push(`/mnt/${drive[1]}${drive[2]}`)
  if (wsl) repositoryPaths.push(`${wsl[1]}:${wsl[2]}`)
  for (const file of files) {
    assert(!/(?:^|\/)(?:copyright|node_modules|src|\.tmp)\/|(?:^|\/)docs\/screenshots\/|\.bak$/i.test(file),
      'Unexpected npm tarball entry: ' + file)
    assert(allowed.has(file), 'Entry outside npm tarball allowlist: ' + file)
    if (file.endsWith('.jpg')) continue
    const { stdout: content } = await run(tar, ['-xOzf', tgz, file], { cwd: source, env, logStdout: false })
    if (file === 'package/package.json') {
      assert.equal(JSON.parse(content).private, true, 'Expected private: true to prevent accidental npm publishing')
    }
    const normalized = content.replace(/\\+/g, '/').toLowerCase()
    assert(repositoryPaths.every(path => !normalized.includes(path)), 'Development checkout path in ' + file)
  }
  console.log(`PASS npm pack tarball allowlist (${files.size} entries, ${photos.length} demo JPEGs), checkout path scan, and private: true`)
}

async function hasBrowser(installed, env) {
  const { stdout } = await run(process.execPath, ['-e', `
    const { chromium } = require('playwright')
    chromium.launch().then(async browser => {
      await browser.close()
      console.log('null')
    }, error => {
      if (!error.message.includes("Executable doesn't exist")) throw error
      console.log(JSON.stringify(error.message.split('\\n')[0]))
    }).catch(error => { console.error(error); process.exitCode = 1 })
  `], { cwd: installed, env })
  const missing = JSON.parse(stdout)
  if (!missing) return true
  const reason = `Playwright Chromium headless shell for ${process.platform}/${process.arch}: ${missing}`
  if (env.SHOTWEFT_REQUIRE_PDF === '1') throw new Error(reason)
  console.log(`SKIP installed PDF export and verification: ${reason}`)
  return false
}

async function checkPDF(installed, work, json, verified) {
  const path = join(work, 'storyboard.pdf')
  const bytes = await readFile(path)
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-')
  assert(bytes.subarray(-64).includes('%%EOF'), 'Expected a complete PDF')
  assert(bytes.length > 30_000, 'Expected a rendered storyboard PDF')
  const require = createRequire(join(installed, 'package.json'))
  const { PDFDocument, PDFName, PDFNumber, PDFRawStream } = require('pdf-lib')
  const pdf = await PDFDocument.load(bytes, { throwOnInvalidObject: true, updateMetadata: false })
  assert.equal(pdf.getPageCount(), 3)
  const title = verified.project.title + ' · 分镜表'
  assert.equal(pdf.getTitle(), title)
  for (const [index, page] of pdf.getPages().entries()) {
    const objects = page.node.Resources()?.lookup(PDFName.of('XObject'))
    const image = objects?.entries().map(([, ref]) => pdf.context.lookup(ref)).find(object =>
      object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype')) === PDFName.of('Image') &&
      object.dict.get(PDFName.of('Filter')) === PDFName.of('DCTDecode') && object.contents.length > 10_000 &&
      object.dict.lookup(PDFName.of('Width'), PDFNumber).asNumber() >= 1_000 &&
      object.dict.lookup(PDFName.of('Height'), PDFNumber).asNumber() >= 1_000 &&
      object.contents[0] === 0xff && object.contents[1] === 0xd8)
    assert(image, `Expected a full-size JPEG image on PDF page ${index + 1}`)
  }
  assert.deepEqual(await json('agent', 'verify', 'storyboard.zip', '--pdf', 'storyboard.pdf'), {
    ...verified, pdf: { path, bytes: bytes.length, pages: 3, title },
  })
  console.log(`PASS installed agent storyboard --pdf and agent verify --pdf (3 pages, ${bytes.length} bytes, JPEG on every page)`)
}

async function verify(directory) {
  const source = join(directory, 'source')
  const global = join(directory, 'global')
  const work = join(directory, 'work')
  await Promise.all([source, global, work].map(path => mkdir(path)))
  const env = {
    ...process.env,
    [pathKey]: [dirname(process.execPath), process.env[pathKey]].filter(Boolean).join(delimiter),
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || join(root, '.browsers'),
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    npm_config_cache: process.env.npm_config_cache || join(root, '.npm-cache'),
    npm_config_update_notifier: 'false',
    NODE_COMPILE_CACHE: join(directory, 'node-compile-cache'),
    TEMP: work,
    TMP: work,
    TMPDIR: work,
    SHOTWEFT_TMP: join(work, '.tmp'),
  }
  if (env.PLAYWRIGHT_BROWSERS_PATH && env.PLAYWRIGHT_BROWSERS_PATH !== '0') {
    env.PLAYWRIGHT_BROWSERS_PATH = resolve(root, env.PLAYWRIGHT_BROWSERS_PATH)
  }
  const npmCLI = process.env.npm_execpath ?? (windows
    ? join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    : undefined)
  const npm = (cwd, ...args) => npmCLI
    ? run(process.execPath, [npmCLI, ...args], { cwd, env })
    : run('npm', args, { cwd, env })

  await copyWorkingTree(source, env)
  await npm(source, 'ci')
  console.log('PASS npm ci in isolated source')
  await npm(source, 'pack', '--pack-destination', directory)
  const tarballs = (await readdir(directory)).filter(name => name.endsWith('.tgz'))
  assert.equal(tarballs.length, 1, 'Expected one tgz from npm pack')
  const tgz = join(directory, tarballs[0])
  const { version } = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
  await checkTarball(tgz, source, env)
  await npm(work, 'install', '-g', '--prefix', global, tgz)

  const shim = windows ? join(global, 'shotweft.cmd') : join(global, 'bin', 'shotweft')
  const shims = windows ? [join(global, 'shotweft'), shim, join(global, 'shotweft.ps1')] : [shim]
  await Promise.all(shims.map(path => access(path)))
  const cli = async (...args) => {
    // Fixture paths are relative to work. Only the npm-generated .cmd needs cmd.exe.
    const result = windows
      ? await run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c',
        ['..\\global\\shotweft.cmd', ...args.map(value => `"${value}"`)].join(' ')],
      { cwd: work, env, windowsVerbatimArguments: true })
      : await run(shim, args, { cwd: work, env })
    assert.equal(result.stderr, '')
    return result.stdout
  }
  const json = async (...args) => {
    const stdout = await cli(...args)
    assert.match(stdout, /^[^\r\n]+\n$/)
    return JSON.parse(stdout)
  }
  assert.equal((await cli('--version')).trim(), version)
  assert.match(await cli('--help'), /agent storyboard <script\.txt> <project\.zip>/)
  assert.match(await cli('export', '--help'), /export zip <zip> --output/)
  assert.match(await cli('agent', '--help'), /agent verify <zip>/)
  const created = await json('project', 'create', 'created.zip', '--title', '安装验收')
  assert.equal(created.title, '安装验收')
  assert.deepEqual((await json('project', 'show', 'created.zip')), created)

  const installed = join(global, ...(windows ? [] : ['lib']), 'node_modules', 'shotweft')
  const renderPDF = await hasBrowser(installed, env)
  await writeFile(join(work, 'script.txt'), '外景 旧码头 - 清晨\n船靠岸。\n内景 等候室 - 夜\n灯亮了。\n')
  const storyboard = await json('agent', 'storyboard', 'script.txt', 'storyboard.zip',
    '--title', '安装分镜', '--shots', '12', ...(renderPDF ? ['--pdf', 'storyboard.pdf'] : []))
  const { path: storyboardPath, project, summary } = storyboard
  assert.equal(storyboardPath, join(work, 'storyboard.zip'))
  if (renderPDF) {
    assert.equal(storyboard.pdf, join(work, 'storyboard.pdf'))
    await checkPDF(installed, work, json, { path: storyboardPath, project, summary })
  }
  assert.equal(project.title, '安装分镜')
  assert.deepEqual(summary, {
    scenes: 2, shots: 12, duration: project.shots.reduce((sum, item) => sum + item.duration, 0),
  })
  assert.deepEqual((await json('export', 'json', 'storyboard.zip')).project, project)
  assert.deepEqual((await json('project', 'restore', 'storyboard.zip', 'working.zip')).project, project)
  const [{ id: shot }] = project.shots
  const [{ id: scene }] = project.scenes
  assert.match(shot, /^[a-f\d-]+$/i)
  assert.match(scene, /^[a-f\d-]+$/i)
  await json('shot', 'update', 'working.zip', shot, '--title', '已更新镜头', '--duration', '9.5')
  await json('scene', 'update', 'working.zip', scene, '--location', '已更新场景')
  const manifestPath = join(work, 'working.json')
  assert.deepEqual(await json('export', 'json', 'working.zip', '--output', 'working.json'), { path: manifestPath })
  const edited = JSON.parse(await readFile(manifestPath, 'utf8'))
  assert.equal(edited.project.shots[0].title, '已更新镜头')
  assert.equal(edited.project.shots[0].duration, 9.5)
  assert.equal(edited.project.scenes[0].location, '已更新场景')
  const path = join(work, 'copy.zip')
  assert.deepEqual(await json('export', 'zip', 'working.zip', '--output', 'copy.zip'), { path })
  assert.deepEqual(await json('export', 'json', 'copy.zip'), edited)
  const duration = summary.duration - project.shots[0].duration + 9.5
  const verified = { path, project: edited.project, summary: { scenes: 2, shots: 12, duration } }
  assert.deepEqual(await json('agent', 'verify', 'copy.zip'), verified)

  assert.deepEqual((await json('project', 'restore', 'copy.zip', 'continued.zip')).project, edited.project)
  const updated = await json('shot', 'update', 'continued.zip', shot, '--title', '继续编辑', '--duration', '11.5')
  const continued = await json('agent', 'verify', 'continued.zip')
  assert.equal(continued.path, join(work, 'continued.zip'))
  assert.deepEqual(continued.summary, { ...verified.summary, duration: duration + 2 })
  assert.deepEqual(continued.project.shots[0], updated)
  assert.equal(continued.project.shots[0].title, '继续编辑')
  assert.deepEqual(await json('agent', 'verify', 'copy.zip'), verified)
  console.log(`PASS installed shotweft ${version} on ${process.platform}: help, create, storyboard, edits, JSON/ZIP export, ZIP verification, restore, and continued edits (${duration} → ${duration + 2} s)`)

  await npm(work, 'uninstall', '-g', '--prefix', global, 'shotweft')
  await Promise.all(shims.map(path => assert.rejects(lstat(path), { code: 'ENOENT' }, `npm left behind ${path}`)))
  console.log('PASS npm uninstall removed the installed shotweft shims')
}

await mkdir(temporary, { recursive: true })
const directory = await mkdtemp(join(temporary, 'package-'))
let failure
try {
  await verify(directory)
} catch (error) {
  failure = error
} finally {
  try {
    await rm(directory, { recursive: true, force: true, maxRetries: 3 })
  } catch (error) {
    log.push('Cleanup failed: ' + error.stack)
    failure ??= error
  }
  if (failure) {
    const logPath = directory + '.log'
    console.error(failure.message)
    console.error('Package verification log: ' + logPath)
    await writeFile(logPath, [...log, failure.stack].join('\n\n') + '\n', { flag: 'wx' })
    process.exitCode = 1
  }
}
