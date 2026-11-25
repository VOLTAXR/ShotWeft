import { randomUUID } from 'node:crypto'
import { constants, createWriteStream, openAsBlob } from 'node:fs'
import { mkdtemp, open, realpath, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { z } from 'zod'
import { audioLimit, isAudioFormat, validateAudioSignature } from '../core/audio-format'
import { backupLimit, type ProjectArchive } from '../core/project-archive'
import type { Asset } from '../model'
import { inputOptions, measuredStreamSeconds, openFFmpeg, openFFprobe, probeFile, type FFmpeg, type FFprobe } from './ffmpeg'
import { updateProjectArchive, withProject, type ProjectArchiveUpdateOptions, type ProjectMedia } from './project-file'

const MiB = 1024 * 1024
const formats = {
  '.png': ['image', 'image/png', 'png_pipe', /^png$/],
  '.jpg': ['image', 'image/jpeg', 'jpeg_pipe', /^mjpeg$/],
  '.webp': ['image', 'image/webp', 'webp_pipe', /^webp$/],
  '.mp4': ['video', 'video/mp4', 'mov', /^h264$/],
  '.webm': ['video', 'video/webm', 'matroska', /^(vp8|vp9|av1)$/],
  '.wav': ['audio', 'audio/wav', 'wav', /^pcm_(u8|s16le|s24le|s32le|f32le|f64le)$/],
  '.mp3': ['audio', 'audio/mpeg', 'mp3', /^mp3$/],
  '.m4a': ['audio', 'audio/mp4', 'mov', /^aac$/],
} as const

export function projectMediaExtension(asset: Asset) {
  const extension = (Object.keys(formats) as (keyof typeof formats)[]).find(ext => formats[ext][1] === asset.blob.type && formats[ext][0] === asset.kind)
  if (!extension) throw new Error('Unsupported archive media type for asset ' + asset.id + '.')
  return extension
}

const fileEntry = z.strictObject({ path: z.string().min(1).max(1024),
  source: z.url({ protocol: /^https?$/ }).max(2048).optional(), license: z.string().trim().min(1).max(4096).optional() })
const importBatch = z.array(fileEntry).min(1).max(100)
type FileEntry = z.infer<typeof fileEntry>
export class InvalidMediaInput extends Error {}

export async function readLocalJSON<T>(path: string, schema: z.ZodType<T>) {
  if (!(await stat(path)).isFile()) throw new InvalidMediaInput('Expected a regular JSON file.')
  const file = await openAsBlob(path)
  if (!file.size || file.size > MiB) throw new InvalidMediaInput('JSON input must be nonempty and at most 1 MiB.')
  const bytes = await file.arrayBuffer()
  let value: unknown
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
  catch { throw new InvalidMediaInput('Invalid UTF-8 JSON input.') }
  const result = schema.safeParse(value)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new InvalidMediaInput('Invalid JSON input at ' + (issue.path.join('.') || 'root') + ': ' + issue.message)
  }
  return result.data
}

function safeParts(path: string) {
  const parts = path.split('/')
  if (/[\\:\u0000-\u001f\u007f]/.test(path) || parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part))) {
    throw new Error('Media paths must be relative, slash-separated paths within --root: ' + path)
  }
  return parts
}

function isWebM(bytes: Buffer) {
  if (!bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return false
  // Read EBML element IDs and sizes within the small header, not media packet data.
  function integer(offset: number, id = false) {
    const first = bytes[offset]
    if (!first) return
    let length = 1, marker = 0x80
    while (!(first & marker)) { marker >>= 1; length++ }
    if (length > (id ? 4 : 6) || offset + length > bytes.length) return
    let value = id ? first : first & (marker - 1)
    for (let i = 1; i < length; i++) value = value * 256 + bytes[offset + i]
    return { value, next: offset + length }
  }
  const size = integer(4)
  if (!size || size.next + size.value > bytes.length) return false
  for (let pos = size.next, end = pos + size.value; pos < end;) {
    const tag = integer(pos, true)
    const length = tag && integer(tag.next)
    if (!tag || !length || length.next + length.value > end) return false
    if (tag.value === 0x4282) return bytes.toString('ascii', length.next, length.next + length.value) === 'webm'
    pos = length.next + length.value
  }
  return false
}

async function checkSignature(blob: Blob) {
  if (isAudioFormat(blob.type)) return validateAudioSignature(blob, blob.type)
  const b = Buffer.from(await blob.slice(0, 4096).arrayBuffer())
  const tag = (offset: number) => b.toString('latin1', offset, offset + 4)
  const valid = blob.type === 'image/png' ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : blob.type === 'image/jpeg' ? b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
    : blob.type === 'image/webp' ? tag(0) === 'RIFF' && tag(8) === 'WEBP'
    : blob.type === 'video/webm' ? isWebM(b)
    : b.length >= 16 && tag(4) === 'ftyp' && /^(isom|iso[2-9]|mp4[12]|avc1|M4V |dash|MSNV)$/.test(tag(8))
  if (!valid) throw new Error('Invalid file signature for ' + blob.type + '.')
}

function requireWithin(base: string, path: string, source: string) {
  const rel = relative(base, path)
  if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep)) throw new Error('Media symlink escapes --root: ' + source)
}

async function snapshotMedia(base: string, path: string, local: string, size: number, source: string) {
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
  try {
    if (process.platform === 'linux') requireWithin(base, await realpath('/proc/self/fd/' + file.fd), source)
    else requireWithin(base, await realpath(path), source)
    const info = await file.stat()
    if (!info.isFile() || info.size !== size) throw new Error('Media changed before copying: ' + source)
    await pipeline(file.createReadStream({ autoClose: false, start: 0, end: size - 1 }), createWriteStream(local, { flags: 'wx', mode: 0o600 }))
    const current = await file.stat()
    if (current.size !== size || current.mtimeMs !== info.mtimeMs || current.ctimeMs !== info.ctimeMs) throw new Error('Media changed while copying: ' + source)
  } finally { await file.close() }
}

function mediaLimit(kind: Asset['kind']) { return kind === 'image' ? 25 * MiB : kind === 'video' ? 120 * MiB : audioLimit }

export interface MediaTools { ffmpeg?: string; ffprobe?: string }
export async function openMediaTools(options: MediaTools) {
  const [ffmpeg, ffprobe] = await Promise.all([openFFmpeg(options.ffmpeg), openFFprobe(options.ffprobe)])
  return { ffmpeg, ffprobe }
}

async function inspect(path: string, extension: keyof typeof formats, ffprobe: FFprobe) {
  const [kind, , demuxer, codec] = formats[extension]
  const { streams, format } = await probeFile(ffprobe, path, demuxer)
  const type = kind === 'audio' ? 'audio' : 'video'
  const matching = streams.filter(stream => stream.codec_type === type && !stream.disposition?.attached_pic)
  const stream = matching[0]
  const sounds = streams.filter(stream => stream.codec_type === 'audio')
  if (matching.length !== 1 || !stream.codec_name || !codec.test(stream.codec_name) ||
      (kind !== 'video' && streams.length !== 1) || (kind === 'video' && (sounds.length > 1 || streams.length !== 1 + sounds.length))) {
    throw new Error('Unsupported or ambiguous ' + kind + ' streams or codec for ' + extension + '.')
  }
  const width = stream.width ?? 0, height = stream.height ?? 0
  if (type === 'video' && (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 60_000_000)) throw new Error('Invalid or excessive media dimensions.')
  if (kind === 'video' && sounds.length && !(extension === '.mp4' ? /^aac$/ : /^(opus|vorbis)$/).test(sounds[0].codec_name ?? '')) {
    throw new Error('Unsupported embedded audio codec for ' + extension + '.')
  }
  if (sounds.some(audio => !audio.channels || audio.channels > 8 || !Number(audio.sample_rate) || Number(audio.sample_rate) > 192000)) {
    throw new Error('Unsupported audio channels or sample rate.')
  }
  const duration = measuredStreamSeconds(stream, streams.length === 1 ? format.duration : undefined)
  if (kind !== 'image' && (!Number.isFinite(duration) || duration <= 0 || duration > 3600)) {
    throw new Error('Media must have a measurable duration between zero and one hour.')
  }
  return { kind, width, height, duration, demuxer, codecs: streams.map(stream => stream.codec_name!) }
}

export async function measureProjectAudio(asset: Asset, path: string, ffprobe: FFprobe) {
  if (asset.kind !== 'audio') throw new Error('Narration requires a project audio asset.')
  await checkSignature(asset.blob)
  return (await inspect(path, projectMediaExtension(asset), ffprobe)).duration
}

export async function prepareProjectAssets(entries: FileEntry[], root: string, projectId: string, media: ProjectMedia,
  { ffmpeg, ffprobe }: { ffmpeg: FFmpeg; ffprobe: FFprobe }, existing: Asset[], audioOnly = false) {
  const base = await realpath(root)
  if (!(await stat(base)).isDirectory()) throw new Error('--root must be a directory.')
  if (existing.length + entries.length > 5000) throw new Error('Too many project assets.')
  const inputs = []
  const seen = new Set<string>()
  let size = existing.reduce((n, item) => n + item.blob.size + item.thumbnail.size, 0)
  for (const entry of entries) {
    const path = await realpath(join(base, ...safeParts(entry.path)))
    requireWithin(base, path, entry.path)
    if (seen.has(path)) throw new Error('Duplicate media source: ' + entry.path)
    seen.add(path)
    const ext = extname(entry.path).toLowerCase().replace(/^\.jpeg$/, '.jpg')
    if (!Object.hasOwn(formats, ext)) throw new Error('Unsupported media extension: ' + entry.path)
    const extension = ext as keyof typeof formats
    const [kind, mime] = formats[extension]
    if (audioOnly && kind !== 'audio') throw new Error('Narration requires an audio file.')
    const info = await stat(path)
    if (!info.isFile() || !info.size || info.size > mediaLimit(kind)) throw new Error('Invalid file size or oversized ' + kind + ': ' + entry.path)
    size += info.size
    if (size > backupLimit - 16 * MiB) throw new Error('Media batch exceeds the project ZIP size limit.')
    inputs.push({ entry, path, extension, mime, kind, size: info.size })
  }
  const directory = await mkdtemp(join(await media.directory(), 'cli-import-'))
  const items: Asset[] = []
  for (const [index, input] of inputs.entries()) {
    const local = join(directory, 'original-' + index + input.extension)
    await snapshotMedia(base, input.path, local, input.size, input.entry.path)
    const blob = await openAsBlob(local, { type: input.mime })
    if (blob.size !== input.size) throw new Error('Media changed while copying: ' + input.entry.path)
    await checkSignature(blob)
    const { width, height, duration, demuxer, codecs } = await inspect(local, input.extension, ffprobe)
    await ffmpeg.requireCapability('decoders', codecs)
    await ffmpeg.requireCapability('demuxers', [demuxer])
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-xerror', '-n']
    const source = [...inputOptions(demuxer), '-err_detect', 'explode', '-threads', '2', '-i', local]
    await ffmpeg.invoke([...args, ...source, '-map', '0', '-f', 'null', '-'], 'validate decoded media', { timeout: 180_000 })
    const thumb = join(directory, 'thumbnail-' + index + '.png')
    const picture = input.kind === 'audio' ? ['-protocol_whitelist', 'file', '-f', 'lavfi', '-i', 'color=c=0x17243d:s=320x144:r=1']
      : [...source, '-map', '0:v:0', '-vf', 'scale=480:480:force_original_aspect_ratio=decrease']
    await ffmpeg.invoke([...args, ...picture, '-frames:v', '1', '-threads', '1', '-c:v', 'png', '-f', 'image2', '-update', '1', thumb], 'media thumbnail')
    const thumbnail = await openAsBlob(thumb, { type: 'image/png' })
    const name = basename(input.entry.path)
    const record = { id: randomUUID(), projectId, name, created: Date.now(), blob, thumbnail,
      ...(input.entry.source && { source: input.entry.source }), ...(input.entry.license && { license: input.entry.license }) }
    items.push(input.kind === 'audio' ? { ...record, kind: 'audio', duration }
      : { ...record, kind: input.kind, width, height, ...(input.kind === 'video' && { duration }) })
  }
  return items
}

export function assetMetadata({ blob, thumbnail, ...asset }: Asset) {
  return { ...asset, mimeType: blob.type, size: blob.size, thumbnailMimeType: thumbnail.type, thumbnailSize: thumbnail.size }
}

export function requireProjectAsset(archive: ProjectArchive, id: string) {
  const asset = archive.items.find(item => item.id === id)
  if (!asset || asset.projectId !== archive.project.id) throw new Error('Missing project asset: ' + id)
  return asset
}

export async function importProjectAssets(path: string, batch: string, root: string, options: ProjectArchiveUpdateOptions & MediaTools) {
  const entries = await readLocalJSON(batch, importBatch)
  let assets: ReturnType<typeof assetMetadata>[] = []
  const { project: _project, ...result } = await updateProjectArchive(path, async (archive, media) => {
    const imported = await prepareProjectAssets(entries, root, archive.project.id, media, await openMediaTools(options), archive.items)
    assets = imported.map(assetMetadata)
    return { ...archive, items: [...archive.items, ...imported] }
  }, options)
  return { ...result, assets }
}

export function showProjectAssets(path: string, id?: string) {
  return withProject(path, archive => id === undefined ? archive.items.map(assetMetadata) : assetMetadata(requireProjectAsset(archive, id)))
}

export async function removeProjectAsset(path: string, id: string, options: ProjectArchiveUpdateOptions) {
  const { project: _project, ...result } = await updateProjectArchive(path, archive => {
    requireProjectAsset(archive, id)
    const project = archive.project
    const references: string[] = []
    if (project.coverAssetId === id) references.push('project.coverAssetId')
    for (const shot of project.shots) {
      if (shot.assetId === id) references.push(`shot ${shot.id}.assetId`)
      if (shot.posterId === id) references.push(`shot ${shot.id}.posterId`)
    }
    for (const track of project.video?.tracks ?? []) for (const clip of track.clips) {
      if (clip.assetId === id) references.push(`video track ${track.id}, clip ${clip.id}`)
    }
    for (const asset of project.direction?.assets ?? []) {
      if (asset.projectAssetId === id) references.push(`DirectorPlan.asset ${asset.id}`)
    }
    if (references.length) throw new Error('Asset ' + id + ' is referenced by: ' + references.join('; '))
    return { ...archive, items: archive.items.filter(asset => asset.id !== id) }
  }, options)
  return { ...result, id }
}
