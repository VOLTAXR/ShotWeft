import { useEffect, useState } from 'react'
import { Archive, ChevronDown, Download, FileImage, FileJson, FileText, Film } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { ExportKind } from './exports'
import { enter, leave, timing, useMenuDismiss, visible } from './ui'

const formats = [
  ['png', '当前镜头 PNG', FileImage],
  ['pdf', '分镜表 PDF', FileText],
  ['json', '项目 JSON', FileJson],
  ['zip', '项目 ZIP 备份', Archive],
  ['video', '当前镜头原始视频', Film],
] as const

export function ExportMenu({ projectId, shotId, saving, video }: { projectId: string; shotId?: string; saving: boolean; video: boolean }) {
  const [open, setOpen] = useState(false)
  const menu = useMenuDismiss(open, setOpen)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; alert?: boolean }>()
  useEffect(() => {
    if (!message) return
    const timeout = setTimeout(() => setMessage(undefined), 4700)
    return () => clearTimeout(timeout)
  }, [message])

  async function run(kind: ExportKind) {
    setOpen(false)
    setBusy(true)
    try {
      const { exportProject } = await import('./exports')
      await exportProject(projectId, kind, shotId)
      setMessage({ text: (kind === 'video' ? '原始视频' : kind.toUpperCase()) + ' 文件已生成' })
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : '导出失败', alert: true })
    } finally { setBusy(false) }
  }

  return <div ref={menu} className="project-options export-options">
    <button className="button primary export-trigger" aria-expanded={open} disabled={busy || saving} onClick={() => setOpen(!open)}>
      <Download size={16} />{busy ? '正在导出' : '导出'}<ChevronDown size={13} />
    </button>
    <AnimatePresence>
      {open && <motion.div className="dropdown export-dropdown" initial={enter} animate={visible} exit={leave} transition={timing}>
        {formats.filter(([kind]) => kind !== 'video' || video).map(([kind, label, Icon]) => <button type="button" key={kind}
          disabled={(kind === 'png' && !shotId) || saving} onClick={() => { void run(kind) }}><Icon size={16} />{label}</button>)}
      </motion.div>}
      {message && <motion.div className="toast" role={message.alert ? 'alert' : 'status'} initial={enter}
        animate={visible} exit={leave} transition={timing}>{message.text}</motion.div>}
    </AnimatePresence>
  </div>
}


