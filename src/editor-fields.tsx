import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, ChevronUp, Copy, Film, GripVertical, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { defaultCrop, number, type Crop, type Scene, type Shot } from './model'
import { Sortable } from './sortable'
import { EditText, IconButton, enter, leave, timing, visible } from './ui'

export function ScriptPanel({ scenes, scene, onSelect, onAdd, onUpdate, onSort, onRemove }: {
  scenes: Scene[]
  scene?: Scene
  onSelect: (id: string) => void
  onAdd: () => void
  onUpdate: (id: string, changes: Partial<Scene>, group?: string) => void
  onSort: (id: string, to: number) => Promise<boolean>
  onRemove: (scene: Scene) => void
}) {
  const ids = scenes.map(item => item.id)
  return <section className="document-panel">
    <div className="section-heading"><div><h2>剧本与场景</h2><p>{scenes.length} 个场景</p></div>
      <button className="button primary" onClick={onAdd}><Plus size={17} /> 添加场景</button></div>
    <div className="script-layout">
      <Sortable ids={ids} axis="y" label="场景" className="scene-list" onSort={onSort} render={(id, handle) => {
        const item = scenes.find(item => item.id === id)!
        return <div className={'scene-list-row ' + (id === scene?.id ? 'selected' : '')}>{handle}
          <button className="scene-select" data-scene-id={id} onClick={() => onSelect(id)} aria-pressed={id === scene?.id}>
            <span>{number(ids.indexOf(id))}</span><strong>{item.location}</strong>
          </button>
        </div>
      }} />
      <AnimatePresence initial={false} mode="wait">
        {scene
          ? <motion.div key={scene.id} data-scene-id={scene.id} className="scene-form" initial={enter} animate={visible} exit={leave} transition={timing}>
            <div className="section-heading"><h3>场景属性</h3>
              <IconButton label="删除场景" className="danger-text" onClick={() => onRemove(scene)}><Trash2 size={16} /></IconButton></div>
            <div className="form-grid">
              <label className="field"><span>内景 / 外景</span><select value={scene.setting} onChange={event => {
                onUpdate(scene.id, { setting: event.target.value as Scene['setting'] })
              }}><option>外景</option><option>内景</option></select></label>
              {([['location', '地点'], ['time', '时间'], ['description', '剧情'], ['dialogue', '对白'], ['notes', '场景备注']] as const)
                .map(([field, label], i) => <EditText key={field} value={scene[field]} label={label} required={i < 2} multiline={i >= 2}
                  onCommit={(value, group) => onUpdate(scene.id, { [field]: value }, group)} />)}
            </div>
          </motion.div>
          : <motion.div key="empty" className="empty scene-form" initial={enter} animate={visible} exit={leave}><Film size={24} /><h3>添加场景开始编辑剧本</h3></motion.div>}
      </AnimatePresence>
    </div>
  </section>
}

export function ShotPanel({ shots, scenes, selected, onSelect, onAdd, onSort, onCopy, onRemove, path }: {
  shots: Shot[]
  scenes: Scene[]
  selected?: string
  onSelect: (id: string) => void
  onAdd: () => void
  onSort: (id: string, to: number) => Promise<boolean>
  onCopy: (id: string) => void
  onRemove: (id: string) => void
  path: string
}) {
  const [query, setQuery] = useState('')
  const [sceneFilter, setSceneFilter] = useState('')
  const filter = scenes.some(scene => scene.id === sceneFilter) ? sceneFilter : ''
  const searching = !!(query.trim() || filter)
  const ids = shots.filter((item, i) => {
    const text = [number(i), item.title, item.lens, item.size, item.angle, item.movement, item.notes].join(' ').toLowerCase()
    return (!filter || item.sceneId === filter) && text.includes(query.trim().toLowerCase())
  }).map(item => item.id)
  return <section className="document-panel">
    <div className="section-heading"><div><h2>镜头列表</h2><p>{shots.length} 个镜头</p></div>
      <button className="button primary" onClick={onAdd}><Plus size={17} /> 添加镜头</button></div>
    <div className="shot-filters">
      <input aria-label="搜索镜头" placeholder="搜索编号、镜头名称或焦距" value={query} onChange={event => setQuery(event.target.value)} />
      <select aria-label="按场景筛选" value={filter} onChange={event => setSceneFilter(event.target.value)}>
        <option value="">全部场景</option>
        {scenes.map(item => <option key={item.id} value={item.id}>{item.location}</option>)}
      </select>
    </div>
    {!ids.length && <div className="empty"><Film size={26} /><h3>暂无匹配的镜头</h3></div>}
    {!!ids.length && <div className="shot-row shot-table-header"><span>编号</span><span>镜头名称</span><span>景别</span><span>焦距</span><span>时长</span><span>操作</span></div>}
    <Sortable ids={ids} axis="y" label="镜头" className="shot-list" disabled={searching} onSort={onSort} render={(id, handle) => {
      const i = shots.findIndex(item => item.id === id)
      const item = shots[i]
      return <div className={'shot-row ' + (item.id === selected ? 'row-active' : '')}>
        <div className="shot-index">{searching ? <GripVertical size={14} /> : handle}<span>{number(i)}</span></div>
        <a href={path + '/board'} onClick={() => onSelect(id)}>{item.title}</a>
        <span>{item.size}</span><span>{item.lens}</span><span>{item.duration} 秒</span>
        <div className="row-actions">
          <IconButton label={'上移镜头 ' + number(i)} disabled={i === 0} onClick={() => { void onSort(id, i - 1) }}><ChevronUp size={16} /></IconButton>
          <IconButton label={'下移镜头 ' + number(i)} disabled={i === shots.length - 1} onClick={() => { void onSort(id, i + 1) }}><ChevronDown size={16} /></IconButton>
          <IconButton label={'复制镜头 ' + number(i)} onClick={() => onCopy(id)}><Copy size={15} /></IconButton>
          <IconButton label={'删除镜头 ' + number(i)} className="danger-text" onClick={() => onRemove(id)}><Trash2 size={15} /></IconButton>
        </div>
      </div>
    }} />
  </section>
}

export function InspectorFields({ shot, scenes, crop, onCrop, onEdit, onCopy, onRemove, visual, onMedia }: {
  shot: Shot
  scenes: Scene[]
  crop: Crop
  onCrop: (crop: Crop, commit: boolean) => void
  onEdit: (patch: Partial<Shot>, group?: string) => void
  onCopy: () => void
  onRemove: () => void
  onMedia: string
  visual: boolean
}) {
  return <motion.div className="inspector-fields" data-shot-id={shot.id} initial={enter} animate={visible} exit={leave} transition={timing}>
    <EditText label="镜头名称" required value={shot.title} onCommit={(title, group) => onEdit({ title }, group)} />
    <label className="field"><span>所属场景</span><select value={shot.sceneId} onChange={event => onEdit({ sceneId: event.target.value })}>
      <option value="">未分组</option>
      {scenes.map(item => <option key={item.id} value={item.id}>{item.location}</option>)}
    </select></label>
    <div className="inspector-grid">
      {([['size', '景别'], ['angle', '角度'], ['movement', '运镜'], ['lens', '焦距']] as const).map(([key, label]) =>
        <EditText key={key} label={label} value={shot[key]} onCommit={(value, group) => onEdit({ [key]: value }, group)} />)}
    </div>
    <EditText label="时长（秒）" numeric value={String(shot.duration)} onCommit={(value, group) => onEdit({ duration: Number(value) }, group)} />
    <EditText label="拍摄备注" value={shot.notes} multiline onCommit={(notes, group) => onEdit({ notes }, group)} />
    <section className="inspector-crop" aria-label="素材与裁切">
      <div><h3>画面</h3><a href={onMedia}>{visual ? '更换素材' : '选择素材'}</a></div>
      <AnimatePresence initial={false}>
        {visual && <motion.div className="crop-tools" key="crop" initial={enter} animate={visible} exit={leave} transition={timing}>
          <label className="field crop-field"><span>裁切缩放</span>
            <input type="range" min="1" max="3" step="0.05" value={crop.zoom}
              onChange={event => onCrop({ ...crop, zoom: Number(event.target.value) }, false)}
              onPointerUp={() => onCrop(crop, true)} onKeyUp={() => onCrop(crop, true)} onBlur={() => onCrop(crop, true)} />
            <output>{Math.round(crop.zoom * 100)}%</output>
          </label>
          <button className="button subtle" type="button" disabled={crop.zoom === 1 && crop.x === 0.5 && crop.y === 0.5}
            onClick={() => onCrop(defaultCrop, true)}>重置裁切</button>
        </motion.div>}
      </AnimatePresence>
    </section>
    <div className="inspector-actions">
      <button className="button secondary" onClick={onCopy}><Copy size={14} /> 复制镜头</button>
      <button className="button subtle danger-text" onClick={onRemove}><Trash2 size={14} /> 删除镜头</button>
    </div>
  </motion.div>
}



