import { Captions, Eye, EyeOff, Film, Plus, Terminal, Type, Upload, Volume2, VolumeX } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { acceptsVideoAsset, videoTimelineSchema } from './core/video-schema'
import { allowedFiles, demoVideos, prepareAsset, prepareDemoVideo } from './media'
import type { Asset, Project } from './model'
import { IconButton, enter, timing, visible } from './ui'
import { ClipInspector, splitVideoClip, SubtitleInspector } from './video-inspector'
import {
  applyVideoTemplate, clipEndFrame, frameToSeconds, secondsToFrame, timelineDurationFrames, videoTemplateIds,
  videoTrackKinds, type SubtitleCue, type VideoClip, type VideoTemplateId, type VideoTimeline, type VideoTrack, type VideoTrackKind,
} from './video-model'
import { VideoPreview } from './video-preview'
import { parseSRT, parseVTT } from './video-subtitles'

const trackLabels: Record<VideoTrackKind, string> = {
  'main-video': 'Main video', 'b-roll': 'B-roll', voice: 'Voice', music: 'Music', captions: 'Captions', graphics: 'Graphics',
}
const templateLabels: Record<VideoTemplateId, string> = {
  'talking-head': 'Talking head', educational: 'Educational', 'short-form': 'Short form',
  documentary: 'Documentary', 'cinematic-title': 'Cinematic title',
}
const renderCommand = 'shotweft video render project.zip --output final.mp4'

type UpdateProject = (change: (current: Project) => Project, options?: { group?: string; imported?: Asset[] }) => Promise<boolean>
type Selection = { type: 'clip' | 'cue'; id: string; trackId: string }
type Block = Omit<Selection, 'trackId'> & { startFrame: number; endFrame: number; label: string }

function defaultTracks() {
  return videoTrackKinds.map((kind): VideoTrack => ({
    id: crypto.randomUUID(), kind, label: trackLabels[kind], muted: false, visible: true, clips: [],
  }))
}

function withEditingTracks(timeline: VideoTimeline, defaults: VideoTrack[]): VideoTimeline {
  const missing = defaults.filter(track => !timeline.tracks.some(item => item.kind === track.kind))
  return missing.length ? { ...timeline, tracks: [...timeline.tracks, ...missing] } : timeline
}

function spanAt(frame: number, length: number, occupied: ReadonlyArray<{ startFrame: number; endFrame: number }>) {
  let startFrame = frame
  for (const span of [...occupied].sort((a, b) => a.startFrame - b.startFrame)) {
    if (startFrame >= span.endFrame) continue
    if (startFrame < span.startFrame) return { startFrame, endFrame: Math.min(span.startFrame, startFrame + length) }
    startFrame = span.endFrame
  }
  return { startFrame, endFrame: startFrame + length }
}

function TrackRow({ track, cues, frame, extent, selection, disabled, onSelect, onToggle, onSeek }: {
  track: VideoTrack; cues: SubtitleCue[]; frame: number; extent: number; selection?: Selection; disabled: boolean
  onSelect: (block: Block, trackId: string) => void; onToggle: (key: 'muted' | 'visible') => void; onSeek: (frame: number) => void
}) {
  const blocks: Block[] = track.kind === 'captions'
    ? cues.filter(cue => cue.trackId === track.id).map(cue => ({ ...cue, label: cue.text || 'Subtitle', type: 'cue' }))
    : track.clips.map(clip => ({ ...clip, label: clip.label || 'Untitled clip', endFrame: clipEndFrame(clip), type: 'clip' }))
  const lanes: number[] = []
  const placed = blocks.sort((a, b) => a.startFrame - b.startFrame).map(block => {
    const free = lanes.findIndex(end => end <= block.startFrame)
    const lane = free < 0 ? lanes.length : free
    lanes[lane] = block.endFrame
    return { block, lane }
  })
  const label = track.label || trackLabels[track.kind]

  return <section className="video-track-row" aria-label={label} data-track-kind={track.kind}>
    <header>
      <strong title={label}>{label}</strong>
      <div>
        <IconButton label={(track.muted ? 'Unmute ' : 'Mute ') + label} aria-pressed={track.muted}
          disabled={disabled} onClick={() => onToggle('muted')}>{track.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</IconButton>
        <IconButton label={(track.visible ? 'Hide ' : 'Show ') + label} aria-pressed={!track.visible}
          disabled={disabled} onClick={() => onToggle('visible')}>{track.visible ? <Eye size={15} /> : <EyeOff size={15} />}</IconButton>
      </div>
    </header>
    <div className="video-track-lane" style={{ minHeight: Math.max(1, lanes.length) * 28 + 6 }}
      data-hidden={!track.visible} onClick={event => {
        if (event.target !== event.currentTarget) return
        const box = event.currentTarget.getBoundingClientRect()
        onSeek(Math.floor((event.clientX - box.left) / box.width * extent))
      }}>
      {!blocks.length && <span className="video-track-empty">Empty</span>}
      {placed.map(({ block, lane }) => <button key={block.id} type="button" className="video-block"
        data-start-frame={block.startFrame} data-end-frame={block.endFrame}
        style={{ left: block.startFrame / extent * 100 + '%', width: (block.endFrame - block.startFrame) / extent * 100 + '%', top: 3 + lane * 28 }}
        aria-pressed={selection?.id === block.id && selection.type === block.type && selection.trackId === track.id}
        title={block.label + ' · frames ' + block.startFrame + '–' + (block.endFrame - 1)}
        onClick={() => onSelect(block, track.id)}>{block.label}</button>)}
      <span className="video-playhead" style={{ left: frame / extent * 100 + '%' }} />
    </div>
  </section>
}

function RenderPanel() {
  return <section className="video-panel video-render">
    <header className="video-panel-head"><h3><Terminal size={16} /> Render with CLI</h3></header>
    <p>Export a project ZIP and run this command with a compatible local FFmpeg and ffprobe build.</p>
    <pre><code>{renderCommand}</code></pre>
  </section>
}

function TimelineEditor({ video, projectId, assets, assetsFailed, saving, onUpdate }: {
  video: VideoTimeline; projectId: string; assets: Asset[]; assetsFailed: boolean; saving: boolean; onUpdate: UpdateProject
}) {
  const [defaults] = useState(defaultTracks)
  const timeline = withEditingTracks(video, defaults)
  const [position, setPosition] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [selected, setSelected] = useState<Selection>()
  const [mediaTrackId, setMediaTrackId] = useState('')
  const [subtitleTrackId, setSubtitleTrackId] = useState('')
  const [assetId, setAssetId] = useState('')
  const [demoPath, setDemoPath] = useState(demoVideos[0].path)
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState('')
  const [importNotice, setImportNotice] = useState('')
  const files = useRef<HTMLInputElement>(null)
  const captions = useRef<HTMLInputElement>(null)
  const anchor = useRef(0)
  const items = new Map(assets.map(asset => [asset.id, asset]))
  const { fps } = timeline
  const { numerator, denominator } = fps
  const duration = timelineDurationFrames(timeline)
  const frame = Math.min(position, Math.max(0, duration - 1))
  const extent = Math.max(duration, secondsToFrame(4, fps))
  const mediaTracks = timeline.tracks.filter(track => track.kind !== 'captions')
  const mediaTrack = mediaTracks.find(track => track.id === mediaTrackId) ?? mediaTracks[0]
  const captionTracks = timeline.tracks.filter(track => track.kind === 'captions')
  const captionTrack = captionTracks.find(track => track.id === subtitleTrackId) ?? captionTracks[0]
  const graphicTrack = timeline.tracks.find(track => track.kind === 'graphics')
  const compatible = mediaTrack ? assets.filter(asset => acceptsVideoAsset(mediaTrack.kind, asset.kind)) : []
  const mediaAsset = compatible.find(asset => asset.id === assetId)
  const selectedTrack = timeline.tracks.find(track => track.id === selected?.trackId)
  const clip = selected?.type === 'clip' ? selectedTrack?.clips.find(item => item.id === selected.id) : undefined
  const cue = selected?.type === 'cue' ? timeline.subtitles.find(item => item.id === selected.id) : undefined
  const timed = !!clip && (items.get(clip.assetId ?? '')?.kind === 'video' || clip.sourceInFrame !== undefined || clip.sourceOutFrame !== undefined)

  useEffect(() => {
    if (!playing || !duration) return
    const start = Math.min(anchor.current, duration - 1)
    const step = frameToSeconds(1, { numerator, denominator }) * 1000
    const origin = performance.now()
    let token = 0
    const tick = (now: number) => {
      const next = start + Math.floor((now - origin) / step)
      setPosition(Math.min(next, duration - 1))
      if (next >= duration) setPlaying(false)
      else token = requestAnimationFrame(tick)
    }
    token = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(token)
  }, [playing, duration, numerator, denominator])

  useEffect(() => {
    setPlaying(false)
    setPosition(previous => Math.min(previous, Math.max(0, duration - 1)))
  }, [video, duration])

  function seek(next: number) {
    setPlaying(false)
    setPosition(Math.min(Math.max(0, next), Math.max(0, duration - 1)))
  }

  async function update(change: (timeline: VideoTimeline) => VideoTimeline, group?: string) {
    setPlaying(false)
    setNotice('')
    let issue = ''
    let changed = false
    const saved = await onUpdate(current => {
      if (!current.video) return current
      const before = withEditingTracks(current.video, defaults)
      let next: VideoTimeline
      try {
        next = change(before)
      } catch (error) {
        issue = error instanceof Error ? error.message : 'Could not edit video.'
        return current
      }
      if (next === before) return current
      const validated = videoTimelineSchema.safeParse(next)
      if (!validated.success) {
        issue = validated.error.issues[0].message
        return current
      }
      changed = true
      return { ...current, video: next }
    }, { group })
    if (!saved || issue) setNotice(issue || 'Could not save the video edit.')
    return saved && changed
  }

  function editTrack(trackId: string, change: (track: VideoTrack, timeline: VideoTimeline) => VideoTrack, group?: string) {
    return update(current => {
      const original = current.tracks.find(track => track.id === trackId)
      if (!original) return current
      const next = change(original, current)
      return next === original ? current : { ...current, tracks: current.tracks.map(track => track === original ? next : track) }
    }, group)
  }

  function selectBlock(block: Block, trackId: string) {
    setSelected({ type: block.type, id: block.id, trackId })
    setNotice('')
    if (frame < block.startFrame || frame >= block.endFrame) seek(block.startFrame)
  }

  async function appendClip(trackId: string, label: string, asset?: Asset, graphic?: VideoClip['graphic']) {
    const id = crypto.randomUUID()
    let start = frame
    const saved = await editTrack(trackId, (track, { fps }) => {
      if (asset && !acceptsVideoAsset(track.kind, asset.kind)) throw new Error('This asset is incompatible with the selected track.')
      const isTimed = asset?.kind === 'video'
      const sourceLength = isTimed && asset.duration !== undefined ? Math.floor(asset.duration / frameToSeconds(1, fps)) : undefined
      if (sourceLength !== undefined && sourceLength < 1) throw new Error('This video is shorter than one timeline frame.')
      const length = Math.min(secondsToFrame(3, fps), sourceLength ?? Infinity)
      const occupied = track.kind === 'voice' || track.kind === 'music' ? [] :
        track.clips.map(item => ({ startFrame: item.startFrame, endFrame: clipEndFrame(item) }))
      const { startFrame, endFrame } = spanAt(frame, length, occupied)
      start = startFrame
      return { ...track, clips: [...track.clips, {
        id, label, startFrame, durationFrames: endFrame - startFrame, ...(asset && { assetId: asset.id }),
        ...(isTimed && { sourceInFrame: 0, sourceOutFrame: endFrame - startFrame }),
        ...(graphic && { graphic }), volume: 1, muted: false,
      }] }
    })
    if (saved) {
      setSelected({ type: 'clip', id, trackId })
      setPosition(start)
    }
  }

  function addGraphic(lowerThird: boolean) {
    if (!graphicTrack) return
    const label = lowerThird ? 'Lower third' : 'Title'
    void appendClip(graphicTrack.id, label, undefined, {
      kind: 'text', text: lowerThird ? 'Name · Role' : 'Your title',
      x: 0.08, y: lowerThird ? 0.72 : 0.39, width: 0.84, height: 0.2, opacity: 1,
      fontSize: Math.round(timeline.width * (lowerThird ? 0.034 : 0.05)), color: '#ffffff',
      align: lowerThird ? 'left' : 'center',
    })
  }

  function editClip(change: (item: VideoClip) => VideoClip, group?: string) {
    if (!clip || !selectedTrack) return
    void editTrack(selectedTrack.id, (track, { fps }) => ({ ...track, clips: track.clips.map(item => {
      if (item.id !== clip.id) return item
      const next = change(item)
      const asset = items.get(item.assetId ?? '')
      const beforeEnd = (item.sourceInFrame ?? 0) + item.durationFrames
      const afterEnd = (next.sourceInFrame ?? 0) + next.durationFrames
      if (asset?.kind === 'video' && asset.duration !== undefined && afterEnd > beforeEnd &&
        frameToSeconds(afterEnd, fps) > asset.duration) throw new Error('Source out exceeds the video duration.')
      return next
    }) }), group)
  }

  async function splitClip() {
    if (!clip || !selectedTrack) return
    const trackId = selectedTrack.id
    const rightId = crypto.randomUUID()
    let split = false
    const saved = await editTrack(trackId, track => {
      const current = track.clips.find(item => item.id === clip.id)
      if (!current || frame <= current.startFrame || frame >= clipEndFrame(current)) return track
      split = true
      return { ...track, clips: track.clips.flatMap(item =>
        item.id === clip.id ? splitVideoClip(item, frame, rightId, timed) : [item]) }
    })
    if (saved && split) setSelected({ type: 'clip', id: rightId, trackId })
  }

  async function newCue() {
    if (!captionTrack) return
    const trackId = captionTrack.id
    const id = crypto.randomUUID()
    let start = frame
    const saved = await update(current => {
      if (!current.tracks.some(track => track.id === trackId)) return current
      const span = spanAt(frame, secondsToFrame(2, current.fps), current.subtitles.filter(item => item.trackId === trackId))
      start = span.startFrame
      return { ...current, subtitles: [...current.subtitles, { id, trackId, ...span, text: 'New subtitle' }] }
    })
    if (saved) {
      setPosition(start)
      setSelected({ type: 'cue', trackId, id })
    }
  }

  async function importSubtitles(file: File) {
    if (!captionTrack) return
    const trackId = captionTrack.id
    try {
      const text = await file.text()
      const parse = file.name.toLowerCase().endsWith('.vtt') ? parseVTT : parseSRT
      await update(current => {
        if (!current.tracks.some(track => track.id === trackId)) return current
        const cues = parse(text, trackId, current.fps)
        if (!cues.length) throw new Error('The subtitle file contains no cues.')
        return { ...current, subtitles: [...current.subtitles, ...cues] }
      })
    } catch {
      setNotice('Could not read the subtitle file.')
    }
  }

  async function importMedia(local?: File) {
    const demo = local ? undefined : demoVideos.find(item => item.path === demoPath)
    if (!local && !demo) return
    if (demo) {
      const existing = assets.find(item => item.kind === 'video' && item.source === demo.source)
      if (existing) {
        setAssetId(existing.id)
        setImportNotice('Demo video is already in Project media.')
        return
      }
    }
    setImporting(true)
    setImportNotice('')
    try {
      const asset = demo ? await prepareDemoVideo(demo, projectId, demo.englishName) : local && await prepareAsset(local, projectId)
      if (!asset) return
      if (!await onUpdate(current => current, { imported: [asset] })) throw new Error('Could not save media')
      setAssetId(asset.id)
      setImportNotice('Imported ' + asset.name)
    } catch {
      setImportNotice('Could not import this media. Choose a valid image or a browser-supported video.')
    } finally {
      setImporting(false)
    }
  }

  return <motion.div className="video-layout" initial={enter} animate={visible} transition={timing}>
    <VideoPreview timeline={timeline} assets={items} frame={frame} duration={duration} playing={playing} onSeek={seek}
      onPlay={() => {
        anchor.current = frame >= duration - 1 ? 0 : frame
        setPlaying(value => !value)
      }} />
    <section className="video-panel video-library" aria-label="Project media">
      <header className="video-panel-head"><h3>Project media</h3></header>
      {assetsFailed && <p className="video-notice" role="alert">Could not load project media.</p>}
      <div className="video-field-grid">
        <label className="field"><span>Destination track</span>
          <select aria-label="Destination track" value={mediaTrack?.id ?? ''} onChange={event => setMediaTrackId(event.currentTarget.value)}>
            {mediaTracks.map(track => <option key={track.id} value={track.id}>{track.label || trackLabels[track.kind]}</option>)}
          </select>
        </label>
        <label className="field"><span>Media asset</span>
          <select aria-label="Media asset" value={mediaAsset?.id ?? ''} onChange={event => setAssetId(event.currentTarget.value)}>
            <option value="">{compatible.length ? 'Choose an asset' : 'No compatible media'}</option>
            {compatible.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select>
        </label>
      </div>
      <div className="video-actions">
        <button className="button primary" disabled={!mediaAsset || !mediaTrack || saving}
          onClick={() => { if (mediaAsset && mediaTrack) void appendClip(mediaTrack.id, mediaAsset.name, mediaAsset) }}><Plus size={16} /> Add media clip</button>
        <button className="button secondary" disabled={importing || saving} onClick={() => files.current?.click()}><Upload size={15} /> Import media</button>
        <input ref={files} className="visually-hidden" tabIndex={-1} aria-label="Import media file" type="file" accept={allowedFiles}
          onChange={event => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) void importMedia(file)
          }} />
      </div>
      <label className="field"><span>Demo video</span>
        <select aria-label="Demo video" value={demoPath} onChange={event => setDemoPath(event.currentTarget.value)}>
          {demoVideos.map(demo => <option key={demo.path} value={demo.path}>{demo.englishName}</option>)}
        </select>
      </label>
      <div className="video-actions">
        <button className="button secondary" disabled={importing || saving} onClick={() => { void importMedia() }}><Film size={15} /> Import demo video</button>
      </div>
      {(importing || importNotice) && <p className="video-notice" role="status">{importing ? 'Importing media…' : importNotice}</p>}
    </section>
    <section className="video-panel video-timeline" aria-label="Video timeline">
      <header className="video-panel-head"><h3>Timeline</h3><span>{duration} frames · {frameToSeconds(duration, fps).toFixed(3)} s</span></header>
      <div className="video-actions">
        <button className="button secondary" disabled={saving} onClick={() => addGraphic(false)}><Type size={15} /> Add title</button>
        <button className="button secondary" disabled={saving} onClick={() => addGraphic(true)}><Type size={15} /> Add lower third</button>
        <button className="button secondary" disabled={saving} onClick={() => { void newCue() }}><Captions size={15} /> Add subtitle</button>
        <button className="button secondary" disabled={saving} onClick={() => captions.current?.click()}><Upload size={15} /> Import SRT/VTT</button>
        <input ref={captions} type="file" aria-label="Import subtitle file" className="visually-hidden" tabIndex={-1} accept=".srt,.vtt"
          onChange={event => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) void importSubtitles(file)
          }} />
        {captionTracks.length > 1 && <label className="field"><span>Subtitle track</span>
          <select aria-label="Subtitle track" value={captionTrack?.id ?? ''} onChange={event => setSubtitleTrackId(event.currentTarget.value)}>
            {captionTracks.map(track => <option key={track.id} value={track.id}>{track.label || trackLabels.captions}</option>)}
          </select>
        </label>}
      </div>
      {notice && <p className="video-notice video-error" role="alert">{notice}</p>}
      <div className="video-tracks">
        {timeline.tracks.map(track => <TrackRow key={track.id} track={track} cues={timeline.subtitles} frame={frame} extent={extent}
          selection={selected} disabled={saving} onSelect={selectBlock} onSeek={seek} onToggle={key => {
            void editTrack(track.id, current => ({ ...current, [key]: !current[key] }))
          }} />)}
      </div>
    </section>
    <div className="video-detail">
      {clip && selectedTrack ? <ClipInspector key={clip.id} clip={clip} frame={frame} timed={timed} disabled={saving}
        onEdit={editClip} onSplit={() => { void splitClip() }} onDelete={() => {
          void editTrack(selectedTrack.id, track => ({ ...track, clips: track.clips.filter(item => item.id !== clip.id) }))
        }} /> : cue ? <SubtitleInspector key={cue.id} cue={cue} disabled={saving}
        onEdit={(patch, group) => { void update(current => ({
          ...current, subtitles: current.subtitles.map(item => item.id === cue.id ? {
            ...item, ...patch, ...(patch.style && { style: { ...item.style, ...patch.style } }),
          } : item),
        }), group) }} onDelete={() => {
          void update(current => ({ ...current, subtitles: current.subtitles.filter(item => item.id !== cue.id) }))
        }} /> : <div className="video-panel video-empty-selection">Select a timeline clip or subtitle to edit it.</div>}
    </div>
    <RenderPanel />
  </motion.div>
}

export function VideoWorkspace({ project, assets, assetsFailed, saving, onUpdate }: {
  project: Project; assets: Asset[]; assetsFailed: boolean; saving: boolean; onUpdate: UpdateProject
}) {
  const video = project.video
  const template = video?.template?.id
  const preset = videoTemplateIds.find(id => id === template)
  return <section className="video-workspace" aria-label="Video workspace">
    <div className="video-heading"><h2><Film size={22} /> Video</h2>{preset && <span>{templateLabels[preset]}</span>}</div>
    {video ? <TimelineEditor video={video} projectId={project.id} assets={assets} assetsFailed={assetsFailed} saving={saving} onUpdate={onUpdate} />
      : <motion.div className="video-layout" initial={enter} animate={visible} transition={timing}>
        <section className="video-panel video-templates">
          <header className="video-panel-head"><h3>Choose a template</h3></header>
          <p>Start a video timeline for this project.</p>
          <div className="video-actions">
            {videoTemplateIds.map(id => <button key={id} data-template={id} type="button" className="button secondary" disabled={saving}
              onClick={() => {
                void onUpdate(current => current.video ? current : {
                  ...current, video: withEditingTracks(applyVideoTemplate(id), defaultTracks()),
                })
              }}><Film size={15} /> {templateLabels[id]}</button>)}
          </div>
        </section>
        <RenderPanel />
      </motion.div>}
  </section>
}
