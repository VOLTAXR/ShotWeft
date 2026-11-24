import { ArrowLeft, ArrowRight, Scissors, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { EditText } from './ui'
import { captionDefaults, clipEndFrame, type SubtitleCue, type SubtitleStyle, type VideoClip } from './video-model'

export function VideoNumber({ label, value, onChange, min = 0, max = Number.MAX_SAFE_INTEGER, step = 1 }: {
  label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number
}) {
  const [draft, setDraft] = useState<string>()
  return <label className="field"><span>{label}</span>
    <input type="number" value={draft ?? value} min={min} max={max} step={step}
      onChange={event => setDraft(event.currentTarget.value)}
      onBlur={event => {
        const { valueAsNumber: next, validity } = event.currentTarget
        setDraft(undefined)
        if (validity.valid && Number.isFinite(next) && next !== value) onChange(next)
      }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
  </label>
}

function VideoColor({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="field"><span>{label}</span>
    <input type="color" value={value.slice(0, 7)} onChange={event => onChange(event.currentTarget.value + value.slice(7))} />
  </label>
}

type ClipEdit = (change: (clip: VideoClip) => VideoClip, group?: string) => void

function withSourceRange(clip: VideoClip, timed: boolean, sourceInFrame: number, durationFrames: number): VideoClip {
  return {
    ...clip, durationFrames,
    ...(timed && { sourceInFrame, sourceOutFrame: sourceInFrame + durationFrames }),
  }
}

export function splitVideoClip(clip: VideoClip, frame: number, rightId: string, timed: boolean) {
  const leftLength = frame - clip.startFrame
  const source = clip.sourceInFrame ?? 0
  return [
    withSourceRange(clip, timed, source, leftLength),
    withSourceRange({ ...clip, id: rightId, startFrame: frame }, timed, source + leftLength, clip.durationFrames - leftLength),
  ]
}

export function ClipInspector({ clip, frame, timed, audioOnly, disabled, onEdit, onSplit, onDelete }: {
  clip: VideoClip; frame: number; timed: boolean; audioOnly: boolean; disabled: boolean
  onEdit: ClipEdit; onSplit: () => void; onDelete: () => void
}) {
  const [step, setStep] = useState(1)
  const sourceIn = clip.sourceInFrame ?? 0
  const sourceOut = clip.sourceOutFrame ?? sourceIn + clip.durationFrames
  const graphic = clip.graphic
  return <section className="video-panel video-inspector" aria-label="Clip properties">
    <header className="video-panel-head"><h3>{audioOnly ? 'Audio clip properties' : 'Clip properties'}</h3></header>
    <EditText label="Clip label" value={clip.label} onCommit={(label, group) => onEdit(item => ({ ...item, label }), group)} />
    {graphic?.kind === 'text' && <EditText label="Graphic text" value={graphic.text ?? ''} multiline
      onCommit={(text, group) => onEdit(item => item.graphic ? { ...item, graphic: { ...item.graphic, text } } : item, group)} />}
    {graphic && <div className="video-field-grid">
      <VideoNumber label="Graphic font size" min={1} value={graphic.fontSize}
        onChange={fontSize => onEdit(item => item.graphic ? { ...item, graphic: { ...item.graphic, fontSize } } : item)} />
      <VideoColor label="Graphic color" value={graphic.color}
        onChange={color => onEdit(item => item.graphic ? { ...item, graphic: { ...item.graphic, color } } : item)} />
    </div>}
    <div className="video-field-grid">
      <VideoNumber label="Start frame" value={clip.startFrame} onChange={startFrame => onEdit(item => ({ ...item, startFrame }))} />
      <VideoNumber label="Duration (frames)" min={1} value={clip.durationFrames}
        onChange={duration => onEdit(item => withSourceRange(item, timed, item.sourceInFrame ?? 0, duration))} />
      {timed && <>
        <VideoNumber label="Source in frame" value={sourceIn} onChange={start => onEdit(item =>
          withSourceRange(item, true, start, (item.sourceInFrame ?? 0) + item.durationFrames - start))} />
        <VideoNumber label="Source out frame" min={1} value={sourceOut} onChange={end => onEdit(item =>
          withSourceRange(item, true, item.sourceInFrame ?? 0, end - (item.sourceInFrame ?? 0)))} />
      </>}
      <VideoNumber label="Volume (%)" max={100} value={Math.round(clip.volume * 10000) / 100} step={0.01}
        onChange={volume => onEdit(item => ({ ...item, volume: volume / 100 }))} />
      <label className="video-check"><input type="checkbox" checked={clip.muted}
        onChange={event => {
          const muted = event.currentTarget.checked
          onEdit(item => ({ ...item, muted }))
        }} /> Muted</label>
      <VideoNumber label="Edit step (frames)" value={step} min={1} onChange={setStep} />
    </div>
    <div className="video-actions">
      <button className="button secondary" disabled={disabled || clip.startFrame < step}
        onClick={() => onEdit(item => ({ ...item, startFrame: item.startFrame - step }))}><ArrowLeft size={15} /> Move left</button>
      <button className="button secondary" disabled={disabled}
        onClick={() => onEdit(item => ({ ...item, startFrame: item.startFrame + step }))}>Move right <ArrowRight size={15} /></button>
      <button className="button secondary" disabled={disabled || clip.durationFrames <= step}
        onClick={() => onEdit(item => withSourceRange({ ...item, startFrame: item.startFrame + step }, timed,
          (item.sourceInFrame ?? 0) + step, item.durationFrames - step))}>Trim start</button>
      <button className="button secondary" disabled={disabled || clip.durationFrames <= step}
        onClick={() => onEdit(item => withSourceRange(item, timed,
          item.sourceInFrame ?? 0, item.durationFrames - step))}>Trim end</button>
      <button className="button secondary" disabled={disabled || frame <= clip.startFrame || frame >= clipEndFrame(clip)}
        onClick={onSplit}><Scissors size={15} /> Split at playhead</button>
      <button className="button secondary" disabled={disabled} onClick={onDelete}><Trash2 size={15} /> Delete clip</button>
    </div>
  </section>
}

export function SubtitleInspector({ cue, disabled, onEdit, onDelete }: {
  cue: SubtitleCue; disabled: boolean
  onEdit: (patch: Partial<SubtitleCue>, group?: string) => void
  onDelete: () => void
}) {
  const style = { ...captionDefaults, ...cue.style }
  return <section className="video-panel video-inspector" aria-label="Subtitle properties">
    <header className="video-panel-head"><h3>Subtitle properties</h3></header>
    <EditText label="Subtitle text" value={cue.text} multiline onCommit={(text, group) => onEdit({ text }, group)} />
    <div className="video-field-grid">
      <VideoNumber label="Cue start frame" value={cue.startFrame} onChange={startFrame => onEdit({ startFrame })} />
      <VideoNumber label="Cue end frame" min={1} value={cue.endFrame} onChange={endFrame => onEdit({ endFrame })} />
      <label className="field"><span>Caption position</span>
        <select aria-label="Caption position" value={style.position}
          onChange={event => onEdit({ style: { position: event.currentTarget.value as SubtitleStyle['position'] } })}>
          <option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option>
        </select>
      </label>
      <VideoNumber label="Caption font size" min={1} value={style.fontSize} onChange={fontSize => onEdit({ style: { fontSize } })} />
      <VideoColor label="Caption color" value={style.color} onChange={color => onEdit({ style: { color } })} />
      <VideoColor label="Caption background" value={style.background} onChange={background => onEdit({ style: { background } })} />
    </div>
    <div className="video-actions">
      <button className="button secondary" disabled={disabled} onClick={onDelete}><Trash2 size={15} /> Delete subtitle</button>
    </div>
  </section>
}
