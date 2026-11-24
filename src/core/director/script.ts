export const scriptByteLimit = 1024 * 1024
export const scriptFormats = ['paste', 'txt', 'markdown', 'json'] as const
export type ScriptFormat = typeof scriptFormats[number]

export interface ImportedScriptSegment {
  id: string
  text: string
  charStart: number
  charEnd: number
}

export interface ImportedScript {
  title?: string
  format: ScriptFormat
  originalScript: string
  segments: ImportedScriptSegment[]
}

export function stableScriptHash(text: string) {
  // FNV-1a over UTF-16 code units, independent of locale and runtime.
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
  return (hash >>> 0).toString(36)
}

const normalize = (text: string) => text.normalize('NFC').replace(/\s+/gu, ' ').trim()

export function scriptHeading(text: string): string | undefined {
  const [first, second] = text.trim().split(/\r\n|[\r\n]/u, 2)
  const markdown = /^#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?$/u.exec(first.trim())
  if (markdown) return markdown[1]
  if (first.trim() && second && /^[ \t]*(?:=+|-+)[ \t]*$/u.test(second)) return first.trim()
  if (/^\s*(?:(?:INT\/EXT|EXT\/INT|INT|EXT|I\/E)\.[ \t]*\S|第[零〇一二三四五六七八九十百\d]+[场幕章节](?:\s|[:：、]|$)|[内外]景[ \t·.：:])/iu.test(first)) return first.trim()
}

function paragraphs(source: string) {
  const lines = [...source.matchAll(/[^\r\n]*(?:\r\n|[\r\n]|$)/gu)].filter(line => line[0])
  const starts = [0]
  let blank = false
  let afterHeading = false
  let hasContent = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i][0]
    if (!line.trim()) {
      blank = true
      continue
    }
    const next = lines[i + 1]?.[0]
    const underlined = next !== undefined && /^[ \t]*(?:=+|-+)[ \t]*(?:\r\n|[\r\n])?$/u.test(next)
    const heading = underlined || scriptHeading(line) !== undefined
    if (hasContent && (blank || heading || afterHeading)) starts.push(lines[i].index)
    hasContent = true
    blank = false
    afterHeading = heading
    if (underlined) i++
  }
  return starts.map((start, i) => source.slice(start, starts[i + 1]))
}

const longParagraph = 500
const abbreviation = /(?:\b(?:mr|mrs|ms|dr|prof|st|vs|etc|e\.g|i\.e)|\b(?:[a-z]\.)*[a-z])\.$/iu

function splitLongParagraph(paragraph: string) {
  // UTF-16 is only used to find slice boundaries. Public offsets count code points.
  if (paragraph.length <= longParagraph) return [paragraph]
  const parts: string[] = []
  let start = 0
  let boundary = 0
  for (const match of paragraph.matchAll(/(?:[。！？!?…]+|\.+)["'”’」』）)\]]*\s*/gu)) {
    const punctuation = match[0]
    const end = match.index + punctuation.length
    if (punctuation.startsWith('.') && end < paragraph.length && !/\s$/u.test(punctuation)) continue
    if (punctuation.startsWith('.') && abbreviation.test(paragraph.slice(Math.max(start, match.index - 24), match.index + 1))) continue
    if (end - start > longParagraph && boundary > start) {
      parts.push(paragraph.slice(start, boundary))
      start = boundary
    }
    boundary = end
  }
  if (paragraph.length - start > longParagraph && boundary > start && boundary < paragraph.length) {
    parts.push(paragraph.slice(start, boundary))
    start = boundary
  }
  if (start < paragraph.length) parts.push(paragraph.slice(start))
  return parts
}

function jsonParts(source: string): { title?: string; parts: string[] } {
  let value: unknown
  try { value = JSON.parse(source) } catch { throw new Error('Invalid script JSON.') }
  let title: string | undefined
  let requireLineObjects = false
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    if (record.title !== undefined && (typeof record.title !== 'string' || !record.title.trim())) {
      throw new Error('Script JSON title must be a nonempty string.')
    }
    title = record.title as string | undefined
    const keys = ['script', 'text', 'segments', 'lines'].filter(key => Object.hasOwn(record, key))
    if (keys.length !== 1) throw new Error('Script JSON must contain one of script, text, segments, or lines.')
    const [key] = keys
    value = record[key]
    requireLineObjects = key === 'lines'
    if (key === 'script' || key === 'text') {
      if (typeof value !== 'string' || !value.trim()) throw new Error('Script JSON text must be a nonempty string.')
      return { title, parts: paragraphs(value).flatMap(splitLongParagraph) }
    }
  } else if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error('Script JSON must be an object or an array of strings.')
  }
  if (!Array.isArray(value) || !value.length) throw new Error('Script JSON segments must be a nonempty array.')
  const parts = value.map((item: unknown, index) => {
    let text = item
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, unknown>
      if (record.id !== undefined && typeof record.id !== 'string') throw new Error('Invalid script JSON ID at segment ' + (index + 1) + '.')
      text = record.text
    } else if (requireLineObjects) {
      throw new Error('Script JSON line ' + (index + 1) + ' must be an object with text.')
    }
    if (typeof text !== 'string' || !text.trim()) throw new Error('Script JSON segment ' + (index + 1) + ' must contain nonempty text.')
    return text
  })
  return { title, parts }
}

/** JSON offsets address the decoded script. Supplied segment texts are joined without separators. */
export function importScript(input: string | Uint8Array, format: ScriptFormat = 'paste'): ImportedScript {
  if (!scriptFormats.includes(format)) throw new Error('Unsupported script format.')
  if (typeof input === 'string' ? input.length > scriptByteLimit || new TextEncoder().encode(input).length > scriptByteLimit :
    input.byteLength > scriptByteLimit) {
    throw new Error('Script exceeds the 1 MiB limit.')
  }
  let source: string
  try {
    source = (typeof input === 'string' ? input : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input)).replace(/^\uFEFF/u, '')
  } catch { throw new Error('Script must be valid UTF-8.') }
  if (!source.trim()) throw new Error('Script is empty.')
  const { title, parts } = format === 'json' ? jsonParts(source) : { title: undefined, parts: paragraphs(source).flatMap(splitLongParagraph) }
  let charStart = 0
  const segments = parts.map(text => {
    if (/[\uD800-\uDFFF]/u.test(text)) throw new Error('Script contains an unpaired Unicode surrogate.')
    const charEnd = charStart + Array.from(text).length
    const id = 'segment-' + charStart.toString(36) + '-' + stableScriptHash(normalize(text))
    const segment = { id, text, charStart, charEnd }
    charStart = charEnd
    return segment
  })
  const inferredTitle = title ?? scriptHeading(parts[0])
  return { ...(inferredTitle !== undefined && { title: inferredTitle }), format, originalScript: parts.join(''), segments }
}
