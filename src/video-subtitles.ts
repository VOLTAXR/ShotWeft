import type { FrameRate, SubtitleCue } from './video-model'

const srtTimestamp = /^(\d{2,}):([0-5]\d):([0-5]\d),(\d{3})$/
const vttTimestamp = /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/
const timing = /^(\S+)[ \t]+-->[ \t]+(\S+)(?:[ \t]+(.+))?$/

function timestampToMilliseconds(timestamp: string, vtt: boolean, line: number) {
  const match = (vtt ? vttTimestamp : srtTimestamp).exec(timestamp)
  if (!match) throw new Error(`Line ${line}: invalid timestamp ${timestamp}`)
  const [, hours = '0', minutes, seconds, milliseconds] = match
  return ((BigInt(hours) * 60n + BigInt(minutes)) * 60n + BigInt(seconds)) * 1000n + BigInt(milliseconds)
}

export function parseTimedSubtitleText(input: string, vtt: boolean) {
  const cues: { startTime: bigint; endTime: bigint; text: string; line: number }[] = []
  const lines = input.replace(/^\uFEFF/, '').split(/\r\n?|\n/)
  let index = 0

  if (vtt) {
    if (!/^WEBVTT(?:[ \t].*)?$/.test(lines[0]) || lines[0].includes('-->')) {
      throw new Error('Line 1: expected a WEBVTT header')
    }
    index++
    while (index < lines.length && lines[index].trim()) {
      if (!/^[\w-]+:[^>]*$/.test(lines[index])) throw new Error(`Line ${index + 1}: expected a blank line after the WEBVTT header`)
      index++
    }
  }

  while (index < lines.length) {
    if (!lines[index].trim()) {
      index++
      continue
    }
    const blockStart = index
    while (index < lines.length && lines[index].trim()) index++
    const block = lines.slice(blockStart, index)
    const heading = block[0].trim()
    if (vtt && /^NOTE(?:[ \t]|$)/.test(heading)) continue
    if (vtt && !cues.length && /^(STYLE|REGION)$/.test(heading) && block.every(line => !line.includes('-->'))) continue
    if (!vtt && !/^\d+$/.test(heading)) throw new Error(`Line ${blockStart + 1}: expected an SRT cue number`)
    const timingIndex = vtt && heading.includes('-->') ? 0 : 1
    const line = blockStart + timingIndex + 1
    const match = timing.exec(block[timingIndex]?.trim() ?? '')
    if (!match) throw new Error(`Line ${line}: expected cue timing with start --> end`)
    const [, start, end, settings] = match
    if (settings && (!vtt || !settings.split(/[ \t]+/).every(setting => /^[a-z][a-z-]*:\S+$/.test(setting)))) {
      throw new Error(`Line ${line}: invalid cue timing settings`)
    }
    const startTime = timestampToMilliseconds(start, vtt, line)
    const endTime = timestampToMilliseconds(end, vtt, line)
    if (endTime <= startTime) throw new Error(`Line ${line}: cue end must follow its start`)
    const content = block.slice(timingIndex + 1)
    if (!content.length) throw new Error(`Line ${line}: cue text is missing`)
    if (content.some(text => /^\s*\d{2,}:[\d:.,]*[ \t]+-->/.test(text))) {
      throw new Error(`Line ${line}: expected a blank line between cues`)
    }
    cues.push({ startTime, endTime, text: content.join('\n'), line })
  }

  if (!vtt && !cues.length) throw new Error('SRT contains no cues')
  return cues
}

function parseSubtitles(input: string, trackId: string, fps: FrameRate, vtt: boolean): SubtitleCue[] {
  const numerator = BigInt(fps.numerator)
  const denominator = 1000n * BigInt(fps.denominator)
  function toFrame(milliseconds: bigint, line: number) {
    // Round integer timestamps to the nearest frame without floating-point ties.
    const frame = Number((2n * milliseconds * numerator + denominator) / (2n * denominator))
    if (!Number.isSafeInteger(frame)) throw new Error(`Line ${line}: timestamp is outside the frame range`)
    return frame
  }
  return parseTimedSubtitleText(input, vtt).map(({ startTime, endTime, text, line }) => {
    const startFrame = toFrame(startTime, line)
    const endFrame = toFrame(endTime, line)
    if (endFrame <= startFrame) throw new Error(`Line ${line}: cue does not span a frame at this frame rate`)
    return { id: crypto.randomUUID(), trackId, startFrame, endFrame, text }
  })
}

export function parseSRT(input: string, trackId: string, fps: FrameRate) {
  return parseSubtitles(input, trackId, fps, false)
}

export function parseVTT(input: string, trackId: string, fps: FrameRate) {
  return parseSubtitles(input, trackId, fps, true)
}
