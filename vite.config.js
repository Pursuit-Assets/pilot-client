import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Pre-bundle mermaid at server start instead of letting Vite discover it
    // the first time someone opens /admin-prompts. Mermaid loads each diagram
    // type through an internal dynamic import (flowDiagram-*.js), so when the
    // dep optimizer re-runs mid-session it rewrites that chunk's filename and
    // browserHash — the already-loaded page then requests the OLD url and gets
    // "Failed to fetch dynamically imported module: .../flowDiagram-*.js?v=...".
    include: ['mermaid'],
  },
  server: {
    watch: {
      // iCloud Drive periodically replaces `node_modules` with a
      // `node_modules.nosync` symlink and recreates thousands of
      // tsconfig.json files inside it. Without these ignores Vite's
      // file watcher thrashes on every replacement, blows past its RSS
      // budget, and the dev server gets killed (exit 137). Excluding
      // both paths from the watcher fixes the crash loop while leaving
      // normal source-file watching intact.
      ignored: [
        '**/node_modules/**',
        '**/node_modules.nosync/**',
        '**/.git/**',
      ],
    },
  },
})
