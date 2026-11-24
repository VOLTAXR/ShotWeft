import type { DirectorPlan, DirectorShot } from '../director/plan'
import { frameToSeconds, type FrameRate } from '../../video-model'

export type AlignedWord = NonNullable<DirectorPlan['transcript']>['words'][number]
export type Caption = DirectorPlan['captions'][number]
type Segment = DirectorPlan['scriptSegments'][number]
export type CaptionMode = 'sentence' | 'word'

const end = (span: { startFrame: number; durationFrames: number }) => span.startFrame + span.durationFrames

export function wordsBySegment(words: AlignedWord[]) {
  const grouped = new Map<string, AlignedWord[]>()
  for (const word of words) {
    const group = grouped.get(word.scriptSegmentId)
    if (group) group.push(word)
    else grouped.set(word.scriptSegmentId, [word])
  }
  return grouped
}

/** Frames for word characters and for all intervening punctuation, spaces and unspoken characters. */
export function characterFrameAt(segment: Segment, words: AlignedWord[], offset: number, characterCount = Array.from(segment.text).length) {
  let low = 0, high = words.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (words[mid].charEnd <= offset) low = mid + 1
    else high = mid
  }
  const word = words[low], previous = words[low - 1]
  const at = (from: number, to: number, start: number, finish: number) =>
    start + Math.floor((finish - start) * (offset - from) / Math.max(1, to - from))
  if (word && offset >= word.charStart) return at(word.charStart, word.charEnd, word.startFrame, end(word))
  const start = previous ? end(previous) : segment.startFrame
  return Math.min(end(segment) - 1, at(previous?.charEnd ?? 0, word?.charStart ?? characterCount, start, word?.startFrame ?? end(segment)))
}

export function alignCueAnchors(shots: DirectorShot[], segments: Segment[], words: AlignedWord[], captions: Caption[] = []): DirectorShot[] {
  const bySegment = wordsBySegment(words)
  const segmentIndex = new Map(segments.map(segment => [segment.id, { segment, characterCount: Array.from(segment.text).length }]))
  const output = shots.map(shot => ({ ...shot, cueAnchors: shot.cueAnchors.map(anchor => {
    const { segment, characterCount } = segmentIndex.get(anchor.scriptSegmentId)!
    const frame = characterFrameAt(segment, bySegment.get(segment.id) ?? [], anchor.charOffset, characterCount)
    return { ...anchor, frame: Math.max(shot.startFrame, Math.min(end(shot) - 1, frame)) }
  }) }))
  if (!captions.length) return output
  const ordered = [...output].sort((a, b) => a.startFrame - b.startFrame)
  const seen = new Map(ordered.map(shot => [shot.id, new Set(shot.cueAnchors.map(anchor => anchor.scriptSegmentId + ':' + anchor.charOffset))]))
  for (const caption of captions) {
    const { scriptSegmentId, charStart, keywords } = caption
    if (charStart === undefined) continue
    const { segment, characterCount } = segmentIndex.get(scriptSegmentId)!
    for (const charOffset of [charStart, ...(keywords ?? []).map(keyword => keyword.charStart)]) {
      const frame = characterFrameAt(segment, bySegment.get(scriptSegmentId) ?? [], charOffset, characterCount)
      let low = 0, high = ordered.length
      while (low < high) {
        const mid = (low + high) >>> 1
        if (end(ordered[mid]) <= frame) low = mid + 1
        else high = mid
      }
      const shot = ordered[low]
      if (!shot || !shot.scriptSegmentIds.includes(scriptSegmentId) || shot.cueAnchors.length >= 1000) continue
      const key = scriptSegmentId + ':' + charOffset
      const prior = seen.get(shot.id)!
      if (prior.has(key)) continue
      prior.add(key)
      shot.cueAnchors.push({ scriptSegmentId, charOffset, frame })
    }
  }
  return output
}

export function makeCaptions(segments: Segment[], words: AlignedWord[], mode: CaptionMode, keywords: string[] = [],
  appearance: Pick<Caption, 'style' | 'safeArea'> = {}): Caption[] {
  const groups = wordsBySegment(words)
  const captions: Caption[] = []
  for (const segment of segments) {
    const characters = Array.from(segment.text)
    const timed = groups.get(segment.id) ?? []
    let firstIndex = 0
    for (const [index, word] of timed.entries()) {
      const next = timed[index + 1]
      const gap = characters.slice(word.charEnd, next?.charStart).join('')
      if (next && mode === 'sentence' && !/[.!?。！？…]/u.test(gap) && index - firstIndex < 15 &&
          next.charEnd - timed[firstIndex].charStart <= 72) continue
      const first = timed[firstIndex]
      const charStart = first.charStart
      // Keep adjacent sentence punctuation and closing quotes, omitting intervening white space.
      const suffix = /^[,.;:!?，。！？、；：…"'”’」』）)\]]+/u.exec(gap)?.[0] ?? ''
      const charEnd = word.charEnd + Array.from(suffix).length
      const text = characters.slice(charStart, charEnd).join('')
      const hits: NonNullable<Caption['keywords']> = []
      let utf16 = 0
      while (utf16 < text.length && hits.length < 100) {
        const keyword = keywords.find(phrase => phrase && text.startsWith(phrase, utf16))
        if (!keyword) { utf16 += text.codePointAt(utf16)! > 0xffff ? 2 : 1; continue }
        const start = charStart + Array.from(text.slice(0, utf16)).length
        hits.push({ charStart: start, charEnd: start + Array.from(keyword).length })
        utf16 += keyword.length
      }
      captions.push({ id: 'caption-' + first.id, scriptSegmentId: segment.id, text, charStart, charEnd,
        wordStartId: first.id, wordEndId: word.id, startFrame: first.startFrame, durationFrames: end(word) - first.startFrame,
        ...appearance, ...(hits.length > 0 && { keywords: hits }) })
      firstIndex = index + 1
    }
  }
  return captions
}

function formatCaptions(captions: readonly Pick<Caption, 'text' | 'startFrame' | 'durationFrames'>[], fps: FrameRate, vtt: boolean) {
  const timestamp = (frame: number) => {
    const ms = Math.round(frameToSeconds(frame, fps) * 1000)
    return [Math.floor(ms / 3_600_000), Math.floor(ms / 60_000) % 60, Math.floor(ms / 1000) % 60]
      .map(part => String(part).padStart(2, '0')).join(':') + (vtt ? '.' : ',') + String(ms % 1000).padStart(3, '0')
  }
  const blocks = captions.map((caption, index) => {
    const lines = caption.text.split(/\r\n?|\n/)
    // Script segments may retain blank paragraph separators at their edges.
    const first = lines.findIndex(line => line.trim())
    let last = lines.length
    while (last > 0 && !lines[last - 1].trim()) last--
    const payload = first < 0 ? [] : lines.slice(first, last)
    if (!payload.length || payload.some(line => !line.trim() || line.includes('-->')) ||
        !Number.isSafeInteger(caption.durationFrames) || caption.durationFrames <= 0) {
      throw new Error('Caption cannot be represented as a timed subtitle cue.')
    }
    return `${index + 1}\n${timestamp(caption.startFrame)} --> ${timestamp(end(caption))}\n${payload.join('\n')}`
  })
  return (vtt ? 'WEBVTT\n\n' : '') + blocks.join('\n\n') + (blocks.length ? '\n' : '')
}

export const formatSRT = (captions: Parameters<typeof formatCaptions>[0], fps: FrameRate) => formatCaptions(captions, fps, false)
export const formatVTT = (captions: Parameters<typeof formatCaptions>[0], fps: FrameRate) => formatCaptions(captions, fps, true)
