import { parseTranscriptJSON, type Transcript } from './transcript'

export interface TranscriptionProvider {
  transcribe(mediaPath: string): Promise<Transcript>
}

export interface FasterWhisperOptions {
  /** An existing local model directory, never a model name or remote ID. */
  modelDirectory: string
  device?: 'cpu' | 'cuda'
  deviceIndex?: number
  computeType?: string
  cacheDirectory?: string
}

export interface FasterWhisperRuntime {
  isLocalModel(directory: string): Promise<boolean>
  transcribe(mediaPath: string, options: FasterWhisperOptions & { localFilesOnly: true; wordTimestamps: true }): Promise<unknown>
}

/** Host integration seam. The host must supply a local-only faster-whisper runtime. */
export function fasterWhisperProvider(options?: FasterWhisperOptions, runtime?: FasterWhisperRuntime): TranscriptionProvider {
  return {
    async transcribe(mediaPath) {
      if (!options?.modelDirectory?.trim() || !runtime) throw new Error('Faster-whisper requires a configured local model directory and runtime.')
      const { modelDirectory, device, deviceIndex, computeType, cacheDirectory } = options
      if (!mediaPath.trim() || (device !== undefined && device !== 'cpu' && device !== 'cuda') ||
          (deviceIndex !== undefined && (device !== 'cuda' || !Number.isSafeInteger(deviceIndex) || deviceIndex < 0)) ||
          (computeType !== undefined && !computeType.trim()) || (cacheDirectory !== undefined && !cacheDirectory.trim())) {
        throw new Error('Invalid faster-whisper media or local runtime settings.')
      }
      if (!await runtime.isLocalModel(modelDirectory)) throw new Error('Configured faster-whisper model is missing on disk.')
      return parseTranscriptJSON(await runtime.transcribe(mediaPath, {
        ...options, localFilesOnly: true, wordTimestamps: true,
      }))
    },
  }
}
