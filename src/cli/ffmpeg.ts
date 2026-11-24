import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { delimiter, resolve } from 'node:path'
import { promisify } from 'node:util'
import { frameToSeconds, type FrameRate } from '../video-model'

const exec = promisify(execFile)
const probeTimeout = 60_000
export const encodeTimeout = 30 * 60_000
export const sampleRate = 48_000

export interface TimelineProfile {
  width: number
  height: number
  fps: FrameRate
  durationFrames: number
  durationSeconds: number
}

type Capability = 'encoders' | 'decoders' | 'filters' | 'demuxers' | 'muxers'

const renderCapabilities = {
  encoders: ['libopenh264', 'aac'],
  decoders: [],
  filters: ['color', 'fps', 'trim', 'settb', 'setpts', 'scale', 'pad', 'format', 'overlay', 'drawbox', 'drawtext',
    'anullsrc', 'anull', 'aresample', 'aformat', 'atrim', 'asetpts', 'apad', 'adelay', 'volume', 'amix', 'alimiter'],
  demuxers: [],
  muxers: ['mp4'],
} satisfies Record<Capability, string[]>

type ToolName = 'ffmpeg' | 'ffprobe'

async function run(path: string, args: string[], task: string, { cwd, timeout = probeTimeout }: { cwd?: string; timeout?: number } = {}) {
  try {
    const command = exec(path, args, {
      cwd, timeout, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024, windowsHide: true, shell: false,
    })
    command.child.stdin?.end()
    return await command
  } catch (error) {
    const failure = error as Error & { code?: number | string; killed?: boolean; stderr?: string }
    const detail = failure.killed ? 'timed out' : failure.stderr?.trim().slice(-1600) || failure.code || failure.name
    throw new Error(task + ' failed (' + path + '): ' + detail)
  }
}

async function executable(name: ToolName, explicit?: string) {
  const variable = name.toUpperCase() + '_PATH'
  const override = explicit ?? process.env[variable]
  const suffixes = process.platform === 'win32' ? ['.exe', '.com'] : ['']
  const candidates = override !== undefined
    ? [resolve(override)]
    : (process.env.PATH ?? '').split(delimiter).flatMap(directory =>
      suffixes.map(suffix => resolve(directory.replace(/^"(.*)"$/, '$1'), name + suffix)))
  for (const path of candidates) {
    try {
      await access(path, constants.X_OK)
      if ((await stat(path)).isFile()) return path
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR' && code !== 'EACCES') throw error
    }
  }
  throw new Error(name + ' executable not found or inaccessible' +
    (override === undefined ? '' : ' at ' + JSON.stringify(override)) +
    '. Provide --' + name + ', set ' + variable + ', or add ' + name + ' to PATH.')
}

async function openTool(name: ToolName, explicit?: string) {
  const path = await executable(name, explicit)
  const invoke = (args: string[], task: string, options?: { cwd?: string; timeout?: number }) =>
    run(path, args, name + ' ' + task, options)
  const checks = await Promise.all(['-version', '-buildconf', '-L'].map(flag => invoke([flag], 'build check ' + flag)))
  const [version, configuration, license] = checks.map(({ stdout, stderr }) => stdout + '\n' + stderr)
  if (!version.includes(name + ' version') || !configuration.includes('configuration:')) {
    throw new Error('Invalid ' + name + ' build information: ' + path)
  }
  const flags = (version + '\n' + configuration).match(/--enable-(?:gpl|nonfree)(?=\s|$)/g)
  if (flags) throw new Error(name + ' build is unsupported: ' + [...new Set(flags)].join(', ') + ' (' + path + ')')
  if (!/GNU Lesser General Public License/.test(license) || /(?:the terms of (?:the )?)GNU General Public License/.test(license)) {
    throw new Error(name + ' must report a GNU Lesser General Public License: ' + path)
  }
  const listings = new Map<Capability, Promise<Set<string>>>()
  async function list(kind: Capability) {
    const { stdout } = await invoke(['-hide_banner', '-' + kind], 'capability check ' + kind)
    const names = new Set<string>()
    for (const line of stdout.split('\n')) {
      const match = line.match(/^\s*[.A-Z]+\s+([\w,-]+)(?=\s|$)/)
      if (!match) continue
      for (const item of match[1].split(',')) names.add(item)
      if (kind === 'decoders') {
        const codec = line.match(/\(codec ([\w-]+)\)/)?.[1]
        if (codec) names.add(codec)
      }
    }
    return names
  }
  async function requireCapability(kind: Capability, names: readonly string[]) {
    if (!listings.has(kind)) listings.set(kind, list(kind))
    const available = await listings.get(kind)!
    const missing = names.find(item => !available.has(item))
    if (missing) throw new Error(name + ' is missing required ' + kind.slice(0, -1) + ': ' + missing)
  }
  return { invoke, requireCapability }
}

export async function openFFmpeg(explicit?: string) {
  const tool = await openTool('ffmpeg', explicit)
  for (const kind of Object.keys(renderCapabilities) as Capability[]) {
    await tool.requireCapability(kind, renderCapabilities[kind])
  }
  const { stdout } = await tool.invoke(['-hide_banner', '-h', 'filter=scale'], 'scale options check')
  if (!/\breset_sar\b/.test(stdout)) throw new Error('ffmpeg is missing required scale option: reset_sar')
  return tool
}

export function openFFprobe(explicit?: string) {
  return openTool('ffprobe', explicit)
}

export type FFmpeg = Awaited<ReturnType<typeof openFFmpeg>>
export type FFprobe = Awaited<ReturnType<typeof openFFprobe>>

export interface ProbeStream {
  index: number
  codec_type: string
  codec_name?: string
  width?: number
  height?: number
  pix_fmt?: string
  avg_frame_rate?: string
  r_frame_rate?: string
  duration?: string
  start_time?: string
  nb_read_frames?: string
  channels?: number
  sample_rate?: string
  profile?: string
  disposition?: { attached_pic?: number; default?: number }
  tags?: { DURATION?: string }
}

interface MediaProbe {
  streams: ProbeStream[]
  format: { format_name: string; duration?: string; start_time?: string; tags?: { major_brand?: string } }
}

export function inputOptions(demuxer: string) {
  return ['-protocol_whitelist', 'file', '-f', demuxer, ...(demuxer === 'mov' ? ['-enable_drefs', '0'] : [])]
}

export async function probeFile(tool: FFprobe, path: string, demuxer: string, countFrames = false) {
  if (!(await stat(path)).isFile()) throw new Error('Expected a regular media file: ' + path)
  await tool.requireCapability('demuxers', [demuxer])
  const { stdout, stderr } = await tool.invoke([
    '-v', 'error', ...inputOptions(demuxer), ...(countFrames ? ['-count_frames'] : []),
    '-show_entries',
    'stream=index,codec_type,codec_name,width,height,pix_fmt,avg_frame_rate,r_frame_rate,duration,start_time,nb_read_frames,channels,sample_rate,profile' +
    ':stream_disposition=attached_pic,default:stream_tags=DURATION:format=format_name,duration,start_time:format_tags=major_brand',
    '-of', 'json', '-i', path,
  ], 'media probe', { timeout: countFrames ? encodeTimeout : probeTimeout })
  if (stderr.trim()) throw new Error('ffprobe could not read media: ' + stderr.trim().slice(-1600))
  const data = JSON.parse(stdout) as MediaProbe
  if (!Array.isArray(data.streams) || !data.format) throw new Error('ffprobe returned incomplete media properties.')
  return data
}

function sameRate(rate: string | undefined, fps: FrameRate) {
  if (!rate || !/^\d+\/[1-9]\d*$/.test(rate)) return false
  const [numerator, denominator] = rate.split('/').map(BigInt)
  return numerator * BigInt(fps.denominator) === denominator * BigInt(fps.numerator)
}

export async function verifyMP4(tool: FFprobe, path: string, profile: TimelineProfile) {
  await tool.requireCapability('decoders', ['h264', 'aac'])
  const { streams, format } = await probeFile(tool, path, 'mov', true)
  const video = streams.find(stream => stream.codec_type === 'video' && !stream.disposition?.attached_pic)
  const audio = streams.find(stream => stream.codec_type === 'audio')
  const brand = format.tags?.major_brand?.trim() ?? ''
  if (!format.format_name.split(',').includes('mp4') || !/^(?:isom|iso[2-9]|mp4[12]|avc1|M4[VP]|MSNV|dash)$/.test(brand)) {
    throw new Error('Expected an MP4 container with a compatible major brand.')
  }
  if (streams.length !== 2 || video?.codec_name !== 'h264' || audio?.codec_name !== 'aac') {
    throw new Error('Expected one H.264 video stream and one AAC audio stream.')
  }
  if (video.width !== profile.width || video.height !== profile.height || video.pix_fmt !== 'yuv420p') {
    throw new Error('Expected ' + profile.width + 'x' + profile.height + ' yuv420p video, measured ' +
      video.width + 'x' + video.height + ' ' + video.pix_fmt + '.')
  }
  if (!sameRate(video.avg_frame_rate, profile.fps) || !sameRate(video.r_frame_rate, profile.fps)) {
    throw new Error('Video frame rate does not match the timeline: ' + video.avg_frame_rate + '.')
  }
  if (Number(audio.sample_rate) !== sampleRate || audio.channels !== 2 || audio.profile !== 'LC') {
    throw new Error('Expected stereo AAC-LC audio at 48000 Hz.')
  }
  const frameCount = Number(video.nb_read_frames)
  if (!Number.isSafeInteger(frameCount) || frameCount < 1 || Math.abs(frameCount - profile.durationFrames) > 1) {
    throw new Error('Video frame count does not match the timeline: ' + video.nb_read_frames + '.')
  }
  const frameDuration = frameToSeconds(1, profile.fps)
  function duration(label: string, value: string | undefined, tolerance: number) {
    const seconds = Number(value)
    if (!Number.isFinite(seconds) || seconds <= 0 || Math.abs(seconds - profile.durationSeconds) > tolerance + 0.000001) {
      throw new Error(label + ' duration does not match the timeline: ' + value + '.')
    }
    return seconds
  }
  return {
    format: 'mp4', brand, codec: video.codec_name, pixelFormat: video.pix_fmt, width: video.width, height: video.height,
    fps: video.avg_frame_rate, frameCount,
    durationSeconds: duration('Video', video.duration, frameDuration),
    containerDurationSeconds: duration('MP4', format.duration, frameDuration),
    audio: {
      codec: audio.codec_name, profile: audio.profile, sampleRate, channels: audio.channels,
      durationSeconds: duration('Audio', audio.duration, frameDuration + 1024 / sampleRate),
    },
  }
}
