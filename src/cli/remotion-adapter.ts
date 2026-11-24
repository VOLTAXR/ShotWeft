import { copyFile, mkdir, mkdtemp, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { compileDirectorPlan } from '../core/director/compiler'
import { frameToSeconds } from '../video-model'
import { readDirectorPlan } from './director'
import { encodeTimeout, inputOptions, openFFmpeg, openFFprobe, probeFile, verifyMP4 } from './ffmpeg'
import { writeOutputFile } from './project-file'
import type { RenderAdapter } from './render-adapters'

export interface RemotionRenderRequest { source: string; output: string; browser?: string; ffmpeg?: string; ffprobe?: string }

export class RemotionRenderAdapter implements RenderAdapter<RemotionRenderRequest> {
  readonly engine = 'remotion-frames-lgpl-ffmpeg'
  async render({ source, output, browser, ffmpeg: ffmpegPath, ffprobe: ffprobePath }: RemotionRenderRequest) {
    const planPath = resolve(source)
    const compiled = compileDirectorPlan(await readDirectorPlan(planPath))
    const { plan, width, height } = compiled
    const profile = { width, height, fps: plan.frameRate, durationFrames: plan.durationFrames,
      durationSeconds: frameToSeconds(plan.durationFrames, plan.frameRate) }
    let evidence!: Awaited<ReturnType<typeof verifyMP4>>
    const path = await writeOutputFile(output, async staged => {
      // Local checkout only: renderer dependencies are development dependencies, never added to the CLI tarball.
      const root = process.cwd()
      await stat(resolve(root, 'remotion/index.ts')).catch(() => { throw new Error('Remotion M1 requires a source checkout. Run from the repository root after npm ci.') })
      const [ffmpeg, ffprobe] = await Promise.all([openFFmpeg(ffmpegPath), openFFprobe(ffprobePath)])
      const base = resolve(root, '.tmp')
      await mkdir(base, { recursive: true })
      const temporary = await mkdtemp(join(base, 'director-render-'))
      const previousTmp = process.env.TMPDIR
      process.env.TMPDIR = temporary
      try {
        const publicDir = join(temporary, 'public')
        await mkdir(publicDir)
        const planDirectory = await realpath(dirname(planPath))
        const sources = new Map<string, { path: string; demuxer: string }>()
        const audioSources: Record<string, string> = {}
        for (const audio of plan.audio) {
          if (sources.has(audio.assetId)) continue
          const asset = plan.assets.find(a => a.id === audio.assetId)!
          const local = await realpath(resolve(planDirectory, asset.path))
          const rel = relative(planDirectory, local)
          if (isAbsolute(rel) || rel.startsWith('..')) throw new Error('Asset symlink escapes the plan directory.')
          const info = await stat(local)
          if (!info.isFile() || info.size > 60 * 1024 * 1024) throw new Error('Audio asset must be a regular file up to 60 MiB.')
          const demuxer = { '.wav': 'wav', '.mp3': 'mp3', '.m4a': 'mov' }[extname(asset.path)]!
          const copy = join(publicDir, asset.id + extname(asset.path))
          await copyFile(local, copy)
          const media = await probeFile(ffprobe, copy, demuxer)
          if (media.streams.length !== 1 || media.streams[0].codec_type !== 'audio') throw new Error('Expected one local audio stream.')
          await ffmpeg.requireCapability('decoders', [media.streams[0].codec_name!])
          sources.set(asset.id, { path: copy, demuxer })
          audioSources[asset.id] = asset.id + extname(asset.path)
        }
        // Probe every clip's source range, including later reuse of the same asset.
        for (const audio of plan.audio) {
          const src = sources.get(audio.assetId)!
          const media = await probeFile(ffprobe, src.path, src.demuxer)
          const duration = Number(media.streams[0].duration ?? media.format.duration)
          if (!Number.isFinite(duration) || frameToSeconds(audio.sourceInFrame + audio.durationFrames, plan.frameRate) > duration + 0.001) {
            throw new Error('Audio source range exceeds measured duration: ' + audio.id)
          }
        }
        // Dynamic imports keep V1.x installed CLI independent of local-only Remotion development tools.
        const [{ bundle }, { renderFrames, selectComposition }, { chromium }] = await Promise.all([
          import('@remotion/bundler'), import('@remotion/renderer'), import('playwright'),
        ])
        const browserExecutable = browser ?? process.env.SHOTWEFT_BROWSER ?? chromium.executablePath()
        if (!(await stat(browserExecutable).catch(() => null))?.isFile()) throw new Error('Existing Chromium not found. Set SHOTWEFT_BROWSER or use --browser; no browser is downloaded.')
        const serveUrl = await bundle({ entryPoint: resolve(root, 'remotion/index.ts'), outDir: join(temporary, 'bundle'),
          publicDir, enableCaching: false, onProgress: () => {}, gitSource: null })
        const inputProps = { plan, audioSources }
        const composition = await selectComposition({ serveUrl, id: compiled.id, inputProps, browserExecutable, logLevel: 'error' })
        if (composition.width !== width || composition.height !== height || composition.durationInFrames !== plan.durationFrames || composition.fps !== compiled.fps) {
          throw new Error('Composition metadata does not match DirectorPlan.')
        }
        const framesDir = join(temporary, 'frames')
        await renderFrames({ composition, serveUrl, inputProps, browserExecutable, outputDir: framesDir, imageFormat: 'png',
          concurrency: 2, logLevel: 'error', onStart: () => {}, onFrameUpdate: () => {}, muted: true })
        const images = (await readdir(framesDir)).filter(n => /^element-\d+\.png$/.test(n)).sort()
        if (images.length !== plan.durationFrames) throw new Error('Remotion frame count does not match plan.')
        const digits = images[0].match(/\d+/)![0].length
        const clock = plan.frameRate.numerator + '/' + plan.frameRate.denominator
        const graph = ['anullsrc=r=48000:cl=stereo,atrim=duration=' + profile.durationSeconds + '[bed]']
        const labels = ['[bed]']
        const sampleAt = (frame: number) => Math.round(frame * 48000 * plan.frameRate.denominator / plan.frameRate.numerator)
        plan.audio.forEach((audio, i) => {
          const start = sampleAt(audio.startFrame), duration = sampleAt(audio.startFrame + audio.durationFrames) - start
          graph.push('[' + (i + 1) + ':a:0]aresample=48000,aformat=channel_layouts=stereo,atrim=start_sample=' + sampleAt(audio.sourceInFrame) +
            ':end_sample=' + sampleAt(audio.sourceInFrame + audio.durationFrames) + ',asetpts=PTS-STARTPTS,apad=whole_len=' + duration +
            ',atrim=end_sample=' + duration + ',volume=' + audio.volume + ',adelay=' + start + 'S:all=1[a' + i + ']')
          labels.push('[a' + i + ']')
        })
        graph.push(labels.join('') + 'amix=inputs=' + labels.length + ':duration=first:normalize=0,alimiter=limit=0.95:level=0:latency=1[sound]')
        const graphPath = join(temporary, 'audio.txt')
        await writeFile(graphPath, graph.join(';\n'))
        await ffmpeg.requireCapability('demuxers', ['image2'])
        await ffmpeg.requireCapability('decoders', ['png'])
        await ffmpeg.invoke(['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-xerror', '-filter_complex_threads', '2',
          '-f', 'image2', '-framerate', clock, '-start_number', '0', '-i', join(framesDir, 'element-%0' + digits + 'd.png'),
          ...plan.audio.flatMap(audio => { const s = sources.get(audio.assetId)!; return [...inputOptions(s.demuxer), '-i', s.path] }),
          '-filter_complex_script', graphPath, '-map', '0:v:0', '-map', '[sound]', '-frames:v', String(plan.durationFrames),
          '-c:v', 'libopenh264', '-pix_fmt', 'yuv420p', '-r', clock, '-fps_mode', 'cfr', '-video_track_timescale', String(plan.frameRate.numerator),
          '-c:a', 'aac', '-profile:a', 'aac_low', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-f', 'mp4', staged],
          'Remotion frame encode', { timeout: encodeTimeout })
        evidence = await verifyMP4(ffprobe, staged, profile)
      } finally {
        if (previousTmp === undefined) delete process.env.TMPDIR
        else process.env.TMPDIR = previousTmp
        await rm(temporary, { recursive: true, force: true, maxRetries: 3 })
      }
    })
    return { path, planPath, engine: this.engine, composition: compiled.id, reviewStatus: plan.reviewStatus, video: { ...evidence, path } }
  }
}
