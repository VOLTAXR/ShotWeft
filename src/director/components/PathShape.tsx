import { enterProgress } from '../animation'
import type { ComponentProps } from './registry'

export function PathShape({ element, ctx, accent }: ComponentProps) {
  const progress = enterProgress(element.animation, ctx)
  const stroke = element.color === 'transparent' ? accent : element.color
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">
    <path d={element.pathData ?? ''} fill={element.fill ?? 'none'} fillOpacity={element.fill ? progress * 0.9 : 0}
      stroke={stroke} strokeWidth={element.strokeWidth ?? 3} strokeLinecap="round" strokeLinejoin="round"
      pathLength={1} strokeDasharray={1} strokeDashoffset={1 - progress} vectorEffect="non-scaling-stroke" />
  </svg>
}
