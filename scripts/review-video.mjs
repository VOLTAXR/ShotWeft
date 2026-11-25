#!/usr/bin/env node
// Automated motion/audio review for rendered ShotWeft videos.
// Measurements use the external LGPL FFmpeg/FFprobe already required by rendering.
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const usage = 'review-video <video.mp4> [--plan plan.json] [--audio source.wav] [--config thresholds.json] ' +
  '[--ffmpeg <path>] [--ffprobe <path>] [--json <report.json>]'

function args(argv) {
  const flags = new Map()
  const positionals = []
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i]
    if (value.startsWith('--')) {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) throw new Error('Missing value for ' + value)
      flags.set(value.slice(2), next); i++
    } else positionals.push(value)
  }
  if (positionals.length !== 1) throw new Error(usage)
  return { video: positionals[0], flags }
}

const defaults = {
  stillRatio: 0.3, maxHoldSeconds: 2.5, maxLongHoldsPerMinute: 1,
  minCutsPerMinute: 8, maxCutsPerMinute: 40, maxShotP75Seconds: 6,
  cutThreshold: 5, freezeNoise: '-60dB', allowHolds: [], captionDriftMs: 150, requireMeasuredAlignment: true,
}

async function run(bin, argv, task) {
  try {
    return await exec(bin, argv, { maxBuffer: 32 * 1024 * 1024, timeout: 30 * 60_000 })
  } catch (error) {
    const stderr = error.stderr?.toString().trim().split('\n').slice(-3).join(' | ')
    throw new Error(task + ' failed (' + bin + '): ' + (stderr || error.message))
  }
}

function parser(text) {
  const frozen = []
  let current
  for (const line of text.split('\n')) {
    const start = /freeze_start: ([\d.]+)/.exec(line)
    const duration = /freeze_duration: ([\d.]+)/.exec(line)
    const end = /freeze_end: ([\d.]+)/.exec(line)
    if (start) { current = { start: Number(start[1]), duration: undefined, end: undefined }; frozen.push(current) }
    if (duration && current) current.duration = Number(duration[1])
    if (end && current) current.end = Number(end[1])
  }
  return frozen
}

async function measure(video, { ffmpeg, ffprobe, config }) {
  const directory = await mkdtemp(join(tmpdir(), 'shotweft-review-'))
  try {
    const probe = JSON.parse((await run(ffprobe, ['-v', 'error', '-show_entries',
      'stream=index,codec_type,codec_name,width,height,r_frame_rate,nb_frames,duration,sample_rate,channels:format=duration',
      '-of', 'json', video], 'ffprobe')).stdout)
    const duration = Number(probe.format?.duration)
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('ffprobe could not measure a positive duration')
    const videoStream = probe.streams.find(stream => stream.codec_type === 'video')
    if (!videoStream) throw new Error('Input has no video stream')

    const frozenLog = await run(ffmpeg, ['-hide_banner', '-nostdin', '-i', video, '-map', '0:v',
      '-vf', 'freezedetect=n=' + config.freezeNoise + ':d=0.5', '-f', 'null', '-'], 'freeze detection')
    const frozen = parser(frozenLog.stderr).map(item => ({
      start: item.start, duration: item.duration ?? Math.max(0, duration - item.start),
    }))

    const diffPath = join(directory, 'diff.txt')
    await run(ffmpeg, ['-hide_banner', '-nostdin', '-i', video, '-map', '0:v',
      '-vf', 'tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=' + diffPath,
      '-f', 'null', '-'], 'frame difference')
    const deltas = []
    for (const line of (await readFile(diffPath, 'utf8')).split('\n')) {
      const match = /YAVG=([\d.]+)/.exec(line)
      if (match) deltas.push(Number(match[1]))
    }
    // Adaptive cut detection: a cut must stand out from its local neighbourhood,
    // so legitimate animation never masquerades as a hard cut.
    const cutFrames = []
    for (const [index, delta] of deltas.entries()) {
      if (index < 2 || delta < config.cutThreshold) continue
      const window = deltas.slice(Math.max(0, index - 6), index).concat(deltas.slice(index + 1, index + 7)).sort((a, b) => a - b)
      const median = window.length ? window[Math.floor(window.length / 2)] : 0
      if (delta > 3 * median + 2 && index - (cutFrames.at(-1) ?? -9) > 3) cutFrames.push(index)
    }
    const cuts = cutFrames.length

    const audioStream = probe.streams.find(stream => stream.codec_type === 'audio')
    let audio = null
    if (audioStream) {
      const wav = join(directory, 'review.wav')
      await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', video, '-map', '0:a:0',
        '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], 'audio decode')
      const pcm = await readFile(wav)
      let peak = 0, clipped = 0
      for (let offset = 0; offset + 1 < pcm.length; offset += 2) {
        const value = pcm.readInt16LE(offset)
        const absolute = Math.abs(value)
        if (absolute > peak) peak = absolute
        if (absolute >= 32760) clipped++
      }
      audio = { peakDbfs: peak ? Math.round(20 * Math.log10(peak / 32768) * 10) / 10 : -Infinity,
        clippedSamples: clipped, codec: audioStream.codec_name, sampleRate: Number(audioStream.sample_rate) }
    }
    return { directory, probe, duration, videoStream, frozen, deltas, cuts, cutFrames, audio }
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

function overlap(a, b) {
  return Math.max(0, Math.min(a.start + a.duration, b.start + b.duration) - Math.max(a.start, b.start))
}

async function captionCheck(plan, audioSource, { ffmpeg, config }) {
  const captions = [...(plan.captions ?? [])].sort((a, b) => a.startFrame - b.startFrame)
  const fps = plan.frameRate ? plan.frameRate.numerator / plan.frameRate.denominator : 30
  if (captions.length < 2) return { checked: 0, driftMaxMs: 0, unverified: 0, alignment: plan.narration?.alignment ?? 'unverified' }
  const log = await run(ffmpeg, ['-hide_banner', '-nostdin', '-i', audioSource,
    '-af', 'silencedetect=n=-35dB:d=0.25', '-f', 'null', '-'], 'speech pause detection')
  const gaps = []
  let open
  for (const line of log.stderr.split('\n')) {
    const start = /silence_start: ([\d.]+)/.exec(line)
    const end = /silence_end: ([\d.]+)/.exec(line)
    if (start) open = Number(start[1])
    if (end && open !== undefined) { gaps.push({ start: open, end: Number(end[1]) }); open = undefined }
  }
  const drifts = []
  let unverified = 0
  for (const caption of captions.slice(1)) {
    const time = caption.startFrame / fps
    let best
    for (const gap of gaps) {
      const midpoint = (gap.start + gap.end) / 2
      if (Math.abs(time - midpoint) <= 2) {
        const drift = Math.abs(time - midpoint)
        if (best === undefined || drift < best) best = drift
      }
    }
    if (best === undefined) unverified++
    else drifts.push(best * 1000)
  }
  const driftMaxMs = drifts.length ? Math.round(Math.max(...drifts)) : 0
  const alignment = plan.narration?.alignment ?? 'unverified'
  return { checked: drifts.length, unverified, driftMaxMs, alignment }
}

export async function review(video, options = {}) {
  const flags = options.flags ?? new Map()
  const config = { ...defaults, ...(options.config ?? {}) }
  const ffmpeg = options.ffmpeg ?? process.env.FFMPEG_PATH ?? 'ffmpeg'
  const ffprobe = options.ffprobe ?? process.env.FFPROBE_PATH ?? 'ffprobe'
  const measured = await measure(video, { ffmpeg, ffprobe, config })
  const { duration, frozen, deltas, cuts, cutFrames, audio } = measured
  try {
  const allowed = (interval) => config.allowHolds.some(hold => overlap(interval, { start: hold[0], duration: Math.max(0, hold[1] - hold[0]) }) > 0)
  const intervals = frozen.map(item => ({ ...item, allowed: allowed(item) }))
  const counted = intervals.filter(item => !item.allowed)
  const frozenSeconds = counted.reduce((total, item) => total + item.duration, 0)
  const stillRatio = duration ? frozenSeconds / duration : 0
  const longestHold = counted.reduce((max, item) => Math.max(max, item.duration), 0)
  const longHolds = counted.filter(item => item.duration > 2)
  const minutes = duration / 60
  const cutsPerMinute = minutes ? cuts / minutes : 0

  const shotLengths = options.plan?.shots?.map(shot => shot.durationFrames / (options.plan.frameRate
    ? options.plan.frameRate.numerator / options.plan.frameRate.denominator : 30)) ?? []
  const sorted = [...shotLengths].sort((a, b) => a - b)
  const p75ShotSeconds = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))] : undefined

  const failures = []
  const warnings = []
  if (stillRatio > config.stillRatio) failures.push(`frozen ratio ${(stillRatio * 100).toFixed(1)}% exceeds ${(config.stillRatio * 100).toFixed(0)}%`)
  if (longestHold > config.maxHoldSeconds) failures.push(`longest hold ${longestHold.toFixed(2)}s exceeds ${config.maxHoldSeconds}s`)
  if (longHolds.length / minutes > config.maxLongHoldsPerMinute) {
    failures.push(`${longHolds.length} holds >2s (${(longHolds.length / minutes).toFixed(1)}/min) exceed ${config.maxLongHoldsPerMinute}/min`)
  }
  if (minutes && cutsPerMinute < config.minCutsPerMinute) failures.push(`cut rate ${cutsPerMinute.toFixed(1)}/min below ${config.minCutsPerMinute}/min`)
  if (minutes && cutsPerMinute > config.maxCutsPerMinute) warnings.push(`cut rate ${cutsPerMinute.toFixed(1)}/min above ${config.maxCutsPerMinute}/min`)
  if (config.maxShotP75Seconds !== undefined && p75ShotSeconds !== undefined && p75ShotSeconds > config.maxShotP75Seconds) {
    warnings.push(`p75 shot ${p75ShotSeconds.toFixed(2)}s exceeds ${config.maxShotP75Seconds}s`)
  }
  if (audio) {
    if (audio.clippedSamples > 0) failures.push(`${audio.clippedSamples} clipped audio samples`)
    if (audio.peakDbfs > -0.5) warnings.push('audio peaks near full scale (' + audio.peakDbfs + ' dBFS)')
  }

  let captions
  if (options.plan && flags.get('audio')) {
    captions = await captionCheck(options.plan, flags.get('audio'), { ffmpeg, config })
    if (captions.unverified > 0) failures.push(`${captions.unverified} caption boundaries have no measured speech pause`)
    if (captions.driftMaxMs > config.captionDriftMs) {
      failures.push(`caption drift ${captions.driftMaxMs}ms exceeds ${config.captionDriftMs}ms`)
    }
    if (config.requireMeasuredAlignment && captions.alignment !== 'measured') {
      failures.push(`caption alignment is "${captions.alignment}", not measured speech alignment`)
    }
    if (!captions.checked && captions.alignment !== 'measured') warnings.push('captions are unverified')
  }

  const report = {
    tool: 'shotweft-review-video', video: resolve(video), duration,
    video: { codec: measured.videoStream.codec_name, width: measured.videoStream.width, height: measured.videoStream.height,
      frameRate: measured.videoStream.r_frame_rate, frames: Number(measured.videoStream.nb_frames) || deltas.length + 1 },
    stillRatio: Math.round(stillRatio * 10000) / 10000,
    frozenSeconds: Math.round(frozenSeconds * 1000) / 1000,
    longestHold: Math.round(longestHold * 1000) / 1000,
    longHolds: longHolds.length, longHoldsPerMinute: Math.round((longHolds.length / minutes) * 10) / 10,
    cuts, cutFrames, cutsPerMinute: Math.round(cutsPerMinute * 10) / 10,
    ...(p75ShotSeconds !== undefined && { p75ShotSeconds: Math.round(p75ShotSeconds * 100) / 100 }),
    heldIntervals: intervals.map(item => ({ start: Math.round(item.start * 1000) / 1000,
      duration: Math.round(item.duration * 1000) / 1000, allowed: item.allowed })),
    audio, ...(captions && { captions }), config,
    failures, warnings, ok: failures.length === 0,
  }
  await rm(measured.directory, { recursive: true, force: true })
  return report
  } catch (error) {
    await rm(measured.directory, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

async function main() {
  try {
    const { video, flags } = args(process.argv.slice(2))
    const configPath = flags.get('config')
    const config = configPath ? JSON.parse(await readFile(configPath, 'utf8')) : {}
    const planPath = flags.get('plan')
    const plan = planPath ? JSON.parse(await readFile(planPath, 'utf8')) : undefined
    const report = await review(video, { flags, config, plan, ffmpeg: flags.get('ffmpeg'), ffprobe: flags.get('ffprobe') })
    const json = JSON.stringify(report) + '\n'
    const out = flags.get('json')
    if (out) await writeFile(out, json)
    process.stdout.write(json)
    process.exitCode = report.ok ? 0 : 1
  } catch (error) {
    process.stderr.write(JSON.stringify({ error: error.message }) + '\n')
    process.exitCode = 2
  }
}

if (process.argv[1] && isAbsolute(process.argv[1]) && process.argv[1].endsWith('review-video.mjs')) await main()