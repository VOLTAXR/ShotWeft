import type { DirectorPlan } from '../director/plan'

export type PresenterLayoutSpan = NonNullable<DirectorPlan['layoutTimeline']>[number]

export function presenterSpans(plan: DirectorPlan): PresenterLayoutSpan[] {
  const timeline = plan.layoutTimeline ?? [...plan.shots].sort((a, b) => a.startFrame - b.startFrame)
    .map(({ presenterLayout: layout, startFrame, durationFrames }) => ({ layout, startFrame, durationFrames }))
  const merged: PresenterLayoutSpan[] = []
  for (const span of timeline) {
    const last = merged.at(-1)
    if (last?.layout === span.layout) last.durationFrames += span.durationFrames
    else merged.push({ ...span })
  }
  return merged
}

export function presenterLayoutWarnings(plan: DirectorPlan) {
  const spans = presenterSpans(plan)
  const fps = plan.frameRate.numerator / plan.frameRate.denominator
  const warnings = spans.filter(span => span.durationFrames < 3 * fps)
    .map(span => `Layout ${span.layout} at frame ${span.startFrame} lasts under 3 seconds.`)
  const changes = spans.slice(1)
  if (changes.some((span, index) => index >= 5 && span.startFrame - changes[index - 5].startFrame < 30 * fps)) {
    warnings.push('More than five presenter layout changes occur within 30 seconds.')
  }
  return warnings
}

/** Exclusive end frame of the last visible part of the take, on the plan timeline. */
export function presenterVideoEnd(plan: DirectorPlan) {
  return presenterSpans(plan).reduce((end, span) => span.layout === 'none' || span.layout === 'b-roll'
    ? end : Math.max(end, span.startFrame + span.durationFrames), 0)
}
