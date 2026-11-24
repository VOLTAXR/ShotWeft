export const audioLimit = 60 * 1024 * 1024
export const audioFormats = {
  'audio/wav': { extension: 'wav', label: 'WAV', aliases: ['audio/x-wav', 'audio/wave', 'audio/vnd.wave'] },
  'audio/mpeg': { extension: 'mp3', label: 'MP3', aliases: ['audio/mp3'] },
  'audio/mp4': { extension: 'm4a', label: 'M4A', aliases: ['audio/x-m4a', 'audio/m4a'] },
} as const
export type AudioFormat = keyof typeof audioFormats

export function isAudioFormat(type: string): type is AudioFormat {
  return Object.hasOwn(audioFormats, type)
}

export function audioExtension(name: string) {
  return /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase()
}

export async function validateAudioSignature(blob: Blob, type: AudioFormat) {
  if (!blob.size || blob.size > audioLimit) throw new Error('Audio files must be between 1 byte and 60 MiB.')
  const bytes = new Uint8Array(await blob.slice(0, 4096).arrayBuffer())
  const view = new DataView(bytes.buffer)
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4))
  let valid = false
  if (type === 'audio/wav') {
    valid = bytes.length > 12 && tag(0) === 'RIFF' && tag(8) === 'WAVE' &&
      view.getUint32(4, true) >= 4 && view.getUint32(4, true) <= blob.size - 8
  } else if (type === 'audio/mpeg' && bytes.length >= 4) {
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      const size = bytes.subarray(6, 10)
      valid = size.length === 4 && bytes[3] >= 2 && bytes[3] <= 4 && bytes[4] !== 0xff &&
        size.every(byte => byte < 128) && size.reduce((length, byte) => length * 128 + byte, 0) + 10 < blob.size
    } else {
      const version = (bytes[1] >> 3) & 3
      const layer = (bytes[1] >> 1) & 3
      const bitrate = bytes[2] >> 4
      const sampleRate = (bytes[2] >> 2) & 3
      valid = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && version !== 1 && layer === 1 &&
        bitrate > 0 && bitrate < 15 && sampleRate !== 3 && (bytes[3] & 3) !== 2
    }
  } else if (type === 'audio/mp4' && bytes.length >= 16 && tag(4) === 'ftyp') {
    const length = view.getUint32(0)
    if (length >= 16 && length <= bytes.length && length < blob.size && length % 4 === 0) {
      const brands = [tag(8)]
      for (let offset = 16; offset < length; offset += 4) brands.push(tag(offset))
      valid = brands.some(brand => brand === 'M4A ' || brand === 'M4B ')
    }
  }
  if (!valid) throw new Error('Invalid ' + audioFormats[type].label + ' file signature.')
}
