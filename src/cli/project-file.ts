import { createHash } from 'node:crypto'
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

export async function writeProjectFile(staged: string, { project, items, photos, manifest }: ProjectArchive, preserveVersion = false) {
  readProjectManifest(projectManifest(project, items, manifest, preserveVersion), 'ZIP')
  const size = await writeFileStream(staged, destination => writeProjectZIPTo(destination, project, items, async path => {
    const photo = photos.get(path)
    if (!photo) throw new Error('项目缺少引用的示例照片')
    return photo
  }, manifest, preserveVersion))
  if (size > backupLimit) throw new Error('此项目超过 768 MB 备份上限')
}

export const revisionPattern = /^[a-f0-9]{64}$/i

export async function projectRevision(path: string) {
  if (!(await stat(path)).isFile()) throw new Error('Project must be a regular file.')
  const file = await open(path, 'r')
  try {
    if (!(await file.stat()).isFile()) throw new Error('Project must be a regular file.')
    const hash = createHash('sha256')
    for await (const chunk of file.createReadStream({ autoClose: false })) hash.update(chunk)
    return hash.digest('hex')
  } finally {
    await file.close()
  }
}

export interface ProjectArchiveUpdateOptions {
  expectedRevision?: string
  dryRun?: boolean
}

/** The edit returns a complete archive; return the original object for an explicit no-op.
 * Extracted media blobs are available only inside the edit, not in the receipt.
 */
export async function updateProjectArchive(path: string, edit: (archive: ProjectArchive) => ProjectArchive | Promise<ProjectArchive>,
  { expectedRevision, dryRun = false }: ProjectArchiveUpdateOptions = {},
) {
  if (expectedRevision !== undefined && !revisionPattern.test(expectedRevision)) throw new Error('Expected revision must be a SHA-256 hex digest.')
  return withOutputLock(await realpath(path), async (staged, target) => {
    const previousRevision = await projectRevision(target)
    if (expectedRevision !== undefined && expectedRevision.toLowerCase() !== previousRevision) {
      throw new Error('Revision conflict: expected ' + expectedRevision + ', found ' + previousRevision + '.')
    }
    const { project, changed } = await withProject(target, async archive => {
      // Capture metadata before invoking the edit. Structured data is small; media stays file-backed.
      const originalManifest = structuredClone(archive.manifest!)
      const edited = await edit(archive)
      if (edited === archive) return { project: archive.project, changed: false }
      const project = { ...edited.project, updated: Date.now() }
      if (edited.items.some(item => item.projectId !== project.id)) throw new Error('Project asset ownership does not match the project ID.')
      const manifest = { ...originalManifest, ...edited.manifest, version: originalManifest.version,
        project: originalManifest.project, bundledPhotos: [...edited.photos.keys()] }
      const data = projectManifest(project, edited.items, manifest, true)
      if (data.bundledPhotos.length !== edited.photos.size || data.bundledPhotos.some(path => !edited.photos.has(path))) {
        throw new Error('Project photos must match the archive photo collection and all project references.')
      }
      await writeProjectFile(staged, { ...edited, project, manifest }, true)
      return { project, changed: true }
    })
    if (changed) await withProject(staged, () => undefined)
    const revision = changed ? await projectRevision(staged) : previousRevision
    if (await projectRevision(target) !== previousRevision) throw new Error('Revision conflict: project changed during the transaction.')
    const committed = changed && !dryRun
    if (committed) await rename(staged, target)
    return { project, previousRevision, revision, changed, committed, dryRun }
  })
}

export async function updateProject(path: string, edit: (project: Project) => Project, options?: ProjectArchiveUpdateOptions): Promise<Project> {
  const { project } = await updateProjectArchive(path, archive => {
    const project = edit(archive.project)
    return project === archive.project ? archive : { ...archive, project }
  }, options)
  return project
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
