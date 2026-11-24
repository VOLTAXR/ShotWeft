import { AudioLines, Clapperboard, Film, Image, ListVideo, Lock, Plus, RotateCw, Unlock } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { PlayerRef } from '@remotion/player'
import { attachNarration } from '../core/director/audio'
import { parseDirectorPlan, type DirectorAsset, type DirectorPlan, type DirectorShot } from '../core/director/plan'
import { planFromScript, regenerateShot } from '../core/director/planner'
import { importScript, scriptByteLimit, type ImportedScript, type ScriptFormat } from '../core/director/script'
import { measuredMediaFrames, prepareAsset } from '../media'
import type { Asset, Project } from '../model'
import { DirectorPreview } from './DirectorPreview'

type UpdateOptions = { group?: string; imported?: Asset[] }
type WorkspaceProps = {
  project: Project
  assets: Asset[]
  assetsFailed: boolean
  saving: boolean
  onUpdate: (change: (current: Project) => Project, options?: UpdateOptions) => Promise<boolean>
}

const scriptFormats: Partial<Record<string, ScriptFormat>> = { txt: 'txt', md: 'markdown', markdown: 'markdown', json: 'json' }
const sceneTypes: DirectorShot['sceneType'][] = ['title', 'chart', 'quote', 'graphic', 'image', 'video', 'split']
const narrationOrigins = { imported: 'Imported', tts: 'TTS', synthetic: 'Synthetic', unknown: 'Unknown' }
type NarrationOrigin = keyof typeof narrationOrigins
const layerPlacements = { background: 'Background', 'b-roll': 'B-roll', overlay: 'Overlay' }
type LayerPlacement = keyof typeof layerPlacements
type NoticeArea = 'shot' | 'media' | 'narration'

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function DirectorSetup({ project, saving, onUpdate }: WorkspaceProps) {
  const scriptLabel = useId()
  const [script, setScript] = useState('')
  const [imported, setImported] = useState<ImportedScript>()
  const [title, setTitle] = useState('')
  const [aspectRatio, setAspectRatio] = useState<DirectorPlan['aspectRatio']>(project.frame === '9:16' ? '9:16' : '16:9')
  const [numerator, setNumerator] = useState('30')
  const [denominator, setDenominator] = useState('1')
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')

  async function readScript(file: File) {
    setReading(true)
    setError('')
    try {
      const format = scriptFormats[file.name.split('.').at(-1)?.toLowerCase() ?? '']
      if (!format) throw new Error('Choose a TXT, Markdown, or JSON script.')
      if (file.size > scriptByteLimit) throw new Error('Script exceeds the 1 MiB limit.')
      const next = importScript(new Uint8Array(await file.arrayBuffer()), format)
      setImported(next)
      setScript(next.originalScript)
      if (next.title) setTitle(current => current.trim() ? current : next.title!)
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setReading(false)
    }
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    try {
      const plan = planFromScript({
        script: imported?.originalScript === script ? imported : importScript(script),
        title: title.trim() || undefined, aspectRatio,
        frameRate: { numerator: Number(numerator), denominator: Number(denominator) },
      })
      const saved = await onUpdate(current => current.direction ? current : { ...current, direction: plan, activeTimeline: 'director' })
      if (!saved) setError('Could not save the Director plan.')
    } catch (failure) {
      setError(errorMessage(failure))
    }
  }

  return <form className="video-panel director-setup" aria-label="Create Director plan" onSubmit={event => void generate(event)}>
    <header className="video-panel-head"><h3><Clapperboard size={17} /> Create Director plan</h3></header>
    <label className="field"><span>Script file (TXT, Markdown, JSON)</span>
      <input type="file" accept=".txt,.md,.markdown,.json" disabled={reading || saving} onChange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) void readScript(file)
      }} />
    </label>
    <label className="field"><span id={scriptLabel}>Script</span>
      <textarea aria-labelledby={scriptLabel} rows={6} value={script} disabled={reading || saving} onChange={event => setScript(event.target.value)} />
    </label>
    <div className="video-field-grid">
      <label className="field"><span>Title</span>
        <input value={title} onChange={event => setTitle(event.target.value)} />
      </label>
      <label className="field"><span>Aspect ratio</span>
        <select aria-label="Aspect ratio" value={aspectRatio} onChange={event => setAspectRatio(event.target.value as DirectorPlan['aspectRatio'])}>
          <option>16:9</option><option>9:16</option>
        </select>
      </label>
      <label className="field"><span>FPS numerator</span>
        <input type="number" step={1} required value={numerator} onChange={event => setNumerator(event.target.value)} />
      </label>
      <label className="field"><span>FPS denominator</span>
        <input type="number" step={1} required value={denominator} onChange={event => setDenominator(event.target.value)} />
      </label>
    </div>
    {error && <p className="video-notice video-error" role="alert">{error}</p>}
    <div className="video-actions">
      <button className="button primary" type="submit" disabled={reading || saving}><Clapperboard size={15} /> Generate Director plan</button>
    </div>
  </form>
}

function ShotTextField({ label, value, onEdit }: {
  label: string; value: string; onEdit: (value: string, group: string) => Promise<string>
}) {
  const [draft, setDraft] = useState<{ text: string; error?: string }>()
  const group = useRef<string | undefined>(undefined)
  const revision = useRef(0)
  const labelId = useId()
  const errorId = useId()
  useEffect(() => {
    if (!group.current) setDraft(previous => previous?.error ? previous : undefined)
  }, [value])

  async function change(text: string) {
    if (!group.current) group.current = crypto.randomUUID()
    const request = ++revision.current
    setDraft({ text })
    const error = await onEdit(text, group.current)
    if (error && request === revision.current) setDraft({ text, error })
  }

  const props = {
    value: draft?.text ?? value,
    'aria-labelledby': labelId,
    'aria-invalid': draft?.error ? true : undefined,
    'aria-describedby': draft?.error ? errorId : undefined,
    onBlur: () => {
      group.current = undefined
      if (draft?.text === value && !draft.error) setDraft(undefined)
    },
  }
  return <div className="field">
    <label className="field"><span id={labelId}>{label}</span>
      <textarea {...props} rows={2} onChange={event => void change(event.target.value)} />
    </label>
    {draft?.error && <small className="director-field-error" id={errorId} role="alert">{draft.error}</small>}
  </div>
}

function linkedPlanAsset(plan: DirectorPlan, asset: Asset, durationFrames?: number): DirectorAsset {
  return plan.assets.find(item => item.projectAssetId === asset.id && item.kind === asset.kind) ?? {
    id: 'asset-' + crypto.randomUUID(), kind: asset.kind, projectAssetId: asset.id,
    description: asset.name,
    ...(durationFrames !== undefined && { sourceDurationFrames: Math.min(1_000_000, durationFrames) }),
  }
}

function PlanEditor({ project, plan, assets, assetsFailed, saving, onUpdate }: WorkspaceProps & { plan: DirectorPlan }) {
  const [selectedId, setSelectedId] = useState('')
  const [assetId, setAssetId] = useState('')
  const [placement, setPlacement] = useState<LayerPlacement>('background')
  const [origin, setOrigin] = useState<NarrationOrigin>(plan.narration.origin ?? 'imported')
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState<{ area: NoticeArea; message: string; error?: boolean }>()
  const playerRef = useRef<PlayerRef>(null)
  const ordered = [...plan.shots].sort((a, b) => a.startFrame - b.startFrame)
  const shot = ordered.find(item => item.id === selectedId) ?? ordered[0]
  const primary = shot.visualElements.find(element => element.kind === 'text' || element.kind === 'number')
  const visualAssets = assets.filter(asset => asset.kind === 'image' || asset.kind === 'video')
  const selectedAsset = visualAssets.find(asset => asset.id === assetId)
  const narrationAsset = plan.assets.find(asset => asset.id === plan.narration.assetId)
  const narrationName = assets.find(asset => asset.id === narrationAsset?.projectAssetId)?.name ?? narrationAsset?.description

  useEffect(() => {
    const player = playerRef.current
    player?.pause()
    player?.seekTo(shot.startFrame)
  }, [shot.id, shot.startFrame, plan.durationFrames])

  async function update(change: (current: DirectorPlan) => DirectorPlan, options?: UpdateOptions) {
    let issue = ''
    const saved = await onUpdate(current => {
      try {
        if (!current.direction) throw new Error('The Director plan is no longer available.')
        const next = change(current.direction)
        return next === current.direction ? current : { ...current, direction: parseDirectorPlan(next) }
      } catch (failure) {
        issue = errorMessage(failure)
        // Throwing rolls back the same transaction that would add the imported blob.
        if (options?.imported?.length) throw failure
        return current
      }
    }, options)
    return issue || (saved ? '' : 'Could not save the Director edit.')
  }

  function editShot(change: (current: DirectorShot, direction: DirectorPlan) => DirectorShot, group?: string) {
    return update(direction => {
      const current = direction.shots.find(item => item.id === shot.id)
      if (!current) throw new Error('The selected shot is no longer available.')
      const next = change(current, direction)
      return next === current ? direction : { ...direction, shots: direction.shots.map(item => item === current ? next : item) }
    }, { group })
  }

  function editContinuity(field: 'previous' | 'next', text: string, group: string) {
    return editShot((current, direction) => {
      const previous = direction.shots.find(item => item.startFrame + item.durationFrames === current.startFrame)
      const next = direction.shots.find(item => item.startFrame === current.startFrame + current.durationFrames)
      const continuity = current.continuity ?? { previousShotId: previous?.id ?? null, nextShotId: next?.id ?? null, previous: '', next: '' }
      return text === continuity[field] ? current : { ...current, continuity: { ...continuity, [field]: text } }
    }, group)
  }

  async function showResult(area: NoticeArea, operation: Promise<string>, message = '') {
    setNotice(undefined)
    const error = await operation
    if (error || message) setNotice({ area, message: error || message, error: !!error })
  }

  function noticeFor(area: NoticeArea) {
    if (notice?.area !== area) return null
    return <p className={'video-notice' + (notice.error ? ' video-error' : '')}
      role={notice.error ? 'alert' : 'status'}>{notice.message}</p>
  }

  function addLayer() {
    if (!selectedAsset || selectedAsset.kind === 'audio') return
    const kind = selectedAsset.kind
    const layerId = placement + '-' + crypto.randomUUID()
    void showResult('media', update(direction => {
      const current = direction.shots.find(item => item.id === shot.id)
      if (!current) throw new Error('The selected shot is no longer available.')
      const frames = kind === 'video' ? measuredMediaFrames(selectedAsset.duration, direction.frameRate) : undefined
      if (kind === 'video' && (!frames || frames < 1)) throw new Error('This video has no measured duration of at least one plan frame.')
      const asset = linkedPlanAsset(direction, selectedAsset, frames)
      const layer: NonNullable<DirectorShot['mediaLayers']>[number] = {
        id: layerId, assetId: asset.id, kind, startFrame: current.startFrame,
        durationFrames: Math.min(current.durationFrames, frames ?? Infinity, asset.sourceDurationFrames ?? Infinity),
        fit: placement === 'overlay' ? 'contain' : 'cover',
        ...(placement === 'overlay' && { region: { x: 0.62, y: 0.08, width: 0.32, height: 0.24 } }),
      }
      const layers = [...current.mediaLayers ?? []]
      const before = layers.findIndex(item => placement === 'background' ? !item.id.startsWith('background-')
        : placement === 'b-roll' && item.id.startsWith('overlay-'))
      layers.splice(before < 0 ? layers.length : before, 0, layer)
      const next = { ...current, mediaLayers: layers, assetIds: [...new Set([...current.assetIds, asset.id])] }
      return { ...direction, assets: direction.assets.includes(asset) ? direction.assets : [...direction.assets, asset],
        shots: direction.shots.map(item => item === current ? next : item) }
    }), 'Added ' + selectedAsset.name + ' to ' + shot.id + '.')
  }

  async function importNarration(file: File) {
    setImporting(true)
    setNotice(undefined)
    try {
      if (!/\.(wav|mp3|m4a)$/i.test(file.name)) throw new Error('Choose a WAV, MP3, or M4A audio file.')
      const asset = await prepareAsset(file, project.id)
      if (asset.kind !== 'audio') throw new Error('Narration requires an audio file.')
      const attach = (current: DirectorPlan) => {
        const durationFrames = measuredMediaFrames(asset.duration, current.frameRate) ?? 0
        return attachNarration(current, { asset: linkedPlanAsset(current, asset, durationFrames), measuredDurationFrames: durationFrames, origin })
      }
      // Validate before starting the transaction, then apply against the current plan inside it.
      attach(plan)
      await showResult('narration', update(attach, { imported: [asset] }), 'Assigned ' + asset.name + ' as narration.')
    } catch (failure) {
      setNotice({ area: 'narration', message: errorMessage(failure), error: true })
    } finally {
      setImporting(false)
    }
  }

  return <section className="director-workspace" aria-label="Director workspace">
    <header className="director-plan-head">
      <h3><Clapperboard size={19} /> {plan.scenes.find(scene => scene.startFrame === 0)?.title || 'Director plan'}</h3>
      <p role="status" className="director-timing">
        Timing: {plan.narration.timing === 'actual' ? 'Actual' : 'Estimated'} · Narration: {narrationOrigins[plan.narration.origin ?? 'unknown']} · {plan.durationFrames} frames · {plan.frameRate.numerator}/{plan.frameRate.denominator} fps
      </p>
    </header>
    <div className="director-layout">
      <section className="video-panel director-shot-panel" aria-label="Director shots">
        <header className="video-panel-head"><h3><ListVideo size={17} /> Shots</h3></header>
        <ul className="director-shot-list">
          {ordered.map(item => <li key={item.id}>
            <button className="director-shot" type="button" aria-pressed={item.id === shot.id} data-shot-id={item.id}
              data-start-frame={item.startFrame} data-end-frame={item.startFrame + item.durationFrames}
              onClick={() => {
                setNotice(undefined)
                setSelectedId(item.id)
                playerRef.current?.pause()
                playerRef.current?.seekTo(item.startFrame)
              }}>
              <strong>{item.id}</strong>
              <span>{item.sceneType} · Frames {item.startFrame}–{item.startFrame + item.durationFrames - 1}</span>
              <span className="director-shot-purpose">{item.purpose}</span>
              <span>{item.locked ? <Lock size={12} /> : <Unlock size={12} />} {item.locked ? 'Locked' : 'Unlocked'}</span>
            </button>
          </li>)}
        </ul>
      </section>
      <section className="video-panel director-player" aria-label="Director preview">
        <header className="video-panel-head"><h3><Film size={17} /> Preview</h3></header>
        <div className="director-player-frame" style={{ maxWidth: Math.round(560 * plan.resolution.width / plan.resolution.height) }}>
          <DirectorPreview plan={plan} projectAssets={assets} playerRef={playerRef} initialFrame={shot.startFrame} />
        </div>
      </section>
      <div className="director-details">
        <section className="video-panel director-fields" aria-label="Director shot inspector" key={shot.id}>
          <header className="video-panel-head"><h3>Shot inspector</h3><span>{shot.id}</span></header>
          <div className="video-actions">
            <button type="button" className="button secondary" disabled={saving}
              onClick={() => void showResult('shot', editShot(current => ({ ...current, locked: !current.locked })))}>
              {shot.locked ? <Unlock size={15} /> : <Lock size={15} />} {shot.locked ? 'Unlock shot' : 'Lock shot'}
            </button>
            <button type="button" className="button secondary" disabled={saving}
              onClick={() => void showResult('shot', update(current => {
                const next = regenerateShot(current, shot.id)
                if (next === current) throw new Error('This shot is locked. Unlock it before regenerating.')
                return next
              }), 'Regenerated ' + shot.id + '.')}>
              <RotateCw size={15} /> Regenerate shot
            </button>
          </div>
          {noticeFor('shot')}
          <ShotTextField label="Purpose" value={shot.purpose} onEdit={(purpose, group) =>
            editShot(current => purpose === current.purpose ? current : { ...current, purpose }, group)} />
          <ShotTextField label="Rationale" value={shot.rationale} onEdit={(rationale, group) =>
            editShot(current => rationale === current.rationale ? current : { ...current, rationale }, group)} />
          <div className="video-field-grid">
            <label className="field"><span>Scene type</span>
              <select aria-label="Scene type" value={shot.sceneType} onChange={event => {
                const sceneType = event.target.value as DirectorShot['sceneType']
                void showResult('shot', editShot(current => ({ ...current, sceneType })))
              }}>{sceneTypes.map(type => <option key={type}>{type}</option>)}</select>
            </label>
            <label className="field"><span>Camera</span>
              <select aria-label="Camera" value={shot.camera} onChange={event => {
                const camera = event.target.value as DirectorShot['camera']
                void showResult('shot', editShot(current => ({ ...current, camera })))
              }}>
                <option value="static">Static</option><option value="slow-push">Slow push</option>
              </select>
            </label>
          </div>
          {primary ? <ShotTextField label="Primary text" value={primary.text} onEdit={(text, group) =>
            editShot(current => {
              const element = current.visualElements.find(item => item.id === primary.id)
              if (!element || (element.kind !== 'text' && element.kind !== 'number')) throw new Error('The primary text is no longer available.')
              return element.text === text ? current : { ...current, visualElements: current.visualElements.map(item => item === element ? { ...item, text } : item) }
            }, group)} /> : <p>This shot has no primary text element.</p>}
          <ShotTextField label="Continuity from previous shot" value={shot.continuity?.previous ?? ''}
            onEdit={(text, group) => editContinuity('previous', text, group)} />
          <ShotTextField label="Continuity to next shot" value={shot.continuity?.next ?? ''}
            onEdit={(text, group) => editContinuity('next', text, group)} />
        </section>
        <section className="video-panel director-fields" aria-label="Director media">
          <header className="video-panel-head"><h3><Image size={17} /> Shot media</h3></header>
          {assetsFailed && <p className="video-notice video-error" role="alert">Could not read project media.</p>}
          {!visualAssets.length && <p>Import an image or video in Project media to use it in a shot.</p>}
          <label className="field"><span>Project image or video</span>
            <select aria-label="Project image or video" value={selectedAsset?.id ?? ''} onChange={event => setAssetId(event.target.value)}>
              <option value="">Choose project media</option>
              {visualAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Layer placement</span>
            <select aria-label="Layer placement" value={placement} onChange={event => setPlacement(event.target.value as LayerPlacement)}>
              {Object.entries(layerPlacements).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="video-actions">
            <button type="button" className="button secondary" disabled={!selectedAsset || saving} onClick={addLayer}>
              <Plus size={15} /> Add media layer
            </button>
          </div>
          {noticeFor('media')}
          {!!shot.mediaLayers?.length && <ul className="director-layer-list">
            {shot.mediaLayers.map(layer => <li key={layer.id}>{plan.assets.find(asset => asset.id === layer.assetId)?.description || layer.assetId}</li>)}
          </ul>}
        </section>
        <section className="video-panel director-fields" aria-label="Director narration">
          <header className="video-panel-head"><h3><AudioLines size={17} /> Narration</h3></header>
          {narrationName && <p>{narrationName}</p>}
          <label className="field"><span>Narration origin</span>
            <select aria-label="Narration origin" value={origin} disabled={importing} onChange={event => setOrigin(event.target.value as NarrationOrigin)}>
              {Object.entries(narrationOrigins).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="field"><span>Import narration (WAV, MP3, M4A)</span>
            <input type="file" accept=".wav,.mp3,.m4a" disabled={importing || saving} onChange={event => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) void importNarration(file)
            }} />
          </label>
          {importing && <p role="status">Reading narration…</p>}
          {noticeFor('narration')}
        </section>
      </div>
    </div>
  </section>
}

export function DirectorWorkspace(props: WorkspaceProps) {
  return props.project.direction ? <PlanEditor {...props} plan={props.project.direction} /> : <DirectorSetup {...props} />
}
