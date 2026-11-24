import { copyFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { ProjectArchive } from '../core/project-archive'
import { captionDefaults, clipEndFrame, frameToSeconds, timelineDurationFrames, type VideoClip, type VideoTimeline } from '../video-model'
import {
  encodeTimeout, inputOptions, openFFmpeg, openFFprobe, probeFile, sampleRate, verifyMP4,
  type FFmpeg, type FFprobe, type ProbeStream, type TimelineProfile,
} from './ffmpeg'
import { withProject, writeOutputFile } from './project-file'

const archiveOptions = { temporaryRoot: '.tmp' }
const demuxers: Readonly<Record<string, string>> = {
  'video/mp4': 'mov', 'video/webm': 'matroska',
  'image/jpeg': 'jpeg_pipe', 'image/png': 'png_pipe', 'image/webp': 'webp_pipe',
}

interface MediaInput {
  index: number
  path: string
  demuxer: string
  visual?: ProbeStream
  audio?: ProbeStream
  duration?: string
  startTime?: string
}

function timelineProfile(timeline?: VideoTimeline) {
  if (!timeline) throw new Error('Project has no video timeline.')
  const { width, height, fps } = timeline
  const durationFrames = timelineDurationFrames(timeline)
  return { width, height, fps, durationFrames, durationSeconds: frameToSeconds(durationFrames, fps) }
}

function timelineRate({ fps }: TimelineProfile) {
  return fps.numerator + '/' + fps.denominator
}

function requireRenderable(profile: TimelineProfile) {
  if (!profile.durationFrames) throw new Error('The video timeline is empty.')
  // FFmpeg's AVRational and MP4 video track timescale store the numerator as a signed int.
  if (profile.fps.numerator > 2_147_483_647) throw new Error('Video frame rate exceeds the FFmpeg rational range.')
}

function samplesAt(frame: number, { fps }: TimelineProfile) {
  const numerator = BigInt(fps.numerator)
  const samples = (BigInt(frame) * BigInt(fps.denominator) * BigInt(sampleRate) + numerator / 2n) / numerator
  if (samples > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Video timeline exceeds the supported audio sample range.')
  return Number(samples)
}

function color(hex: string, opacity = 1) {
  const alpha = hex.length === 9 ? Number.parseInt(hex.slice(7), 16) / 255 : 1
  return '0x' + hex.slice(1, 7) + '@' + alpha * opacity
}

function enabled(start: number, end: number) {
  return "enable='between(n," + start + ',' + (end - 1) + ")'"
}

function selectStream(streams: ProbeStream[], kind: 'audio' | 'video') {
  const candidates = streams.filter(stream => stream.codec_type === kind && !stream.disposition?.attached_pic)
  return candidates.find(stream => stream.disposition?.default) ?? candidates[0]
}

function sourceEnd(stream: ProbeStream, media: MediaInput) {
  const origin = Number(media.startTime ?? 0)
  const start = Number(stream.start_time ?? origin)
  if (stream.duration && Number.isFinite(Number(stream.duration))) return start - origin + Number(stream.duration)
  const end = stream.tags?.DURATION?.split(':').map(Number)
  if (end?.length === 3 && end.every(Number.isFinite)) return end[0] * 3600 + end[1] * 60 + end[2] - origin
  return Number(media.duration)
}

function requireSourceRange(stream: ProbeStream, clip: VideoClip, media: MediaInput, { fps }: TimelineProfile) {
  const end = sourceEnd(stream, media)
  const requested = frameToSeconds((clip.sourceInFrame ?? 0) + clip.durationFrames, fps)
  // Container and stream metadata can round endpoints by up to one source timestamp tick.
  if (!Number.isFinite(end) || requested > end + 0.001) {
    throw new Error('Source ' + stream.codec_type + ' range exceeds the measured media duration for clip ' + clip.id + '.')
  }
}

async function encode(ffmpeg: FFmpeg, cwd: string, graph: string, profile: TimelineProfile, output: string, inputs: MediaInput[] = []) {
  const script = join(cwd, 'graph.txt')
  await writeFile(script, graph, { mode: 0o600 })
  await ffmpeg.invoke([
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-xerror', '-filter_complex_threads', '2',
    ...inputs.flatMap(({ path, demuxer }) => [...inputOptions(demuxer), '-i', path]),
    '-filter_complex_script', script, '-map', '[picture]', '-map', '[sound]',
    '-c:v', 'libopenh264', '-pix_fmt', 'yuv420p', '-fps_mode', 'cfr', '-r', timelineRate(profile),
    '-video_track_timescale', String(profile.fps.numerator),
    '-c:a', 'aac', '-profile:a', 'aac_low', '-ar', String(sampleRate), '-ac', '2',
    '-map_metadata', '-1', '-map_chapters', '-1', '-movflags', '+faststart', '-f', 'mp4', output,
  ], 'MP4 encode', { cwd, timeout: encodeTimeout })
}

function blackBase(profile: TimelineProfile) {
  return 'color=c=black:s=' + profile.width + 'x' + profile.height + ':r=' + timelineRate(profile) +
    ',trim=end_frame=' + profile.durationFrames + ',format=yuv420p'
}

function silentBase(profile: TimelineProfile) {
  return 'anullsrc=r=' + sampleRate + ':cl=stereo,atrim=end_sample=' + samplesAt(profile.durationFrames, profile)
}

async function compileGraph(
  timeline: VideoTimeline, profile: TimelineProfile, items: ProjectArchive['items'],
  directory: string, pathFor: (blob: Blob) => string, ffmpeg: FFmpeg, ffprobe: FFprobe,
) {
  const assets = new Map(items.map(item => [item.id, item]))
  const inputs = new Map<string, MediaInput>()
  const graph: string[] = [blackBase(profile) + '[base]', silentBase(profile) + '[silence]']
  const audio = ['[silence]']
  const clock = timeline.fps.denominator + '/' + timeline.fps.numerator
  const { width, height } = profile
  let picture = '[base]'
  let nextLabel = 0
  let nextText = 0
  let font = 'font=Sans'

  async function mediaFor(assetId: string) {
    const existing = inputs.get(assetId)
    if (existing) return existing
    const asset = assets.get(assetId)!
    const demuxer = demuxers[asset.blob.type]
    await ffmpeg.requireCapability('demuxers', [demuxer])
    const path = pathFor(asset.blob)
    const { streams, format } = await probeFile(ffprobe, path, demuxer)
    const input = {
      index: inputs.size, path, demuxer,
      visual: selectStream(streams, 'video'), audio: selectStream(streams, 'audio'),
      duration: format.duration, startTime: format.start_time,
    }
    inputs.set(assetId, input)
    return input
  }

  async function requireDecoder(stream: ProbeStream) {
    if (!stream.codec_name) throw new Error('Unknown codec in source ' + stream.codec_type + ' stream.')
    await ffmpeg.requireCapability('decoders', [stream.codec_name])
  }

  function draw(filter: string) {
    const output = '[layer' + nextLabel++ + ']'
    graph.push(picture + filter + output)
    picture = output
  }

  function overlay(source: string, start: number, end: number, x = 0, y = 0) {
    draw(source + 'overlay=x=' + x + ':y=' + y + ':eof_action=repeat:' + enabled(start, end))
  }

  async function textOptions(text: string, size: number, ink: string, opacity?: number) {
    if (text.includes('\0')) throw new Error('Video text contains an unsupported NUL character.')
    if (nextText === 0 && process.env.SHOTWEFT_FONT) {
      try {
        await copyFile(resolve(process.env.SHOTWEFT_FONT), join(directory, 'font'))
      } catch {
        throw new Error('Cannot read the font selected by SHOTWEFT_FONT.')
      }
      font = 'fontfile=font'
    }
    const file = 'text-' + nextText++ + '.txt'
    await writeFile(join(directory, file), text, { mode: 0o600 })
    return 'drawtext=' + font + ':textfile=' + file + ':expansion=none:fontsize=' + Math.max(1, Math.round(size)) +
      ':fontcolor=' + color(ink, opacity)
  }

  async function drawGraphic(clip: VideoClip) {
    const graphic = clip.graphic!
    const x = Math.round(graphic.x * width)
    const y = Math.round(graphic.y * height)
    const w = Math.max(1, Math.round(graphic.width * width))
    const h = Math.max(1, Math.round(graphic.height * height))
    const end = clipEndFrame(clip)
    if (graphic.opacity === 0) return
    if (graphic.kind === 'box') {
      draw('drawbox=x=' + x + ':y=' + y + ':w=' + w + ':h=' + h + ':t=fill:color=' +
        color(graphic.color, graphic.opacity) + ':' + enabled(clip.startFrame, end))
    } else if (graphic.text) {
      const align = { left: '0', center: '(w-tw)/2', right: 'w-tw' }[graphic.align]
      const source = '[graphic' + nextLabel++ + ']'
      const text = await textOptions(graphic.text, graphic.fontSize, graphic.color, graphic.opacity)
      graph.push('color=c=black@0.0:s=' + w + 'x' + h + ':r=' + timelineRate(profile) +
        ',format=rgba,trim=end_frame=1,' + text + ':x=' + align + ':y=(h-th)/2,format=yuva420p' +
        ',settb=' + clock + ',setpts=N+' + clip.startFrame + source)
      overlay(source, clip.startFrame, end, x, y)
    }
  }

  const visualOrder = [...timeline.tracks.filter(track => track.kind === 'main-video'),
    ...timeline.tracks.filter(track => track.kind !== 'main-video' && track.kind !== 'captions')]
  for (const track of visualOrder) {
    const audioOnly = track.kind === 'voice' || track.kind === 'music'
    for (const clip of track.clips) {
      if (clip.graphic) {
        if (track.visible) await drawGraphic(clip)
        continue
      }
      const asset = assets.get(clip.assetId!)!
      const moving = asset.kind === 'video'
      const visible = track.visible && !audioOnly
      const audible = moving && !track.muted && !clip.muted && clip.volume > 0
      if (!visible && !audible) continue
      const media = await mediaFor(asset.id)
      const start = clip.sourceInFrame ?? 0
      const end = start + clip.durationFrames
      if (visible) {
        if (!media.visual) throw new Error('Missing source video stream for clip ' + clip.id + '.')
        await requireDecoder(media.visual)
        if (moving) requireSourceRange(media.visual, clip, media, profile)
        const timing = moving
          ? 'fps=fps=' + timelineRate(profile) + ':start_time=0,trim=start_frame=' + start + ':end_frame=' + end
          : 'trim=end_frame=1'
        const layer = '[media' + nextLabel++ + ']'
        graph.push('[' + media.index + ':' + media.visual.index + ']' + timing +
          ',scale=' + width + ':' + height + ':force_original_aspect_ratio=decrease:force_divisible_by=2:reset_sar=1' +
          ',format=yuva420p,pad=' + width + ':' + height + ':(ow-iw)/2:(oh-ih)/2:color=black@0' +
          ',settb=' + clock + ',setpts=N+' + clip.startFrame + layer)
        overlay(layer, clip.startFrame, clipEndFrame(clip))
      }
      if (!audible) continue
      if (!media.audio) {
        if (audioOnly) throw new Error('Missing source audio stream for clip ' + clip.id + '.')
        continue
      }
      await requireDecoder(media.audio)
      if (audioOnly) requireSourceRange(media.audio, clip, media, profile)
      const delay = samplesAt(clip.startFrame, profile)
      const length = samplesAt(clipEndFrame(clip), profile) - delay
      const label = '[audio' + audio.length + ']'
      graph.push('[' + media.index + ':' + media.audio.index + ']aresample=' + sampleRate +
        ':async=1:first_pts=0:ochl=stereo,aformat=sample_fmts=fltp:channel_layouts=stereo' +
        ',atrim=start_sample=' + samplesAt(start, profile) + ':end_sample=' + samplesAt(end, profile) +
        ',asetpts=PTS-STARTPTS,apad=whole_len=' + length + ',atrim=end_sample=' + length +
        ',volume=' + clip.volume + ',adelay=' + delay + 'S:all=1' + label)
      audio.push(label)
    }
  }

  for (const track of timeline.tracks) {
    if (track.kind !== 'captions' || !track.visible) continue
    for (const cue of timeline.subtitles.filter(cue => cue.trackId === track.id)) {
      if (!cue.text) continue
      const style = { ...captionDefaults, ...cue.style }
      const margin = Math.round(height * 0.06)
      const y = { top: String(margin), center: '(h-th)/2', bottom: 'h-th-' + margin }[style.position]
      const padding = Math.round(style.fontSize * 0.18) + '|' + Math.round(style.fontSize * 0.4)
      draw(await textOptions(cue.text, style.fontSize, style.color) +
        ':x=(w-tw)/2:y=' + y + ':box=1:boxcolor=' + color(style.background) + ':boxborderw=' + padding +
        ':' + enabled(cue.startFrame, cue.endFrame))
    }
  }
  graph.push(picture + 'format=yuv420p[picture]')
  graph.push(audio.length === 1 ? '[silence]anull[sound]' : audio.join('') +
    'amix=inputs=' + audio.length + ':duration=first:normalize=0,alimiter=limit=0.95:level=0:latency=1[sound]')
  return { graph: graph.join(';\n'), inputs: [...inputs.values()] }
}

export function renderVideo(source: string, output: string, executables: { ffmpeg?: string; ffprobe?: string }) {
  const projectPath = resolve(source)
  return withProject(projectPath, async ({ project, items }, media) => {
    const timeline = timelineProfile(project.video)
    requireRenderable(timeline)
    let measured!: Awaited<ReturnType<typeof verifyMP4>>
    const path = await writeOutputFile(output, async staged => {
      const [ffmpeg, ffprobe] = await Promise.all([openFFmpeg(executables.ffmpeg), openFFprobe(executables.ffprobe)])
      const directory = await media.directory()
      const smoke = { ...timeline, durationFrames: 2, durationSeconds: frameToSeconds(2, timeline.fps) }
      const smokePath = join(directory, 'smoke.mp4')
      await encode(ffmpeg, directory, blackBase(smoke) + '[picture];' + silentBase(smoke) + '[sound]', smoke, smokePath)
      await verifyMP4(ffprobe, smokePath, smoke)
      const compiled = await compileGraph(project.video!, timeline, items, directory, media.pathFor, ffmpeg, ffprobe)
      await encode(ffmpeg, directory, compiled.graph, timeline, staged, compiled.inputs)
      measured = await verifyMP4(ffprobe, staged, timeline)
    })
    return { path, projectPath, timeline, video: { ...measured, path } }
  }, archiveOptions)
}

export function verifyVideo(source: string, candidate?: string, probeExecutable?: string) {
  const projectPath = resolve(source)
  return withProject(projectPath, async ({ project }) => {
    const timeline = timelineProfile(project.video)
    if (candidate === undefined) return { projectPath, timeline }
    requireRenderable(timeline)
    const path = resolve(candidate)
    const ffprobe = await openFFprobe(probeExecutable)
    return { path, projectPath, timeline, video: { ...await verifyMP4(ffprobe, path, timeline), path } }
  }, archiveOptions)
}
