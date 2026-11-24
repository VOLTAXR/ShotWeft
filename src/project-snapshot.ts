import type { Asset, Project } from './model'

export type ArchiveMetadata = Record<string, unknown> & { softwareVersion?: string }

export interface ProjectSnapshot {
  project: Project
  items: Asset[]
  archiveMetadata?: ArchiveMetadata
}
