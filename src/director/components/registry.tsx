import type { VisualElement } from '../../core/director/plan'
import type { AnimationContext } from '../animation'
import { Bullets } from './Bullets'
import { ChapterCard } from './ChapterCard'
import { GeoMap } from './GeoMap'
import { PathShape } from './PathShape'
import { StatCard } from './StatCard'
import { TimelineScene } from './TimelineScene'
import { TitleCard } from './TitleCard'

export type ComponentElement = Extract<VisualElement, { kind: 'component' }>
export type ComponentName = ComponentElement['component']
export interface ComponentProps {
  element: ComponentElement
  ctx: AnimationContext
  width: number
  height: number
  accent: string
}

/** The typed registry referenced by DirectorPlan `component` values. */
export const componentRegistry = {
  title: TitleCard, chapter: ChapterCard, stat: StatCard, bullets: Bullets,
  timeline: TimelineScene, path: PathShape, map: GeoMap,
} satisfies Record<ComponentName, (props: ComponentProps) => React.ReactNode>

export const componentNames = Object.keys(componentRegistry) as ComponentName[]
