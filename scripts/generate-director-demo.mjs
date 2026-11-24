// Original, deterministic fixture. These tones are synthesized math, NOT a human voice.
import { writeFile, mkdir } from 'node:fs/promises'
await mkdir('public/director', { recursive: true })
const rate = 48000, seconds = 6
const wav = Buffer.alloc(44 + rate * seconds * 2)
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34)
wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40)
for (let i = 0; i < rate * seconds; i++) {
  const t = i / rate, envelope = Math.min(1, t * 10, (seconds - t) * 10)
  wav.writeInt16LE(Math.round(3200 * envelope * Math.sin(2 * Math.PI * [220, 330, 440][Math.min(2, Math.floor(t / 2))] * t)), 44 + i * 2)
}
await writeFile('public/director/synthetic-tones.wav', wav)
const lines = ['Three scenes. One plan.', 'Make the evidence visible.', 'Keep the idea in motion.']
const hero = (i) => ({ id: 'hero-' + i, sharedKey: 'idea', kind: 'number', text: '3', x: [0.4, 0.68, 0.12][i], y: [0.3, 0.16, 0.68][i],
  width: [0.2, 0.18, 0.16][i], height: [0.35, 0.25, 0.2][i], fontSize: [100, 64, 42][i], color: '#101827', background: '#f6c85f', borderRadius: [65, 12, 4][i] })
const plan = {
  schemaVersion: 1, productionMode: 'script', originalScript: lines.join('\n'),
  scriptSegments: lines.map((text, i) => ({ id: 'segment-' + i, text, startFrame: i * 60, durationFrames: 60 })),
  aspectRatio: '16:9', frameRate: { numerator: 30, denominator: 1 }, resolution: { width: 640, height: 360 }, durationFrames: 180,
  scenes: lines.map((title, i) => ({ id: 'scene-' + i, title, startFrame: i * 60, durationFrames: 60, shotIds: ['shot-' + i] })),
  shots: ['title', 'chart', 'quote'].map((sceneType, i) => ({ id: 'shot-' + i, scriptSegmentIds: ['segment-' + i], purpose: lines[i],
    startFrame: i * 60, durationFrames: 60, sceneType, visualElements: [hero(i), { id: 'label-' + i, kind: 'text', text: lines[i],
      x: 0.12, y: [0.7, 0.12, 0.35][i], width: [0.76, 0.5, 0.76][i], height: 0.22, fontSize: 27, color: '#f5f7fa', background: '#101827', borderRadius: 0 }],
    assetIds: [], camera: 'static', transition: i < 2 ? 'morph-' + i : null,
    cueAnchors: [{ scriptSegmentId: 'segment-' + i, charOffset: 0, frame: i * 60 }], presenterLayout: 'none',
    rationale: ['Introduce the central count.', 'Retain the count as evidence grows.', 'Carry the same idea into the conclusion.'][i] })),
  narration: { text: 'Synthetic tones only; explicitly not human voice.', assetId: 'tone', scriptSegmentIds: [] }, presenter: null,
  assets: [{ id: 'tone', kind: 'audio', path: 'synthetic-tones.wav', description: 'Self-generated 220/330/440 Hz PCM tones; not human voice.' }],
  captions: [], transitions: [0, 1].map(i => ({ id: 'morph-' + i, fromShotId: 'shot-' + i, toShotId: 'shot-' + (i + 1), kind: 'morph', durationFrames: 18, sharedElementId: 'idea' })),
  audio: [{ id: 'soundtrack', assetId: 'tone', startFrame: 0, durationFrames: 180, sourceInFrame: 0, volume: 0.7 }],
  style: { background: '#101827', foreground: '#f5f7fa', accent: '#f6c85f', fontFamily: 'sans-serif' }, reviewStatus: 'needs-review',
}
await writeFile('public/director/demo-plan.json', JSON.stringify(plan, null, 2) + '\n')
