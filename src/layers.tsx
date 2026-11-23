import { ArrowDown, ArrowRight, ArrowUp, Circle, Crop, Eye, EyeOff, Layers3, Lock, LockOpen, MousePointer2, Pencil, Square, Trash2, Type } from 'lucide-react'
import { motion } from 'motion/react'
import { useRef, type ReactNode } from 'react'
import { annotationLabels, type Annotation, type CanvasTool } from './annotation-model'
import { Sortable } from './sortable'
import { EditText, IconButton, enter, leave, timing, visible } from './ui'

const tools = [
  ['crop', '裁切工具', Crop], ['select', '选择工具', MousePointer2], ['text', '添加文字', Type],
  ['arrow', '绘制箭头', ArrowRight], ['rectangle', '绘制矩形', Square],
  ['ellipse', '绘制椭圆', Circle], ['pen', '自由绘制', Pencil],
] as const
const icons = { text: Type, arrow: ArrowRight, rectangle: Square, ellipse: Circle, pen: Pencil }

export function CanvasToolbar({ value, disabled, onChange }: {
  value: CanvasTool
  disabled: boolean
  onChange: (tool: CanvasTool) => void
}) {
  return <div className="canvas-toolbar" role="group" aria-label="分镜标注工具">
    {tools.map(([tool, label, Icon]) => <IconButton label={label} key={tool} disabled={disabled}
      aria-pressed={value === tool} onClick={() => onChange(tool)}><Icon size={17} /></IconButton>)}
  </div>
}

export function LayerPanel({ items, selected, onSelect, onEdit, onSort, onDelete }: {
  items: Annotation[]
  selected?: string
  onSelect: (id: string) => void
  onEdit: (id: string, patch: Partial<Annotation>, group?: string) => void
  onSort: (id: string, to: number) => Promise<boolean>
  onDelete: (id: string) => void
}) {
  const nodes = [...items].reverse()
  const item = items.find(layer => layer.id === selected)
  const opacityGroup = useRef<string | undefined>(undefined)
  const sort = (id: string, to: number) => onSort(id, nodes.length - 1 - to)

  return <motion.div className="layer-panel" initial={enter} animate={visible} exit={leave} transition={timing}>
    <div className="layer-heading"><h3>标注图层</h3><span>{items.length}</span></div>
    {items.length ? <Sortable ids={nodes.map(item => item.id)} axis="y" label="图层" className="layer-list"
      onSort={sort} render={(id, handle) => {
        const layer = items.find(item => item.id === id)!
        const Icon = icons[layer.type]
        return <div className={'layer-row ' + (id === selected ? 'layer-selected' : '')}>
          {handle}
          <button type="button" className="layer-select" aria-label={'选择图层 ' + layer.name} aria-pressed={id === selected}
            onClick={() => onSelect(id)}><Icon size={15} style={{ color: layer.hidden ? undefined : layer.color === '#ffffff' ? '#2459ed' : layer.color }} />
            <span title={layer.name}>{layer.name}</span></button>
          <IconButton label={(layer.hidden ? '显示图层 ' : '隐藏图层 ') + layer.name} onClick={() => onEdit(id, { hidden: !layer.hidden })}>
            {layer.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
          </IconButton>
          <IconButton label={(layer.locked ? '解锁图层 ' : '锁定图层 ') + layer.name} onClick={() => onEdit(id, { locked: !layer.locked })}>
            {layer.locked ? <Lock size={14} /> : <LockOpen size={14} />}
          </IconButton>
        </div>
      }} /> : <div className="layer-empty"><Layers3 size={23} /><span>从画布工具栏添加标注</span></div>}
    {item && <div className="layer-properties" key={item.id}>
      <div className="layer-heading"><h3>图层属性</h3><span>{annotationLabels[item.type]}</span></div>
      <EditText label="图层名称" required value={item.name} onCommit={(name, group) => onEdit(item.id, { name }, group)} />
      {item.type === 'text' && <EditText label="标注文字" required multiline value={item.text} onCommit={(text, group) => onEdit(item.id, { text }, group)} />}
      <label className="field layer-opacity"><span>不透明度</span>
        <input type="range" min={0} max={100} value={Math.round(item.opacity * 100)}
          onFocus={() => { opacityGroup.current = crypto.randomUUID() }} onBlur={() => { opacityGroup.current = undefined }}
          onChange={event => onEdit(item.id, { opacity: Number(event.target.value) / 100 }, opacityGroup.current)} />
        <output>{Math.round(item.opacity * 100)}%</output>
      </label>
      <label className="field layer-color"><span>标注颜色</span><input type="color" value={item.color}
        onFocus={() => { opacityGroup.current = crypto.randomUUID() }} onBlur={() => { opacityGroup.current = undefined }}
        onChange={event => onEdit(item.id, { color: event.target.value }, opacityGroup.current)} /></label>
      <div className="layer-actions">
        <IconButton label="图层上移" disabled={nodes[0]?.id === item.id} onClick={() => { void sort(item.id, nodes.findIndex(layer => layer.id === item.id) - 1) }}><ArrowUp size={16} /></IconButton>
        <IconButton label="图层下移" disabled={nodes.at(-1)?.id === item.id} onClick={() => { void sort(item.id, nodes.findIndex(layer => layer.id === item.id) + 1) }}><ArrowDown size={16} /></IconButton>
        <IconButton label="删除图层" className="danger-text" disabled={item.locked} onClick={() => onDelete(item.id)}><Trash2 size={16} /></IconButton>
      </div>
    </div>}
  </motion.div>
}

export function PanelTabs({ value, onChange }: { value: 'shot' | 'layers'; onChange: (next: 'shot' | 'layers') => void }) {
  const option = (id: 'shot' | 'layers', label: string, icon: ReactNode) =>
    <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>
      {value === id && <motion.span layoutId="inspector-tab" className="inspector-tab-fill" transition={timing} />}
      {icon}{label}
    </button>
  return <div className="inspector-tabs" role="group" aria-label="属性面板选项">
    {option('shot', '镜头', <MousePointer2 size={14} />)}
    {option('layers', '图层', <Layers3 size={15} />)}
  </div>
}

