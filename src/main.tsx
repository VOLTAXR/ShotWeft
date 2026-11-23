import { createRoot } from 'react-dom/client'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { liveQuery } from 'dexie'
import { AlertCircle, Aperture } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { copyProject, deleteProject, editProject, initialize, projects, restoreEdit, revise } from './db'
import { isTab } from './route'
import { ProjectHome } from './projects'
import { frames, newProject, type Frame, type Project } from './model'
import { Modal, timing } from './ui'
import './styles.css'

const Editor = lazy(() => import('./editor'))

type Action = 'new' | 'rename' | 'delete'

function App() {
  const [route, setRoute] = useState(window.location.hash)
  const [records, setRecords] = useState<Project[]>()
  const [databaseError, setDatabaseError] = useState(false)
  const [action, setAction] = useState<Action>()
  const [title, setTitle] = useState('')
  const [frame, setFrame] = useState<Frame>('16:9')
  const [pending, setPending] = useState(0)
  const [failed, setFailed] = useState(false)
  const [notice, setNotice] = useState('')
  const [importing, setImporting] = useState(false)
  const [importFailed, setImportFailed] = useState(false)
  const [, area, id, page] = route.split('/')
  const tab = isTab(page) ? page : 'board'
  const active = area === 'project' && records?.find(item => item.id === id)
  const archive = area === 'archive'

  useEffect(() => {
    const refresh = () => { setRoute(window.location.hash); setAction(undefined) }
    window.addEventListener('hashchange', refresh)
    return () => window.removeEventListener('hashchange', refresh)
  }, [])

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined
    initialize().then(() => {
      if (cancelled) return
      const subscription = liveQuery(() => projects.toArray()).subscribe({
        next: setRecords,
        error: () => setDatabaseError(true),
      })
      unsubscribe = () => subscription.unsubscribe()
    }).catch(() => { if (!cancelled) setDatabaseError(true) })
    return () => { cancelled = true; unsubscribe?.() }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 4200)
    return () => window.clearTimeout(timeout)
  }, [notice])

  function openAction(next: Action) {
    setTitle(next === 'rename' && active ? active.title : '')
    setFrame('16:9')
    setAction(next)
  }

  async function perform(operation: () => Promise<unknown>, success?: string) {
    setPending(value => value + 1)
    setFailed(false)
    setImportFailed(false)
    try {
      await operation()
      setRecords(await projects.toArray())
      if (success) setNotice(success)
      return true
    } catch (error) {
      console.error(error)
      setFailed(true)
      setNotice('操作失败，请重试')
      return false
    } finally {
      setPending(value => value - 1)
    }
  }

  async function restoreBackup(file: File) {
    if (importing) return
    setImporting(true)
    setNotice('')
    setImportFailed(false)
    try {
      const { restoreZIP } = await import('./backup')
      const id = await restoreZIP(file)
      setRecords(await projects.toArray())
      setNotice('项目已恢复为新副本')
      location.hash = '/project/' + id + '/board'
    } catch (error) {
      setImportFailed(true)
      setNotice(error instanceof Error ? '恢复失败 · ' + error.message : '无法读取 ZIP 备份')
    } finally { setImporting(false) }
  }

  async function submit() {
    if (pending) return
    if (action === 'new' && title.trim()) {
      const project = newProject(title.trim(), frame)
      if (!await perform(() => projects.add(project), '已创建项目')) return
      location.hash = '/project/' + project.id + '/board'
    } else if (action === 'rename' && active && title.trim()) {
      if (!await perform(() => revise(active.id, item => ({ ...item, title: title.trim() })), '已重命名项目')) return
    } else if (action === 'delete' && active) {
      if (!await perform(() => deleteProject(active.id), '已删除项目')) return
      location.hash = active.archived ? '/archive' : '/'
    }
    setAction(undefined)
  }

  return <MotionConfig reducedMotion="user">
    <AnimatePresence mode="wait" initial={false}>
      {databaseError ? <motion.main key="error" className="app-empty"><AlertCircle size={28} /><h1>本地存储无法打开</h1>
        <p>请允许浏览器使用本地存储。</p><button className="button primary" onClick={() => location.reload()}>重新加载</button></motion.main>
      : !records ? <motion.main key="loading" className="app-empty"><Aperture size={32} /><p role="status">正在打开工作区</p></motion.main>
      : active ? <Suspense key={active.id} fallback={<main className="app-empty"><p role="status">正在打开编辑器</p></main>}>
        <Editor key={active.id} project={active} tab={tab} saving={pending > 0} error={failed}
        onUpdate={(change, options) => perform(() => editProject(active.id, change, options?.group, options?.imported))}
        onRestore={direction => perform(() => restoreEdit(active.id, direction))}
        onArchive={() => { void perform(() => revise(active.id, current => ({ ...current, archived: !current.archived }))) }}
        onRename={() => openAction('rename')} onDelete={() => openAction('delete')}
        onDuplicate={async () => {
          let id: string | undefined
          if (await perform(async () => { id = await copyProject(active.id) }, '已复制项目') && id) {
            location.hash = '/project/' + id + '/board'
          }
        }} />
      </Suspense>
      : area === 'project' ? <motion.main key="missing" className="app-empty"><Aperture size={28} /><h1>找不到项目</h1>
        <a href="#/" className="button primary">返回项目工作台</a></motion.main>
      : <ProjectHome key={archive ? 'archive' : 'home'} projects={records} archive={archive} onNew={() => openAction('new')} importing={importing} onImport={restoreBackup} />}
    </AnimatePresence>
    <Modal open={!!action} onClose={() => setAction(undefined)}
      title={action === 'delete' ? '删除项目' : action === 'rename' ? '重命名项目' : '新建影片项目'}
      description={action === 'delete' ? '此操作会永久删除该项目。' : action === 'rename' ? '输入新的项目名称。' : '命名你的影片，并选择初始画幅。'}>
      <form className="modal-form" onSubmit={event => { event.preventDefault(); void submit() }}>
        {action !== 'delete' && <label className="field"><span>项目名称</span>
          <input placeholder="例如 海边来信" required maxLength={60} value={title} onChange={event => setTitle(event.target.value)} />
        </label>}
        {action === 'new' && <fieldset className="frame-options">
          <legend>画幅</legend>
          {frames.map(item => <label key={item}><input type="radio" name="frame" checked={frame === item} onChange={() => setFrame(item)} /><span>{item}</span></label>)}
        </fieldset>}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={() => setAction(undefined)}>取消</button>
          <button className={'button ' + (action === 'delete' ? 'danger' : 'primary')} disabled={pending > 0 || (action !== 'delete' && !title.trim())}>
            {action === 'delete' ? '确认删除' : action === 'rename' ? '保存名称' : '创建项目'}
          </button>
        </div>
      </form>
    </Modal>
    <AnimatePresence>
      {notice && <motion.div className="toast" role={importFailed ? 'alert' : 'status'} initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={timing}>{notice}</motion.div>}
    </AnimatePresence>
  </MotionConfig>
}

createRoot(document.getElementById('root')!).render(<App />)






