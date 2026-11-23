import { AnimatePresence, Reorder, useDragControls, useReducedMotion } from 'motion/react'
import { GripVertical } from 'lucide-react'
import { useRef, useState, type ReactNode, type Ref } from 'react'
import { enter, leave, visible } from './ui'

const spring = { layout: { type: 'spring' as const, stiffness: 440, damping: 40 }, opacity: { duration: 0.18 } }

export function Sortable({ ids, axis, className, label, disabled, onSort, render }: {
  ids: string[]
  axis: 'x' | 'y'
  className: string
  label: string
  disabled?: boolean
  onSort: (id: string, to: number) => Promise<boolean>
  render: (id: string, handle: ReactNode) => ReactNode
}) {
  const [draft, setDraft] = useState<string[]>()
  const staged = useRef<string[] | undefined>(undefined)
  const original = useRef<string[] | undefined>(undefined)
  const values = draft && ids.length === draft.length && draft.every(id => ids.includes(id)) ? draft : ids

  return <Reorder.Group as="div" role="list" aria-label={label} axis={axis} values={values}
    layoutScroll className={className}
    onReorder={next => { staged.current = next; setDraft(next) }}>
    <AnimatePresence initial={false} mode="popLayout">
      {values.map(id => <SortItem key={id} id={id} axis={axis} disabled={disabled}
        label={label + ' ' + (ids.indexOf(id) + 1)}
        onKeyboard={step => { void onSort(id, ids.indexOf(id) + step) }}
        onStart={() => { original.current = ids; staged.current = ids }}
        onFinish={cancelled => {
          const next = staged.current
          const from = original.current?.indexOf(id)
          const to = next?.indexOf(id)
          if (!cancelled && to !== undefined && to >= 0 && from !== to) {
            void onSort(id, to).finally(() => setDraft(undefined))
          } else setDraft(undefined)
          staged.current = undefined
          original.current = undefined
        }} render={handle => render(id, handle)} />)}
    </AnimatePresence>
  </Reorder.Group>
}

function SortItem({ id, axis, disabled, label, onKeyboard, onStart, onFinish, render, ref }: {
  id: string
  axis: 'x' | 'y'
  disabled?: boolean
  label: string
  onKeyboard: (offset: number) => void
  ref?: Ref<HTMLDivElement>
  onStart: () => void
  onFinish: (cancelled: boolean) => void
  render: (handle: ReactNode) => ReactNode
}) {
  const controls = useDragControls()
  const reduce = useReducedMotion()
  return <Reorder.Item ref={ref} as="div" role="listitem" className="sort-item" value={id} dragListener={false} dragControls={controls}
    initial={enter} animate={visible} exit={leave} transition={spring}
    whileDrag={reduce ? undefined : { scale: 1.035, boxShadow: '0 8px 26px #1d314332' }}
    onDragStart={onStart} onDragEnd={event => onFinish(event.type === 'pointercancel' || event.type === 'touchcancel')}>
    {render(<button type="button" className="drag-handle" aria-label={'排序' + label}
      title="拖动排序或按方向键" disabled={disabled}
      onPointerDown={event => { if (!disabled) controls.start(event) }}
      onKeyDown={event => {
        const back = axis === 'x' ? 'ArrowLeft' : 'ArrowUp'
        const forward = axis === 'x' ? 'ArrowRight' : 'ArrowDown'
        if (event.key !== back && event.key !== forward) return
        event.preventDefault()
        onKeyboard(event.key === back ? -1 : 1)
      }}><GripVertical size={16} /></button>)}
  </Reorder.Item>
}


