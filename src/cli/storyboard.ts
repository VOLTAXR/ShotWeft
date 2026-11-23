import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ProjectArchive } from '../core/project-archive'
import { breakdownScript } from '../core/script-breakdown'
import { durationOf, newProject, newScene, newShot, type Frame, type Project } from '../model'
import { exportPDF, verifyPDF } from './pdf'
import { withProject, writeOutputFile, writeOutputPair, writeProjectFile } from './project-file'

const scriptLimit = 1024 * 1024

function summarizeProject({ scenes, shots }: Project) {
  return { scenes: scenes.length, shots: shots.length, duration: durationOf(shots) }
}

async function readScript(path: string) {
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK).catch(error => {
    const message = error.code === 'ENOENT' || error.code === 'ENOTDIR' ? '剧本文件不存在' : '无法打开剧本文件'
    throw new Error(message + '：' + path)
  })
  let bytes: Buffer
  try {
    const info = await file.stat()
    if (!info.isFile()) throw new Error('剧本必须为普通的 UTF-8 文本文件')
    if (info.size > scriptLimit) throw new Error('剧本文件超过 1 MB')
    const chunks: Buffer[] = []
    for await (const chunk of file.createReadStream({ end: scriptLimit, autoClose: false })) chunks.push(chunk)
    bytes = Buffer.concat(chunks)
  } finally {
    await file.close()
  }
  if (bytes.length > scriptLimit) throw new Error('剧本文件超过 1 MB')
  let script: string
  try {
    script = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('剧本必须为有效的 UTF-8 纯文本')
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(script)) throw new Error('剧本必须为 UTF-8 纯文本')
  if (!script.trim()) throw new Error('剧本文件为空')
  return script
}

export async function createStoryboard(source: string, output: string, title: string, frame: Frame, count: number, pdfPath?: string) {
  const draft = breakdownScript(await readScript(source), count)
  const scenes = draft.scenes.map(scene => ({ ...newScene(), ...scene }))
  const shots = draft.shots.map(({ sceneIndex, ...shot }) => ({ ...newShot(scenes[sceneIndex].id), ...shot }))
  const project = { ...newProject(title, frame), scenes, shots }
  const archive: ProjectArchive = { project, items: [], photos: new Map() }
  const writeZIP = (staged: string) => writeProjectFile(staged, archive)
  const paths = pdfPath === undefined
    ? { path: await writeOutputFile(output, writeZIP) }
    : await writeOutputPair(output, writeZIP, pdfPath, staged => exportPDF(archive, staged))
  return { ...paths, project, summary: summarizeProject(project) }
}

export function verifyStoryboard(source: string, pdfPath?: string) {
  const path = resolve(source)
  return withProject(path, async ({ project }) => ({
    path, project, summary: summarizeProject(project),
    ...(pdfPath === undefined ? {} : { pdf: await verifyPDF(pdfPath) }),
  }))
}
