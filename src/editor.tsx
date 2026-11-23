import { liveQuery } from 'dexie'
import { Archive, ArchiveRestore, ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Copy, Crosshair, FileText, FolderOpen, Grid2X2, Image, LayoutPanelLeft, Maximize, Minus, Pause, Pencil, Play, Plus, Redo2, Scan, Trash2, Undo2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import {
  addScene as appendScene, addShot as appendShot, editScene as patchScene, editShot as patchShot,
  moved, removeScene, removeShot as deleteShot,
} from './core/project-edit'
import { history } from './db'
import type { Annotation, CanvasTool } from './annotation-model'
import { ExportMenu } from './export-menu'
import { PaneResize, usePanelSize } from './editor-sizing'
import { CanvasToolbar, LayerPanel, PanelTabs } from './layers'
import { Timeline } from './timeline'
import { InspectorFields, ScriptPanel, ShotPanel } from './editor-fields'
import { useAssets, useBlobURL } from './media'
import { MediaPanel } from './media-panel'
import { clock, defaultCrop, durationOf, frames, newScene, newShot, number, type Asset, type Crop, type Frame, type Project, type Scene, type Shot } from './model'
import { Monitor } from './monitor'
import type { Tab } from './route'
import { IconButton, Modal, enter, leave, timing, useMenuDismiss, visible } from './ui'
import { displayVersion } from '../release.json'

const tabs = [
  { id: 'board', label: '分镜', icon: LayoutPanelLeft },
  { id: 'script', label: '剧本', icon: FileText },
  { id: 'shots', label: '镜头', icon: Clapperboard },
  { id: 'media', label: '素材', icon: Image },
  { id: 'preview', label: '预演', icon: Play },
] as const

type UpdateOptions = { group?: string; imported?: Asset[] }

function savedSelection(projectId: string) {
  try { return sessionStorage.getItem('frameos-shot:' + projectId) ?? undefined }
  catch { return undefined }
}

export default function Editor({ project, tab, saving, error, onUpdate, onRestore, onArchive, onRename, onDuplicate, onDelete }: {
  project: Project
  tab: Tab
  saving: boolean
  error: boolean
  onUpdate: (change: (current: Project) => Project, options?: UpdateOptions) => Promise<boolean>
  onRestore: (direction: 'undo' | 'redo') => Promise<boolean>
  onArchive: () => void
  onRename: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const [selected, setSelected] = useState(() => savedSelection(project.id) ?? project.shots[0]?.id)
  const [selectedScene, setSelectedScene] = useState(project.scenes[0]?.id)
  const [deletingScene, setDeletingScene] = useState<Scene>()
  const [inspector, setInspector] = useState(true)
  const [dock, setDock] = useState<'shot' | 'layers'>('shot')
  const [inspectorWidth, setInspectorWidth] = usePanelSize('frameos-inspector-width', 302)
  const [timelineHeight, setTimelineHeight] = usePanelSize('frameos-timeline-height', 202)
  const [resizing, setResizing] = useState(false)
  const [canvasTool, setCanvasTool] = useState<CanvasTool>('crop')
  const [layerSelection, setLayerSelection] = useState<{ shotId: string; id: string }>()
  const [options, setOptions] = useState(false)
  const projectMenu = useMenuDismiss(options, setOptions)
  const [grid, setGrid] = useState(true)
  const [safe, setSafe] = useState(false)
  const [center, setCenter] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(false)
  const [available, setAvailable] = useState({ undo: false, redo: false })
  const [draft, setDraft] = useState<{ shotId: string; crop: Crop }>()
  const [elapsed, setElapsed] = useState(0)
  const cursor = useRef(0)
  const { items, error: assetReadError } = useAssets(project.id)
  const itemById = new Map(items.map(item => [item.id, item]))

  const index = Math.max(0, project.shots.findIndex(shot => shot.id === selected))
  const shot = project.shots[index]
  const layers = shot?.annotations ?? []
  const activeLayer = layerSelection?.shotId === shot?.id ? layers.find(item => item.id === layerSelection?.id) : undefined
  const scene = project.scenes.find(item => item.id === selectedScene) ?? project.scenes[0]
  const asset = shot?.assetId ? itemById.get(shot.assetId) : undefined
  const poster = shot?.posterId ? itemById.get(shot.posterId) : undefined
  const posterURL = useBlobURL(poster?.blob ?? (asset?.kind === 'image' ? asset.blob : asset?.thumbnail))
  const movieURL = useBlobURL(asset?.kind === 'video' ? asset.blob : undefined)
  const picture = posterURL ?? shot?.media
  const hasPicture = !!(asset || shot?.media)
  const total = durationOf(project.shots)
  const start = durationOf(project.shots.slice(0, index))
  const shotElapsed = Math.min(elapsed, shot?.duration ?? 0)
  const position = Math.min(shotElapsed + start, total)
  const board = tab === 'board' || tab === 'preview'
  const crop = draft && draft.shotId === shot?.id ? draft.crop : (shot?.crop ?? defaultCrop)

  useEffect(() => {
    const subscription = liveQuery(() => history.get(project.id)).subscribe({
      next: item => setAvailable({ undo: !!item?.past.length, redo: !!item?.future.length }),
      error: () => setAvailable({ undo: false, redo: false }),
    })
    return () => subscription.unsubscribe()
  }, [project.id])

  useEffect(() => {
    if (!playing && selected) {
      try { sessionStorage.setItem('frameos-shot:' + project.id, selected) } catch { /* Selection is optional. */ }
    }
  }, [project.id, playing, selected])

  useEffect(() => {
    if (!playing) return
    if (!project.shots.length) {
      setPlaying(false)
      return
    }
    const origin = performance.now() - cursor.current * 1000
    let token = 0
    const advance = (now: number) => {
      const time = (now - origin) / 1000
      cursor.current = loop ? time % total : Math.min(time, total)
      let remaining = cursor.current
      const last = project.shots[project.shots.length - 1]
      const item = project.shots.find(shot => {
        if (remaining < shot.duration) return true
        remaining -= shot.duration
        return false
      })
      setSelected((item ?? last).id)
      setElapsed(item ? remaining : last.duration)
      if (!loop && time >= total) setPlaying(false)
      else token = requestAnimationFrame(advance)
    }
    token = requestAnimationFrame(advance)
    return () => cancelAnimationFrame(token)
  }, [playing, project.shots, total, loop])

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (event.altKey || saving) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input,textarea,select,[contenteditable=true],[role=dialog]')) return
      if (event.key === 'Delete' && tab === 'board' && activeLayer && !activeLayer.locked) {
        event.preventDefault()
        deleteLayer(activeLayer.id)
        return
      }
      if (!event.ctrlKey && !event.metaKey) return
      const key = event.key.toLowerCase()
      const command = key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : key === 'y' ? 'redo' : undefined
      if (!command || !available[command]) return
      event.preventDefault()
      setPlaying(false)
      setDraft(undefined)
      void onRestore(command)
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [available, onRestore, saving, activeLayer, tab])

  function selectShot(id: string, time = 0) {
    setPlaying(false)
    setDraft(undefined)
    setSelected(id)
    setElapsed(time)
  }

  function seek(time: number) {
    let remaining = time
    const target = project.shots.find(item => {
      if (remaining < item.duration) return true
      remaining -= item.duration
      return false
    })
    if (target) selectShot(target.id, remaining)
    else if (project.shots.length) {
      const last = project.shots[project.shots.length - 1]
      selectShot(last.id, last.duration)
    }
  }

  function editShot(id: string, patch: Partial<Shot>, group?: string) {
    const duration = patch.duration
    if (duration !== undefined && id === shot?.id) {
      setPlaying(false)
      setElapsed(value => Math.min(value, Math.max(0, duration - 0.01)))
    }
    return onUpdate(current => {
      const original = current.shots.find(item => item.id === id)
      if (!original) return current
      const next = patch.sceneId && !current.scenes.some(item => item.id === patch.sceneId) ? { ...patch, sceneId: '' } : patch
      const unchanged = Object.keys(next).every(raw => {
        const key = raw as keyof Shot
        if (key !== 'crop') return original[key] === next[key]
        const before = original.crop ?? defaultCrop
        const after = next.crop ?? defaultCrop
        return before.x === after.x && before.y === after.y && before.zoom === after.zoom
      })
      if (unchanged) return current
      return patchShot(current, id, next)
    }, { group })
  }

  function changeLayers(edit: (items: Annotation[]) => Annotation[], group?: string) {
    if (!shot) return Promise.resolve(false)
    return onUpdate(current => {
      const target = current.shots.find(item => item.id === shot.id)
      if (!target) return current
      const previous = target.annotations ?? []
      const next = edit(previous)
      if (previous === next) return current
      return { ...current, shots: current.shots.map(item => item.id === target.id ? { ...item, annotations: next } : item) }
    }, { group })
  }

  function selectLayer(id?: string) {
    if (!id || !shot) {
      setLayerSelection(undefined)
      return
    }
    setLayerSelection({ shotId: shot.id, id })
    setDock('layers')
    setCanvasTool('select')
  }

  function createLayer(item: Annotation) {
    setPlaying(false)
    setInspector(true)
    selectLayer(item.id)
    void changeLayers(items => [...items, item])
  }

  function editLayer(id: string, patch: Partial<Annotation>, group?: string) {
    void changeLayers(items => {
      const target = items.find(item => item.id === id)
      if (!target) return items
      if (target.locked && (patch.x !== undefined || patch.y !== undefined || patch.scaleX !== undefined || patch.scaleY !== undefined)) return items
      if (Object.keys(patch).every(key => target[key as keyof Annotation] === patch[key as keyof Annotation])) return items
      return items.map(item => item.id === id ? { ...item, ...patch } : item)
    }, group)
  }

  function deleteLayer(id: string) {
    void changeLayers(items => items.filter(item => item.id !== id || item.locked))
  }

  async function changeCrop(value: Crop, commit: boolean) {
    if (!shot) return
    if (!commit) {
      setDraft({ shotId: shot.id, crop: value })
      return
    }
    const previous = shot.crop ?? defaultCrop
    if (previous.zoom === value.zoom && previous.x === value.x && previous.y === value.y) {
      setDraft(undefined)
      return
    }
    setDraft({ shotId: shot.id, crop: value })
    await editShot(shot.id, { crop: value })
    setDraft(current => current?.crop === value ? undefined : current)
  }

  async function addShot() {
    const item = newShot(shot?.sceneId ?? scene?.id ?? '')
    if (await onUpdate(current => appendShot(current, {
      ...item, sceneId: current.scenes.some(scene => scene.id === item.sceneId) ? item.sceneId : '',
    }))) selectShot(item.id)
  }

  async function duplicateShot(id: string) {
    const duplicateId = crypto.randomUUID()
    if (await onUpdate(current => {
      const index = current.shots.findIndex(item => item.id === id)
      if (index < 0) return current
      const source = current.shots[index]
      const shots = [...current.shots]
      shots.splice(index + 1, 0, { ...source, id: duplicateId, title: source.title.slice(0, 113) + ' 副本', annotations: source.annotations?.map(layer => ({ ...layer, id: crypto.randomUUID() })) })
      return { ...current, shots }
    })) selectShot(duplicateId)
  }

  function sortShots(id: string, to: number) {
    setPlaying(false)
    setElapsed(0)
    return onUpdate(current => {
      const shots = moved(current.shots, id, to)
      return shots === current.shots ? current : { ...current, shots }
    })
  }

  function removeShot(id: string) {
    setPlaying(false)
    setElapsed(0)
    void onUpdate(current => deleteShot(current, id))
  }

  async function addScene() {
    const item = newScene()
    if (await onUpdate(current => appendScene(current, item))) setSelectedScene(item.id)
  }

  function sortScenes(id: string, to: number) {
    return onUpdate(current => {
      const scenes = moved(current.scenes, id, to)
      return scenes === current.scenes ? current : { ...current, scenes }
    })
  }

  async function confirmSceneRemoval(scene: Scene) {
    if (await onUpdate(current => removeScene(current, scene.id))) setDeletingScene(undefined)
  }

  function togglePlayback() {
    if (!shot) return
    if (playing) {
      setPlaying(false)
      return
    }
    cursor.current = position >= total ? 0 : position
    setPlaying(true)
  }

  function attach(id?: string, path?: string) {
    if (!shot) return Promise.resolve(false)
    if (shot.assetId === id && shot.media === path) return Promise.resolve(true)
    setDraft(undefined)
    return editShot(shot.id, { assetId: id, media: path, posterId: undefined, crop: undefined })
  }

  function saveFrame(video: Asset, frame: Asset) {
    return onUpdate(current => {
      if (!shot || !current.shots.some(item => item.id === shot.id && item.assetId === video.id)) return current
      return { ...current, shots: current.shots.map(item => item.id === shot.id ? { ...item, posterId: frame.id } : item) }
    }, { imported: [frame] })
  }

  const saveStatus = error ? '保存失败' : saving ? '正在保存' : '已保存在本地'
  const subtitle = shot && project.scenes.find(item => item.id === shot.sceneId)
  const path = '#/project/' + project.id

  return <motion.div className={'editor editor-pro ' + (resizing ? 'editor-resizing' : '')}
    style={{ '--inspector-width': inspectorWidth + 'px', '--timeline-height': timelineHeight + 'px' } as React.CSSProperties} initial={enter} animate={visible} exit={leave} transition={timing}>
    <header className="editor-header">
      <a className="back-link" href={project.archived ? '#/archive' : '#/'}><ArrowLeft size={17} /><span>项目</span></a>
      <span className="header-divider" />
      <div className="editor-title"><Clapperboard size={18} /><h1>{project.title}</h1></div>
      <div className="editor-header-right">
        <span className={'save-status ' + (error ? 'save-error' : '')} role="status"><Check size={15} /> {saveStatus}</span>
        <div className="history-buttons">
          <IconButton label="撤销" disabled={!available.undo || saving} onClick={() => {
            setPlaying(false); setDraft(undefined); void onRestore('undo')
          }}><Undo2 size={17} /></IconButton>
          <IconButton label="重做" disabled={!available.redo || saving} onClick={() => {
            setPlaying(false); setDraft(undefined); void onRestore('redo')
          }}><Redo2 size={17} /></IconButton>
        </div>
        <ExportMenu projectId={project.id} shotId={shot?.id} saving={saving} video={asset?.kind === 'video'} />
        <div ref={projectMenu} className="project-options">
          <button className="button secondary" aria-expanded={options} onClick={() => setOptions(!options)}>项目操作 <ChevronDown size={14} /></button>
          <AnimatePresence>
            {options && <motion.div className="dropdown" initial={enter} animate={visible} exit={leave} transition={timing}>
              <button onClick={() => { setOptions(false); onRename() }}><Pencil size={16} /> 重命名</button>
              <button onClick={() => { setOptions(false); onDuplicate() }}><Copy size={16} /> 复制项目</button>
              <button onClick={() => { setOptions(false); onArchive() }}>
                {project.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />} {project.archived ? '恢复项目' : '归档项目'}
              </button>
              <button className="danger-text" onClick={() => { setOptions(false); onDelete() }}><Trash2 size={16} /> 删除项目</button>
            </motion.div>}
          </AnimatePresence>
        </div>
      </div>
    </header>
    <div className="editor-body">
      <nav className="editor-rail" aria-label="编辑器">
        {tabs.map(({ id, icon: Icon, label }) => <a key={id} href={path + '/' + id} aria-current={id === tab ? 'page' : undefined}
          className={id === tab ? 'rail-active' : ''}>
          {id === tab && <motion.span className="rail-indicator" layoutId="rail-indicator" transition={timing} />}
          <Icon size={20} strokeWidth={1.7} /><span>{label}</span>
        </a>)}
        <span className="editor-version">{displayVersion}</span>
      </nav>
      <div className="editor-work">
        <div className={'workspace ' + (inspector && tab === 'board' ? 'with-inspector' : '')}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.main key={tab} className={'work-panel ' + (board ? 'board-panel' : '')} initial={enter} animate={visible} exit={leave} transition={timing}>
              {board && <>
                <section className="board-head">
                  <div><h2>{tab === 'preview' ? '动态预演' : '分镜画布'}</h2><p>{shot ? '镜头 ' + number(index) + ' / ' + (subtitle?.location ?? '未分组') : '暂无镜头'}</p></div>
                  {tab === 'board' && <div className="board-tools">
                    <IconButton label="三分线" aria-pressed={grid} onClick={() => setGrid(!grid)}><Grid2X2 size={17} /></IconButton>
                    <IconButton label="安全框" aria-pressed={safe} onClick={() => setSafe(!safe)}><Scan size={17} /></IconButton>
                    <IconButton label="中心线" aria-pressed={center} onClick={() => setCenter(!center)}><Crosshair size={17} /></IconButton>
                    <label className="frame-picker"><select aria-label="画幅" value={project.frame} onChange={event => {
                      const frame = event.target.value as Frame
                      void onUpdate(current => ({ ...current, frame }))
                    }}>{frames.map(frame => <option key={frame}>{frame}</option>)}</select><ChevronDown size={13} /></label>
                    <IconButton label="镜头属性" aria-pressed={inspector} onClick={() => setInspector(!inspector)}><LayoutPanelLeft size={17} /></IconButton>
                  </div>}
                </section>
                {tab === 'board' && <div className="canvas-tool-row">
                  <CanvasToolbar value={canvasTool} disabled={!shot} onChange={value => { setPlaying(false); setCanvasTool(value) }} />
                </div>}
                <div className="monitor">
                  <div className="monitor-label"><span><i /> {tab === 'preview' ? '序列预演' : '分镜监看'}</span><span>{project.frame}</span></div>
                  <Monitor frame={project.frame} source={picture} grid={tab === 'board' && grid} safe={tab === 'board' && safe}
                    center={tab === 'board' && center} zoom={zoom} crop={crop}
                    onCrop={tab === 'board' && !playing && hasPicture ? changeCrop : undefined}
                    annotations={layers} tool={tab === 'board' && !playing ? canvasTool : 'crop'} selected={activeLayer?.id}
                    onSelect={tab === 'board' && !playing ? selectLayer : undefined}
                    onCreate={tab === 'board' && !playing && shot ? createLayer : undefined}
                    onAnnotation={editLayer}
                    video={shot && movieURL && (tab === 'preview' || playing)
                      ? { source: movieURL, time: shotElapsed, playing, key: shot.id + movieURL } : undefined} />
                  <div className="monitor-controls">
                    <span className="timecode">{clock(position)} <em>/ {clock(total)}</em></span>
                    <div>
                      <IconButton label="上一镜头" disabled={index === 0} onClick={() => selectShot(project.shots[index - 1].id)}><ChevronLeft size={18} /></IconButton>
                      <IconButton label={playing ? '暂停' : '播放'} disabled={!shot} onClick={togglePlayback}>
                        {playing ? <Pause size={17} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                      </IconButton>
                      <IconButton label="下一镜头" disabled={index >= project.shots.length - 1} onClick={() => selectShot(project.shots[index + 1].id)}><ChevronRight size={18} /></IconButton>
                    </div>
                    <div>
                      <IconButton label="缩小画布" disabled={zoom <= 0.5} onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}><Minus size={15} /></IconButton>
                      <span className="zoom">{Math.round(zoom * 100)}%</span>
                      <IconButton label="放大画布" disabled={zoom >= 1.5} onClick={() => setZoom(Math.min(1.5, zoom + 0.1))}><Plus size={15} /></IconButton>
                      <IconButton label="适配视口" onClick={() => setZoom(1)}><Maximize size={15} /></IconButton>
                    </div>
                  </div>
                </div>
              </>}
              {tab === 'script' && <ScriptPanel scenes={project.scenes} scene={scene} onSelect={setSelectedScene} onAdd={addScene}
                onSort={sortScenes} onRemove={setDeletingScene} onUpdate={(id, patch, group) => {
                  void onUpdate(current => patchScene(current, id, patch), { group })
                }} />}
              {tab === 'shots' && <ShotPanel shots={project.shots} scenes={project.scenes} selected={shot?.id} onAdd={addShot}
                onSelect={selectShot} onSort={sortShots} onCopy={duplicateShot} onRemove={removeShot} path={path} />}
              {tab === 'media' && <MediaPanel projectId={project.id} items={items} failed={assetReadError} shot={shot}
                onSave={imported => onUpdate(current => current, { imported })}
                onAttach={item => attach(item.id)} onDemo={src => attach(undefined, src)} onFrame={saveFrame} />}
            </motion.main>
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {tab === 'board' && inspector && <motion.aside className="inspector" key="inspector" initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={timing}>
              <PaneResize axis="x" label="调整属性面板宽度" value={inspectorWidth} min={280} max={380}
                onChange={setInspectorWidth} onResize={setResizing} />
              <div className="inspector-head"><div><h2>属性面板</h2><p>{shot ? '镜头 ' + number(index) : '暂无镜头'}</p></div>
                <IconButton label="折叠镜头属性" onClick={() => setInspector(false)}><ChevronRight size={18} /></IconButton></div>
              <PanelTabs value={dock} onChange={value => { setDock(value); if (value === 'layers') setCanvasTool('select') }} />
              <AnimatePresence initial={false} mode="wait">
                {shot && dock === 'layers' ? <LayerPanel key={shot.id + '-layers'} items={layers} selected={activeLayer?.id}
                  onSelect={selectLayer} onEdit={editLayer} onDelete={deleteLayer}
                  onSort={(id, to) => changeLayers(items => moved(items, id, to))} />
                  : shot ? <InspectorFields key={shot.id} shot={shot} scenes={project.scenes} visual={hasPicture} crop={crop} onCrop={changeCrop}
                  onMedia={path + '/media'} onEdit={(patch, group) => { void editShot(shot.id, patch, group) }}
                  onCopy={() => { void duplicateShot(shot.id) }} onRemove={() => removeShot(shot.id)} />
                  : <motion.div key="empty" className="empty" initial={enter} animate={visible} exit={leave}>
                    <FolderOpen size={24} /><button className="button secondary" onClick={addShot}>添加镜头</button>
                  </motion.div>}
              </AnimatePresence>
            </motion.aside>}
          </AnimatePresence>
        </div>
        <Timeline shots={project.shots} selected={shot?.id} time={position} loop={loop} height={timelineHeight}
          assets={itemById} onHeight={setTimelineHeight} onResize={setResizing} onLoop={() => setLoop(!loop)}
          onAdd={addShot} onSelect={selectShot} onSeek={seek} onSort={sortShots} />
      </div>
    </div>
    <Modal open={!!deletingScene} title="删除场景" description="关联镜头会转为未分组。你可以撤销此操作。"
      onClose={() => setDeletingScene(undefined)}>
      <div className="modal-actions">
        <button className="button secondary" onClick={() => setDeletingScene(undefined)}>取消</button>
        <button className="button danger" disabled={saving} onClick={() => { if (deletingScene) void confirmSceneRemoval(deletingScene) }}>确认删除场景</button>
      </div>
    </Modal>
  </motion.div>
}





