import { Player, type PlayerRef } from '@remotion/player'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { compileDirectorPlan, compileDirectorPlanForProject, compileDirectorPlanForRender, type DirectorMediaSource } from '../core/director/compiler'
import { referencedDirectorAssetIds, type DirectorPlan } from '../core/director/plan'
import { measuredMediaFrames } from '../media'
import type { Asset } from '../model'
import { Modal } from '../ui'
import { DirectorComposition, resolvedPresenterMetadata } from './DirectorComposition'

type PreviewSource = DirectorMediaSource & { src: string }
type PreviewProps = {
  plan?: DirectorPlan
  projectAssets?: readonly Asset[]
  /** Resolved sources keyed by project asset ID or, for unlinked media, by relative plan path. */
  mediaSources?: ReadonlyMap<string, PreviewSource>
  playerRef?: RefObject<PlayerRef | null>
  initialFrame?: number
}

const emptyAssets: readonly Asset[] = []

function useProjectURLs(assets: readonly Asset[], linkedIds: string) {
  const [resource, setResource] = useState<{ assets: readonly Asset[]; linkedIds: string; urls: Map<string, string> }>()
  useEffect(() => {
    if (!linkedIds) return
    const wanted = new Set(linkedIds.split('|'))
    const urls = new Map(assets.filter(asset => wanted.has(asset.id))
      .map(asset => [asset.id, URL.createObjectURL(asset.blob)]))
    setResource({ assets, linkedIds, urls })
    return () => { for (const url of urls.values()) URL.revokeObjectURL(url) }
  }, [assets, linkedIds])
  return resource?.assets === assets && resource.linkedIds === linkedIds ? resource.urls : undefined
}

function PreviewPlayer({ compiled, sources, presenterSource, playerRef, initialFrame = 0 }: {
  compiled: ReturnType<typeof compileDirectorPlanForRender>
  sources?: Record<string, string>
  presenterSource?: DirectorMediaSource
  playerRef?: PreviewProps['playerRef']
  initialFrame?: number
}) {
  const inputProps = useMemo(() => ({ plan: compiled.plan, mediaSources: sources, presenterSource }), [compiled.plan, sources, presenterSource])
  const host = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const player = host.current
    return () => player?.querySelectorAll<HTMLMediaElement>('audio, video').forEach(media => media.pause())
  }, [])

  return <div ref={host}>
    <Player ref={playerRef} component={DirectorComposition} inputProps={inputProps}
      durationInFrames={compiled.durationInFrames} fps={compiled.fps}
      compositionWidth={compiled.width} compositionHeight={compiled.height}
      initialFrame={initialFrame} controls style={{ width: '100%' }}
      errorFallback={({ error }) => <p className="director-preview-error" role="alert">{error.message}</p>} />
  </div>
}

function ProjectPreview({ plan, projectAssets = emptyAssets, mediaSources, playerRef, initialFrame }: PreviewProps & { plan: DirectorPlan }) {
  const linkedIds = useMemo(() => {
    const ids = referencedDirectorAssetIds(plan)
    return [...new Set(plan.assets.flatMap(asset => asset.projectAssetId && ids.has(asset.id) && !mediaSources?.has(asset.projectAssetId)
      ? [asset.projectAssetId] : []))].sort().join('|')
  }, [plan, mediaSources])
  const urls = useProjectURLs(projectAssets, linkedIds)
  const projectSources = useMemo(() => new Map(projectAssets.flatMap(asset => {
    const src = urls?.get(asset.id)
    return src ? [[asset.id, { src, kind: asset.kind, durationFrames: measuredMediaFrames(asset.duration, plan.frameRate) }] as const] : []
  })), [projectAssets, urls, plan.frameRate])

  const linkedPresenter = plan.assets.find(asset => asset.id === plan.presenter?.assetId)?.projectAssetId
  const audioBlob = linkedPresenter && plan.presenter?.audio === 'embedded' && !mediaSources?.has(linkedPresenter)
    ? projectAssets.find(asset => asset.id === linkedPresenter && asset.kind === 'video')?.blob : undefined
  const [audioProbe, setAudioProbe] = useState<{ blob: Blob; duration?: number }>()
  useEffect(() => {
    if (!audioBlob) return
    let canceled = false
    const probe = async () => {
      // A video element's metadata exposes video duration, but audio track metadata is browser-specific.
      const context = new OfflineAudioContext(1, 1, 8_000)
      return (await context.decodeAudioData(await audioBlob.arrayBuffer())).duration
    }
    void probe().then(
      duration => { if (!canceled) setAudioProbe({ blob: audioBlob, duration }) },
      () => { if (!canceled) setAudioProbe({ blob: audioBlob }) },
    )
    return () => { canceled = true }
  }, [audioBlob])

  const result = useMemo(() => {
    if ((linkedIds && !urls) || (audioBlob && audioProbe?.blob !== audioBlob)) return
    try {
      const sources = new Map(mediaSources)
      for (const [id, source] of projectSources) sources.set(id, id === linkedPresenter && audioBlob
        ? { ...source, audioDurationFrames: measuredMediaFrames(audioProbe?.duration, plan.frameRate) } : source)
      const compiled = compileDirectorPlanForProject(plan, { projectAssets: sources, localAssets: mediaSources })
      // Report unsupported render options before mounting the shared composition.
      const presenterSource = compiled.plan.presenter ? compiled.mediaSources.get(compiled.plan.presenter.assetId) : undefined
      compileDirectorPlanForRender(compiled.plan, resolvedPresenterMetadata(compiled.plan, presenterSource))
      const inputSources = Object.fromEntries(compiled.plan.assets.flatMap(asset => compiled.mediaSources.has(asset.id)
        ? [[asset.id, sources.get(asset.projectAssetId ?? asset.path!)!.src]] : []))
      for (const [id, src] of Object.entries(inputSources)) {
        if (!src.trim()) throw new Error('Missing media source for DirectorPlan asset ' + id + '.')
      }
      return { compiled, inputSources, presenterSource }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }, [plan, linkedIds, urls, mediaSources, projectSources, linkedPresenter, audioBlob, audioProbe])

  if (!result) return <p role="status">Loading project media…</p>
  if ('error' in result) return <p className="video-notice video-error" role="alert">{result.error}</p>
  return <PreviewPlayer compiled={result.compiled} sources={result.inputSources} presenterSource={result.presenterSource} playerRef={playerRef} initialFrame={initialFrame} />
}

function DemoPreview() {
  const [open, setOpen] = useState(false)
  const [compiled, setCompiled] = useState<ReturnType<typeof compileDirectorPlan>>()
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    const abort = new AbortController()
    setError('')
    void fetch('/director/demo-plan.json', { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error('Could not load the local demo plan.')
      const plan = compileDirectorPlan(await response.json())
      if (!abort.signal.aborted) setCompiled(plan)
    }).catch(failure => { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : String(failure)) })
    return () => abort.abort()
  }, [open])
  return <>
    <button className="button secondary" type="button" onClick={() => setOpen(true)}>Director demo (Remotion)</button>
    <Modal open={open} onClose={() => setOpen(false)} title="Director demo · Remotion Player"
      description="Local validation preview with three scenes and synthetic tones.">
      {open && (error ? <p role="alert">{error}</p> : compiled ? <PreviewPlayer compiled={compiled} />
        : <p role="status">Loading local plan…</p>)}
    </Modal>
  </>
}

export function DirectorPreview(props: PreviewProps = {}) {
  return props.plan ? <ProjectPreview {...props} plan={props.plan} /> : <DemoPreview />
}
