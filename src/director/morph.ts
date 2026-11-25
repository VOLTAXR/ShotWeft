import { interpolate, interpolateColors } from 'remotion'
import { interpolatePath } from './flubber'
import type { DirectorPlan, VisualElement } from '../core/director/plan'

export type GraphicElement = Exclude<VisualElement, { assetId: string }>

const pathCache = new Map<string, ((progress: number) => string) | null>()

/** Flubber interpolation for supported SVG paths; null when shapes are incompatible. */
function pathInterpolator(from: string, to: string) {
  const key = from + '\u0000' + to
  if (!pathCache.has(key)) {
    try {
      pathCache.set(key, interpolatePath(from, to))
    } catch {
      pathCache.set(key, null)
    }
  }
  return pathCache.get(key) ?? null
}

export function morphElement(from: GraphicElement, to: GraphicElement, progress: number): GraphicElement {
  const mix = (a: number, b: number) => interpolate(progress, [0, 1], [a, b], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const paint = (a: string, b: string) => a === 'transparent' || b === 'transparent'
    ? (progress < 0.5 ? a : b) : interpolateColors(progress, [0, 1], [a, b])
  const base = {
    ...from,
    x: mix(from.x, to.x), y: mix(from.y, to.y), width: mix(from.width, to.width), height: mix(from.height, to.height),
    fontSize: mix(from.fontSize, to.fontSize), borderRadius: mix(from.borderRadius, to.borderRadius),
    color: interpolateColors(progress, [0, 1], [from.color, to.color]), background: paint(from.background, to.background),
  } as GraphicElement
  if (from.kind === 'component' && to.kind === 'component' && base.kind === 'component' &&
      from.component === 'path' && to.component === 'path' && from.pathData && to.pathData) {
    const fn = pathInterpolator(from.pathData, to.pathData)
    return { ...base, pathData: fn ? fn(progress) : (progress < 0.5 ? from.pathData : to.pathData) }
  }
  return base
}

/** Every shared element named by the outgoing morph transition, interpolated at `frame`. */
export function sharedElementsAtFrame(plan: DirectorPlan, frame: number): GraphicElement[] {
  const shot = plan.shots.find(s => frame >= s.startFrame && frame < s.startFrame + s.durationFrames)
  if (!shot) return []
  const shared = shot.visualElements
    .filter((element): element is GraphicElement => !('assetId' in element) && !!element.sharedKey)
  const transition = plan.transitions.find(t => t.id === shot.transition && t.kind === 'morph')
  // Shared elements still render outside a morph window; only the named ones interpolate.
  if (!transition) return shared
  const ids = transition.sharedElementIds ?? (transition.sharedElementId ? [transition.sharedElementId] : [])
  const next = plan.shots.find(s => s.id === transition.toShotId)
  if (!next || !ids.length) return shared
  const boundary = shot.startFrame + shot.durationFrames
  const progress = interpolate(frame, [boundary - transition.durationFrames, boundary], [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return shared.filter(element => ids.includes(element.sharedKey!)).map(element => {
    const target = next.visualElements.find(e => e.sharedKey === element.sharedKey)
    return target && !('assetId' in target) ? morphElement(element, target, progress) : element
  })
}
