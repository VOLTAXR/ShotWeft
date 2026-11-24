import { useMemo } from 'react'
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion'
import { compileDirectorPlanForRender } from '../core/director/compiler'
import { directorAssetPath, referencedDirectorAssetIds, type DirectorPlan } from '../core/director/plan'
import { Element } from './Element'
import { MediaLayer } from './MediaLayer'
import { sharedElementsAtFrame } from './morph'
import { TitleScene } from './scenes/TitleScene'
import { ChartScene } from './scenes/ChartScene'
import { QuoteScene } from './scenes/QuoteScene'

export type DirectorProps = {
  plan: DirectorPlan
  mediaSources?: Record<string, string>
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
    else throw new Error('Missing media source for DirectorPlan asset ' + asset.id + '. Provide mediaSources or localMedia.')
  }
  return sources
}

export function DirectorComposition({ plan: input, mediaSources, localMedia, audioSources }: DirectorProps) {
  const { plan, width, height } = useMemo(() => compileDirectorPlanForRender(input), [input])
  const sources = useMemo(() => resolveDirectorMedia({ plan, mediaSources, localMedia, audioSources }), [plan, mediaSources, localMedia, audioSources])
  const frame = useCurrentFrame()
  return <AbsoluteFill data-director-frame={frame} style={{ background: plan.style.background, color: plan.style.foreground, fontFamily: plan.style.fontFamily }}>
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
          borderRadius={element.borderRadius} durationFrames={shot.durationFrames} /> :
          !element.sharedKey && <Element key={element.id} element={element} width={width} height={height} />)}
      </Sequence>
    })}
    {sharedElementsAtFrame(plan, frame).map(element => <Element key={element.sharedKey} element={element} width={width} height={height} />)}
    {plan.captions.filter(c => frame >= c.startFrame && frame < c.startFrame + c.durationFrames).map(c =>
      <div key={c.id} style={{ position: 'absolute', bottom: '5%', left: '8%', width: '84%', textAlign: 'center', fontSize: Math.min(width, height) * 0.04 }}>{c.text}</div>)}
    {plan.audio.map(audio => {
      return <Sequence key={audio.id} from={audio.startFrame} durationInFrames={audio.durationFrames} layout="none">
        <Audio src={sources.get(audio.assetId)!} trimBefore={audio.sourceInFrame} volume={audio.volume} />
      </Sequence>
    })}
  </AbsoluteFill>
}
