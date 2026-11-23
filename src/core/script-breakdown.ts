import type { Scene, Shot } from '../model'

type SceneFields = Omit<Scene, 'id'>
type ShotDraft = Omit<Shot, 'id' | 'sceneId'> & { sceneIndex: number }
type BodyField = 'description' | 'dialogue' | 'notes'
type BodyLine = { field: BodyField; text: string }
type SceneDraft = Pick<SceneFields, 'location' | 'setting' | 'time'> & { body: BodyLine[] }

const textLimit = 20_000 // Project archive text field limit, measured in UTF-16 code units.
const heading = /^(?:(?:\d+[.．、)）]|场景\s*[\d零〇一二两三四五六七八九十百千]+[.．、:：]?)\s*)?(内景|外景|INT\.|EXT\.)(?=\s|[:：]|$)\s*[:：]?\s*(.*)$/iu
const separator = /(?<=\s)-|-(?=\s)|[–—/／]/u
const trailingTime = /[\s-](清晨|早晨|上午|中午|下午|傍晚|黄昏|晚上|午夜|深夜|凌晨|黎明|日|夜|晨|昼|DAWN|MORNING|DAY|AFTERNOON|DUSK|EVENING|NIGHT|CONTINUOUS)$/iu
const note = /^(?:[#＃（(【\[]|(?:备注|注释|旁注|NOTE|NOTES|CUT TO|FADE IN|FADE OUT)\s*[:：])/iu
const action = /^(?:动作|ACTION)\s*[:：]\s*/iu
const speaker = /^[\p{L}\p{N}·・.'’_-]+(?:[ \t]+[\p{L}\p{N}·・.'’_-]+){0,3}(?:\s*[（(][^）)]+[）)])?$/u

const setups = [
  { size: '全景', angle: '平视', movement: '固定', lens: '24mm' },
  { size: '中景', angle: '平视', movement: '跟拍', lens: '35mm' },
  { size: '近景', angle: '斜侧', movement: '固定', lens: '50mm' },
  { size: '特写', angle: '俯视', movement: '缓推', lens: '85mm' },
]

function bounded(text: string, limit = textLimit) {
  return text.slice(0, limit).replace(/[\uD800-\uDBFF]$/u, '').trim()
}

function readHeading(line: string): SceneDraft | undefined {
  const match = heading.exec(line)
  if (!match) return
  const [, marker, details] = match
  const split = separator.exec(details) ?? trailingTime.exec(details)
  const location = bounded(split ? details.slice(0, split.index) : details)
  if (!location) return
  const time = bounded(split ? (split[1] ?? details.slice(split.index + split[0].length)) : '') || '日'
  return { location, time, setting: /^(内景|INT\.)$/iu.test(marker) ? '内景' : '外景', body: [] }
}

function readBodyLine(line: string): BodyLine {
  if (note.test(line)) return { field: 'notes', text: line }
  const cue = line.replace(action, '')
  if (cue !== line) return { field: cue ? 'description' : 'notes', text: cue || line }
  const colon = line.search(/[:：]/u)
  const dialogue = colon > 0 && colon <= 80 && colon < line.length - 1 && speaker.test(line.slice(0, colon).trim())
  return { field: dialogue ? 'dialogue' : 'description', text: line }
}

function readScenes(script: string, count: number) {
  const scenes: SceneDraft[] = []
  const preamble: string[] = []
  let current: SceneDraft | undefined
  for (const raw of script.split(/\r\n?|[\n\u2028\u2029]/u)) {
    const line = raw.trim()
    if (!line) continue
    const next = readHeading(line)
    if (next && scenes.length < count) {
      if (!current) next.body = preamble.map(text => ({ field: 'notes', text }))
      scenes.push(next)
      current = next
    } else if (current) {
      current.body.push(next ? { field: 'notes', text: line } : readBodyLine(line))
    } else {
      preamble.push(line)
    }
  }
  if (scenes.length) return scenes
  return [{ location: '未标注地点', setting: '外景', time: '日', body: preamble.map(readBodyLine) }] satisfies SceneDraft[]
}

function allocateShots(weights: number[], count: number) {
  const remaining = count - weights.length
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const allocations = weights.map(weight => Math.floor(weight * remaining / total) + 1)
  const leftovers = count - allocations.reduce((sum, allocation) => sum + allocation, 0)
  const priority = weights.map((weight, index) => ({ index, remainder: weight * remaining % total }))
  priority.sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (const { index } of priority.slice(0, leftovers)) allocations[index]++
  return allocations
}

export function breakdownScript(script: string, count: number): { scenes: SceneFields[]; shots: ShotDraft[] } {
  const drafts = readScenes(script, count)
  const content = drafts.map(({ body }) => body.filter(line => line.field !== 'notes').map(line => line.text).join('\n'))
  const allocations = allocateShots(content.map(text => Math.max(1, text.length)), count)
  const shots = drafts.flatMap(({ location }, sceneIndex) => {
    const beats = content[sceneIndex].split(/\n|(?<=[。！？；])|(?<=[.!?;])\s+/u)
      .flatMap(sentence => sentence.trim().match(/.{1,96}/gu) ?? []).map(beat => beat.trim()).filter(Boolean)
    const length = allocations[sceneIndex]
    return Array.from({ length }, (_, index) => {
      const start = Math.ceil(index * beats.length / length)
      const end = Math.ceil((index + 1) * beats.length / length)
      const notes = bounded(beats.slice(start, end).join('\n'))
      const setup = setups[index % setups.length]
      const title = bounded(beats[start] && start < end ? beats[start] : location + ' · ' + setup.size, 32)
      return { sceneIndex, ...setup, title, notes, duration: Math.min(8, 2 + Math.round(notes.length / 8) / 2) }
    })
  })
  const scenes = drafts.map(({ body, ...scene }) => {
    const fields: Record<BodyField, string[]> = { description: [], dialogue: [], notes: [] }
    for (const { field, text } of body) fields[field].push(text)
    return {
      ...scene,
      description: bounded(fields.description.join('\n')),
      dialogue: bounded(fields.dialogue.join('\n')),
      notes: bounded(fields.notes.join('\n')),
    }
  })
  return { scenes, shots }
}
