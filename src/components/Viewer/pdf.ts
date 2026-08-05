import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Vite hands us a hashed URL for the worker bundle, which keeps rendering off
// the main thread — without it pdf.js falls back to fake-worker mode and the
// UI freezes while pages rasterise.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

/**
 * pdf.js loads the 14 standard PDF fonts (Helvetica, Times, Courier…) and CJK
 * character maps as separate data files. Without these URLs any score whose
 * text uses a standard font fails to render — the page comes out blank white.
 * In dev Vite serves node_modules directly; for the build, vite.config copies
 * both folders into dist/pdfjs so it still works fully offline.
 */
const ASSET_ROOT = import.meta.env.DEV ? '/node_modules/pdfjs-dist/' : './pdfjs/'

export type PDFDocument = pdfjsLib.PDFDocumentProxy

export async function loadPdf(blob: Blob): Promise<PDFDocument> {
  const data = await blob.arrayBuffer()
  return pdfjsLib.getDocument({
    data,
    standardFontDataUrl: `${ASSET_ROOT}standard_fonts/`,
    cMapUrl: `${ASSET_ROOT}cmaps/`,
    cMapPacked: true,
  }).promise
}

/** True when a render was superseded rather than genuinely failing. */
export function isCancelled(err: unknown) {
  return (err as { name?: string })?.name === 'RenderingCancelledException'
}

/** Pages laid out per view, and how they wrap into a grid. */
export const LAYOUTS: Record<number, { cols: number; rows: number }> = {
  1: { cols: 1, rows: 1 },
  2: { cols: 2, rows: 1 },
  3: { cols: 3, rows: 1 },
  4: { cols: 2, rows: 2 },
}
