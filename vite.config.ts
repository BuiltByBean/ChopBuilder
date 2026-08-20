import { createRequire } from 'node:module'
import { cp } from 'node:fs/promises'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const require = createRequire(import.meta.url)
const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'))

/**
 * pdf.js reads the standard font files and CJK cmaps over HTTP at render time.
 * Vite only bundles what's imported, so copy both folders into the build by
 * hand — otherwise scores using Helvetica/Times render as blank pages once
 * deployed. Kept local rather than pointed at a CDN so the app works offline.
 */
function pdfjsAssets(): Plugin {
  return {
    name: 'chopbuilder:pdfjs-assets',
    apply: 'build',
    async closeBundle() {
      const out = path.resolve('dist/pdfjs')
      await cp(path.join(pdfjsRoot, 'standard_fonts'), path.join(out, 'standard_fonts'), {
        recursive: true,
      })
      await cp(path.join(pdfjsRoot, 'cmaps'), path.join(out, 'cmaps'), { recursive: true })
    },
  }
}

export default defineConfig({
  // Relative base so the built site works from a subfolder as well as a domain root.
  base: './',
  // Stamped into Diagnostics so a phone screenshot proves which build it runs.
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16) + 'Z') },
  plugins: [react(), pdfjsAssets()],
  // PORT lets the dev-server launcher pick a free port when 5273 is taken.
  server: { port: Number(process.env.PORT) || 5273 },
  build: { chunkSizeWarningLimit: 1600 },
})
