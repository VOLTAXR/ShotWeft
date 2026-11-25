import { parseArgs, type ParseArgsOptionDescriptor } from 'node:util'
import { version } from '../../package.json'
import { addScene, addShot, editScene, editShot, moved, removeScene, removeShot } from '../core/project-edit'
import { projectManifest } from '../core/project-archive'
import { frames, newProject, newScene, newShot, type Frame, type Project, type Scene, type Shot } from '../model'
import { exportPDF } from './pdf'
import { projectRevision, revisionPattern, updateProject, updateProjectArchive, withProject, writeOutput, writeOutputFile, writeProjectFile } from './project-file'
import { applyProjectOperations, InvalidProjectOperations, readProjectOperations } from './project-operations'
import { createStoryboard, verifyStoryboard } from './storyboard'
import { verifyVideo } from './video'
import { LegacyFFmpegRenderAdapter } from './render-adapters'
import { alignDirectorTranscript, exportDirectorCaptions, generateDirectorPlan, importDirectorTranscript,
  validateDirectorPlan, validatePresenterPlan } from './director'
import { directorFrameRateSchema } from '../core/director/plan'

type Action = { usage: string; count: number; options?: string[]; notes?: string }
type Command = { actions: Record<string, Action>; unknownAction: string }

const sceneFields = ['location', 'setting', 'time', 'description', 'dialogue', 'notes']
const shotFields = ['title', 'size', 'angle', 'movement', 'lens', 'duration', 'notes', 'scene']
const revisionOption = 'expected-revision'
const revisionUsage = ' [--expected-revision <sha256>]'
const sceneNotes = 'Scene options  --location --setting 内景|外景 --time --description --dialogue --notes'
const shotNotes = 'Shot options  --title --size --angle --movement --lens --duration --notes --scene <id>\nUse --scene= to clear the scene association.'

const commands: Record<string, Command> = {
  project: {
    unknownAction: '未知项目操作',
    actions: {
      create: { usage: 'project create <zip> --title <title> [--frame <frame>]', count: 1, options: ['title', 'frame'] },
      show: { usage: 'project show <zip>', count: 1 },
      update: { usage: 'project update <zip> [--title <title>] [--frame <frame>] [--archived true|false]' + revisionUsage,
        count: 1, options: ['title', 'frame', 'archived', revisionOption] },
      revision: { usage: 'project revision <zip>', count: 1 },
      apply: { usage: 'project apply <zip> <operations.json>' + revisionUsage + ' [--dry-run]', count: 2,
        options: [revisionOption, 'dry-run'] },
      restore: { usage: 'project restore <zip|json> <new-zip>', count: 2 },
    },
  },
  scene: {
    unknownAction: '未知场景操作',
    actions: {
      list: { usage: 'scene list <zip>', count: 1 },
      show: { usage: 'scene show <zip> <id>', count: 2 },
      add: { usage: 'scene add <zip> [scene options]' + revisionUsage, count: 1, options: [...sceneFields, revisionOption], notes: sceneNotes },
      update: { usage: 'scene update <zip> <id> [scene options]' + revisionUsage, count: 2, options: [...sceneFields, revisionOption], notes: sceneNotes },
      move: { usage: 'scene move <zip> <id> --position <1-based-index>' + revisionUsage, count: 2, options: ['position', revisionOption] },
      delete: { usage: 'scene delete <zip> <id>' + revisionUsage, count: 2, options: [revisionOption] },
    },
  },
  shot: {
    unknownAction: '未知镜头操作',
    actions: {
      list: { usage: 'shot list <zip>', count: 1 },
      show: { usage: 'shot show <zip> <id>', count: 2 },
      add: { usage: 'shot add <zip> [shot options]' + revisionUsage, count: 1, options: [...shotFields, revisionOption], notes: shotNotes },
      update: { usage: 'shot update <zip> <id> [shot options]' + revisionUsage, count: 2, options: [...shotFields, revisionOption], notes: shotNotes },
      move: { usage: 'shot move <zip> <id> --position <1-based-index>' + revisionUsage, count: 2, options: ['position', revisionOption] },
      delete: { usage: 'shot delete <zip> <id>' + revisionUsage, count: 2, options: [revisionOption] },
    },
  },
  export: {
    unknownAction: '未知导出格式',
    actions: {
      json: { usage: 'export json <zip> [--output <new-json>]', count: 1, options: ['output'] },
      pdf: { usage: 'export pdf <zip> --output <new-pdf>', count: 1, options: ['output'] },
      zip: { usage: 'export zip <zip> --output <new-zip>', count: 1, options: ['output'] },
    },
  },
  agent: {
    unknownAction: '未知 Agent 操作',
    actions: {
      storyboard: {
        usage: 'agent storyboard <script.txt> <project.zip> --title <title> [--frame 16:9|9:16|2.39:1] [--shots 12] [--pdf <storyboard.pdf>]',
        count: 2, options: ['title', 'frame', 'shots', 'pdf'],
        notes: 'Storyboard options  --shots accepts 1 to 50 shots; default is 12. Default frame is 16:9.',
      },
      verify: { usage: 'agent verify <zip> [--pdf <storyboard.pdf>]', count: 1, options: ['pdf'] },
    },
  },
  director: {
    unknownAction: 'Unknown director action',
    actions: {
      generate: { usage: 'director generate <script> --output <plan.json> [--title <title>] [--aspect 16:9|9:16] [--fps <rational>] [--mode script|presenter]',
        count: 1, options: ['output', 'title', 'aspect', 'fps', 'mode'],
        notes: 'Use shotweft director generate <script> --output <plan.json> to plan locally from TXT, Markdown, or JSON.' },
      validate: { usage: 'director validate <plan.json>', count: 1 },
      'import-transcript': { usage: 'director import-transcript <json|srt|vtt> --output <transcript.json>', count: 1, options: ['output'],
        notes: 'Transcript JSON v1 stores schemaVersion, source, text, and words with text, Unicode charStart/charEnd, startSeconds/endSeconds, and optional confidence.' },
      'align-transcript': { usage: 'director align-transcript <plan.json> <transcript> --output <aligned.json> [--captions sentence|word] [--corrections <json>] [--keywords <comma-separated>] [--duration-frames <frames>]',
        count: 2, options: ['output', 'captions', 'corrections', 'keywords', 'duration-frames'],
        notes: 'Corrections are an array of word ranges with scriptSegmentId, Unicode charStart/charEnd, startFrame and durationFrames. Keep the aligned plan beside its relative media.' },
      'export-captions': { usage: 'director export-captions <plan.json> --output <srt|vtt>', count: 1, options: ['output'] },
      'validate-presenter': { usage: 'director validate-presenter <plan.json> [--ffprobe <path>]', count: 1, options: ['ffprobe'] },
    },
  },
  video: {
    unknownAction: 'Unknown video action',
    actions: {
      'export-remotion': { usage: 'video export-remotion <plan.json> --output <mp4> [--browser <path>] [--ffmpeg <path>] [--ffprobe <path>]', count: 1, options: ['output', 'browser', 'ffmpeg', 'ffprobe'] },
      render: {
        usage: 'video render <zip> --output <mp4> [--ffmpeg <path>] [--ffprobe <path>]',
        count: 1, options: ['output', 'ffmpeg', 'ffprobe'],
      },
      verify: {
        usage: 'video verify <zip> [--video <mp4>] [--ffprobe <path>]',
        count: 1, options: ['video', 'ffprobe'],
      },
    },
  },
}

function showHelp(groups: Action[][]) {
  const usage = groups.map(actions => actions.map(action => action.usage).join('\n'))
  const notes = new Set(groups.flat().flatMap(action => action.notes ? [action.notes] : []))
  process.stdout.write([
    'ShotWeft CLI v' + version,
    ...usage,
    [...notes, 'Command results are JSON by default; pass --json to force it. Use --help or -h for help.'].join('\n'),
  ].join('\n\n') + '\n')
}

class UsageError extends Error {}

function args(input: string[], count?: number, options: string[] = []) {
  const spec: Record<string, ParseArgsOptionDescriptor> = { help: { type: 'boolean', short: 'h' }, json: { type: 'boolean' } }
  for (const option of options) spec[option] = { type: option === 'dry-run' ? 'boolean' : 'string' }
  try {
    const parsed = parseArgs({
      args: input, allowPositionals: true, options: spec,
    })
    const help = parsed.values.help === true
    if (count !== undefined && (parsed.positionals.length > count ||
      (!help && (parsed.positionals.length < count || parsed.positionals.includes(''))))) {
      throw new UsageError('需要 ' + count + ' 个位置参数。使用 --help 查看命令。')
    }
    const values: Record<string, string | undefined> = {}
    for (const [key, value] of Object.entries(parsed.values)) {
      if (typeof value === 'string') values[key] = value
    }
    return { positionals: parsed.positionals, values, help, dryRun: parsed.values['dry-run'] === true }
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error))
  }
}

type CommandArgs = ReturnType<typeof args>

function requireOption(option: string, value?: string) {
  if (!value?.trim()) throw new UsageError('需要 --' + option)
  return value
}

function positiveInteger(raw: string) {
  const value = Number(raw)
  return /^\d+$/.test(raw) && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

function projectPatch(values: Record<string, string | undefined>): Partial<Pick<Project, 'title' | 'frame' | 'archived'>> {
  const { title, frame, archived } = values
  const patch: Partial<Pick<Project, 'title' | 'frame' | 'archived'>> = {}
  if (title !== undefined) {
    if (!title.trim() || title.length > 120) throw new UsageError('项目标题需要 1 到 120 个字符')
    patch.title = title
  }
  if (frame !== undefined) {
    if (!frames.includes(frame as Frame)) throw new UsageError('画幅需为 ' + frames.join('、'))
    patch.frame = frame as Frame
  }
  if (archived !== undefined) {
    if (archived !== 'true' && archived !== 'false') throw new UsageError('--archived 需为 true 或 false')
    patch.archived = archived === 'true'
  }
  return patch
}

function expectedRevision(value: string | undefined) {
  if (value !== undefined && !revisionPattern.test(value)) throw new UsageError('--expected-revision must be a SHA-256 hex digest.')
  return value
}

async function projectCommand(action: string, { positionals: [file, output], values, dryRun }: CommandArgs) {
  switch (action) {
    case 'create': {
      const title = requireOption('title', values.title)
      const { frame = '16:9' } = projectPatch(values)
      const project = newProject(title, frame)
      await writeOutputFile(file, staged => writeProjectFile(staged, { project, items: [], photos: new Map() }))
      return project
    }
    case 'show':
      return withProject(file, archive => archive.project)
    case 'update': {
      const patch = projectPatch(values)
      if (!Object.keys(patch).length) throw new UsageError('请至少提供一个要更新的字段')
      return updateProject(file, project => ({ ...project, ...patch }), { expectedRevision: expectedRevision(values[revisionOption]) })
    }
    case 'revision': return { revision: await projectRevision(file) }
    case 'apply': {
      const revision = expectedRevision(values[revisionOption])
      const input = await readProjectOperations(output).catch(error => {
        if (error instanceof InvalidProjectOperations) throw new UsageError(error.message)
        throw error
      })
      let operations: ReturnType<typeof applyProjectOperations>['operations'] = []
      const { project, ...receipt } = await updateProjectArchive(file, archive => {
        const result = applyProjectOperations(archive.project, input)
        operations = result.operations
        return result.project === archive.project ? archive : { ...archive, project: result.project }
      }, { expectedRevision: revision, dryRun })
      return { ...receipt, operations }
    }
    case 'restore':
      return withProject(file, async archive => {
        const path = await writeOutputFile(output, staged => writeProjectFile(staged, archive))
        return { path, project: archive.project }
      }, { allowJSON: true })
    default: throw new UsageError('未知项目操作：' + action)
  }
}

function scenePatch(values: Record<string, string | undefined>): Partial<Scene> {
  const { setting, ...text } = values
  if (setting !== undefined && setting !== '内景' && setting !== '外景') throw new UsageError('--setting 需为 内景 或 外景')
  return setting === undefined ? text : { ...text, setting }
}

function shotPatch(values: Record<string, string | undefined>): Partial<Shot> {
  const { duration, scene, ...text } = values
  const patch: Partial<Shot> = text
  if (duration !== undefined) {
    const seconds = Number(duration)
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3600) throw new UsageError('--duration 需大于 0 且不超过 3600 秒')
    patch.duration = seconds
  }
  if (scene !== undefined) patch.sceneId = scene
  return patch
}

function requireItem<T extends Scene | Shot>(items: T[], id: string, label: string) {
  const item = items.find(item => item.id === id)
  if (!item) throw new Error('找不到' + label + '：' + id)
  return item
}

async function collectionCommand(collection: 'scenes' | 'shots', action: string, { positionals: [file, id], values }: CommandArgs) {
  const label = collection === 'scenes' ? '场景' : '镜头'
  if (action === 'list' || action === 'show') {
    return withProject(file, ({ project }) =>
      action === 'list' ? project[collection] : requireItem<Scene | Shot>(project[collection], id, label))
  }
  const { [revisionOption]: revision, position: rawPosition, ...fields } = values
  if (action === 'update' && !Object.keys(fields).length) throw new UsageError('请至少提供一个要更新的字段')
  const position = action === 'move' ? positiveInteger(requireOption('position', rawPosition)) : undefined
  if (action === 'move' && position === undefined) {
    throw new UsageError('--position 需为从 1 开始的整数')
  }
  const patch = collection === 'scenes' ? scenePatch(fields) : shotPatch(fields)

  let result: Scene | Shot | undefined
  await updateProject(file, project => {
    const items = project[collection]
    if (action === 'delete') {
      result = requireItem<Scene | Shot>(items, id, label)
      return collection === 'scenes' ? removeScene(project, id) : removeShot(project, id)
    }
    if (position !== undefined) {
      if (position > items.length) throw new UsageError('--position 需为 1 到 ' + items.length + ' 的整数')
      result = requireItem<Scene | Shot>(items, id, label)
      const reordered = moved<Scene | Shot>(items, id, position - 1)
      return reordered === items ? project : { ...project, [collection]: reordered }
    }
    if (collection === 'scenes') {
      const scene = { ...(action === 'add' ? newScene() : requireItem(project.scenes, id, label)), ...patch }
      result = scene
      return action === 'add' ? addScene(project, scene) : editScene(project, id, patch)
    }
    if ('sceneId' in patch && patch.sceneId && !project.scenes.some(item => item.id === patch.sceneId)) {
      throw new Error('找不到场景：' + patch.sceneId)
    }
    const shot = { ...(action === 'add' ? newShot(project.scenes[0]?.id ?? '') : requireItem(project.shots, id, label)), ...patch }
    result = shot
    return action === 'add' ? addShot(project, shot) : editShot(project, id, patch)
  }, { expectedRevision: expectedRevision(revision) })
  return result
}

async function exportCommand(format: string, { positionals: [file], values }: CommandArgs) {
  if (format === 'zip') {
    const output = requireOption('output', values.output)
    return withProject(file, async archive => ({ path: await writeOutputFile(output, staged => writeProjectFile(staged, archive)) }))
  }
  const output = format === 'pdf' || values.output !== undefined ? requireOption('output', values.output) : undefined
  return withProject(file, async archive => {
    if (format === 'pdf') return { path: await writeOutputFile(output!, staged => exportPDF(archive, staged)) }
    const manifest = projectManifest(archive.project, archive.items, archive.manifest)
    if (!output) return manifest
    return {
      path: await writeOutput(output, new Blob([JSON.stringify(manifest, null, 2) + '\n'], { type: 'application/json' })),
    }
  })
}

function agentCommand(action: string, { positionals: [source, output], values }: CommandArgs) {
  if (action === 'verify') return verifyStoryboard(source, values.pdf === undefined ? undefined : requireOption('pdf', values.pdf))
  const title = requireOption('title', values.title)
  const { frame = '16:9' } = projectPatch(values)
  const count = positiveInteger(values.shots ?? '12')
  if (count === undefined || count > 50) throw new UsageError('--shots 需为 1 到 50 的整数')
  const pdf = values.pdf === undefined ? undefined : requireOption('pdf', values.pdf)
  return createStoryboard(source, output, title, frame, count, pdf)
}

function directorCommand(action: string, { positionals: [source, transcript], values }: CommandArgs) {
  if (action === 'validate') return validateDirectorPlan(source)
  if (action === 'validate-presenter') return validatePresenterPlan(source,
    values.ffprobe === undefined ? undefined : requireOption('ffprobe', values.ffprobe))
  const output = requireOption('output', values.output)
  if (action === 'import-transcript') return importDirectorTranscript(source, output)
  if (action === 'export-captions') return exportDirectorCaptions(source, output)
  if (action === 'align-transcript') {
    const { captions, corrections, keywords, 'duration-frames': frames } = values
    if (captions !== undefined && captions !== 'sentence' && captions !== 'word') throw new UsageError('--captions must be sentence or word.')
    const durationFrames = frames === undefined ? undefined : positiveInteger(frames)
    if (frames !== undefined && durationFrames === undefined) throw new UsageError('--duration-frames must be a positive integer.')
    return alignDirectorTranscript(source, transcript, output, { captionMode: captions,
      corrections: corrections === undefined ? undefined : requireOption('corrections', corrections),
      keywords: keywords?.split(',').map(keyword => keyword.trim()).filter(Boolean), durationFrames })
  }
  const { aspect, fps, mode } = values
  const title = values.title === undefined ? undefined : requireOption('title', values.title)
  if (aspect !== undefined && aspect !== '16:9' && aspect !== '9:16') throw new UsageError('--aspect must be 16:9 or 9:16.')
  if (mode !== undefined && mode !== 'script' && mode !== 'presenter') throw new UsageError('--mode must be script or presenter.')
  let frameRate
  if (fps !== undefined) {
    const match = /^(\d+)(?:\/(\d+))?$/.exec(fps)
    const result = match && directorFrameRateSchema.safeParse({ numerator: Number(match[1]), denominator: Number(match[2] ?? 1) })
    if (!result || !result.success) throw new UsageError('--fps must be a reduced rational from 1 to 120, such as 30000/1001.')
    frameRate = result.data
  }
  return generateDirectorPlan(source, output, { title, mode, aspectRatio: aspect, frameRate })
}

async function videoCommand(action: string, { positionals: [file], values }: CommandArgs) {
  const ffprobe = values.ffprobe === undefined ? undefined : requireOption('ffprobe', values.ffprobe)
  if (action === 'verify') {
    const video = values.video === undefined ? undefined : requireOption('video', values.video)
    return verifyVideo(file, video, ffprobe)
  }
  const output = requireOption('output', values.output)
  const ffmpeg = values.ffmpeg === undefined ? undefined : requireOption('ffmpeg', values.ffmpeg)
  if (action === 'export-remotion') {
    const browser = values.browser === undefined ? undefined : requireOption('browser', values.browser)
    const { RemotionRenderAdapter } = await import('./remotion-adapter')
    return new RemotionRenderAdapter().render({ source: file, output, browser, ffmpeg, ffprobe })
  }
  return new LegacyFFmpegRenderAdapter().render({ source: file, output, ffmpeg, ffprobe })
}

async function main(input: string[]) {
  const [command, action, ...rest] = input
  if (command === '--version' || command === '-v') {
    args(input.slice(1), 0)
    process.stdout.write(version + '\n')
    return
  }
  if (command === undefined || (command.startsWith('-') && args(input).help)) {
    return showHelp(Object.values(commands).map(group => Object.values(group.actions)))
  }
  if (!Object.hasOwn(commands, command)) throw new UsageError('未知命令：' + command)
  const group = commands[command]
  if (action === undefined || action.startsWith('-')) {
    if (args(input.slice(1)).help) return showHelp([Object.values(group.actions)])
    throw new UsageError('需要指定 ' + command + ' 子命令。使用 --help 查看命令。')
  }
  if (!Object.hasOwn(group.actions, action)) throw new UsageError(group.unknownAction + '：' + action)
  const definition = group.actions[action]
  const parsed = args(rest, definition.count, definition.options)
  if (parsed.help) return showHelp([[definition]])
  const result = await dispatch(command, action, parsed)
  process.stdout.write(JSON.stringify(result) + '\n')
}

function dispatch(command: string, action: string, parsed: CommandArgs) {
  switch (command) {
    case 'project': return projectCommand(action, parsed)
    case 'scene': return collectionCommand('scenes', action, parsed)
    case 'shot': return collectionCommand('shots', action, parsed)
    case 'export': return exportCommand(action, parsed)
    case 'agent': return agentCommand(action, parsed)
    case 'director': return directorCommand(action, parsed)
    case 'video': return videoCommand(action, parsed)
    default: throw new UsageError('未知命令：' + command)
  }
}

try {
  await main(process.argv.slice(2))
} catch (error) {
  const failure = error as NodeJS.ErrnoException | null | undefined
  const message = failure?.code === 'ENOENT' || failure?.code === 'ENOTDIR'
    ? '文件不存在：' + (failure.path ?? String(error))
    : error instanceof Error ? error.message : String(error)
  process.stderr.write(JSON.stringify({ error: message }) + '\n')
  process.exitCode = error instanceof UsageError ? 2 : 1
}
