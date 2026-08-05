import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { LAYOUTS, isCancelled, loadPdf, type PDFDocument } from './pdf'

const GAP = 14
const PAD = 16

interface Box {
  w: number
  h: number
}

/**
 * Renders a PDF (or image) as 1–4 pages side by side. Pages are rasterised to
 * fit the cell they land in, so "4 up" genuinely shows four readable pages
 * rather than four scrollbars.
 */
export function ScoreViewer({
  blob,
  kind,
  pagesPerView,
  startPage,
  zoom,
  onPageCount,
}: {
  blob: Blob
  kind: 'pdf' | 'image'
  pagesPerView: number
  startPage: number
  zoom: number
  onPageCount: (n: number) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<PDFDocument | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [box, setBox] = useState<Box>({ w: 0, h: 0 })
  const [imgUrl, setImgUrl] = useState<string | null>(null)

  // --- load ---------------------------------------------------------------
  useEffect(() => {
    let dead = false
    setDoc(null)
    setError(null)

    if (kind === 'image') {
      const url = URL.createObjectURL(blob)
      setImgUrl(url)
      return () => URL.revokeObjectURL(url)
    }

    loadPdf(blob)
      .then((d) => {
        if (dead) return void d.destroy()
        setDoc(d)
        onPageCount(d.numPages)
      })
      .catch((e) => {
        if (!dead) setError(e?.message ?? 'This PDF could not be opened.')
      })

    return () => {
      dead = true
    }
    // onPageCount is stable enough; re-running on it would reload the document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob, kind])

  useEffect(() => () => void doc?.destroy(), [doc])

  // --- measure the available area ------------------------------------------
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () =>
      setBox({ w: el.clientWidth - PAD * 2, h: el.clientHeight - PAD * 2 })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const layout = LAYOUTS[pagesPerView] ?? LAYOUTS[1]
  const cell = useMemo<Box>(
    () => ({
      w: Math.max(60, (box.w - GAP * (layout.cols - 1)) / layout.cols),
      h: Math.max(60, (box.h - GAP * (layout.rows - 1)) / layout.rows),
    }),
    [box, layout],
  )

  const total = kind === 'image' ? 1 : (doc?.numPages ?? 0)
  const pages = Array.from({ length: pagesPerView }, (_, i) => startPage + i).filter(
    (n) => n <= total,
  )

  if (error) {
    return (
      <div className="pages-wrap" ref={wrapRef}>
        <div className="viewer-empty">
          <strong>Couldn’t open this file</strong>
          <span>{error}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="pages-wrap" ref={wrapRef}>
      {kind === 'image' ? (
        <div className="pages">
          <div className="page-card">
            {imgUrl && (
              <img
                src={imgUrl}
                alt="Sheet music"
                style={{
                  maxWidth: cell.w * zoom,
                  maxHeight: zoom > 1 ? undefined : cell.h,
                }}
              />
            )}
          </div>
        </div>
      ) : !doc || box.w === 0 ? (
        <div className="viewer-empty">
          <div className="spinner" />
        </div>
      ) : (
        <div
          className="pages"
          style={{ gridTemplateColumns: `repeat(${Math.min(layout.cols, pages.length)}, auto)` }}
        >
          {pages.map((n) => (
            <PdfPage key={`${n}-${pagesPerView}`} doc={doc} pageNumber={n} cell={cell} zoom={zoom} />
          ))}
        </div>
      )}
    </div>
  )
}

function PdfPage({
  doc,
  pageNumber,
  cell,
  zoom,
}: {
  doc: PDFDocument
  pageNumber: number
  cell: Box
  zoom: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let task: { cancel: () => void } | null = null

    const run = async () => {
      const page = await doc.getPage(pageNumber)
      if (cancelled) return

      const base = page.getViewport({ scale: 1 })
      // Fit the page inside its cell, then apply the user's zoom on top.
      const fit = Math.min(cell.w / base.width, cell.h / base.height)
      const scale = Math.max(0.05, fit * zoom)
      // Rasterise at device resolution so staff lines stay crisp.
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const vp = page.getViewport({ scale: scale * dpr })

      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = Math.max(1, Math.floor(vp.width))
      canvas.height = Math.max(1, Math.floor(vp.height))
      canvas.style.width = `${Math.floor(vp.width / dpr)}px`
      canvas.style.height = `${Math.floor(vp.height / dpr)}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const render = page.render({ canvasContext: ctx, viewport: vp })
      task = render
      try {
        await render.promise
        if (!cancelled) {
          setReady(true)
          setFailed(null)
        }
      } catch (err) {
        // A cancelled render is routine (resize, page turn). Anything else is a
        // real failure and must surface rather than leaving a blank white page.
        if (!cancelled && !isCancelled(err)) {
          console.error(`Failed to render page ${pageNumber}`, err)
          setFailed((err as Error)?.message ?? 'Render failed')
        }
      }
    }

    void run()
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, pageNumber, cell.w, cell.h, zoom])

  return (
    <div className="page-card">
      <canvas ref={canvasRef} />
      {failed && <span className="page-error">Page {pageNumber} failed to render</span>}
      {ready && <span className="page-num">{pageNumber}</span>}
    </div>
  )
}
