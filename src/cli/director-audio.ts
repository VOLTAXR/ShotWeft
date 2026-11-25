import type { DirectorPlan } from '../core/director/plan'
import { directorAudioTracks } from '../core/presenter/plan'
import { sampleRate } from './ffmpeg'

export function buildAudioGraph(plan: DirectorPlan) {
  const tracks = directorAudioTracks(plan)
  const sampleAt = (frame: number) => Math.round(frame * sampleRate * plan.frameRate.denominator / plan.frameRate.numerator)
  const whole = sampleAt(plan.durationFrames)
  const filters = tracks.map((audio, i) => {
    const start = sampleAt(audio.startFrame), duration = sampleAt(audio.startFrame + audio.durationFrames) - start
    return '[' + (i + 1) + ':a:0]aresample=48000,aformat=channel_layouts=stereo,atrim=start_sample=' + sampleAt(audio.sourceInFrame) +
      ':end_sample=' + sampleAt(audio.sourceInFrame + audio.durationFrames) + ',asetpts=PTS-STARTPTS,apad=whole_len=' + duration +
      ',atrim=end_sample=' + duration + ',volume=' + audio.volume + ',adelay=' + start + 'S:all=1,apad=whole_len=' + whole + '[a' + i + ']'
  })
  const limiter = 'alimiter=limit=0.95:level=0:latency=1[sound]'
  if (tracks.length) filters.push(tracks.map((_, i) => '[a' + i + ']').join('') +
    'amix=inputs=' + tracks.length + ':duration=first:normalize=0,' + limiter)
  // Silent timelines skip the limiter: its lookahead can emit a full-scale click into an otherwise silent AAC stream.
  else filters.push('anullsrc=r=48000:cl=stereo,atrim=end_sample=' + whole + ',afade=t=in:st=0:d=0.05[sound]')
  return { tracks, filters }
}
