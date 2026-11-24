import { interpolate, useCurrentFrame } from 'remotion'
export function ChartScene({ accent }: { accent: string }) {
  const frame = useCurrentFrame()
  return <div data-scene-type="chart" style={{ position: 'absolute', left: '12%', right: '12%', bottom: '16%', height: '32%', display: 'flex', alignItems: 'end', gap: '5%' }}>
    {[0.3, 0.55, 0.72, 1].map((value, i) => <div key={i} style={{ flex: 1, background: accent, opacity: 0.4 + i * 0.2,
      height: interpolate(frame, [0, 24], [0, value * 100], { extrapolateRight: 'clamp' }) + '%', borderRadius: '8px 8px 0 0' }} />)}
  </div>
}
