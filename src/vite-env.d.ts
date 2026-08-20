/// <reference types="vite/client" />

/** Build timestamp injected by vite.config.ts `define` (dev runs show 'dev'). */
declare const __BUILD_TIME__: string

declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const src: string
  export default src
}
