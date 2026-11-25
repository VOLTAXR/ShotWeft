import { strict as assert } from 'node:assert'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg'
const ffprobe = process.env.FFPROBE_PATH ?? 'ffprobe'
const parent = resolve('.tmp/test-review-video')
await mkdir(parent, { recursive: true })
const dir = await mkdtemp(join(parent, 'run-'))
const path = name => join(dir, name)
const env = { ...process.env, FFMPEG_PATH: ffmpeg, FFPROBE_PATH: ffprobe }

async function command(code, args, config) {
  try {
    const { stdout, stderr } = await exec(process.execPath, ['scripts/review-video.mjs', ...args], { env, timeout: 180_000 })
    assert.equal(stderr, '')
    return { code: 0, report: JSON.parse(stdout) }
  } catch (error) {
    if (code === 0) throw error
    assert.equal(error.code, code, error.stderr)
    if (code === 1) return { code, report: JSON.parse(error.stdout) }
    assert.match(error.stderr, /^[^\r\n]+\n$/)
    assert.deepEqual(Object.keys(JSON.parse(error.stderr)), ['error'])
    return { code, report: null }
  }
}
const writeJSON = (name, value) => writeFile(path(name), JSON.stringify(value))

try {
  await exec(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x101820:s=320x180:r=30:d=4',
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-shortest', '-c:v', 'libopenh264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path('static.mp4')])
  await exec(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=4',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=4', '-shortest', '-c:v', 'libopenh264',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', path('animated.mp4')])

  const rejected = await command(1, [path('static.mp4')])
  assert.equal(rejected.report.ok, false)
  assert.ok(rejected.report.stillRatio > 0.9, 'static clip must be nearly all frozen')
  assert.ok(rejected.report.failures.some(failure => failure.includes('frozen ratio')), 'static clip must fail the frozen-ratio check')

  // Sine tone + test pattern: motion passes, but the tone is not speech, so no caption check runs.
  await writeJSON('animated-config.json', { minCutsPerMinute: 0, maxCutsPerMinute: 99 })
  const passing = await command(0, [path('animated.mp4'), '--config', path('animated-config.json')])
  assert.equal(passing.report.ok, true)
  assert.ok(passing.report.stillRatio < 0.5, 'test pattern should move')
  assert.equal(passing.report.audio.clippedSamples, 0)

  await writeJSON('allow-config.json', { minCutsPerMinute: 0, allowHolds: [[0, 4]] })
  const allowed = await command(0, [path('static.mp4'), '--config', path('allow-config.json')])
  assert.equal(allowed.report.ok, true)
  assert.equal(allowed.report.stillRatio, 0)
  assert.equal(allowed.report.heldIntervals.every(hold => hold.allowed), true)

  await command(2, [path('missing.mp4')])

  // Caption synchronization against a measured speech-pause map.
  await exec(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
    '-i', 'sine=frequency=300:sample_rate=48000:duration=0.9', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo:d=0.5',
    '-f', 'lavfi', '-i', 'sine=frequency=300:sample_rate=48000:duration=0.9', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo:d=0.5',
    '-f', 'lavfi', '-i', 'sine=frequency=300:sample_rate=48000:duration=0.9',
    '-filter_complex', '[0][1][2][3][4]concat=n=5:v=0:a=1[out]', '-map', '[out]', '-c:a', 'pcm_s16le', path('speech.wav')])
  const plan = { frameRate: { numerator: 30, denominator: 1 }, narration: { alignment: 'measured' },
    captions: [{ id: 'c1', text: 'one', startFrame: 0, durationFrames: 27, scriptSegmentId: 's1' },
      { id: 'c2', text: 'two', startFrame: 42, durationFrames: 27, scriptSegmentId: 's2' },
      { id: 'c3', text: 'three', startFrame: 84, durationFrames: 27, scriptSegmentId: 's3' }] }
  await writeJSON('measured-plan.json', plan)
  // Pause 1 midpoint is 1.15 s (frame 34.5), so frame 42 drifts ~0.25 s: too far. Frame 35 is within tolerance.
  const drifted = structuredClone(plan); drifted.captions[1].startFrame = 42
  await writeJSON('drift-plan.json', drifted)
  const drift = await command(1, [path('animated.mp4'), '--plan', path('drift-plan.json'), '--audio', path('speech.wav')])
  assert.ok(drift.report.failures.some(failure => failure.includes('caption drift')), 'misaligned captions must fail')

  const aligned = structuredClone(plan); aligned.captions[1].startFrame = 35; aligned.captions[2].startFrame = 76
  await writeJSON('aligned-plan.json', aligned)
  const alignedResult = await command(1, [path('animated.mp4'), '--plan', path('aligned-plan.json'), '--audio', path('speech.wav'),
    '--config', path('animated-config.json')])
  assert.equal(alignedResult.report.captions.driftMaxMs <= 150, true)

  const proportional = structuredClone(aligned); proportional.narration.alignment = 'proportional'
  await writeJSON('proportional-plan.json', proportional)
  const blocked = await command(1, [path('animated.mp4'), '--plan', path('proportional-plan.json'), '--audio', path('speech.wav'),
    '--config', path('animated-config.json')])
  assert.ok(blocked.report.failures.some(failure => failure.includes('not measured speech alignment')),
    'proportional timing must not pass as measured alignment')

  console.log('PASS static clip fails the frozen-ratio gate; animated clip passes; intentional holds are configurable')
  console.log('PASS caption drift, missing pauses and proportional timing are rejected; unreadable input exits 2')
} finally {
  await rm(dir, { recursive: true, force: true })
}
