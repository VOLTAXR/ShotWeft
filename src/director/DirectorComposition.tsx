import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion'
import { compileDirectorPlan } from '../core/director/compiler'
import type { DirectorPlan } from '../core/director/plan'
import { Element } from './Element'
import { sharedElementsAtFrame } from './morph'
import { TitleScene } from './scenes/TitleScene'
import { ChartScene } from './scenes/ChartScene'
import { QuoteScene } from './scenes/QuoteScene'

export type DirectorProps = { plan: DirectorPlan; audioSources?: Record<string, string> }
const scenes = { title: TitleScene, chart: ChartScene, quote: QuoteScene }

export function DirectorComposition({ plan: input, audioSources = {} }: DirectorProps) {
  const { plan, width, height } = compileDirectorPlan(input)
  const frame = useCurrentFrame()
  return <AbsoluteFill data-director-frame={frame} style={{ background: plan.style.background, color: plan.style.foreground, fontFamily: plan.style.fontFamily }}>
    {plan.shots.map(shot => {
      const Scene = scenes[shot.sceneType]
      return <Sequence key={shot.id} name={shot.id} from={shot.startFrame} durationInFrames={shot.durationFrames}>
        <Scene accent={plan.style.accent} />
        {shot.visualElements.filter(e => !e.sharedKey).map(element => <Element key={element.id} element={element} width={width} height={height} />)}
      </Sequence>
    })}
    {sharedElementsAtFrame(plan, frame).map(element => <Element key={element.sharedKey} element={element} width={width} height={height} />)}
    {plan.captions.filter(c => frame >= c.startFrame && frame < c.startFrame + c.durationFrames).map(c =>
      <div key={c.id} style={{ position: 'absolute', bottom: '5%', left: '8%', width: '84%', textAlign: 'center', fontSize: Math.min(width, height) * 0.04 }}>{c.text}</div>)}
    {plan.audio.map(audio => {
      const asset = plan.assets.find(a => a.id === audio.assetId)!
      return <Sequence key={audio.id} from={audio.startFrame} durationInFrames={audio.durationFrames} layout="none">
        <Audio src={staticFile(audioSources[asset.id] ?? 'director/' + asset.path)} startFrom={audio.sourceInFrame} volume={audio.volume} />
      </Sequence>
    })}
  </AbsoluteFill>
}
