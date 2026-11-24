import type { DirectorPlan } from '../director/plan'

export function validatePresenterMetadata(plan: DirectorPlan, issue: (message: string) => void) {
  const end = (span: { startFrame: number; durationFrames: number }) => span.startFrame + span.durationFrames
  if (plan.layoutTimeline) {
    if (!plan.presenter) issue('Layout timeline requires presenter media')
    const boundaries = new Set([plan.durationFrames, ...plan.shots.map(shot => shot.startFrame)])
    let cursor = 0
    for (const span of plan.layoutTimeline) {
      if (span.startFrame !== cursor) issue('Presenter layout coverage has a gap or overlap')
      if (!boundaries.has(span.startFrame) || !boundaries.has(end(span))) issue('Presenter layouts can change only at shot boundaries')
      cursor = end(span)
    }
    if (cursor !== plan.durationFrames) issue('Presenter layout coverage must match plan duration')
  }
  const voice = plan.audio.filter(track => track.role === 'voice' ||
    (plan.narration.trackId ? track.id === plan.narration.trackId : track.assetId === plan.narration.assetId))
    .sort((a, b) => a.startFrame - b.startFrame)
  if (plan.presenter?.audio === 'embedded') {
    if (plan.narration.assetId || voice.length) issue('Presenter embedded audio conflicts with a separate voice or narration track')
    if (plan.audio.some(track => !track.role)) issue('Audio scheduled alongside presenter embedded audio requires explicit roles')
  }
  // Validate new explicit voice roles without changing legacy narration scheduling.
  if (plan.audio.some(track => track.role === 'voice')) {
    let finish = 0
    for (const track of voice) {
      if (track.startFrame < finish) issue('Voice tracks must not overlap')
      finish = Math.max(finish, end(track))
    }
  }

  const words = plan.transcript?.words ?? []
  const byId = new Map(words.map((word, index) => [word.id, { word, index }]))
  if (byId.size !== words.length) issue('Duplicate transcript word ID')
  const segments = new Map(plan.scriptSegments.map(segment =>
    [segment.id, { ...segment, characters: Array.from(segment.text) }]))
  let previousEnd = 0
  const offsets = new Map<string, number>()
  for (const word of words) {
    const segment = segments.get(word.scriptSegmentId)
    if (!segment || word.startFrame < segment.startFrame || end(word) > end(segment) || word.startFrame < previousEnd) {
      issue('Transcript word frames must be monotonic and within their script segment')
      break
    }
    if (word.charStart < (offsets.get(segment.id) ?? 0) || word.charEnd <= word.charStart ||
        word.charEnd > segment.characters.length || !word.text.trim() ||
        segment.characters.slice(word.charStart, word.charEnd).join('') !== word.text) {
      issue('Transcript word offsets must be monotonic Unicode ranges with the original script spelling')
      break
    }
    previousEnd = end(word)
    offsets.set(segment.id, word.charEnd)
  }

  const checkCaptionOrder = Boolean(plan.transcript || plan.layoutTimeline || plan.presenter?.audio ||
    plan.presenter?.sourceInFrame !== undefined || plan.captions.some(caption => caption.charStart !== undefined ||
      caption.charEnd !== undefined || caption.wordStartId || caption.wordEndId || caption.keywords || caption.safeArea))
  let previousCaptionEnd = 0
  for (const caption of plan.captions) {
    const { charStart, charEnd, wordStartId, wordEndId, keywords, safeArea } = caption
    if (safeArea && (safeArea.left + safeArea.right >= 1 || safeArea.top + safeArea.bottom >= 1)) {
      issue('Caption safe area must have positive width and height')
    }
    if (checkCaptionOrder && caption.startFrame < previousCaptionEnd) issue('Presenter caption times must be monotonic and non-overlapping')
    previousCaptionEnd = end(caption)
    if (plan.transcript || charStart !== undefined || charEnd !== undefined || wordStartId || wordEndId || keywords) {
      const segment = segments.get(caption.scriptSegmentId)
      if (charStart === undefined || charEnd === undefined || charEnd <= charStart || !segment ||
        charEnd > segment.characters.length || segment.characters.slice(charStart, charEnd).join('') !== caption.text) {
        issue('Aligned caption must match its Unicode script range')
        continue
      }
      if (plan.transcript || wordStartId || wordEndId) {
        const first = byId.get(wordStartId ?? ''), last = byId.get(wordEndId ?? '')
        if (!first || !last || first.index > last.index || first.word.scriptSegmentId !== segment.id ||
          last.word.scriptSegmentId !== segment.id || first.word.charStart < charStart || last.word.charEnd > charEnd ||
          first.word.startFrame !== caption.startFrame || end(last.word) !== end(caption)) {
          issue('Aligned caption must match its first and last word range')
        }
      }
      let keywordEnd = charStart
      for (const keyword of keywords ?? []) {
        if (keyword.charStart < keywordEnd || keyword.charEnd <= keyword.charStart || keyword.charEnd > charEnd) {
          issue('Caption keyword offsets must be ordered and within the caption')
        }
        keywordEnd = keyword.charEnd
      }
    }
  }
}

/** Both Player and MP4 consume the same schedule. Visual video elements are always muted. */
export function directorAudioTracks(plan: DirectorPlan): DirectorPlan['audio'] {
  const presenter = plan.presenter
  if (presenter?.audio !== 'embedded') return plan.audio
  return [...plan.audio, {
    id: 'presenter-embedded', assetId: presenter.assetId, startFrame: 0, durationFrames: plan.durationFrames,
    sourceInFrame: presenter.sourceInFrame ?? 0, volume: presenter.volume ?? 1, role: 'voice',
  }]
}
