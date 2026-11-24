import { z } from 'zod'
import type { EntryGetDataOptions, FileEntry, WritableWriter } from '@zip.js/zip.js'
import { annotationTypes } from '../annotation-model'
import { productName, releaseVersion } from '../../release.json'
import { frames, media, type Asset, type Project } from '../model'
import type { ArchiveMetadata, ProjectSnapshot } from '../project-snapshot'
import { audioExtension, audioFormats, audioLimit, isAudioFormat, validateAudioSignature, type AudioFormat } from './audio-format'
import { validateVideoAssetReferences, videoTimelineSchema } from './video-schema'

const paths = new Map(media.map((item, index) => [item.path, index]))
const id = z.string().min(1).max(160)
const text = z.string().max(20_000)
const localPhoto = z.string().refine(path => paths.has(path))
const unit = z.number().min(0).max(1)
const mark = z.object({
  id, type: z.enum(annotationTypes), name: text, text, x: z.number(), y: z.number(),
  width: z.number().nonnegative(), height: z.number().nonnegative(),
  scaleX: z.number().positive(), scaleY: z.number().positive(), opacity: unit,
  color: z.string().regex(/^#[0-9a-f]{6}$/i), hidden: z.boolean(), locked: z.boolean(),
  points: z.array(z.number()).max(8000).refine(points => points.length % 2 === 0),
})
const imageType = z.enum(['image/jpeg', 'image/png', 'image/webp'])
const videoType = z.enum(['video/mp4', 'video/webm'])
const audioType = z.custom<AudioFormat>(value => typeof value === 'string' && isAudioFormat(value))
const photoLimit = 25 * 1024 * 1024
const blobSize = 120 * 1024 * 1024
export const backupLimit = 768 * 1024 * 1024
export const manifestLimit = 16 * 1024 * 1024
const assetFields = z.object({
  id, projectId: id, name: z.string().min(1).max(800),
  created: z.number(), source: z.url({ protocol: /^https?$/ }).optional(),
  thumbnailType: imageType, thumbnailBytes: z.number().int().min(1).max(8 * 1024 * 1024),
})
const dimension = z.number().int().positive()
const visualFields = {
  width: dimension, height: dimension, duration: z.number().positive().optional(),
  originalBytes: z.number().int().min(1).max(blobSize),
}
const asset = z.discriminatedUnion('kind', [
  assetFields.extend({ ...visualFields, kind: z.literal('image'), originalType: imageType }),
  assetFields.extend({ ...visualFields, kind: z.literal('video'), originalType: videoType }),
  assetFields.extend({
    kind: z.literal('audio'), width: dimension.optional(), height: dimension.optional(), duration: z.number().positive(),
    originalType: audioType, originalBytes: z.number().int().min(1).max(audioLimit),
  }),
]).refine(item => item.kind !== 'audio' || audioExtension(item.name) === audioFormats[item.originalType].extension)
const manifest = z.looseObject({
  // Accept the legacy product format string while writing the current product name.
  format: z.string().min(1).max(60), version: z.union([z.literal(1), z.literal(2)]), softwareVersion: z.string().optional(),
  project: z.object({
    id, title: z.string().min(1).max(120), frame: z.enum(frames), updated: z.number(),
    archived: z.boolean(), demo: z.boolean().optional(), cover: localPhoto.optional(), coverAssetId: id.optional(),
    video: videoTimelineSchema.optional(),
    scenes: z.array(z.object({
      id, location: text, setting: z.enum(['内景', '外景']), time: text, description: text, dialogue: text, notes: text,
    })).max(20_000),
    shots: z.array(z.object({
      id, sceneId: z.string().max(160), title: text, size: text, angle: text, movement: text, lens: text,
      duration: z.number().positive().max(3600), notes: text, media: localPhoto.optional(),
      assetId: id.optional(), posterId: id.optional(),
      crop: z.object({ zoom: z.number().min(1).max(3), x: unit, y: unit }).optional(),
      annotations: z.array(mark).max(5000).optional(),
    })).max(20_000),
  }),
  assets: z.array(asset).max(5000),
  bundledPhotos: z.array(localPhoto).max(media.length),
})

type ProjectManifest = z.input<typeof manifest>

export function archiveMetadata({ project, assets, bundledPhotos, format, version, ...metadata }: ProjectManifest): ArchiveMetadata {
  return metadata
}

export function projectManifest(project: Project, items: Asset[], source?: Partial<ProjectManifest>) {
  const storedAssets = new Map(source?.assets?.map(item => [item.id, item]))
  return {
    ...source, format: productName, version: project.video || items.some(item => item.kind === 'audio') ? 2 : 1,
    softwareVersion: source ? source.softwareVersion : releaseVersion, project,
    assets: items.map(({ blob, thumbnail, ...item }) => ({
      ...storedAssets.get(item.id), ...item, originalType: blob.type, originalBytes: blob.size,
      thumbnailType: thumbnail.type, thumbnailBytes: thumbnail.size,
    })),
    bundledPhotos: [...new Set([
      ...(source?.bundledPhotos ?? []), project.cover, ...project.shots.map(shot => shot.media),
    ].filter((value): value is string => !!value && paths.has(value)))],
  }
}

export interface ProjectArchive extends ProjectSnapshot {
  photos: ReadonlyMap<string, Blob>
  manifest?: ProjectManifest
}

export async function writeProjectZIP(
  project: Project, items: Asset[], loadPhoto: (path: string) => Promise<Blob>, source?: Partial<ProjectManifest>,
) {
  const { BlobWriter } = await import('@zip.js/zip.js')
  const zip = await writeArchive<Blob>(new BlobWriter('application/zip'), project, items, loadPhoto, source)
  if (zip.size > backupLimit) throw new Error('此项目超过 768 MB 备份上限')
  return zip
}

export async function writeProjectZIPTo(
  destination: WritableStream<Uint8Array>,
  project: Project, items: Asset[], loadPhoto: (path: string) => Promise<Blob>, source?: Partial<ProjectManifest>,
) {
  await writeArchive(destination, project, items, loadPhoto, source)
}

async function writeArchive<T>(
  destination: WritableWriter | WritableStream<Uint8Array>,
  project: Project, items: Asset[], loadPhoto: (path: string) => Promise<Blob>, source?: Partial<ProjectManifest>,
) {
  if (items.reduce((total, item) => total + item.blob.size + item.thumbnail.size, 0) > backupLimit - 16 * 1024 * 1024) {
    throw new Error('此项目超过 768 MB 备份上限')
  }
  const data = projectManifest(project, items, source)
  const metadata = JSON.stringify(data, null, 2)
  if (new Blob([metadata]).size > manifestLimit) throw new Error('项目清单超过 16 MB，无法创建可恢复备份')
  if (data.version === 2) readProjectManifest(data, 'ZIP')
  const { ZipWriter, BlobReader, TextReader } = await import('@zip.js/zip.js')
  const writer = new ZipWriter<T>(destination)
  const options = { level: 0, useWebWorkers: false }
  try {
    await writer.add('project.json', new TextReader(metadata), options)
    for (const [index, item] of items.entries()) {
      await writer.add('media/' + index + '/original', new BlobReader(item.blob), options)
      await writer.add('media/' + index + '/thumbnail', new BlobReader(item.thumbnail), options)
    }
    for (const path of data.bundledPhotos) {
      const photo = await loadPhoto(path)
      if (!photo.size || photo.size > photoLimit) throw new Error('示例照片的大小无效')
      await writer.add('photos/' + paths.get(path) + '.jpg', new BlobReader(photo), options)
    }
  } catch (error) {
    await writer.close().catch(() => {})
    throw error
  }
  return writer.close()
}

export function readProjectManifest(value: unknown, source: 'ZIP' | 'JSON') {
  const formatError = source + ' 中的项目格式无效'
  const photoError = source + ' 缺少项目引用的示例照片'
  const relationError = source + ' 中的场景、镜头或素材关联无效'
  const result = manifest.safeParse(value)
  if (!result.success) {
    const issue = result.error.issues.find(issue => issue.path[0] === 'project' && issue.path[1] === 'video')
    throw new Error(issue ? `${formatError} (${issue.path.join('.')}: ${issue.message})` : formatError)
  }
  const data = result.data
  const audio = new Set(data.assets.filter(item => item.kind === 'audio').map(item => item.id))
  if (audio.size && data.version === 1) throw new Error('Audio assets require ZIP manifest version 2.')
  const photographs = new Set(data.bundledPhotos)
  const referencedPhotos = [data.project.cover, ...data.project.shots.map(shot => shot.media)]
  if (referencedPhotos.some(photo => photo && !photographs.has(photo))) throw new Error(photoError)
  const ids = new Set(data.assets.map(item => item.id))
  const visual = (assetId: string) => ids.has(assetId) && !audio.has(assetId)
  const sceneIds = new Set(data.project.scenes.map(item => item.id))
  if ((data.project.coverAssetId && !visual(data.project.coverAssetId)) || ids.size !== data.assets.length || sceneIds.size !== data.project.scenes.length ||
      new Set(data.project.shots.map(shot => shot.id)).size !== data.project.shots.length ||
      data.project.shots.some(shot => (shot.sceneId && !sceneIds.has(shot.sceneId)) ||
        (shot.assetId && !visual(shot.assetId)) || (shot.posterId && !visual(shot.posterId)) ||
        (shot.annotations && new Set(shot.annotations.map(item => item.id)).size !== shot.annotations.length))) {
    throw new Error(relationError)
  }
  if (data.project.video) validateVideoAssetReferences(data.project.video, data.project.id, data.assets)
  // Keep the original JSON fields alongside the validated and normalized asset values.
  const original = value as ProjectManifest
  return { ...original, assets: original.assets.map((item, index) => ({ ...item, ...data.assets[index] })) }
}

type ReadMedia = (entry: FileEntry, type: string, options: EntryGetDataOptions) => Promise<Blob>

export async function readProjectZIP(file: Blob, readMedia?: ReadMedia): Promise<ProjectArchive> {
  if (!file.size || file.size > backupLimit) throw new Error('ZIP 文件为空或超过 768 MB')
  const { ZipReader, BlobReader, TextWriter, BlobWriter } = await import('@zip.js/zip.js')
  const readBlob: ReadMedia = readMedia ?? ((entry, type, options) => entry.getData(new BlobWriter(type), options))
  const reader = new ZipReader(new BlobReader(file))
  try {
    const entries = await reader.getEntries()
    if (entries.length > 10_010 || entries.reduce((total, entry) => total + entry.uncompressedSize, 0) > backupLimit) {
      throw new Error('ZIP 解压后超过备份上限')
    }
    const fileEntries = entries.filter(entry => !entry.directory)
    const files = new Map(fileEntries.map(entry => [entry.filename, entry]))
    const options = { checkSignature: true, useWebWorkers: false }
    if (files.size !== fileEntries.length) throw new Error('ZIP 中有重复文件')
    const metadata = files.get('project.json')
    if (!metadata || metadata.uncompressedSize > manifestLimit) throw new Error('ZIP 中的项目清单缺失或过大')
    const data = readProjectManifest(JSON.parse(await metadata.getData(new TextWriter(), options)), 'ZIP')
    const expected = new Set(['project.json'])
    const directories = new Set<string>()
    if (data.assets.length) directories.add('media/')
    if (data.bundledPhotos.length) directories.add('photos/')
    for (const index of data.assets.keys()) {
      const folder = 'media/' + index + '/'
      directories.add(folder)
      expected.add(folder + 'original')
      expected.add(folder + 'thumbnail')
    }
    for (const path of data.bundledPhotos) expected.add('photos/' + paths.get(path) + '.jpg')
    const extra = entries.find(entry => entry.directory
      ? entry.uncompressedSize !== 0 || !directories.has(entry.filename)
      : !expected.has(entry.filename))
    if (extra) throw new Error('ZIP 中包含不支持的条目：' + extra.filename)

    async function read(path: string, type: string, max: number, exact?: number) {
      const entry = files.get(path)
      if (!entry || !entry.uncompressedSize || entry.uncompressedSize > max || (exact !== undefined && entry.uncompressedSize !== exact)) {
        throw new Error('ZIP 中的素材缺失或大小无效')
      }
      const blob = await readBlob(entry, type, options)
      if (blob.size !== entry.uncompressedSize) throw new Error('ZIP 中的素材大小与清单不符')
      return blob
    }

    const items: Asset[] = []
    for (const [index, entry] of data.assets.entries()) {
      const { originalType, originalBytes, thumbnailType, thumbnailBytes, ...item } = entry
      const blob = await read('media/' + index + '/original', originalType, blobSize, originalBytes)
      if (entry.kind === 'audio') await validateAudioSignature(blob, entry.originalType)
      const thumbnail = await read('media/' + index + '/thumbnail', thumbnailType, 8 * 1024 * 1024, thumbnailBytes)
      items.push({ ...item, blob, thumbnail })
    }
    const photos = new Map<string, Blob>()
    for (const path of new Set(data.bundledPhotos)) {
      photos.set(path, await read('photos/' + paths.get(path) + '.jpg', 'image/jpeg', photoLimit))
    }
    return { project: data.project, items, photos, manifest: data }
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('ZIP 中的项目清单无法读取')
    throw error
  } finally {
    await reader.close()
  }
}
