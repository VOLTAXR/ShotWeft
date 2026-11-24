import { interpolate, useCurrentFrame } from 'remotion'
export function QuoteScene({ accent }: { accent: string }) {
  const frame = useCurrentFrame()
  return <div data-scene-type="quote" style={{ position: 'absolute', left: '12%', top: '24%', color: accent,
    fontFamily: 'serif', fontSize: 130, opacity: interpolate(frame, [0, 12], [0, 0.6], { extrapolateRight: 'clamp' }) }}>“</div>
}
