import { copyFile, mkdir, mkdtemp, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { compileDirectorPlanForRender, validateDirectorMediaRanges, type DirectorMediaSource } from '../core/director/compiler'
import { referencedDirectorAssetIds, type DirectorAsset } from '../core/director/plan'
import { frameToSeconds } from '../video-model'
import { readDirectorPlan } from './director'
import { encodeTimeout, inputOptions, openFFmpeg, openFFprobe, probeFile, verifyMP4, type FFmpeg, type FFprobe } from './ffmpeg'
import { writeOutputFile } from './project-file'
import type { RenderAdapter } from './render-adapters'

export interface RemotionRenderRequest { source: string; output: string; browser?: string; ffmpeg?: string; ffprobe?: string }

const formats: Readonly<Record<string, { kind: DirectorAsset['kind']; demuxer: string }>> = {
  '.wav': { kind: 'audio', demuxer: 'wav' }, '.mp3': { kind: 'audio', demuxer: 'mp3' }, '.m4a': { kind: 'audio', demuxer: 'mov' },
  '.png': { kind: 'image', demuxer: 'png_pipe' }, '.jpg': { kind: 'image', demuxer: 'jpeg_pipe' }, '.webp': { kind: 'image', demuxer: 'webp_pipe' },
  '.mp4': { kind: 'video', demuxer: 'mov' }, '.webm': { kind: 'video', demuxer: 'matroska' },
}

function requirePath(asset: DirectorAsset) {
  if (!asset.path) throw new Error('Project-asset source-checkout rendering is not yet supported for ' + asset.id +
    '. Export the media beside the plan JSON and set a relative path on the plan asset.')
  return asset.path
}

async function prepareMedia(asset: DirectorAsset, index: number, directory: string, publicDir: string, fps: number,
  ffmpeg: FFmpeg, ffprobe: FFprobe): Promise<DirectorMediaSource & { path: string; filename: string; demuxer: string }> {
  const source = requirePath(asset)
  const extension = extname(source), format = formats[extension]
  if (!format || format.kind !== asset.kind) throw new Error('Asset extension does not match media kind: ' + asset.id)
  const local = await realpath(resolve(directory, source)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') throw new Error('Missing local media for asset ' + asset.id + ': ' + source)
    throw error
  })
  const rel = relative(directory, local)
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep)) throw new Error('Asset symlink escapes the plan directory.')
  const limitMiB = asset.kind === 'audio' ? 60 : 120
  const checkFile = async (path: string) => {
    const info = await stat(path)
    if (!info.isFile() || !info.size || info.size > limitMiB * 1024 * 1024) {
      throw new Error('Asset ' + asset.id + ' must be a nonempty regular file up to ' + limitMiB + ' MiB.')
    }
  }
  await checkFile(local)
  const filename = 'asset-' + index + extension
  const path = join(publicDir, filename)
  await copyFile(local, path)
  await checkFile(path)
  const { demuxer } = format
  const { streams, format: container } = await probeFile(ffprobe, path, demuxer)
  const kind = asset.kind === 'audio' ? 'audio' : 'video'
  const matching = streams.filter(stream => stream.codec_type === kind && !stream.disposition?.attached_pic)
  const stream = matching[0]
  if (matching.length !== 1 || !stream.codec_name || (asset.kind !== 'video' && streams.length !== 1) ||
      (kind === 'video' && (!stream.width || !stream.height))) {
    throw new Error('Expected local ' + asset.kind + ' media matching the extension for asset ' + asset.id + '.')
  }
  await ffmpeg.requireCapability('decoders', [stream.codec_name])
  if (asset.kind === 'image') return { kind: asset.kind, path, filename, demuxer }
  const tagged = stream.tags?.DURATION?.match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/)
  const taggedSeconds = tagged && Number(tagged[1]) * 3600 + Number(tagged[2]) * 60 + Number(tagged[3])
  const duration = Number(stream.duration ?? taggedSeconds ?? (streams.length === 1 ? container.duration : undefined))
  const durationFrames = Math.floor((duration + 0.0000005) * fps)
  if (!Number.isSafeInteger(durationFrames) || durationFrames < 1) throw new Error('Cannot measure media duration for asset ' + asset.id + '.')
  return { kind: asset.kind, path, filename, demuxer, durationFrames }
}

export class RemotionRenderAdapter implements RenderAdapter<RemotionRenderRequest> {
  readonly engine = 'remotion-frames-lgpl-ffmpeg'
  async render({ source, output, browser, ffmpeg: ffmpegPath, ffprobe: ffprobePath }: RemotionRenderRequest) {
    const planPath = resolve(source)
    const compiled = compileDirectorPlanForRender(await readDirectorPlan(planPath))
    const { plan, width, height } = compiled
    const referenced = referencedDirectorAssetIds(plan)
    const renderAssets = plan.assets.filter(asset => referenced.has(asset.id))
    for (const asset of renderAssets) requirePath(asset)
    const profile = { width, height, fps: plan.frameRate, durationFrames: plan.durationFrames,
      durationSeconds: frameToSeconds(plan.durationFrames, plan.frameRate) }
    let evidence!: Awaited<ReturnType<typeof verifyMP4>>
    const path = await writeOutputFile(output, async staged => {
      // Local checkout only: renderer dependencies are development dependencies, never added to the CLI tarball.
      const root = process.cwd()
      await stat(resolve(root, 'remotion/index.ts')).catch(() => { throw new Error('Remotion requires a source checkout. Run from the repository root after npm ci.') })
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
        const sources = new Map<string, Awaited<ReturnType<typeof prepareMedia>>>()
        for (const [index, asset] of renderAssets.entries()) {
          sources.set(asset.id, await prepareMedia(asset, index, planDirectory, publicDir, compiled.fps, ffmpeg, ffprobe))
        }
        validateDirectorMediaRanges(plan, sources)
        // Dynamic imports keep V1.x installed CLI independent of local-only Remotion development tools.
        const [{ bundle }, { renderFrames, selectComposition }, { chromium }] = await Promise.all([
          import('@remotion/bundler'), import('@remotion/renderer'), import('playwright'),
        ])
        const browserExecutable = browser ?? process.env.SHOTWEFT_BROWSER ?? chromium.executablePath()
        if (!(await stat(browserExecutable).catch(() => null))?.isFile()) throw new Error('Existing Chromium not found. Set SHOTWEFT_BROWSER or use --browser; no browser is downloaded.')
        const serveUrl = await bundle({ entryPoint: resolve(root, 'remotion/index.ts'), outDir: join(temporary, 'bundle'),
          publicDir, enableCaching: false, onProgress: () => {}, gitSource: null })
        const inputProps = { plan, localMedia: Object.fromEntries([...sources].map(([id, source]) => [id, source.filename])) }
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
