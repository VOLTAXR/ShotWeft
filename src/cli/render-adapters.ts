import { renderVideo } from './video'

export interface RenderAdapter<Request> {
  readonly engine: string
  render(request: Request): Promise<unknown>
}
export interface LegacyRenderRequest { source: string; output: string; ffmpeg?: string; ffprobe?: string }
export class LegacyFFmpegRenderAdapter implements RenderAdapter<LegacyRenderRequest> {
  readonly engine = 'legacy-ffmpeg'
  render({ source, output, ffmpeg, ffprobe }: LegacyRenderRequest) { return renderVideo(source, output, { ffmpeg, ffprobe }) }
}
