import { Archive, ArrowDownWideNarrow, ArrowRight, ArrowUpRight, ChevronRight, Clapperboard, CloudOff, Film, FolderOpen, HardDrive, Image, LayoutGrid, Plus, Search, Upload } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { liveQuery } from 'dexie'
import { assets } from './db'
import { useBlobURL } from './media'
import { useEffect, useRef, useState } from 'react'
import { clock, durationOf, type Project } from './model'
import { Brand, IconButton, enter, leave, timing, visible } from './ui'

function ProjectCover({ project }: { project: Project }) {
  const [thumbnail, setThumbnail] = useState<Blob>()
  useEffect(() => {
    const id = project.coverAssetId
    if (!id) { setThumbnail(undefined); return }
    const subscription = liveQuery(() => assets.get(id)).subscribe({
      next: item => setThumbnail(item?.thumbnail), error: () => setThumbnail(undefined),
    })
    return () => subscription.unsubscribe()
  }, [project.coverAssetId])
  const source = useBlobURL(thumbnail) ?? project.cover
  return source
    ? <img className="project-cover" src={source} alt="" />
    : <div className="project-cover cover-placeholder"><Clapperboard size={48} strokeWidth={1} /></div>
}

function date(time: number) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(time)
}

export function ProjectHome({ projects, archive, onNew, onImport, importing }: { projects: Project[], archive: boolean, onNew: () => void, onImport: (file: File) => void, importing: boolean }) {
  const [query, search] = useState('')
  const [ascending, sort] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const zip = useRef<HTMLInputElement>(null)
  const demo = projects.find(project => project.demo && !project.archived)
  const sorted = projects.filter(project => project.archived === archive && project.title.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => ascending ? a.updated - b.updated : b.updated - a.updated)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((!event.metaKey && !event.ctrlKey) || event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      input.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return <motion.div className="home" initial={enter} animate={visible} exit={leave} transition={timing}>
    <aside className="home-sidebar">
      <Brand />
      <div className="space-label"><span>F</span><div><strong>个人工作室</strong><small>本地工作区</small></div></div>
      <nav aria-label="工作区">
        <p>工作区</p>
        <a href="#/" className={!archive ? 'nav-active' : ''} aria-current={!archive ? 'page' : undefined}>
          <LayoutGrid size={18} /> 项目
        </a>
        <a href="#/archive" className={archive ? 'nav-active' : ''} aria-current={archive ? 'page' : undefined}>
          <Archive size={18} /> 归档
        </a>
      </nav>
      <div className="local-card"><HardDrive size={17} /><div><strong>本地存储</strong><small>项目保存在此浏览器</small></div></div>
    </aside>
    <div className="home-content">
      <header className="home-header">
        <div className="breadcrumbs"><span>工作区</span><ChevronRight size={13} /><strong>{archive ? '归档' : '项目'}</strong></div>
        <label className="search"><Search size={16} /><input ref={input} aria-label="搜索项目" placeholder="搜索项目" value={query}
          onChange={event => search(event.target.value)} /><kbd>Ctrl K</kbd></label>
        <span className="local-status"><CloudOff size={15} /> 本地模式</span>
      </header>
      <main className="home-main">
        <div className="home-heading">
          <div><h1>{archive ? '归档项目' : '项目工作台'}</h1>
            <p>{archive ? '打开归档项目即可恢复编辑。' : '在一个工作台完成剧本、分镜与拍摄预演。'}</p></div>
          {!archive && <div className="home-actions">
            <input ref={zip} type="file" tabIndex={-1} className="visually-hidden" aria-label="ZIP 备份文件" accept=".zip,application/zip"
              onChange={event => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) onImport(file)
              }} />
            <button className="button secondary" type="button" disabled={importing} onClick={() => zip.current?.click()}>
              <Upload size={16} />{importing ? '正在恢复' : '恢复 ZIP'}</button>
            <button className="button primary" type="button" onClick={onNew}><Plus size={18} /> 新建项目</button>
          </div>}
        </div>
        <AnimatePresence initial={false}>
          {!archive && !query && demo && <motion.section key="hero" className="hero" initial={enter} animate={visible} exit={leave}
            transition={timing} aria-label="可编辑示例">
            <ProjectCover project={demo} />
            <div className="hero-shade" />
            <div className="hero-top"><Clapperboard size={14} /> 可编辑示例</div>
            <div className="hero-bottom">
              <div><h2>{demo.title}</h2><p>一段关于海岸、旧胶片和告别的原创短片。</p>
                <span className="hero-meta">{demo.scenes.length} 个场景 <i /> {demo.shots.length} 个镜头 <i /> {demo.frame}</span></div>
              <a href={'#/project/' + demo.id} className="button hero-button">打开工作台 <ArrowUpRight size={18} /></a>
            </div>
          </motion.section>}
        </AnimatePresence>
        <section aria-labelledby="project-list">
          <div className="list-heading">
            <div><h2 id="project-list">{archive ? '已归档' : query ? '搜索结果' : '最近项目'}</h2><span className="count">{sorted.length}</span></div>
            <IconButton label={ascending ? '按最近编辑排序' : '按最早编辑排序'} onClick={() => sort(!ascending)}>
              <ArrowDownWideNarrow size={18} className={ascending ? 'reverse' : ''} />
            </IconButton>
          </div>
          <motion.div layout className="project-grid">
            <AnimatePresence initial={false} mode="popLayout">
              {sorted.map(project => <motion.article layout key={project.id} className="project-card"
                initial={enter} animate={visible} exit={leave} transition={timing}>
                <a href={'#/project/' + project.id} aria-label={'打开项目 ' + project.title}>
                  <div className="card-image"><ProjectCover project={project} /><span>{project.frame}</span></div>
                  <div className="card-body"><div><h3>{project.title}</h3><p><Film size={13} /> {project.shots.length} 个镜头 <i /> {clock(durationOf(project.shots))} <i /> {date(project.updated)}</p></div><ArrowRight className="card-arrow" size={17} /></div>
                </a>
              </motion.article>)}
              {!archive && !query && <motion.button layout key="create" className="create-card" onClick={onNew}
                initial={enter} animate={visible} exit={leave} transition={timing}>
                <span><Plus size={22} /></span><strong>创建影片项目</strong><small>从剧本或第一个镜头开始</small>
              </motion.button>}
            </AnimatePresence>
          </motion.div>
          {!sorted.length && (archive || query) && <div className="empty"><FolderOpen size={28} /><h3>{query ? '没有匹配的项目' : '暂无归档项目'}</h3></div>}
        </section>
        <footer className="home-footer"><Image size={14} /><span>示例摄影来源见项目文档</span></footer>
      </main>
    </div>
  </motion.div>
}



