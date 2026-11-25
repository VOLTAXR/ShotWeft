// flubber ships both an ESM entry and a CommonJS bundle. Vite's SSR runner may
// externalise the package to its CJS build, so `vite.config.ts` marks it as
// noExternal and this module keeps the ESM named import.
import { interpolate, type Interpolator } from 'flubber'

export function interpolatePath(from: string, to: string): Interpolator {
  return interpolate(from, to, { maxSegmentLength: 12 })
}
