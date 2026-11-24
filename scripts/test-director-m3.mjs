import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { createServer } from 'vite'

const execute = promisify(execFile)
const root = resolve('.tmp/m3')
await mkdir(root, { recursive: true })
const work = await mkdtemp(join(root, 'core-'))
const server = await createServer({ configFile: false, cacheDir: join(work, 'vite'),
  server: { middlewareMode: true, hmr: false, watch: null } })
const cli = resolve('dist/cli/shotweft.js')

async function command(args, code = 0) {
  const result = await execute(process.execPath, [cli, ...args]).then(value => ({ ...value, code: 0 }), error => error)
  assert.equal(result.code, code, result.stderr)
  assert.equal(code ? result.stdout : result.stderr, '')
  const output = code ? result.stderr : result.stdout
  assert.match(output, /^[^\r\n]+\n$/)
  return JSON.parse(output)
}

try {
  const [{ parseTranscript }, { fasterWhisperProvider }, { alignTranscript, AlignmentRejected },
    { characterFrameAt, formatSRT, formatVTT }, { planFromScript }, { reflowDirectorPlan },
    { parseDirectorPlan }, { compileDirectorPlan, compileDirectorPlanForProject, compileDirectorPlanForRender },
    { presenterLayoutWarnings, presenterSpans }, { buildAudioGraph }, subtitles] = await Promise.all([
    '/src/core/presenter/transcript.ts', '/src/core/presenter/provider.ts', '/src/core/presenter/alignment.ts',
    '/src/core/presenter/captions.ts', '/src/core/director/planner.ts', '/src/core/director/audio.ts',
    '/src/core/director/plan.ts', '/src/core/director/compiler.ts', '/src/core/presenter/layout.ts',
    '/src/cli/director-audio.ts', '/src/video-subtitles.ts',
  ].map(path => server.ssrLoadModule(path)))

  const transcript = (text, entries) => ({
    schemaVersion: 1, source: 'imported', text, language: 'en-US',
    words: entries.map(([text, charStart, startSeconds, endSeconds, confidence]) =>
      ({ text, charStart, charEnd: charStart + Array.from(text).length, startSeconds, endSeconds,
        ...(confidence === undefined ? {} : { confidence }) })),
  })
  const repeats = transcript('🎬 Go go then go home', [
    ['Go', 2, 0.2, 0.4, 0.9], ['go', 5, 0.6, 0.8, 0.7], ['then', 8, 1, 1.15], ['go', 13, 1.2, 1.4], ['home', 16, 1.5, 1.9],
  ])
  assert.deepEqual(parseTranscript(JSON.stringify(repeats)), repeats)
  for (const invalid of [
    { ...repeats, extra: true },
    { ...repeats, text: '\uD800' },
    { ...repeats, words: [{ ...repeats.words[0], charStart: 3 }] },
    { ...repeats, words: [repeats.words[1], repeats.words[0]] },
    { ...repeats, words: [repeats.words[0], { ...repeats.words[1], startSeconds: 0.3 }] },
    { ...repeats, durationSeconds: 1.7 },
  ]) assert.throws(() => parseTranscript(JSON.stringify(invalid)))

  const whisper = parseTranscript(JSON.stringify({ language: 'en', duration: 2, text: ' 🎬 Hello world!',
    segments: [{ start: 0, end: 2, text: ' 🎬 Hello world!', words: [
      { word: ' Hello', start: 0.3, end: 0.6, probability: 0.75 },
      { word: ' world!', start: 0.7, end: 1.5 },
    ] }] }))
  assert.equal(whisper.text, ' 🎬 Hello world!')
  assert.deepEqual(whisper.words.map(word => [word.text, word.charStart, word.confidence]), [['Hello', 3, 0.75], ['world!', 9, undefined]])
  assert.throws(() => parseTranscript(JSON.stringify({ segments: [{ start: 0, end: 1, text: 'Hi',
    words: [{ word: 'Hi', start: 0.2, end: 2 }] }] })), /time range/)
  const srt = '1\r\n00:00:01,000 --> 00:00:02,000\r\n  🎬 Hello\r\n世界!\r\n'
  const vtt = 'WEBVTT\n\nNOTE local\n\nline-A\n00:01.000 --> 00:02.000 line:90%\n  🎬 Hello\n世界!\n'
  for (const [input, format] of [[srt, 'srt'], [vtt, 'vtt']]) {
    const parsed = parseTranscript(input, format)
    assert.equal(parsed.source, format)
    assert.equal(parsed.text, '  🎬 Hello\n世界!')
    assert.deepEqual(parsed.words.map(word => [word.text, word.charStart]), [['Hello', 4], ['世', 10], ['界', 11]])
    assert.equal(parsed.words[0].startSeconds, 1)
    assert.equal(parsed.words.at(-1).endSeconds, 2)
  }
  assert.throws(() => parseTranscript(srt + '\n2\n00:00:01,500 --> 00:00:02,500\nOverlap\n', 'srt'), /monotonic/)
  assert.throws(() => parseTranscript('WEBVTT\n\n00:00.000 --> 00:00.000\nInvalid\n', 'vtt'))
  let requested
  const runtime = { isLocalModel: async model => model === '/local/model',
    transcribe: async (path, options) => { requested = { path, options }; return repeats } }
  await assert.rejects(() => fasterWhisperProvider().transcribe('speaker.mp4'), /configured local model/)
  await assert.rejects(() => fasterWhisperProvider({ modelDirectory: 'remote-id' }, runtime).transcribe('speaker.mp4'), /missing on disk/)
  await assert.rejects(() => fasterWhisperProvider({ modelDirectory: '/local/model', device: 'cpu', deviceIndex: 1 }, runtime)
    .transcribe('speaker.mp4'), /Invalid faster-whisper/)
  const localOptions = { modelDirectory: '/local/model', device: 'cuda', deviceIndex: 1, computeType: 'int8', cacheDirectory: '/local/cache' }
  assert.deepEqual(await fasterWhisperProvider(localOptions, runtime).transcribe('speaker.mp4'), repeats)
  assert.deepEqual(requested, { path: 'speaker.mp4', options: { ...localOptions, localFilesOnly: true, wordTimestamps: true } })
  console.log('PASS strict JSON, faster-whisper JSON, SRT/VTT, Unicode offsets, and local-only ASR capability')

  const input = planFromScript('🎬 GO go, then go home.')
  const aligned = alignTranscript(input, repeats, { keywords: ['GO', 'home'] })
  const { plan, report } = aligned
  assert.equal(plan.originalScript, input.originalScript)
  assert.equal(report.matchRate, 1)
  assert.equal(report.confidence, 0.8)
  const words = plan.transcript.words
  assert.deepEqual(words.map(word => word.startFrame), [6, 18, 30, 36, 45])
  assert.equal(words[0].text, 'GO')
  assert.equal(plan.captions[0].text, 'GO go, then go home.')
  assert.deepEqual(plan.captions[0].keywords, [{ charStart: 2, charEnd: 4 }, { charStart: 17, charEnd: 21 }])
  assert(plan.shots[0].cueAnchors.some(anchor => anchor.charOffset === 17 && anchor.frame === 45))
  assert.deepEqual(alignTranscript(input, repeats, { keywords: ['GO', 'home'] }), aligned)
  const repeated = transcript('go go go now', [['go', 0, .1, .2], ['go', 3, .3, .4], ['go', 6, .5, .6], ['now', 9, .7, .9]])
  const repeatPlan = alignTranscript(planFromScript('Go go go now.'), repeated).plan
  assert.deepEqual(repeatPlan.transcript.words.map(word => word.startFrame), [3, 9, 15, 21])
  const chinese = parseTranscript(JSON.stringify({ segments: [
    { start: 0, end: 1, text: '越走越快', words: [{ word: '越走越快', start: .1, end: .9 }] },
  ] }))
  assert.deepEqual(alignTranscript(planFromScript('越走越快。'), chinese).plan.transcript.words.map(word => word.text), ['越', '走', '越', '快'])

  const errata = transcript('go huh then move home', [
    ['go', 0, .2, .4], ['huh', 3, .6, .8], ['then', 7, 1, 1.15], ['move', 12, 1.2, 1.4], ['home', 17, 1.5, 1.9],
  ])
  assert.throws(() => alignTranscript(input, errata), error => error instanceof AlignmentRejected && error.report.matchRate === 0.6)
  const override = { scriptSegmentId: input.scriptSegments[0].id, charStart: 5, charEnd: 7, startFrame: 18, durationFrames: 6 }
  const fixed = alignTranscript(input, errata, { overrides: [override], captionMode: 'word' })
  assert.equal(fixed.report.matchRate, 0.8)
  assert.equal(fixed.plan.originalScript, input.originalScript)
  assert.deepEqual([fixed.plan.transcript.words[1].startFrame, fixed.plan.transcript.words[1].durationFrames], [18, 6])
  assert.equal(fixed.plan.transcript.words[3].text, 'go')
  assert.equal(fixed.plan.captions.length, 5)
  assert.throws(() => alignTranscript(input, errata, { overrides: [{ ...override, charEnd: 6 }] }), /whole/)
  assert.throws(() => alignTranscript(input, errata, { overrides: [override, { ...override, charStart: 9, charEnd: 13 }] }), /monotonic/)
  const segment = fixed.plan.scriptSegments[0]
  let time = 0
  for (let offset = 0; offset < Array.from(segment.text).length; offset++) {
    const frame = characterFrameAt(segment, fixed.plan.transcript.words, offset)
    assert(frame >= time && frame < segment.durationFrames)
    time = frame
  }
  const reflow = reflowDirectorPlan(fixed.plan, 90)
  for (const [index, word] of reflow.transcript.words.entries()) {
    assert.equal(reflow.captions[index].startFrame, word.startFrame)
    assert.equal(reflow.captions[index].durationFrames, word.durationFrames)
    if (index) assert(word.startFrame >= reflow.transcript.words[index - 1].startFrame + reflow.transcript.words[index - 1].durationFrames)
  }
  for (const anchor of reflow.shots[0].cueAnchors) {
    assert.equal(anchor.frame, characterFrameAt(reflow.scriptSegments[0], reflow.transcript.words, anchor.charOffset))
  }
  const rational = { numerator: 30000, denominator: 1001 }
  for (const [format, parse, kind] of [[formatSRT, subtitles.parseSRT, 'srt'], [formatVTT, subtitles.parseVTT, 'vtt']]) {
    const output = format(reflow.captions, rational)
    const parsed = parse(output, 'captions', rational)
    assert.equal(parseTranscript(output, kind).words.length, 5)
    assert.deepEqual(parsed.map(({ text, startFrame, endFrame }) => [text, startFrame, endFrame]),
      reflow.captions.map(({ text, startFrame, durationFrames }) => [text, startFrame, startFrame + durationFrames]))
  }
  assert.throws(() => parseDirectorPlan({ ...plan, captions: [{ ...plan.captions[0], durationFrames: 1 }] }), /word range/)
  assert.throws(() => parseDirectorPlan({ ...plan, captions: [{ ...plan.captions[0], safeArea: { left: 1, right: 0, top: 0, bottom: 0 } }] }), /safe area/)
  assert.throws(() => parseDirectorPlan({ ...plan, transcript: { ...plan.transcript, words: [...words].reverse() } }), /monotonic/)
  console.log('PASS deterministic repeated words, Unicode character frames, manual corrections, reflow, and rational caption round trips')

  const m1 = JSON.parse(await readFile('public/director/demo-plan.json', 'utf8'))
  const m2 = JSON.parse(await readFile('demos/m2/director-plan.json', 'utf8'))
  assert.deepEqual(parseDirectorPlan(m1), m1)
  assert.deepEqual(parseDirectorPlan(m2), m2)
  for (const [format, parse] of [[formatSRT, subtitles.parseSRT], [formatVTT, subtitles.parseVTT]]) {
    const parsed = parse(format(m2.captions, m2.frameRate), 'm2', m2.frameRate)
    assert.deepEqual(parsed.map(({ text, startFrame, endFrame }) => [text, startFrame, endFrame]),
      m2.captions.map(({ text, startFrame, durationFrames }) => [text.trimEnd(), startFrame, startFrame + durationFrames]))
    assert.throws(() => format([{ ...m2.captions[0], text: 'one\n\ntwo' }], m2.frameRate), /cannot be represented/)
  }
  const presenterInput = planFromScript({ script: 'One test.\n\nA second angle.', mode: 'presenter', presenterAssetId: 'speaker',
    mediaAssets: [{ id: 'speaker', kind: 'video', path: 'speaker.mp4' }] })
  const presenter = { ...presenterInput, presenter: { ...presenterInput.presenter, audio: 'embedded', sourceInFrame: 7, volume: 0.5 },
    layoutTimeline: presenterInput.shots.map(({ startFrame, durationFrames }, index) =>
      ({ layout: index ? 'b-roll' : 'full', startFrame, durationFrames })) }
  const duration = presenter.durationFrames + 7
  const source = { kind: 'video', durationFrames: duration, audioDurationFrames: duration }
  const inventory = new Map([['speaker', source]])
  assert.deepEqual(compileDirectorPlanForRender(presenter, inventory).plan, presenter)
  assert.deepEqual(compileDirectorPlanForProject(presenter, { localAssets: new Map([['speaker.mp4', source]]) }).plan, presenter)
  assert.throws(() => compileDirectorPlan(presenter), /M1/)
  assert.throws(() => compileDirectorPlanForRender(presenter), /resolved presenter/)
  assert.throws(() => compileDirectorPlanForRender(presenter, new Map([['speaker', { ...source, audioDurationFrames: undefined }]])), /audio stream/)
  assert.throws(() => compileDirectorPlanForRender(presenter, new Map([['speaker', { ...source, durationFrames: 2 }]])), /video range/)
  assert.throws(() => compileDirectorPlanForRender(presenter, new Map([['speaker', { ...source, audioDurationFrames: 2 }]])), /audio range/)
  for (const spans of [
    [{ layout: 'pip', startFrame: 0, durationFrames: presenter.durationFrames - 1 }],
    [{ layout: 'full', startFrame: 0, durationFrames: 1 }, { layout: 'pip', startFrame: 1, durationFrames: presenter.durationFrames - 1 }],
    [...presenter.layoutTimeline].reverse(),
  ]) assert.throws(() => parseDirectorPlan({ ...presenter, layoutTimeline: spans }), /coverage|boundaries/)
  assert.throws(() => parseDirectorPlan({ ...presenter, captions: [...presenter.captions].reverse() }), /monotonic/)
  const visibleEnd = presenter.layoutTimeline[0].durationFrames + 7
  const muted = parseDirectorPlan({ ...presenter, presenter: { ...presenter.presenter, audio: 'muted' },
    assets: [{ ...presenter.assets[0], sourceDurationFrames: visibleEnd }] })
  assert.deepEqual(compileDirectorPlanForRender(muted, new Map([['speaker', { kind: 'video', durationFrames: visibleEnd }]])).plan, muted)
  assert.equal(presenterSpans(presenter).length, 2)
  assert(presenterLayoutWarnings(presenter).some(warning => /3 seconds/.test(warning)))
  const voice = { id: 'voice', assetId: 'narrator', role: 'voice', sourceInFrame: 0, volume: 1, startFrame: 0, durationFrames: 3 }
  const withVoice = { ...presenter, assets: [...presenter.assets, { id: 'narrator', kind: 'audio', path: 'voice.wav', description: 'synthetic' }],
    audio: [voice], narration: { ...presenter.narration, assetId: 'narrator', trackId: voice.id } }
  assert.throws(() => parseDirectorPlan(withVoice), /conflicts/)
  assert.throws(() => parseDirectorPlan({ ...withVoice, presenter: { ...withVoice.presenter, audio: 'muted' },
    audio: [voice, { ...voice, id: 'duplicate' }] }), /must not overlap/)
  const { tracks, filters } = buildAudioGraph(presenter)
  assert.equal(tracks.length, 1)
  assert.equal(tracks[0].sourceInFrame, 7)
  assert.match(filters.at(-1), /amix=inputs=1:/)
  assert.match(filters[0], /volume=0.5/)
  assert.throws(() => parseDirectorPlan({ ...presenter, assets: withVoice.assets,
    audio: [{ ...voice, role: undefined }] }), /explicit roles/)
  const mixed = buildAudioGraph(parseDirectorPlan({ ...presenter, assets: withVoice.assets,
    audio: [{ ...voice, role: 'music' }] }))
  assert.equal(mixed.tracks.length, 2)
  assert.match(mixed.filters.at(-1), /amix=inputs=2:/)
  console.log('PASS additive schema, layout coverage, explicit video resolution and single voice authority')

  const base = join(work, 'plan.json'), transcriptPath = join(work, 'words.json'), out = join(work, 'aligned.json')
  const inputSrt = join(work, 'input.srt'), imported = join(work, 'transcript.json')
  await Promise.all([writeFile(base, JSON.stringify(input)), writeFile(transcriptPath, JSON.stringify(repeats)), writeFile(inputSrt, srt)])
  assert.equal((await command(['director', 'import-transcript', inputSrt, '--output', imported])).words, 3)
  assert.equal((await command(['director', 'align-transcript', base, transcriptPath, '--output', out, '--captions', 'word'])).captions, 5)
  assert.equal((await command(['director', 'export-captions', out, '--output', join(work, 'captions.vtt')])).captions, 5)
  assert.match((await command(['director', 'validate-presenter', out], 1)).error, /Missing presenter media/)
  assert.match((await command(['director', 'import-transcript', inputSrt, '--output', imported], 1)).error, /存在/)
  assert.match((await command(['director', 'align-transcript', base, transcriptPath, '--output', out, '--captions', 'line'], 2)).error, /sentence or word/)
  assert.match((await command(['director', 'import-transcript', inputSrt], 2)).error, /output/)
  console.log('PASS presenter CLI JSON, caption export, no-overwrite, and exit codes 0/1/2')
} finally {
  await server.close()
}
