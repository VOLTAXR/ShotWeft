import { directorFrameRateSchema, parseDirectorPlan, type DirectorAsset, type DirectorPlan, type DirectorShot, type VisualElement } from './plan'
import { importScript, scriptHeading, stableScriptHash, type ImportedScript } from './script'

export type PlannerMediaAsset = Pick<DirectorAsset, 'id' | 'kind' | 'path' | 'projectAssetId' | 'sourceDurationFrames'> & {
  keywords?: readonly string[]
}

export interface PlanFromScriptInput {
  script: string | ImportedScript
  title?: string
  mode?: DirectorPlan['productionMode']
  aspectRatio?: DirectorPlan['aspectRatio']
  frameRate?: DirectorPlan['frameRate']
  mediaAssets?: readonly PlannerMediaAsset[]
  presenterAssetId?: string
}

export interface DirectorPlanningProvider {
  plan(input: PlanFromScriptInput): DirectorPlan | Promise<DirectorPlan>
}

// 240 CJK characters/minute, 150 Latin words/minute, and 250 ms per sentence pause.
const cjkPerSecond = 4
const latinWordsPerSecond = 2.5
const sentencePauseSeconds = 0.25
const style = { background: '#17243d', foreground: '#ffffff', accent: '#ffcf73', fontFamily: 'sans-serif' } as const
const commonWords = new Set('about after again also and are because been being both but can could does each first for from have here into just more most only other over should some such than that the their them then there these they this those through very was were what when where which while who will with would your'.split(' '))
const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu
const latinWord = /\p{Script=Latin}+(?:['’-]\p{Script=Latin}+)*/gu
const quantity = /(?<![\p{Script=Latin}\d])[+-]?\d+(?:[.,]\d+)*(?:[ \t]?[％%万亿倍])?/gu
const quote = /(?:^\s*>\s*\S|“[^”]+”|「[^」]+」|『[^』]+』|«[^»]+»|"[^"\r\n]+"|‘[^’]+’|(?:^|\s)(?:according to|source\s*[:：])\s*\S|据[^。；\r\n]{1,30}(?:报道|统计|研究|记载)|(?:来源|引自)[:：])/iu

function clip(text: string, length: number) {
  return text.replace(/\s+/gu, ' ').trim().slice(0, length).replace(/[\uD800-\uDBFF]$/u, '')
}

function estimateSeconds(text: string) {
  return Math.max(1, (text.match(cjk)?.length ?? 0) / cjkPerSecond +
    ((text.match(latinWord)?.length ?? 0) + (text.match(quantity)?.length ?? 0)) / latinWordsPerSecond +
    (text.match(/[。！？!?]+|\.(?=\s|$)/gu)?.length ?? 0) * sentencePauseSeconds)
}

function meaningful(word: string) {
  return word.length >= 3 && !commonWords.has(word.toLowerCase())
}

function concepts(text: string) {
  const repeatedCandidates = new Set<string>()
  for (const match of text.matchAll(/(\p{Script=Latin}+)\s+(?=(\p{Script=Latin}+))/gu)) {
    if (meaningful(match[1]) && meaningful(match[2])) repeatedCandidates.add((match[1] + ' ' + match[2]).toLowerCase())
  }
  for (const match of text.matchAll(/\p{Script=Han}{2,}/gu)) {
    if (match[0].length <= 12) repeatedCandidates.add(match[0])
  }
  return repeatedCandidates
}

function keywordMatcher(keyword: string) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return /\p{Script=Latin}/u.test(keyword) ?
    new RegExp('(?<![\\p{Script=Latin}\\d])' + escaped + '(?![\\p{Script=Latin}\\d])', 'iu') : new RegExp(escaped, 'iu')
}

function indexedMedia(assets: readonly PlannerMediaAsset[], presenterAssetId?: string) {
  return assets.filter(asset => asset.kind !== 'audio' && asset.id !== presenterAssetId).map(asset => ({
    asset,
    keywords: [...new Set(asset.keywords?.map(word => word.trim().toLowerCase()).filter(Boolean))].map(keywordMatcher),
  }))
}

function matchMedia(text: string, media: ReturnType<typeof indexedMedia>) {
  const matches = media.map(({ asset, keywords }) => ({
    asset, cues: keywords.flatMap(keyword => { const match = keyword.exec(text); return match ? [match] : [] }),
  })).filter(item => item.cues.length).sort((a, b) => b.cues.length - a.cues.length)
  return [matches.find(m => m.asset.kind === 'image'), matches.find(m => m.asset.kind === 'video')].filter(match => match !== undefined)
}

function visual(id: string, text: string, kind: 'text' | 'number', placement: Pick<VisualElement, 'x' | 'y' | 'width' | 'height'>): VisualElement {
  return { id, kind, text: clip(text, 240), ...placement, fontSize: kind === 'number' ? 84 : 42, color: style.foreground,
    background: style.background, borderRadius: 16 }
}

type Beat = ReturnType<typeof analyzeBeat>

function analyzeBeat(text: string, media: ReturnType<typeof indexedMedia>) {
  const heading = scriptHeading(text)
  const numbers = [...text.matchAll(quantity)]
  const cited = quote.exec(text)
  const matches = matchMedia(text, media)
  const keywords = [...text.matchAll(/\p{Script=Han}+|\p{Script=Latin}+(?:['’-]\p{Script=Latin}+)*/gu)]
    .filter(match => /\p{Script=Han}/u.test(match[0]) || meaningful(match[0]))
  const cues = [...numbers, ...matches.flatMap(match => match.cues), ...keywords]
  const anchors = [...new Set(cues.map(match => match.index))].slice(0, 3).sort((a, b) => a - b)
  const lead = clip(text, 100)
  return { heading, numbers, cited, matches, keywords, lead, concepts: concepts(text), anchors: anchors.length ? anchors : [text.search(/\S/u)] }
}

function directBeat(beat: Beat, opening: boolean): { type: DirectorShot['sceneType']; focus: string; purpose: string; rationale: string } {
  const topic = beat.heading ? clip(beat.heading, 120) : beat.lead
  if (beat.heading) return { type: 'title', focus: topic, purpose: 'Introduce ' + topic, rationale: 'The script heading starts a new section.' }
  if (beat.cited) return { type: 'quote', focus: beat.cited[0], purpose: 'Give the cited wording a moment on screen.',
    rationale: 'The shot isolates the quotation or attribution in this passage.' }
  if (beat.numbers.length) {
    const focus = beat.numbers.slice(0, 3).map(number => number[0]).join(' · ')
    return { type: 'chart', focus, purpose: 'Highlight the figures in “' + topic + '”',
      rationale: 'The visual calls out the quantities given in the script.' }
  }
  if (beat.matches.length) {
    const cues = beat.matches.flatMap(match => match.cues.map(cue => cue[0]))
    const type = beat.matches.length === 2 ? 'split' : beat.matches[0].asset.kind === 'video' ? 'video' : 'image'
    return { type, focus: topic, purpose: 'Illustrate “' + topic + '” with matching media.',
      rationale: 'Supplied media matches the script terms ' + cues.slice(0, 3).map(cue => '“' + clip(cue, 60) + '”').join(', ') + '.' }
  }
  if (opening) return { type: 'title', focus: topic, purpose: 'Set up “' + topic + '”',
    rationale: 'The opening passage establishes the subject for the following shots.' }
  return { type: 'graphic', focus: topic, purpose: 'Make “' + topic + '” easy to follow.',
    rationale: 'A text graphic foregrounds the script’s wording for this passage.' }
}

function shotElements(direction: ReturnType<typeof directBeat>, beat: Beat, previousIdea?: string, nextIdea?: string) {
  const isMedia = direction.type === 'image' || direction.type === 'video' || direction.type === 'split'
  const elements = [visual('focus', direction.focus, direction.type === 'chart' ? 'number' : 'text',
    { x: 0.08, y: isMedia ? 0.65 : 0.3, width: 0.84, height: isMedia ? 0.16 : 0.4 })]
  if (isMedia) for (const [index, { asset }] of beat.matches.entries()) {
    elements.push({
      ...visual('media-' + index, '', 'text',
        { x: index === 0 ? 0.08 : 0.52, y: 0.22, width: direction.type === 'split' ? 0.4 : 0.84, height: 0.4 }),
      kind: asset.kind === 'video' ? 'video' : 'image', assetId: asset.id, fit: 'contain', opacity: 1,
    })
  }
  const shared = (idea: string, x: number) => ({
    ...visual('shared-' + elements.length, idea, 'text', { x, y: 0.07, width: 0.4, height: 0.12 }),
    sharedKey: 'idea-' + stableScriptHash(idea), fontSize: 26, color: style.accent,
  })
  if (previousIdea) elements.push(shared(previousIdea, previousIdea === nextIdea ? 0.3 : 0.08))
  if (nextIdea && previousIdea !== nextIdea) elements.push(shared(nextIdea, 0.52))
  return elements
}

function buildScenes(shots: DirectorShot[], beats: Beat[], title?: string) {
  const scenes: DirectorPlan['scenes'] = []
  for (const [index, shot] of shots.entries()) {
    const beat = beats[index]
    if (index === 0 || beat.heading) {
      scenes.push({ id: 'scene-' + index, title: index === 0 && title ? title : clip(beat.heading ?? beat.lead, 120),
        startFrame: shot.startFrame, durationFrames: 0, shotIds: [] })
    }
    const scene = scenes[scenes.length - 1]
    scene.shotIds.push(shot.id)
    scene.durationFrames += shot.durationFrames
  }
  return scenes
}

export function planFromScript(input: PlanFromScriptInput | ImportedScript | string): DirectorPlan {
  const options = typeof input === 'string' || 'originalScript' in input ? { script: input } : input
  const { script, mode = 'script', aspectRatio = '16:9', frameRate = { numerator: 30, denominator: 1 }, mediaAssets = [], presenterAssetId } = options
  directorFrameRateSchema.parse(frameRate)
  const imported = typeof script === 'string' ? importScript(script) : script
  const { originalScript } = imported
  const title = options.title ?? imported.title
  if (!originalScript.trim() || !imported.segments.length || imported.segments.some(segment => !segment.text.trim())) throw new Error('Script is empty.')
  if (imported.segments.length > 1000) throw new Error('Director plans support at most 1000 script segments.')
  if (presenterAssetId !== undefined && (mode !== 'presenter' || !mediaAssets.some(asset => asset.id === presenterAssetId && asset.kind === 'video'))) {
    throw new Error('A presenter asset must be a supplied video in presenter mode.')
  }
  const fps = frameRate.numerator / frameRate.denominator
  let durationFrames = 0
  const scriptSegments = imported.segments.map(segment => {
    const timed = { ...segment, startFrame: durationFrames, durationFrames: Math.ceil(estimateSeconds(segment.text) * fps) }
    durationFrames += timed.durationFrames
    return timed
  })
  if (durationFrames / fps > 3600) throw new Error('Estimated DirectorPlan exceeds one hour.')
  const assets = mediaAssets.map(({ keywords, ...asset }): DirectorAsset => ({ ...asset,
    description: clip(keywords?.join(', ') ?? '', 240) }))
  const matching = indexedMedia(mediaAssets, presenterAssetId)
  const beats = scriptSegments.map(segment => analyzeBeat(segment.text, matching))
  const handoffs = beats.map((beat, index) => [...beat.concepts].find(idea => beats[index + 1]?.concepts.has(idea)))
  const shots = scriptSegments.map((segment, i): DirectorShot => {
    const { startFrame, durationFrames, text } = segment
    const id = 'shot-' + i
    const beat = beats[i]
    const direction = directBeat(beat, i === 0)
    const previousIdea = handoffs[i - 1]
    const nextIdea = handoffs[i]
    const nextShotId = i + 1 < beats.length ? 'shot-' + (i + 1) : null
    const transition = nextShotId ? 'transition-' + i : null
    const visualElements = shotElements(direction, beat, previousIdea, nextIdea)
    if (i === 0 && title && direction.type === 'title') visualElements[0].text = clip(title, 240)
    const assetIds = visualElements.flatMap(element => 'assetId' in element ? [element.assetId] : [])
    return {
      id, scriptSegmentIds: [segment.id], purpose: direction.purpose, rationale: direction.rationale,
      startFrame, durationFrames, sceneType: direction.type, visualElements, assetIds, camera: 'static',
      assetNeeds: direction.type === 'graphic' && beat.keywords.length ? [{ kind: 'image',
        purpose: 'Illustrate “' + beat.lead + '”', keywords: beat.keywords.slice(0, 3).map(keyword => clip(keyword[0], 80)) }] : [],
      transition, presenterLayout: presenterAssetId ? 'pip' : 'none', locked: false,
      continuity: {
        previousShotId: i ? 'shot-' + (i - 1) : null, nextShotId,
        previous: previousIdea ? 'Carry forward “' + previousIdea + '”.' : i ? 'Continue from “' + beats[i - 1].lead + '”.' : 'Open with this passage.',
        next: nextIdea ? 'Carry “' + nextIdea + '” into the next passage.' : nextShotId ? 'Lead into “' + beats[i + 1].lead + '”.' : 'Close on this passage.',
      },
      cueAnchors: beat.anchors.map(offset => {
        const charOffset = Array.from(text.slice(0, offset)).length
        return { scriptSegmentId: segment.id, charOffset, frame: startFrame + Math.floor(durationFrames * charOffset / (segment.charEnd - segment.charStart)) }
      }),
    }
  })
  const transitions: DirectorPlan['transitions'] = shots.slice(0, -1).map((shot, i) => {
    const next = shots[i + 1]
    const idea = handoffs[i]
    const sharedKey = idea && 'idea-' + stableScriptHash(idea)
    const from = sharedKey && shot.visualElements.find(element => element.sharedKey === sharedKey)
    const to = sharedKey && next.visualElements.find(element => element.sharedKey === sharedKey)
    const morph = from && to && from.x !== to.x
    return { id: shot.transition!, fromShotId: shot.id, toShotId: next.id, kind: morph ? 'morph' : 'cut',
      durationFrames: morph ? Math.max(1, Math.floor(fps / 4)) : 0, sharedElementId: morph ? sharedKey! : null }
  })
  return parseDirectorPlan({
    schemaVersion: 1, productionMode: mode, originalScript, scriptSegments, aspectRatio, frameRate, durationFrames,
    resolution: aspectRatio === '16:9' ? { width: 1280, height: 720 } : { width: 720, height: 1280 },
    scenes: buildScenes(shots, beats, title), shots, style, assets, transitions, reviewStatus: 'draft',
    narration: { text: originalScript, assetId: null, scriptSegmentIds: scriptSegments.map(segment => segment.id), timing: 'estimated' },
    presenter: presenterAssetId ? { name: 'Presenter', assetId: presenterAssetId } : null, audio: [],
    captions: scriptSegments.map(({ id, text, startFrame, durationFrames }) =>
      ({ id: 'caption-' + id, scriptSegmentId: id, text, startFrame, durationFrames })),
  })
}

export function regenerateShot(plan: DirectorPlan, shotId: string, options: { accent?: string } = {}): DirectorPlan {
  const shot = plan.shots.find(item => item.id === shotId)
  if (!shot) throw new Error('Unknown shot: ' + shotId)
  if (shot.locked) return plan
  const focus = shot.visualElements.find(element => element.kind === 'text' || element.kind === 'number') ?? shot.visualElements[0]
  const accent = options.accent ?? plan.style.accent
  if (!/^#[\da-f]{6}$/i.test(accent)) throw new Error('Shot accent must be a six-digit hex color.')
  const alternate = focus.color.toLowerCase() === accent.toLowerCase()
  const color = alternate ? (accent.toLowerCase() === '#ffffff' ? '#17243d' : '#ffffff') : accent
  const variant = { ...shot, visualElements: shot.visualElements.map(element => {
    if (element !== focus) return element
    if ('assetId' in element) return { ...element, fit: element.fit === 'contain' ? 'cover' as const : 'contain' as const }
    if (element.kind === 'box') return { ...element, background: element.background.toLowerCase() === accent.toLowerCase() ? color : accent }
    return { ...element, color, fontSize: alternate ? Math.max(8, element.fontSize - 4) : Math.min(300, element.fontSize + 4) }
  }) }
  return { ...plan, shots: plan.shots.map(item => item === shot ? variant : item) }
}
