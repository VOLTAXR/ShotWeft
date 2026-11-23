import type { Project, Scene, Shot } from '../model'

export function moved<T extends { id: string }>(items: T[], id: string, to: number) {
  const from = items.findIndex(item => item.id === id)
  if (from < 0 || to < 0 || to >= items.length || from === to) return items
  const list = [...items]
  const [item] = list.splice(from, 1)
  list.splice(to, 0, item)
  return list
}

export function removeScene(project: Project, id: string): Project {
  return {
    ...project,
    scenes: project.scenes.filter(scene => scene.id !== id),
    shots: project.shots.map(shot => shot.sceneId === id ? { ...shot, sceneId: '' } : shot),
  }
}

export function addScene(project: Project, scene: Scene): Project {
  return { ...project, scenes: [...project.scenes, scene] }
}

export function addShot(project: Project, shot: Shot): Project {
  return { ...project, shots: [...project.shots, shot] }
}

export function editScene(project: Project, id: string, patch: Partial<Omit<Scene, 'id'>>): Project {
  return { ...project, scenes: project.scenes.map(scene => scene.id === id ? { ...scene, ...patch } : scene) }
}

export function editShot(project: Project, id: string, patch: Partial<Omit<Shot, 'id'>>): Project {
  return { ...project, shots: project.shots.map(shot => shot.id === id ? { ...shot, ...patch } : shot) }
}

export function removeShot(project: Project, id: string): Project {
  return { ...project, shots: project.shots.filter(shot => shot.id !== id) }
}
