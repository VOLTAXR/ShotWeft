import { copyFile, mkdir, mkdtemp, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { compileDirectorPlanForRender, validateDirectorMediaRanges, type DirectorMediaSource } from '../core/director/compiler'
import { referencedDirectorAssetIds, type DirectorAsset, type DirectorPlan } from '../core/director/plan'
import { frameToSeconds } from '../video-model'
import { buildAudioGraph } from './director-audio'
import { readDirectorPlan } from './director'
import { encodeTimeout, inputOptions, measuredStreamSeconds, openFFmpeg, openFFprobe, probeFile, verifyMP4, type FFmpeg, type FFprobe, type ProbeStream } from './ffmpeg'
import { writeOutputFile } from './project-file'
import type { RenderAdapter } from './render-adapters'

export interface RemotionRenderRequest { source: string; output: string; browser?: string; ffmpeg?: string; ffprobe?: string }

type RenderOptions = Omit<RemotionRenderRequest, 'source'>

const formats: Readonly<Record<string, { kind: DirectorAsset['kind']; demuxer: string }>> = {
  '.wav': { kind: 'audio', demuxer: 'wav' }, '.mp3': { kind: 'audio', demuxer: 'mp3' }, '.m4a': { kind: 'audio', demuxer: 'mov' },
  '.png': { kind: 'image', demuxer: 'png_pipe' }, '.jpg': { kind: 'image', demuxer: 'jpeg_pipe' }, '.webp': { kind: 'image', demuxer: 'webp_pipe' },
  '.mov': { kind: 'video', demuxer: 'mov' }, '.mp4': { kind: 'video', demuxer: 'mov' }, '.webm': { kind: 'video', demuxer: 'matroska' },
}

function requirePath(asset: DirectorAsset) {
  if (!asset.path) throw new Error('Project-asset source-checkout rendering is not yet supported for ' + asset.id +
    '. Export the media beside the plan JSON and set a relative path on the plan asset.')
  return asset.path
}

export async function prepareMedia(asset: DirectorAsset, index: number, directory: string, publicDir: string | undefined, fps: number,
  ffmpeg: FFmpeg | undefined, ffprobe: FFprobe, embeddedAudio = false): Promise<DirectorMediaSource & { path: string; filename: string; demuxer: string }> {
  const source = requirePath(asset)
  const local = await realpath(resolve(directory, source)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') throw new Error('Missing local media for asset ' + asset.id + ': ' + source)
    throw error
  })
  const rel = relative(directory, local)
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep)) throw new Error('Asset symlink escapes the plan directory.')
  return prepareLocalMedia(asset, index, local, extname(source), publicDir, fps, ffmpeg, ffprobe, embeddedAudio)
}

async function prepareLocalMedia(asset: DirectorAsset, index: number, local: string, extension: string,
  publicDir: string | undefined, fps: number, ffmpeg: FFmpeg | undefined, ffprobe: FFprobe, embeddedAudio: boolean) {
  const format = formats[extension]
  if (!format || format.kind !== asset.kind) throw new Error('Asset extension does not match media kind: ' + asset.id)
  const limitMiB = asset.kind === 'audio' ? 60 : 120
  const checkFile = async (path: string) => {
    const info = await stat(path)
    if (!info.isFile() || !info.size || info.size > limitMiB * 1024 * 1024) {
      throw new Error('Asset ' + asset.id + ' must be a nonempty regular file up to ' + limitMiB + ' MiB.')
    }
  }
  await checkFile(local)
  const filename = 'asset-' + index + extension
  const path = publicDir ? join(publicDir, filename) : local
  if (publicDir) {
    await copyFile(local, path)
    await checkFile(path)
  }
  const { demuxer } = format
  const { streams, format: container } = await probeFile(ffprobe, path, demuxer)
  const kind = asset.kind === 'audio' ? 'audio' : 'video'
  const matching = streams.filter(stream => stream.codec_type === kind && !stream.disposition?.attached_pic)
  const stream = matching[0]
  if (matching.length !== 1 || !stream.codec_name || (asset.kind !== 'video' && streams.length !== 1) ||
      (kind === 'video' && (!stream.width || !stream.height))) {
    throw new Error('Expected local ' + asset.kind + ' media matching the extension for asset ' + asset.id + '.')
  }
  await ffmpeg?.requireCapability('decoders', [stream.codec_name])
  if (asset.kind === 'image') return { kind: asset.kind, path, filename, demuxer }
  const frames = (stream: ProbeStream) => {
    const duration = measuredStreamSeconds(stream, streams.length === 1 ? container.duration : undefined)
    const result = Math.floor((duration + 0.0000005) * fps)
    if (!Number.isSafeInteger(result) || result < 1) throw new Error('Cannot measure ' + stream.codec_type + ' duration for asset ' + asset.id + '.')
    return result
  }
  let audioDurationFrames: number | undefined
  if (embeddedAudio) {
    const streamsWithAudio = streams.filter(stream => stream.codec_type === 'audio')
    const audio = streamsWithAudio[0]
    if (streamsWithAudio.length !== 1 || !audio.codec_name || !audio.channels) {
      throw new Error('Presenter embedded audio requires exactly one playable audio stream: ' + asset.id + '.')
    }
    await ffmpeg?.requireCapability('decoders', [audio.codec_name])
    audioDurationFrames = frames(audio)
  }
  return { kind: asset.kind, path, filename, demuxer, durationFrames: frames(stream), audioDurationFrames }
}

export class RemotionRenderAdapter implements RenderAdapter<RemotionRenderRequest> {
  readonly engine = 'remotion-frames-lgpl-ffmpeg'
  async render({ source, ...options }: RemotionRenderRequest) {
    const planPath = resolve(source)
    const plan = await readDirectorPlan(planPath)
    const referenced = referencedDirectorAssetIds(plan)
    for (const asset of plan.assets) if (referenced.has(asset.id)) requirePath(asset)
    const directory = await realpath(dirname(planPath))
    return { ...await this.renderPlan(plan, options, (asset, index, publicDir, fps, ffmpeg, ffprobe, embeddedAudio) =>
      prepareMedia(asset, index, directory, publicDir, fps, ffmpeg, ffprobe, embeddedAudio)), planPath }
  }

  /** The resolver must return a file extracted by withProject(), never a plan-provided path. */
  renderExtracted(plan: DirectorPlan, options: RenderOptions, resolveAsset: (asset: DirectorAsset) => { path: string; extension: string }) {
    return this.renderPlan(plan, options, (asset, index, publicDir, fps, ffmpeg, ffprobe, embeddedAudio) => {
      const { path, extension } = resolveAsset(asset)
      return prepareLocalMedia(asset, index, path, extension, publicDir, fps, ffmpeg, ffprobe, embeddedAudio)
    })
  }

  private async renderPlan(plan: DirectorPlan, { output, browser, ffmpeg: ffmpegPath, ffprobe: ffprobePath }: RenderOptions,
    prepare: (asset: DirectorAsset, index: number, publicDir: string, fps: number, ffmpeg: FFmpeg, ffprobe: FFprobe,
      embeddedAudio: boolean) => ReturnType<typeof prepareMedia>) {
    const { width, height } = plan.resolution
    const fps = plan.frameRate.numerator / plan.frameRate.denominator
    let compositionId: string
    const referenced = referencedDirectorAssetIds(plan)
    const renderAssets = plan.assets.filter(asset => referenced.has(asset.id))
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
        const sources = new Map<string, Awaited<ReturnType<typeof prepareMedia>>>()
        for (const [index, asset] of renderAssets.entries()) {
          sources.set(asset.id, await prepare(asset, index, publicDir, fps, ffmpeg, ffprobe,
            plan.presenter?.assetId === asset.id && plan.presenter.audio === 'embedded'))
        }
        const compiled = compileDirectorPlanForRender(plan, sources)
        compositionId = compiled.id
        validateDirectorMediaRanges(plan, sources)
        // Dynamic imports keep V1.x installed CLI independent of local-only Remotion development tools.
        const [{ bundle }, { renderFrames, selectComposition }, { chromium }] = await Promise.all([
          import('@remotion/bundler'), import('@remotion/renderer'), import('playwright'),
        ])
        const browserExecutable = browser ?? process.env.SHOTWEFT_BROWSER ?? chromium.executablePath()
        if (!(await stat(browserExecutable).catch(() => null))?.isFile()) throw new Error('Existing Chromium not found. Set SHOTWEFT_BROWSER or use --browser; no browser is downloaded.')
        const serveUrl = await bundle({ entryPoint: resolve(root, 'remotion/index.ts'), outDir: join(temporary, 'bundle'),
          publicDir, enableCaching: false, onProgress: () => {}, gitSource: null })
        const source = plan.presenter && sources.get(plan.presenter.assetId)
        const presenterSource = source ? { kind: source.kind, durationFrames: source.durationFrames, audioDurationFrames: source.audioDurationFrames } : undefined
        const inputProps = { plan, presenterSource, localMedia: Object.fromEntries([...sources].map(([id, source]) => [id, source.filename])) }
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
        const { tracks, filters } = buildAudioGraph(plan)
        const graphPath = join(temporary, 'audio.txt')
        await writeFile(graphPath, filters.join(';\n'))
        await ffmpeg.requireCapability('demuxers', ['image2'])
        await ffmpeg.requireCapability('decoders', ['png'])
        await ffmpeg.invoke(['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-xerror', '-filter_complex_threads', '2',
          '-f', 'image2', '-framerate', clock, '-start_number', '0', '-i', join(framesDir, 'element-%0' + digits + 'd.png'),
          ...tracks.flatMap(audio => { const s = sources.get(audio.assetId)!; return [...inputOptions(s.demuxer), '-i', s.path] }),
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
    return { path, engine: this.engine, composition: compositionId!, reviewStatus: plan.reviewStatus, video: { ...evidence, path } }
  }
}
