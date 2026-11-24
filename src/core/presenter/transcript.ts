import { z } from 'zod'
import { parseTimedSubtitleText } from '../../video-subtitles'
import { wordTokens } from './tokens'

export const transcriptByteLimit = 16 * 1024 * 1024
const unicode = z.string().max(transcriptByteLimit).refine(text => !/[\uD800-\uDFFF]/u.test(text), 'Expected valid Unicode text')
const offset = z.number().int().min(0).max(transcriptByteLimit)
const seconds = z.number().min(0).max(3600)
const confidence = z.number().min(0).max(1)
const language = z.string().regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/).max(63)
const timed = { startSeconds: seconds, endSeconds: seconds }
const wordSchema = z.strictObject({ text: unicode, charStart: offset, charEnd: offset, ...timed, confidence: confidence.optional() })

/**
 * Local JSON v1: {schemaVersion:1, source:"imported", text:"Hi!", words:[
 *   {text:"Hi", charStart:0, charEnd:2, startSeconds:0.1, endSeconds:0.5}
 * ], language?:"en", durationSeconds?:0.5}. Ranges are half-open. Offsets
 * address Unicode code points in verbatim text, and times are seconds from source start.
 * SRT/VTT provide cue timings. Imported word times within each cue are interpolated.
 */
export const transcriptSchema = z.strictObject({
  schemaVersion: z.literal(1), source: z.enum(['imported', 'faster-whisper', 'srt', 'vtt', 'synthetic']),
  text: unicode, language: language.optional(), durationSeconds: seconds.optional(), words: z.array(wordSchema).min(1).max(200_000),
}).superRefine((transcript, ctx) => {
  const text = Array.from(transcript.text)
  let previousOffset = 0
  let previousTime = 0
  for (const [index, word] of transcript.words.entries()) {
    if (word.charStart < previousOffset || word.charEnd <= word.charStart || word.charEnd > text.length ||
        !word.text.trim() || text.slice(word.charStart, word.charEnd).join('') !== word.text) {
      ctx.addIssue({ code: 'custom', path: ['words', index], message: 'Invalid or overlapping Unicode word offsets' })
      return
    }
    if (word.startSeconds < previousTime || word.endSeconds <= word.startSeconds ||
        word.endSeconds > (transcript.durationSeconds ?? 3600)) {
      ctx.addIssue({ code: 'custom', path: ['words', index], message: 'Word times must be positive, monotonic, non-overlapping, and within source duration' })
      return
    }
    previousOffset = word.charEnd
    previousTime = word.endSeconds
  }
})

export type Transcript = z.infer<typeof transcriptSchema>
export type TranscriptWord = Transcript['words'][number]
export type TranscriptFormat = 'json' | 'srt' | 'vtt'

function interpolateWords(text: string, startSeconds: number, endSeconds: number, offset: number): TranscriptWord[] {
  const tokens = wordTokens(text)
  const at = (index: number) => index === tokens.length ? endSeconds : startSeconds + (endSeconds - startSeconds) * index / tokens.length
  return tokens.map((token, i) => ({
    text: token.text, charStart: offset + token.charStart, charEnd: offset + token.charEnd,
    startSeconds: at(i), endSeconds: at(i + 1),
  }))
}

const whisperSchema = z.object({
  language: language.optional(), duration: seconds.optional(), text: unicode.optional(),
  segments: z.array(z.object({ text: unicode, start: seconds, end: seconds,
    words: z.array(z.object({ word: unicode, start: seconds, end: seconds, probability: confidence.optional() })).max(200_000).nullish(),
  })).min(1).max(20_000),
})

function fromWhisper(value: unknown): Transcript {
  const input = whisperSchema.parse(value)
  const text = input.text ?? input.segments.map(segment => segment.text).join('')
  let cursor = 0
  let offset = 0
  let lastEnd = 0
  const words: TranscriptWord[] = []
  for (const segment of input.segments) {
    const start = text.indexOf(segment.text, cursor)
    if (start === -1 || segment.start < lastEnd || segment.end <= segment.start || segment.end > (input.duration ?? 3600)) {
      throw new Error('Invalid faster-whisper segment text or time range.')
    }
    offset += Array.from(text.slice(cursor, start)).length
    if (!segment.words?.length) {
      for (const word of interpolateWords(segment.text, segment.start, segment.end, offset)) words.push(word)
    } else {
      let position = 0
      let charPosition = offset
      for (const entry of segment.words) {
        const word = entry.word.trim()
        const index = segment.text.indexOf(word, position)
        if (!word || index === -1 || entry.start < segment.start || entry.end > segment.end) {
          throw new Error('faster-whisper word must occur in order in segment text and time range.')
        }
        const charStart = charPosition + Array.from(segment.text.slice(position, index)).length
        charPosition = charStart + Array.from(word).length
        position = index + word.length
        words.push({ text: word, charStart, charEnd: charPosition, startSeconds: entry.start, endSeconds: entry.end,
          ...(entry.probability !== undefined && { confidence: entry.probability }) })
      }
    }
    cursor = start + segment.text.length
    offset += Array.from(segment.text).length
    lastEnd = segment.end
    if (words.length > 200_000) throw new Error('Transcript exceeds 200,000 words.')
  }
  return transcriptSchema.parse({ schemaVersion: 1, source: 'faster-whisper', text, words,
    ...(input.language && { language: input.language }), ...(input.duration !== undefined && { durationSeconds: input.duration }) })
}

export function parseTranscriptJSON(value: unknown): Transcript {
  return value && typeof value === 'object' && 'segments' in value && !('schemaVersion' in value)
    ? fromWhisper(value) : transcriptSchema.parse(value)
}

export function parseTranscript(input: string | Uint8Array, format: TranscriptFormat = 'json'): Transcript {
  if (typeof input === 'string' ? input.length > transcriptByteLimit || new TextEncoder().encode(input).length > transcriptByteLimit :
    input.byteLength > transcriptByteLimit) throw new Error('Transcript exceeds 16 MiB.')
  const contents = (typeof input === 'string' ? input : new TextDecoder('utf-8', { fatal: true }).decode(input)).replace(/^\uFEFF/u, '')
  if (format === 'json') {
    let value: unknown
    try { value = JSON.parse(contents) } catch { throw new Error('Invalid transcript JSON.') }
    return parseTranscriptJSON(value)
  }
  if (format !== 'srt' && format !== 'vtt') throw new Error('Unsupported transcript format.')
  const cues = parseTimedSubtitleText(contents, format === 'vtt')
  const words: TranscriptWord[] = []
  let offset = 0
  let previousEnd = 0n
  for (const { text, startTime, endTime } of cues) {
    if (startTime < previousEnd || endTime > 3_600_000n) throw new Error('Transcript cues must be monotonic and within one hour.')
    for (const word of interpolateWords(text, Number(startTime) / 1000, Number(endTime) / 1000, offset)) words.push(word)
    offset += Array.from(text).length + 1
    previousEnd = endTime
    if (words.length > 200_000) throw new Error('Transcript exceeds 200,000 words.')
  }
  return transcriptSchema.parse({ schemaVersion: 1, source: format, text: cues.map(cue => cue.text).join('\n'), words })
}
