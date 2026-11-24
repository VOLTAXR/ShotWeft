import { interpolate, interpolateColors } from 'remotion'
import type { DirectorPlan, VisualElement } from '../core/director/plan'

export function morphElement(from: VisualElement, to: VisualElement, progress: number): VisualElement {
  const mix = (a: number, b: number) => interpolate(progress, [0, 1], [a, b], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return { ...from, x: mix(from.x, to.x), y: mix(from.y, to.y), width: mix(from.width, to.width), height: mix(from.height, to.height),
    fontSize: mix(from.fontSize, to.fontSize), borderRadius: mix(from.borderRadius, to.borderRadius),
    color: interpolateColors(progress, [0, 1], [from.color, to.color]), background: interpolateColors(progress, [0, 1], [from.background, to.background]) }
}

export function sharedElementsAtFrame(plan: DirectorPlan, frame: number) {
  const shot = plan.shots.find(s => frame >= s.startFrame && frame < s.startFrame + s.durationFrames)
  if (!shot) return []
  const transition = plan.transitions.find(t => t.id === shot.transition && t.kind === 'morph')
  const next = transition && plan.shots.find(s => s.id === transition.toShotId)
  return shot.visualElements.filter(e => e.sharedKey && !('assetId' in e)).map(element => {
    const target = next?.visualElements.find(e => e.sharedKey === transition?.sharedElementId && e.sharedKey === element.sharedKey)
    if (!target || !transition) return element
    const boundary = shot.startFrame + shot.durationFrames
    const progress = interpolate(frame, [boundary - transition.durationFrames, boundary], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    return morphElement(element, target, progress)
  })
}
