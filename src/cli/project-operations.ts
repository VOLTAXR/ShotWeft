import { openAsBlob } from 'node:fs'
import { stat } from 'node:fs/promises'
import { z } from 'zod'
import { manifestLimit } from '../core/project-archive'
import { parseDirectorPlan } from '../core/director/plan'
import { addScene, addShot, editScene, editShot, moved, removeScene, removeShot } from '../core/project-edit'
import { frames, newScene, newShot, type Project } from '../model'

const id = z.string().min(1).max(160)
const label = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
const ref = z.union([id, z.strictObject({ ref: label })])
const text = z.string().max(20_000).optional()
const scenePatch = z.strictObject({ location: text, setting: z.enum(['内景', '外景']).optional(), time: text,
  description: text, dialogue: text, notes: text })
const shotPatch = z.strictObject({ title: text, size: text, angle: text, movement: text, lens: text, notes: text,
  duration: z.number().positive().max(3600).optional(), sceneId: z.union([ref, z.literal('')]).optional() })
const projectPatch = z.strictObject({ title: z.string().min(1).max(120).refine(value => !!value.trim()).optional(),
  frame: z.enum(frames).optional(), archived: z.boolean().optional() })
const nonempty = (patch: object) => Object.keys(patch).length !== 0
const position = z.number().int().positive()

export const projectOperationsSchema = z.array(z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('project.update'), patch: projectPatch.refine(nonempty) }),
  z.strictObject({ op: z.literal('scene.add'), patch: scenePatch.optional(), as: label.optional() }),
  z.strictObject({ op: z.literal('scene.update'), id: ref, patch: scenePatch.refine(nonempty) }),
  z.strictObject({ op: z.literal('scene.move'), id: ref, position }),
  z.strictObject({ op: z.literal('scene.delete'), id: ref }),
  z.strictObject({ op: z.literal('shot.add'), patch: shotPatch.optional(), as: label.optional() }),
  z.strictObject({ op: z.literal('shot.update'), id: ref, patch: shotPatch.refine(nonempty) }),
  z.strictObject({ op: z.literal('shot.move'), id: ref, position }),
  z.strictObject({ op: z.literal('shot.delete'), id: ref }),
  z.strictObject({ op: z.literal('director.plan.replace'), plan: z.record(z.string(), z.unknown()) }),
  z.strictObject({ op: z.literal('director.plan.remove') }),
  z.strictObject({ op: z.literal('project.activeTimeline.set'), timeline: z.enum(['video', 'director']).nullable() }),
])).min(1).max(100)

type Operation = z.infer<typeof projectOperationsSchema>[number]
type Kind = 'scene' | 'shot'
type Reference = z.infer<typeof ref>
export class InvalidProjectOperations extends Error {}

export async function readProjectOperations(path: string) {
  if (!(await stat(path)).isFile()) throw new InvalidProjectOperations('Operations input must be a regular JSON file.')
  const file = await openAsBlob(path)
  if (file.size > manifestLimit) throw new InvalidProjectOperations('Operations JSON must not exceed 16 MiB.')
  let input: unknown
  try {
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()))
  } catch (error) {
    if (!(error instanceof SyntaxError || error instanceof TypeError)) throw error
    throw new InvalidProjectOperations('Operations file must be valid UTF-8 JSON.')
  }
  const result = projectOperationsSchema.safeParse(input)
  if (!result.success) {
    const issue = result.error.issues[0]
    const field = issue.path.length ? ' at [' + issue.path.join('.') + ']' : ''
    throw new InvalidProjectOperations('Invalid project operations' + field + ': ' + issue.message)
  }
  return result.data
}

export function applyProjectOperations(initial: Project, operations: Operation[]) {
  let project = initial
  const aliases = new Map<string, { id: string; kind: Kind }>()
  const resolve = (value: Reference, kind: Kind) => {
    const resolved = typeof value === 'string' ? value : aliases.get(value.ref)
    if (typeof resolved === 'string') return resolved
    if (!resolved || resolved.kind !== kind) throw new Error('No earlier ' + kind + ' alias: ' + (typeof value === 'string' ? value : value.ref))
    return resolved.id
  }
  const existing = (value: Reference, kind: Kind) => {
    const id = resolve(value, kind)
    const items = kind === 'scene' ? project.scenes : project.shots
    if (!items.some(item => item.id === id)) throw new Error('Unknown ' + kind + ': ' + id)
    return id
  }
  const remember = (alias: string | undefined, kind: Kind, id: string) => {
    if (alias === undefined) return
    if (aliases.has(alias)) throw new Error('Duplicate operation alias: ' + alias)
    aliases.set(alias, { kind, id })
  }
  const shotFields = (patch: z.infer<typeof shotPatch> = {}) => {
    const { sceneId, ...fields } = patch
    return sceneId === undefined ? fields : { ...fields, sceneId: sceneId === '' ? '' : existing(sceneId, 'scene') }
  }
  const summary = operations.map((operation, index) => {
    const { op } = operation
    let id: string | undefined
    try {
      switch (op) {
        case 'project.update': project = { ...project, ...operation.patch }; break
        case 'scene.add': {
          const scene = { ...newScene(), ...operation.patch }
          remember(operation.as, 'scene', id = scene.id)
          project = addScene(project, scene)
          break
        }
        case 'scene.update': project = editScene(project, id = existing(operation.id, 'scene'), operation.patch); break
        case 'scene.delete': project = removeScene(project, id = existing(operation.id, 'scene')); break
        case 'scene.move': {
          id = existing(operation.id, 'scene')
          if (operation.position > project.scenes.length) throw new Error('Scene position is out of range.')
          const scenes = moved(project.scenes, id, operation.position - 1)
          if (scenes !== project.scenes) project = { ...project, scenes }
          break
        }
        case 'shot.add': {
          const shot = { ...newShot(project.scenes[0]?.id ?? ''), ...shotFields(operation.patch) }
          remember(operation.as, 'shot', id = shot.id)
          project = addShot(project, shot)
          break
        }
        case 'shot.update': project = editShot(project, id = existing(operation.id, 'shot'), shotFields(operation.patch)); break
        case 'shot.delete': project = removeShot(project, id = existing(operation.id, 'shot')); break
        case 'shot.move': {
          id = existing(operation.id, 'shot')
          if (operation.position > project.shots.length) throw new Error('Shot position is out of range.')
          const shots = moved(project.shots, id, operation.position - 1)
          if (shots !== project.shots) project = { ...project, shots }
          break
        }
        case 'director.plan.replace': project = { ...project, direction: parseDirectorPlan(operation.plan) }; break
        case 'director.plan.remove':
          if (project.direction !== undefined || project.activeTimeline === 'director') {
            project = { ...project }
            delete project.direction
            if (project.activeTimeline === 'director') {
              if (project.video) project.activeTimeline = 'video'
              else delete project.activeTimeline
            }
          }
          break
        case 'project.activeTimeline.set':
          if ((operation.timeline === 'video' && !project.video) || (operation.timeline === 'director' && !project.direction)) {
            throw new Error('Requested active timeline is not present: ' + operation.timeline)
          }
          if (project.activeTimeline !== (operation.timeline ?? undefined)) {
            project = { ...project }
            if (operation.timeline === null) delete project.activeTimeline
            else project.activeTimeline = operation.timeline
          }
          break
      }
    } catch (error) {
      throw new Error(`Operation ${index + 1} (${op}): ${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
    return { op, ...(id === undefined ? {} : { id }), ...('as' in operation && operation.as !== undefined ? { as: operation.as } : {}) }
  })
  return { project, operations: summary }
}
