import { useMemo } from 'react'
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion'
import { compileDirectorPlanForRender, type DirectorMediaSource } from '../core/director/compiler'
import { directorAssetPath, referencedDirectorAssetIds, type DirectorPlan } from '../core/director/plan'
import type { Caption } from '../core/presenter/captions'
import { presenterSpans } from '../core/presenter/layout'
import { directorAudioTracks } from '../core/presenter/plan'
import { PresenterLayer, presenterStage } from './PresenterLayer'
import { Element } from './Element'
import { MediaLayer } from './MediaLayer'
import { sharedElementsAtFrame } from './morph'
import { plainCaption } from './animation'
import { TitleScene } from './scenes/TitleScene'
import { ChartScene } from './scenes/ChartScene'
import { QuoteScene } from './scenes/QuoteScene'

export type DirectorProps = {
  plan: DirectorPlan
  mediaSources?: Record<string, string>
  presenterSource?: DirectorMediaSource
  localMedia?: Record<string, string>
  /** Legacy bundle paths for M1 audio. */
  audioSources?: Record<string, string>
}
const scenes = { title: TitleScene, chart: ChartScene, quote: QuoteScene, graphic: null, image: null, video: null, split: null }
const demoScript = 'Three scenes. One plan.\nMake the evidence visible.\nKeep the idea in motion.'

export function resolveDirectorMedia({ plan, mediaSources, localMedia, audioSources }: DirectorProps) {
  const sources = new Map<string, string>()
  const referenced = referencedDirectorAssetIds(plan)
  const own = (record: Record<string, string> | undefined, id: string) => record && Object.hasOwn(record, id) ? record[id] : undefined
  for (const asset of plan.assets) {
    if (!referenced.has(asset.id)) continue
    const provided = own(mediaSources, asset.id)
    const local = own(localMedia, asset.id) ?? (asset.kind === 'audio' ? own(audioSources, asset.id) : undefined)
    if (provided?.trim()) sources.set(asset.id, provided)
    else if (local !== undefined) sources.set(asset.id, staticFile(directorAssetPath.parse(local)))
    // The M1 Player's existing bundled demo has a single built-in source.
    else if (plan.originalScript === demoScript && asset.id === 'tone' && asset.path === 'synthetic-tones.wav' && !asset.projectAssetId) {
      sources.set(asset.id, staticFile('director/synthetic-tones.wav'))
    }
    else if (asset.id === plan.presenter?.assetId) throw new Error('Missing presenter media source for asset ' + asset.id + '.')
    else throw new Error('Missing media source for DirectorPlan asset ' + asset.id + '. Provide mediaSources or localMedia.')
  }
  return sources
}

export function resolvedPresenterMetadata(plan: DirectorPlan, source?: DirectorMediaSource) {
  return plan.presenter && source ? new Map([[plan.presenter.assetId, source]]) : undefined
}

function CaptionLayer({ caption, width, height }: { caption: Caption; width: number; height: number }) {
  const { style, keywords, safeArea, charStart } = caption
  const aligned = charStart !== undefined
  const area = safeArea ?? { left: 0.08, right: 0.08, bottom: 0.05, top: 0.05 }
  const fontSize = style?.fontSize ?? Math.min(width, height) * 0.04
  const text = aligned ? caption.text : plainCaption(caption.text)
  let content: React.ReactNode = text
  if (aligned && keywords?.length) {
    const chars = Array.from(text)
    let cursor = 0
    content = [...keywords.map(keyword => {
      const start = keyword.charStart - charStart, end = keyword.charEnd - charStart
      const prefix = chars.slice(cursor, start).join('')
      cursor = end
      return <span key={start}>{prefix}<span style={{ color: style?.keywordColor ?? '#9dc9ff' }}>{chars.slice(start, end).join('')}</span></span>
    }), chars.slice(cursor).join('')]
  }
  return <div data-director-caption={caption.id} style={{ position: 'absolute', bottom: `${area.bottom * 100}%`,
    left: `${area.left * 100}%`, right: `${area.right * 100}%`, maxHeight: `${(1 - area.top - area.bottom) * 100}%`, overflow: 'hidden',
    textAlign: 'center', fontSize, color: style?.color ?? (aligned ? '#ffffff' : undefined) }}>
    <span style={{ background: style?.background ?? (aligned ? '#17243d' : undefined),
      ...(aligned && { padding: '0.12em 0.45em', borderRadius: '0.25em', boxDecorationBreak: 'clone', whiteSpace: 'pre-wrap' }) }}>
      {content}
    </span>
  </div>
}

export function DirectorComposition({ plan: input, mediaSources, localMedia, audioSources, presenterSource }: DirectorProps) {
  const sources = useMemo(() => resolveDirectorMedia({ plan: input, mediaSources, localMedia, audioSources }),
    [input, mediaSources, localMedia, audioSources])
  const { plan, width, height } = useMemo(() => compileDirectorPlanForRender(input, resolvedPresenterMetadata(input, presenterSource)),
    [input, presenterSource])
  const layouts = useMemo(() => presenterSpans(plan), [plan])
  const tracks = useMemo(() => directorAudioTracks(plan), [plan])
  const frame = useCurrentFrame()
  const layout = layouts.find(span => frame >= span.startFrame && frame < span.startFrame + span.durationFrames)?.layout ?? 'none'
  return <AbsoluteFill data-director-frame={frame} data-presenter-layout={plan.presenter ? layout : undefined}
    style={{ background: plan.style.background, color: plan.style.foreground, fontFamily: plan.style.fontFamily }}>
    {layout !== 'full' && <AbsoluteFill style={presenterStage(layout, width, height)}>
      {plan.shots.map(shot => {
        const Scene = scenes[shot.sceneType]
        return <Sequence key={shot.id} name={shot.id} from={shot.startFrame} durationInFrames={shot.durationFrames}>
          {shot.mediaLayers?.map(layer => <Sequence key={layer.id} from={layer.startFrame - shot.startFrame}
            durationInFrames={layer.durationFrames} layout="none">
            <MediaLayer {...layer} src={sources.get(layer.assetId)!} />
          </Sequence>)}
          {Scene && <Scene accent={plan.style.accent} />}
          {shot.visualElements.map(element => 'assetId' in element ? <MediaLayer key={element.id} kind={element.kind}
            src={sources.get(element.assetId)!} region={element} fit={element.fit} opacity={element.opacity}
            borderRadius={element.borderRadius} durationFrames={shot.durationFrames}
            animation={element.animation} camera={element.kind === 'image' ? element.camera : undefined} /> :
            !element.sharedKey && <Element key={element.id} element={element} width={width} height={height}
              accent={plan.style.accent} durationFrames={shot.durationFrames} />)}
        </Sequence>
      })}
      {sharedElementsAtFrame(plan, frame).map(element => {
        const owner = plan.shots.find(shot => frame >= shot.startFrame && frame < shot.startFrame + shot.durationFrames)
        return <Element key={element.sharedKey} element={element} width={width} height={height} accent={plan.style.accent}
          durationFrames={owner?.durationFrames ?? plan.durationFrames} frameOverride={frame - (owner?.startFrame ?? 0)} />
      })}
    </AbsoluteFill>}
    {plan.presenter && <PresenterLayer layout={layout} src={sources.get(plan.presenter.assetId)!} sourceInFrame={plan.presenter.sourceInFrame ?? 0} />}
    {plan.captions.filter(c => frame >= c.startFrame && frame < c.startFrame + c.durationFrames).map(c =>
      <CaptionLayer key={c.id} caption={c} width={width} height={height} />)}
    {tracks.map((audio, index) => <Sequence key={audio.id + '-' + index} from={audio.startFrame} durationInFrames={audio.durationFrames} layout="none">
      <Audio src={sources.get(audio.assetId)!} trimBefore={audio.sourceInFrame} volume={audio.volume} />
    </Sequence>)}
  </AbsoluteFill>
}
