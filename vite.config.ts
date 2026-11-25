import { defineConfig } from 'vite'

// flubber publishes ESM next to a CommonJS bundle; process it through Vite in
// SSR so the named `interpolate` export is available in tests and the Player.
export default defineConfig({
  ssr: { noExternal: ['flubber'] },
})
