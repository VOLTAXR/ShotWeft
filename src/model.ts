import type { Annotation } from './annotation-model'
import type { DirectorPlan } from './core/director/plan'
import { remapDirectorPlan } from './core/director/remap'
import { regenerateTimelineIds, type VideoTimeline } from './video-model'

export const frames = ['16:9', '9:16', '2.39:1'] as const
export type Frame = typeof frames[number]

export interface Scene {
  id: string
  location: string
  setting: '外景' | '内景'
  time: string
  description: string
  dialogue: string
  notes: string
}

export interface Crop {
  zoom: number
  x: number
  y: number
}

export const defaultCrop: Crop = { zoom: 1, x: 0.5, y: 0.5 }
export const ratio = (frame: Frame) => frame === '2.39:1' ? 2.39 : frame === '16:9' ? 16 / 9 : 9 / 16

interface AssetRecord {
  id: string
  projectId: string
  name: string
  blob: Blob
  thumbnail: Blob
  source?: string
  created: number
}

export type Asset = AssetRecord & (
  | { kind: 'image' | 'video'; width: number; height: number; duration?: number }
  | { kind: 'audio'; width?: number; height?: number; duration: number }
)

export interface Shot {
  id: string
  sceneId: string
  title: string
  size: string
  angle: string
  movement: string
  lens: string
  duration: number
  notes: string
  media?: string
  assetId?: string
  posterId?: string
  crop?: Crop
  annotations?: Annotation[]
}

export interface Project {
  id: string
  title: string
  frame: Frame
  updated: number
  archived: boolean
  demo?: boolean
  cover?: string
  coverAssetId?: string
  scenes: Scene[]
  shots: Shot[]
  video?: VideoTimeline
  direction?: DirectorPlan
  activeTimeline?: 'video' | 'director'
}

export const media = [
  { path: '/demo-media/before-the-tide.jpg', title: '潮汐之前', author: 'Michael McGarry' },
  { path: '/demo-media/coastal-trail.jpg', title: '海岸小径', author: 'Bill Kuffrey' },
  { path: '/demo-media/afterglow.jpg', title: '海岸余光', author: 'Veronika Andrews' },
]

export const durationOf = (shots: Shot[]) => shots.reduce((total, shot) => total + shot.duration, 0)
export const number = (index: number) => String(index + 1).padStart(2, '0')
export function clock(seconds: number) {
  const whole = Math.floor(seconds)
  return [Math.floor(whole / 60), whole % 60].map(part => String(part).padStart(2, '0')).join(':')
}

export function newScene(): Scene {
  return { id: crypto.randomUUID(), location: '未命名场景', setting: '外景', time: '日', description: '', dialogue: '', notes: '' }
}

export function newShot(sceneId: string): Shot {
  return {
    id: crypto.randomUUID(), sceneId, title: '未命名镜头', size: '中景',
    angle: '平视', movement: '固定', lens: '35mm', duration: 4, notes: '',
  }
}

export function newProject(title: string, frame: Frame): Project {
  const scene = newScene()
  return {
    id: crypto.randomUUID(), title, frame, updated: Date.now(), archived: false,
    scenes: [scene], shots: [newShot(scene.id)],
  }
}

export function duplicateProject(project: Project, assetIds?: ReadonlyMap<string, string>): Project {
  return {
    ...project, id: crypto.randomUUID(), title: project.title.slice(0, 52) + ' 副本',
    demo: false, archived: false, updated: Date.now(),
    scenes: project.scenes.map(scene => ({ ...scene })),
    shots: project.shots.map(shot => ({
      ...shot, annotations: shot.annotations?.map(layer => ({ ...layer, id: crypto.randomUUID() })),
    })),
    ...(project.video && { video: regenerateTimelineIds(project.video, assetIds) }),
    ...(project.direction && { direction: remapDirectorPlan(project.direction, assetIds) }),
  }
}

export function demoProject(): Project {
  const project = newProject('潮汐之前', '2.39:1')
  const scenes: Scene[] = [
    { ...newScene(), location: '海岸', time: '清晨', description: '退潮前，林岚沿着海岸寻找父亲留下的记号。' },
    { ...newScene(), location: '松林小径', time: '日', description: '她在树根旁找到一卷被海水打湿的胶片。' },
    { ...newScene(), location: '潮间带', time: '黄昏', description: '潮水漫过脚印。林岚把胶片放进外套口袋。' },
  ]
  const shots = [
    { title: '雾中的海岸', size: '远景', lens: '24mm', duration: 5, notes: '保留海平线以上的留白。', photo: 0, scene: 0 },
    { title: '穿过松林', size: '全景', lens: '35mm', duration: 4, notes: '用前景树枝遮住画面右上角。', photo: 1, scene: 1 },
    { title: '沿岸寻找', size: '中景', lens: '50mm', duration: 4, notes: '人物朝画面左侧行进。', photo: 1, scene: 1 },
    { title: '潮水渐近', size: '全景', lens: '28mm', duration: 6, notes: '等待近处浪头进入画面。', photo: 0, scene: 2 },
    { title: '最后的余光', size: '远景', lens: '24mm', duration: 5, notes: '在天色变暗后停留两秒。', photo: 2, scene: 2 },
  ].map(({ photo, scene, ...shot }) => ({
    ...newShot(scenes[scene].id), ...shot, media: media[photo].path,
  }))
  return { ...project, id: 'before-the-tide', demo: true, cover: media[0].path, scenes, shots }
}





