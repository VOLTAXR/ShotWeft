import { chmod } from 'node:fs/promises'
import { build } from 'vite'

await build({
  publicDir: false,
  build: {
    ssr: 'src/cli/entry.ts',
    outDir: 'dist/cli',
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'shotweft.js', chunkFileNames: '[name]-[hash].js' } },
    ssrEmitAssets: false,
  },
  ssr: { target: 'node' },
})

await build({
  publicDir: false,
  build: {
    lib: { entry: 'src/cli/pdf-renderer.ts', name: 'ShotWeftPDF', formats: ['iife'], fileName: () => 'render.js' },
    outDir: 'dist/cli',
    emptyOutDir: false,
  },
})

await chmod('dist/cli/shotweft.js', 0o755)
