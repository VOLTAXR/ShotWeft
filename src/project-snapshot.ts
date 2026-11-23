import type { Asset, Project } from './model'

export interface ProjectSnapshot {
  project: Project
  items: Asset[]
}
