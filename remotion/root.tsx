import { Composition } from 'remotion'
import demo from '../public/director/demo-plan.json'
import { compileDirectorPlan, compileDirectorPlanForRender } from '../src/core/director/compiler'
import { DirectorComposition, resolvedPresenterMetadata } from '../src/director/DirectorComposition'
const defaults = compileDirectorPlan(demo)
export function DirectorRoot() {
  return <Composition id={defaults.id} component={DirectorComposition} width={defaults.width} height={defaults.height}
    fps={defaults.fps} durationInFrames={defaults.durationInFrames} defaultProps={{ plan: defaults.plan }}
    calculateMetadata={({ props }) => {
      const c = compileDirectorPlanForRender(props.plan, resolvedPresenterMetadata(props.plan, props.presenterSource))
      return { width: c.width, height: c.height, fps: c.fps, durationInFrames: c.durationInFrames }
    }} />
}
