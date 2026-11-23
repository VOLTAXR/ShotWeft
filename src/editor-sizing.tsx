import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

export function usePanelSize(key: string, fallback: number) {
  const [value, setValue] = useState(() => {
    try {
      const previous = Number(localStorage.getItem(key))
      return Number.isFinite(previous) && previous > 0 ? previous : fallback
    } catch { return fallback }
  })
  useEffect(() => {
    const timeout = setTimeout(() => {
      try { localStorage.setItem(key, String(value)) } catch { /* Preferences are optional. */ }
    }, 150)
    return () => clearTimeout(timeout)
  }, [key, value])
  return [value, setValue] as const
}

export function PaneResize({ axis, label, value, min, max, onChange, onResize }: {
  axis: 'x' | 'y'
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  onResize: (resizing: boolean) => void
}) {
  const initial = useRef<{ coordinate: number; value: number } | undefined>(undefined)
  const coordinate = (event: PointerEvent) => axis === 'x' ? event.clientX : event.clientY
  const clamp = (value: number) => Math.max(min, Math.min(max, Math.round(value)))
  const end = () => { initial.current = undefined; onResize(false) }
  const keyboard = (event: KeyboardEvent) => {
    const increase = axis === 'x' ? 'ArrowLeft' : 'ArrowUp'
    const decrease = axis === 'x' ? 'ArrowRight' : 'ArrowDown'
    if (![increase, decrease, 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    onChange(event.key === 'Home' ? min : event.key === 'End' ? max : clamp(value + (event.key === increase ? 12 : -12)))
  }

  return <span role="separator" className={'pane-resize pane-resize-' + axis} tabIndex={0} aria-label={label}
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
    onPointerDown={event => {
      if (event.button !== 0) return
      initial.current = { coordinate: coordinate(event), value }
      event.currentTarget.setPointerCapture(event.pointerId)
      onResize(true)
    }} onPointerMove={event => {
      const start = initial.current
      if (start) onChange(clamp(start.value + start.coordinate - coordinate(event)))
    }} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onKeyDown={keyboard} />
}

