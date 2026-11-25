import { Easing, interpolate, spring } from 'remotion'
import type { ElementAnimation, VisualElement } from '../core/director/plan'
import { HOUSE_EASE } from './onda/easing'
import { SPRING_SMOOTH, SPRING_SNAPPY } from './onda/motion'

/** Everything an animated element needs is derived from the frame number. */
export interface AnimationContext {
  frame: number
  fps: number
  durationFrames: number
}

export interface AnimatedStyle {
  opacity: number
  translateX: number
  translateY: number
  scale: number
  rotation: number
  blur: number
  clipPath?: string
}

type EasingName = NonNullable<NonNullable<ElementAnimation['enter']>['easing']>

const round = (value: number) => Math.round(value * 1e6) / 1e6

function progressAt(easing: EasingName | undefined, frame: number, fps: number, durationFrames: number) {
  if (easing === 'springSmooth' || easing === 'springSnappy') {
    return spring({ frame, fps, durationInFrames: durationFrames, config: easing === 'springSnappy' ? SPRING_SNAPPY : SPRING_SMOOTH })
  }
  const easingFn = easing === 'easeInOut' ? Easing.inOut(Easing.ease) : easing === 'linear' ? Easing.linear : HOUSE_EASE
  return interpolate(frame, [0, durationFrames], [0, 1], {
    easing: easingFn, extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })
}

/** Local progress of the entrance; 0 before the delay, 1 once settled. */
export function enterProgress(animation: ElementAnimation | undefined, { frame, fps }: AnimationContext) {
  if (!animation?.enter) return 1
  const { delayFrames = 0, durationFrames = 18, easing } = animation.enter
  return progressAt(easing, frame - delayFrames, fps, durationFrames)
}

/** Local progress of the exit; 0 until the exit window starts, 1 at the end. */
export function exitProgress(animation: ElementAnimation | undefined, { frame, fps, durationFrames }: AnimationContext) {
  if (!animation?.exit) return 0
  const { durationFrames: exitFrames = 12, easing } = animation.exit
  return progressAt(easing, frame - (durationFrames - exitFrames), fps, exitFrames)
}

function enterEffect(preset: NonNullable<NonNullable<ElementAnimation['enter']>['preset']>, p: number): AnimatedStyle {
  const base: AnimatedStyle = { opacity: p, translateX: 0, translateY: 0, scale: 1, rotation: 0, blur: 0 }
  if (preset === 'rise') return { ...base, translateY: (1 - p) * 28 }
  if (preset === 'blur') return { ...base, blur: (1 - p) * 10 }
  if (preset === 'scale') return { ...base, scale: 0.92 + 0.08 * p }
  if (preset === 'wipe') return { ...base, clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` }
  return base
}

function exitEffect(preset: NonNullable<NonNullable<ElementAnimation['exit']>['preset']>, p: number): AnimatedStyle {
  const base: AnimatedStyle = { opacity: 1 - p, translateX: 0, translateY: 0, scale: 1, rotation: 0, blur: 0 }
  if (preset === 'drop') return { ...base, translateY: p * 24 }
  if (preset === 'scale') return { ...base, scale: 1 - 0.08 * p }
  if (preset === 'wipe') return { ...base, clipPath: `inset(0 0 0 ${p * 100}%)` }
  return base
}

function keyframeValues(animation: ElementAnimation | undefined, frame: number) {
  const frames = animation?.keyframes
  if (!frames?.length) return undefined
  const value = (key: 'opacity' | 'x' | 'y' | 'scale' | 'rotation') => {
    const points = frames.filter(k => k[key] !== undefined) as ({ frame: number } & Record<string, number>)[]
    if (!points.length) return undefined
    if (points.length === 1) return points[0][key]
    const input = points.map(p => p.frame)
    const output = points.map(p => p[key])
    return interpolate(frame, input, output, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  }
  return { opacity: value('opacity'), x: value('x'), y: value('y'), scale: value('scale'), rotation: value('rotation') }
}

/** Compose enter/exit/keyframes into one deterministic style. */
export function elementAnimationStyle(element: VisualElement, ctx: AnimationContext): AnimatedStyle {
  const animation = element.animation
  const enter = enterEffect(animation?.enter?.preset ?? 'fade', enterProgress(animation, ctx))
  const exit = exitEffect(animation?.exit?.preset ?? 'fade', exitProgress(animation, ctx))
  const keys = keyframeValues(animation, ctx.frame)
  const style: AnimatedStyle = {
    opacity: round(enter.opacity * exit.opacity * (keys?.opacity ?? 1)),
    translateX: (enter.translateX + exit.translateX) + (keys?.x ?? 0) * 100,
    translateY: (enter.translateY + exit.translateY) + (keys?.y ?? 0) * 100,
    scale: round(enter.scale * exit.scale * (keys?.scale ?? 1)),
    rotation: round(enter.rotation + exit.rotation + (keys?.rotation ?? 0)),
    blur: round(enter.blur + exit.blur),
    ...((enter.clipPath ?? exit.clipPath) && { clipPath: enter.clipPath ?? exit.clipPath }),
  }
  return { ...style, ...(style.clipPath === undefined && enter.clipPath === undefined && exit.clipPath === undefined
    ? { clipPath: undefined } : {}) }
}

/** Per-unit stagger progress used by bullets, timelines, characters and markers. */
export function unitProgress(animation: ElementAnimation | undefined, ctx: AnimationContext, index: number) {
  const enter = animation?.enter
  const delay = (enter?.delayFrames ?? 0) + (animation?.stagger ? index * animation.stagger.frames : 0)
  if (!enter) return 1
  return progressAt(enter.easing, ctx.frame - delay, ctx.fps, enter.durationFrames ?? 18)
}

/** Characters visible for a typewriter/stagger reveal. */
export function visibleCharacters(animation: ElementAnimation | undefined, ctx: AnimationContext, length: number) {
  if (!animation?.enter && !animation?.stagger) return length
  const typewriter = animation?.enter?.preset === 'typewriter'
  if (!typewriter && (!animation?.stagger || animation.stagger.unit !== 'char')) return length
  const progress = typewriter ? enterProgress(animation, ctx) : unitProgress(animation, ctx, 0)
  const step = animation?.stagger?.frames ?? 1
  if (typewriter) return Math.min(length, Math.floor(progress * step * length))
  return Math.min(length, Math.floor(progress * length) + 1)
}

/**
 * Deterministic text fitting: estimate glyph widths (Han/full-width ≈ em,
 * Latin ≈ 0.56 em) and shrink the font until the wrapped text fits the box.
 */
export function fitFontSize(text: string, width: number, height: number, preferred: number) {
  const measured = (size: number) => {
    const lines = wrapCount(text, width, size)
    return lines * size * 1.32 <= height ? size : undefined
  }
  const direct = measured(preferred)
  if (direct !== undefined) return direct
  let low = 8, high = preferred
  for (let i = 0; i < 18; i++) {
    const mid = (low + high) / 2
    if (measured(mid) !== undefined) low = mid
    else high = mid
  }
  return Math.max(8, Math.floor(low * 10) / 10)
}

function wrapCount(text: string, width: number, size: number) {
  const paragraphs = (text || ' ').split('\n')
  let lines = 0
  for (const paragraph of paragraphs) {
    let current = 0
    for (const char of Array.from(paragraph)) {
      const w = /[\u3000-\u9fff\uff00-\uffef]/u.test(char) ? size : char === ' ' ? size * 0.3 : size * 0.56
      if (current + w > width) { lines++; current = 0 }
      current += w
    }
    lines += Math.max(1, Math.ceil(current / Math.max(1, width)))
  }
  return Math.max(1, lines)
}

/** Captions and headlines render a plain-text view of the script. */
export function plainCaption(text: string) {
  return text.replace(/^\s{0,3}#{1,6}\s*/u, '').replace(/\*\*|__|`/g, '').replace(/\s*\n\s*/g, ' ').trim()
}
/** Reveal characters for typewriter or character-stagger animation. */
export function revealText(text: string, animation: ElementAnimation | undefined, ctx: AnimationContext) {
  const typewriter = animation?.enter?.preset === 'typewriter'
  const charStagger = animation?.stagger?.unit === 'char'
  if (!typewriter && !charStagger) return text
  const chars = Array.from(text)
  const progress = typewriter ? enterProgress(animation, ctx) : unitProgress(animation, ctx, 0)
  return chars.slice(0, Math.max(0, Math.ceil(progress * chars.length))).join('')
}
