import { useMemo, useRef } from 'react'
import { motion } from 'motion/react'
import { Film, Plus, Repeat2 } from 'lucide-react'
import { PaneResize } from './editor-sizing'
import { ShotThumb } from './media-panel'
import { clock, durationOf, number, type Asset, type Shot } from './model'
import { Sortable } from './sortable'
import { timing } from './ui'

const gap = 10

export function Timeline({ shots, selected, time, loop, height, assets, onHeight, onResize, onLoop, onAdd, onSelect, onSeek, onSort }: {
  shots: Shot[]
  selected?: string
  time: number
  loop: boolean
  height: number
  assets: Map<string, Asset>
  onHeight: (height: number) => void
  onResize: (resizing: boolean) => void
  onLoop: () => void
  onAdd: () => void
  onSelect: (id: string) => void
  onSeek: (time: number) => void
  onSort: (id: string, to: number) => Promise<boolean>
}) {
  const total = durationOf(shots)
  const ruler = useRef<HTMLDivElement>(null)
  const segments = useMemo(() => {
    let start = 0
    let left = 0
    return shots.map((item, index) => {
      const width = Math.min(360, Math.max(166, Math.round(item.duration * 33)))
      const entry = { item, start, left, width, span: width + (index === shots.length - 1 ? 0 : gap) }
      start += item.duration
      left += entry.span
      return entry
    })
  }, [shots])
  const end = segments.at(-1)
  const length = end ? end.left + end.width : 0
  const atTime = segments.find(entry => time < entry.start + entry.item.duration) ?? end
  const playX = atTime ? Math.min(length, atTime.left + atTime.span * (time - atTime.start) / atTime.item.duration) : 0

  function seekX(clientX: number) {
    const left = ruler.current?.getBoundingClientRect().left
    if (left === undefined) return
    const x = Math.max(0, Math.min(length, clientX - left))
    const tick = segments.find(entry => x < entry.left + entry.span) ?? end
    if (tick) onSeek(Math.min(total, tick.start + (x - tick.left) / tick.span * tick.item.duration))
  }

  return <section className="timeline timeline-pro" aria-label="时间轴">
    <PaneResize axis="y" label="调整时间轴高度" value={height} min={170} max={350} onChange={onHeight} onResize={onResize} />
    <div className="timeline-head"><div><h2><Film size={16} /> 时间轴</h2>
      <span>{shots.length} 个镜头</span><span className="timeline-running-time">{clock(time)} / {clock(total)}</span></div>
      <div><button className="button subtle loop" aria-pressed={loop} onClick={onLoop}><Repeat2 size={15} /> 循环</button>
        <button className="button secondary" onClick={onAdd}><Plus size={16} /> 添加镜头</button></div>
    </div>
    <input className="seek timeline-accessible-seek" aria-label="预演进度" type="range" min={0} max={total || 1} step={0.01}
      value={time} onChange={event => onSeek(Number(event.target.value))} disabled={!shots.length} />
    {shots.length ? <div className="timeline-viewport">
      <div className="timeline-content" style={{ width: length + 2 }}>
        <div className="timeline-ruler" ref={ruler} role="presentation"
          onPointerDown={event => {
            if (event.button !== 0) return
            event.currentTarget.setPointerCapture(event.pointerId)
            seekX(event.clientX)
          }} onPointerMove={event => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) seekX(event.clientX)
          }}>
          {segments.map(({ item, start, left, span }) => {
            const interval = item.duration < 30 ? 1 : item.duration < 150 ? 5 : Math.ceil(item.duration / 15)
            const ticks = Math.floor((item.duration - 0.01) / interval)
            return <span className="ruler-segment" key={item.id} style={{ left, width: span }}>
              <span>{clock(start)}</span>
              {Array.from({ length: ticks }, (_, index) => <i key={index} className="ruler-tick"
                style={{ left: ((index + 1) * interval / item.duration * 100) + '%' }} />)}
            </span>
          })}
        </div>
        <div className="playhead" data-position={time.toFixed(2)} style={{ transform: 'translateX(' + Math.max(0, playX) + 'px)' }} />
        <Sortable ids={shots.map(item => item.id)} axis="x" label="时间轴镜头" className="timeline-track" onSort={onSort}
          render={(id, handle) => {
            const i = shots.findIndex(item => item.id === id)
            const item = shots[i]
            const width = segments[i].width
            const thumbnail = assets.get(item.posterId ?? item.assetId ?? '')?.thumbnail
            return <div className="timeline-entry" style={{ width }}>
              {item.id === selected && <motion.span className="timeline-highlight" layoutId="timeline-selected" transition={timing} />}
              <button type="button" className="timeline-card" aria-label={'镜头 ' + number(i) + ' ' + item.title}
                aria-pressed={item.id === selected} onClick={() => onSelect(id)}>
                <span className="timeline-image"><ShotThumb source={item.media} thumbnail={thumbnail} /></span>
                <span className="timeline-card-info"><span>{number(i)}</span><strong>{item.title}</strong><span>{item.duration}s</span></span>
              </button>
              {handle}
            </div>
          }} />
      </div>
    </div> : <p className="timeline-empty">添加镜头后即可开始编排</p>}
  </section>
}


