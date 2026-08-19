import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ScoreViewer } from '../components/Viewer/ScoreViewer'
import { MetronomeDock } from '../components/Metronome/MetronomeDock'
import { metronome } from '../audio/metronome'
import { useBeat, useMetronome } from '../state/useMetronome'
import { useLibrary } from '../state/useLibrary'
import { getFile, type ScoreFile } from '../db/library'
import {
  Back,
  ChevronLeft,
  ChevronRight,
  Compress,
  Expand,
  Grid1,
  Grid2,
  Grid3,
  Grid4,
  Metro,
  ZoomIn,
  ZoomOut,
} from '../components/icons'

const LAYOUT_KEY = 'chopbuilder:layout'
const DOCK_KEY = 'chopbuilder:dock'

const LAYOUT_ICONS = [
  { n: 1, Icon: Grid1, label: 'Single page' },
  { n: 2, Icon: Grid2, label: 'Two pages' },
  { n: 3, Icon: Grid3, label: 'Three pages' },
  { n: 4, Icon: Grid4, label: 'Four pages' },
]

export function PracticePage() {
  const { fileId } = useParams()
  const nav = useNavigate()
  const notePageCount = useLibrary((s) => s.notePageCount)
  const notePractice = useLibrary((s) => s.notePractice)

  const [file, setFile] = useState<ScoreFile | null>(null)
  const [missing, setMissing] = useState(false)
  const [pagesPerView, setPagesPerView] = useState(() =>
    Number(localStorage.getItem(LAYOUT_KEY)) || 1,
  )
  const [startPage, setStartPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [total, setTotal] = useState(0)
  const [showDock, setShowDock] = useState(() => localStorage.getItem(DOCK_KEY) !== 'off')
  const [isFull, setIsFull] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let dead = false
    if (!fileId) return
    getFile(fileId).then((f) => {
      if (dead) return
      if (!f) return setMissing(true)
      setFile(f)
      setTotal(f.pageCount ?? 0)
      setStartPage(1)
      // Pick the piece up at the tempo it was last practised at — unless the
      // click is already running, in which case yanking it would be rude.
      if (f.practiceBpm && !metronome.running) {
        metronome.update({ bpm: f.practiceBpm })
      }
    })
    return () => {
      dead = true
    }
  }, [fileId])

  // Remember this session: stamp the visit, then keep the stored tempo in
  // sync (debounced) so reopening the piece restores where you left off.
  useEffect(() => {
    if (!file) return
    const save = () => notePractice(file.id, metronome.settings.bpm)
    save()
    let t: number | undefined
    const unsub = metronome.subscribe(() => {
      clearTimeout(t)
      t = window.setTimeout(save, 1200)
    })
    return () => {
      clearTimeout(t)
      unsub()
      save()
    }
  }, [file, notePractice])

  // Fullscreen practice: the score fills the display, nav chrome disappears.
  useEffect(() => {
    const onChange = () => setIsFull(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
    } else {
      void rootRef.current?.requestFullscreen().catch(() => {})
    }
  }, [])

  useEffect(() => localStorage.setItem(LAYOUT_KEY, String(pagesPerView)), [pagesPerView])
  useEffect(() => localStorage.setItem(DOCK_KEY, showDock ? 'on' : 'off'), [showDock])

  const lastStart = Math.max(1, total - pagesPerView + 1)
  const canPrev = startPage > 1
  const canNext = startPage + pagesPerView <= total

  const goPrev = useCallback(
    () => setStartPage((p) => Math.max(1, p - pagesPerView)),
    [pagesPerView],
  )
  const goNext = useCallback(
    () => setStartPage((p) => Math.min(lastStart, p + pagesPerView)),
    [pagesPerView, lastStart],
  )

  // Keep the view valid when the layout changes under it.
  useEffect(() => {
    setStartPage((p) => Math.min(Math.max(1, p), Math.max(1, total - pagesPerView + 1)))
  }, [pagesPerView, total])

  const { nudge } = useMetronome()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return
      switch (e.key) {
        // PageDown/PageUp match what Bluetooth page-turner pedals send, so a
        // pedal works here with no setup.
        case 'ArrowRight':
        case 'PageDown':
          e.preventDefault()
          goNext()
          break
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault()
          goPrev()
          break
        case 'Home':
          e.preventDefault()
          setStartPage(1)
          break
        case 'End':
          e.preventDefault()
          setStartPage(lastStart)
          break
        case 'ArrowUp':
          e.preventDefault()
          nudge(e.shiftKey ? 10 : 1)
          break
        case 'ArrowDown':
          e.preventDefault()
          nudge(e.shiftKey ? -10 : -1)
          break
        case 'f':
        case 'F':
          e.preventDefault()
          toggleFullscreen()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, nudge, lastStart, toggleFullscreen])

  const handlePageCount = useCallback(
    (n: number) => {
      setTotal(n)
      if (fileId) void notePageCount(fileId, n)
    },
    [fileId, notePageCount],
  )

  // One object URL per file rather than one per render, released on unmount.
  const blobUrl = useMemo(() => (file ? URL.createObjectURL(file.blob) : null), [file])
  useEffect(() => () => void (blobUrl && URL.revokeObjectURL(blobUrl)), [blobUrl])

  if (missing) {
    return (
      <div className="viewer-empty" style={{ height: '100%' }}>
        <strong>That file isn’t in your library any more.</strong>
        <button className="btn" onClick={() => nav('/library')}>
          Back to library
        </button>
      </div>
    )
  }

  if (!file) {
    return (
      <div className="viewer-empty" style={{ height: '100%' }}>
        <div className="spinner" />
      </div>
    )
  }

  const viewable = file.kind === 'pdf' || file.kind === 'image'

  return (
    <div className="practice" ref={rootRef}>
      <div className="score-area">
        <div className="viewer-bar">
          <button className="btn ghost icon" onClick={() => nav('/library')} title="Back to library">
            <Back size={16} />
          </button>
          <span className="viewer-title" title={file.name}>
            {file.name}
          </span>

          {viewable && file.kind === 'pdf' && (
            <>
              <span className="sep" />
              <div className="seg" role="group" aria-label="Pages per view">
                {LAYOUT_ICONS.map(({ n, Icon, label }) => (
                  <button
                    key={n}
                    aria-pressed={pagesPerView === n}
                    onClick={() => setPagesPerView(n)}
                    title={label}
                  >
                    <Icon size={15} />
                  </button>
                ))}
              </div>

              <span className="sep" />
              <button
                className="btn sm"
                onClick={goPrev}
                disabled={!canPrev}
                title="Previous page (←)"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="page-readout">
                {total === 0
                  ? '—'
                  : pagesPerView === 1
                    ? `${startPage} / ${total}`
                    : `${startPage}–${Math.min(startPage + pagesPerView - 1, total)} / ${total}`}
              </span>
              <button className="btn sm" onClick={goNext} disabled={!canNext} title="Next page (→)">
                <ChevronRight size={15} />
              </button>
            </>
          )}

          {viewable && (
            <>
              <span className="sep" />
              <button
                className="btn sm"
                onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.15).toFixed(2)))}
                title="Zoom out"
              >
                <ZoomOut size={15} />
              </button>
              <span className="page-readout" style={{ minWidth: 52 }}>
                {Math.round(zoom * 100)}%
              </span>
              <button
                className="btn sm"
                onClick={() => setZoom((z) => Math.min(4, +(z + 0.15).toFixed(2)))}
                title="Zoom in"
              >
                <ZoomIn size={15} />
              </button>
              {zoom !== 1 && (
                <button className="btn sm ghost" onClick={() => setZoom(1)}>
                  Fit
                </button>
              )}
            </>
          )}

          <span style={{ flex: 1 }} />
          <button
            className="btn ghost icon"
            onClick={toggleFullscreen}
            title={isFull ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
            aria-label={isFull ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFull ? <Compress size={15} /> : <Expand size={15} />}
          </button>
          {!showDock && (
            <button className="btn sm primary" onClick={() => setShowDock(true)}>
              <Metro size={14} /> Metronome
            </button>
          )}
        </div>

        {viewable ? (
          <ScoreViewer
            blob={file.blob}
            kind={file.kind as 'pdf' | 'image'}
            pagesPerView={file.kind === 'image' ? 1 : pagesPerView}
            startPage={startPage}
            zoom={zoom}
            onPageCount={handlePageCount}
          />
        ) : file.kind === 'audio' ? (
          <div className="pages-wrap">
            <div className="audio-shell">
              <strong>{file.name}</strong>
              {blobUrl && <audio controls src={blobUrl} />}
              <span style={{ color: 'var(--text-faint)', fontSize: 13 }}>
                Play along with the metronome running.
              </span>
            </div>
          </div>
        ) : (
          <div className="viewer-empty">
            <strong>No preview for this file type</strong>
            <span style={{ fontSize: 13 }}>
              It’s safely stored in your library — download it to open elsewhere.
            </span>
            <a className="btn" href={blobUrl ?? undefined} download={file.name}>
              Download
            </a>
          </div>
        )}
      </div>

      {showDock ? <MetronomeDock onHide={() => setShowDock(false)} /> : <CollapsedRail onShow={() => setShowDock(true)} />}
    </div>
  )
}

/** Slim strip that keeps the beat visible even with the panel closed. */
function CollapsedRail({ onShow }: { onShow: () => void }) {
  const { settings, running } = useMetronome()
  const beat = useBeat()

  return (
    <div className="rail">
      <button className="rail-pill" onClick={onShow} title="Show metronome">
        {settings.bpm} BPM
      </button>
      {running &&
        settings.accents.map((state, i) => (
          <span
            key={i}
            className={`rail-beat${beat.isBeat && beat.beatIndex === i ? ' lit' : ''}${
              state === 'accent' ? ' accent' : ''
            }`}
          />
        ))}
    </div>
  )
}
