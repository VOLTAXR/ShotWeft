import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
export function TitleScene({ accent }: { accent: string }) {
  const frame = useCurrentFrame()
  return <AbsoluteFill data-scene-type="title" style={{ padding: '8%', fontSize: 18, letterSpacing: 5,
    opacity: interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' }) }}>
    <span style={{ color: accent }}>SHOTWEFT / DIRECTOR LAB</span>
  </AbsoluteFill>
}
