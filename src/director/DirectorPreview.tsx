import { Player } from '@remotion/player'
import { useEffect, useState } from 'react'
import { compileDirectorPlan } from '../core/director/compiler'
import { Modal } from '../ui'
import { DirectorComposition } from './DirectorComposition'
export function DirectorPreview() {
  const [open, setOpen] = useState(false)
  const [compiled, setCompiled] = useState<ReturnType<typeof compileDirectorPlan>>()
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    const abort = new AbortController()
    setError('')
    void fetch('/director/demo-plan.json', { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error('Could not load the local demo plan.')
      const plan = compileDirectorPlan(await response.json())
      if (!abort.signal.aborted) setCompiled(plan)
    }).catch(failure => { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : String(failure)) })
    return () => abort.abort()
  }, [open])
  return <>
    <button className="button secondary" type="button" onClick={() => setOpen(true)}>Director demo (Remotion)</button>
    <Modal open={open} onClose={() => setOpen(false)} title="Director demo · Remotion Player"
      description="Local validation preview. Three scenes and synthetic tones, not human voice. The editable plan is public/director/demo-plan.json.">
      {error ? <p role="alert">{error}</p> : compiled ? <Player component={DirectorComposition} inputProps={{ plan: compiled.plan }} durationInFrames={compiled.durationInFrames}
        fps={compiled.fps} compositionWidth={compiled.width} compositionHeight={compiled.height}
        controls style={{ width: '100%' }} /> : <p role="status">Loading local plan…</p>}
    </Modal>
  </>
}
