import { createWriteStream, openAsBlob } from 'node:fs'
import { link, lstat, mkdir, mkdtemp, open, realpath, rename, rm, stat, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import {
  backupLimit, manifestLimit, projectManifest, readProjectManifest, readProjectZIP, writeProjectZIPTo, type ProjectArchive,
} from '../core/project-archive'
import type { Project } from '../model'

async function readProjectJSON(file: Blob): Promise<ProjectArchive> {
  if (file.size > manifestLimit) throw new Error('JSON 项目清单超过 16 MB')
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('JSON 格式无效')
  }
  const data = readProjectManifest(parsed, 'JSON')
  if (data.assets.length) throw new Error('JSON 清单缺少素材文件，请使用项目 ZIP 备份恢复')
  const photos = new Map<string, Blob>()
  for (const path of data.bundledPhotos) {
    photos.set(path, await openAsBlob(new URL('../../public' + path, import.meta.url), { type: 'image/jpeg' }))
  }
  return { project: data.project, items: [], photos, manifest: data }
}

async function openProject(path: string) {
  try {
    return await openAsBlob(path)
  } catch (error) {
    // openAsBlob can replace a filesystem error with ERR_INVALID_ARG_VALUE.
    if ((error as NodeJS.ErrnoException).code === 'ERR_INVALID_ARG_VALUE') await stat(path)
    throw error
  }
}

async function createMediaDirectory(temporaryRoot?: string) {
  const base = process.env.SHOTWEFT_TMP || temporaryRoot || (process.platform === 'win32' ? resolve('.tmp') : undefined)
  if (base) await mkdir(base, { recursive: true })
  return mkdtemp(resolve(base ?? tmpdir(), 'shotweft-media-'))
}

interface ProjectMedia {
  directory: () => Promise<string>
  pathFor: (blob: Blob) => string
}

export async function withProject<T>(path: string, use: (archive: ProjectArchive, media: ProjectMedia) => T | Promise<T>,
  { allowJSON = false, temporaryRoot }: { allowJSON?: boolean; temporaryRoot?: string } = {},
) {
  const file = await openProject(path)
  let temporary: Promise<string> | undefined
  const paths = new Map<Blob, string>()
  const media = {
    directory: () => temporary ??= createMediaDirectory(temporaryRoot),
    pathFor(blob: Blob) {
      const path = paths.get(blob)
      if (path === undefined) throw new Error('Media was not extracted from the project ZIP.')
      return path
    },
  }
  try {
    if (allowJSON) {
      const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer())
      if (signature[0] !== 0x50 || signature[1] !== 0x4b) return await use(await readProjectJSON(file), media)
    }
    const archive = await readProjectZIP(file, async (entry, type, options) => {
      const destination = join(await media.directory(), String(paths.size))
      await writeFileStream(destination, writable => entry.getData(writable, options))
      const blob = await openAsBlob(destination, { type })
      paths.set(blob, destination)
      return blob
    })
    return await use(archive, media)
  } finally {
    const directory = await temporary?.catch(() => undefined)
    if (directory) await rm(directory, { recursive: true, force: true, maxRetries: 3 })
  }
}

export async function writeProjectFile(staged: string, { project, items, photos, manifest }: ProjectArchive) {
  readProjectManifest(projectManifest(project, items, manifest), 'ZIP')
  const size = await writeFileStream(staged, destination => writeProjectZIPTo(destination, project, items, async path => {
    const photo = photos.get(path)
    if (!photo) throw new Error('项目缺少引用的示例照片')
    return photo
  }, manifest))
  if (size > backupLimit) throw new Error('此项目超过 768 MB 备份上限')
}

export async function updateProject(path: string, edit: (project: Project) => Project): Promise<Project> {
  return withOutputLock(await realpath(path), async (staged, target) => {
    const { project, changed } = await withProject(target, async archive => {
      const edited = edit(archive.project)
      if (edited === archive.project) return { project: edited, changed: false }
      const project = { ...edited, updated: Date.now() }
      await writeProjectFile(staged, { ...archive, project })
      return { project, changed: true }
    })
    if (changed) await rename(staged, target)
    return project
  })
}

export function writeOutput(path: string, blob: Blob) {
  return writeOutputFile(path, staged => pipeline(blob.stream(), createWriteStream(staged, { flags: 'wx', mode: 0o600 })))
}

export async function writeOutputFile(path: string, write: (staged: string) => Promise<void>) {
  return withOutputLock(path, async (staged, target) => {
    await requireAvailable(target)
    await write(staged)
    await link(staged, target)
    return target
  })
}

export function writeOutputPair(path: string, write: (staged: string) => Promise<void>, pdfPath: string, writePDF: (staged: string) => Promise<void>) {
  return withOutputLock(path, async (staged, target) => {
    return withOutputLock(pdfPath, async (stagedPDF, pdf) => {
      await requireAvailable(target)
      await requireAvailable(pdf)
      await write(staged)
      await writePDF(stagedPDF)
      await link(staged, target)
      try {
        await link(stagedPDF, pdf)
      } catch (error) {
        await unlink(target)
        throw error
      }
      return { path: target, pdf }
    })
  })
}

async function writeFileStream(path: string, write: (destination: WritableStream<Uint8Array>) => Promise<unknown>) {
  const file = await open(path, 'wx', 0o600)
  try {
    await write(new WritableStream<Uint8Array>({ write: chunk => file.writeFile(chunk) }))
    return (await file.stat()).size
  } finally {
    await file.close()
  }
}

async function requireAvailable(path: string) {
  try {
    await lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  throw new Error('目标文件已存在 (EEXIST)：' + path)
}

async function withOutputLock<T>(path: string, operation: (staged: string, target: string) => Promise<T>) {
  const absolute = resolve(path)
  const target = join(await realpath(dirname(absolute)), basename(absolute))
  const lock = target + '.shotweft-lock'
  try {
    await mkdir(lock, { mode: 0o700 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('文件正在写入或有残留锁：' + target)
    throw error
  }
  try {
    return await operation(join(lock, 'output'), target)
  } finally {
    await rm(lock, { recursive: true }).catch(() => {})
  }
}
