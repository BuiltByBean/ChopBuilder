import { useEffect, useMemo, useRef, useState } from 'react'
import { formatBytes } from '../db/library'
import { getRecordingBlob, playerName, type RecordingMeta } from '../db/drumline'
import { fmtDayYear, useDrumline } from '../state/useDrumline'
import { useToast } from '../state/useToast'
import { Sheet } from '../components/Sheet'
import { ConfirmModal } from '../components/Modal'
import { Close, Play, RecDot, Trash, Upload } from '../components/icons'

/**
 * Recordings — reference audio for "listen to yourself in week 1 vs now".
 * Record in-app or import a file; pick any two and play them back to back.
 * Everything stays in IndexedDB on this device.
 */
export function RecordingsPage() {
  const recordings = useDrumline((s) => s.recordings)
  const players = useDrumline((s) => s.players)
  const removeRecording = useDrumline((s) => s.removeRecording)
  const show = useToast((s) => s.show)

  const [pendingBlob, setPendingBlob] = useState<{ blob: Blob; mime: string } | null>(null)
  const [filter, setFilter] = useState<'all' | 'baseline' | string>('all')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [abA, setAbA] = useState<string | null>(null)
  const [abB, setAbB] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<RecordingMeta | null>(null)

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])

  const list = useMemo(() => {
    let l = [...recordings].sort((a, b) => b.createdAt - a.createdAt)
    if (filter === 'baseline') l = l.filter((r) => r.isBaseline)
    else if (filter !== 'all') l = l.filter((r) => r.playerId === filter)
    return l
  }, [recordings, filter])

  const playerFilterOptions = useMemo(() => {
    const ids = new Set(recordings.map((r) => r.playerId).filter(Boolean) as string[])
    return players.filter((p) => ids.has(p.id))
  }, [recordings, players])

  const toggleAb = (id: string) => {
    if (abA === id) setAbA(null)
    else if (abB === id) setAbB(null)
    else if (!abA) setAbA(id)
    else if (!abB) setAbB(id)
    else setAbB(id)
  }

  return (
    <div className="dl-page">
      <div className="page-head">
        <h2 className="page-title">Recordings</h2>
      </div>

      <RecorderBar onCaptured={(blob, mime) => setPendingBlob({ blob, mime })} />

      <div className="tag-filter">
        <button
          className={`filter-chip${filter === 'all' ? ' active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          className={`filter-chip${filter === 'baseline' ? ' active' : ''}`}
          onClick={() => setFilter('baseline')}
        >
          Baselines
        </button>
        {playerFilterOptions.map((p) => (
          <button
            key={p.id}
            className={`filter-chip${filter === p.id ? ' active' : ''}`}
            onClick={() => setFilter(filter === p.id ? 'all' : p.id)}
          >
            {playerName(p)}
          </button>
        ))}
      </div>

      {list.length === 0 && (
        <p className="quiet-empty">
          No recordings{filter !== 'all' ? ' in this filter' : ' yet'}. Capture a baseline early —
          future-you needs the before.
        </p>
      )}

      <div className="rec-rows">
        {list.map((r) => {
          const p = r.playerId ? byId.get(r.playerId) : null
          const abMark = abA === r.id ? 'A' : abB === r.id ? 'B' : null
          return (
            <div key={r.id} className="recline card">
              <div className="recline-row">
                <button
                  className={`ab-pick${abMark ? ' on' : ''}`}
                  onClick={() => toggleAb(r.id)}
                  aria-label={abMark ? `Remove from compare (${abMark})` : 'Add to compare'}
                >
                  {abMark ?? '+'}
                </button>
                <div className="recline-main">
                  <span className="recline-label">
                    {r.isBaseline && <i className="baseline-badge">Baseline</i>}
                    {r.label}
                  </span>
                  <span className="recline-meta">
                    {p ? playerName(p) : 'Section'} · {fmtDayYear(r.createdAt)} ·{' '}
                    {formatBytes(r.size)}
                  </span>
                </div>
                <button
                  className="btn icon"
                  onClick={() => setPlayingId(playingId === r.id ? null : r.id)}
                  aria-label={playingId === r.id ? 'Close player' : 'Play'}
                >
                  {playingId === r.id ? <Close size={15} /> : <Play size={15} />}
                </button>
                <button
                  className="btn icon xs danger"
                  onClick={() => setConfirmDelete(r)}
                  aria-label="Delete recording"
                >
                  <Trash size={14} />
                </button>
              </div>
              {playingId === r.id && <InlinePlayer recording={r} />}
            </div>
          )
        })}
      </div>

      {(abA || abB) && (
        <AbBar
          a={recordings.find((r) => r.id === abA) ?? null}
          b={recordings.find((r) => r.id === abB) ?? null}
          onClear={() => {
            setAbA(null)
            setAbB(null)
          }}
        />
      )}

      {pendingBlob && (
        <SaveRecordingSheet
          blob={pendingBlob.blob}
          mime={pendingBlob.mime}
          onClose={() => setPendingBlob(null)}
        />
      )}
      {confirmDelete && (
        <ConfirmModal
          title="Delete this recording?"
          body={`"${confirmDelete.label}" is removed from this device permanently.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            removeRecording(confirmDelete.id)
            setConfirmDelete(null)
            show('Recording deleted')
          }}
        />
      )}
    </div>
  )
}

/** Record from the mic, or import an existing audio/video file. */
function RecorderBar({ onCaptured }: { onCaptured: (blob: Blob, mime: string) => void }) {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const supported = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const start = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', '']
      const mime = candidates.find((m) => !m || MediaRecorder.isTypeSupported(m)) ?? ''
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunks.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data)
      }
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const type = rec.mimeType || mime || 'audio/webm'
        onCaptured(new Blob(chunks.current, { type }), type)
        setRecording(false)
        stopTimer()
      }
      rec.start(1000)
      recRef.current = rec
      setElapsed(0)
      setRecording(true)
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    } catch {
      setError('Microphone unavailable — check the browser permission.')
    }
  }

  useEffect(
    () => () => {
      stopTimer()
      recRef.current?.stop()
    },
    [],
  )

  const mm = String(Math.floor(elapsed / 60))
  const ss = String(elapsed % 60).padStart(2, '0')

  return (
    <div className="recorder-bar card">
      {supported ? (
        <button
          className={`btn tall${recording ? ' danger-live' : ' primary'}`}
          onClick={() => (recording ? recRef.current?.stop() : void start())}
        >
          <RecDot size={16} />
          {recording ? `Stop · ${mm}:${ss}` : 'Record'}
        </button>
      ) : (
        <span className="quiet-empty">Recording isn't supported in this browser.</span>
      )}
      <button className="btn tall ghost" onClick={() => fileRef.current?.click()}>
        <Upload size={16} /> Import file
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,video/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onCaptured(f, f.type || 'application/octet-stream')
          e.target.value = ''
        }}
      />
      {error && <span className="rec-error">{error}</span>}
    </div>
  )
}

function useRecordingUrl(id: string | null) {
  const [url, setUrl] = useState<string | null>(null)
  const [mime, setMime] = useState('')
  useEffect(() => {
    if (!id) return
    let revoke: string | null = null
    let dead = false
    void getRecordingBlob(id).then((blob) => {
      if (!blob || dead) return
      revoke = URL.createObjectURL(blob)
      setMime(blob.type)
      setUrl(revoke)
    })
    return () => {
      dead = true
      if (revoke) URL.revokeObjectURL(revoke)
      setUrl(null)
    }
  }, [id])
  return { url, mime }
}

function InlinePlayer({ recording }: { recording: RecordingMeta }) {
  const { url, mime } = useRecordingUrl(recording.id)
  if (!url) return <div className="player-slot loading">Loading…</div>
  const isVideo = mime.startsWith('video/')
  return (
    <div className="player-slot">
      {isVideo ? (
        <video src={url} controls playsInline autoPlay />
      ) : (
        <audio src={url} controls autoPlay />
      )}
    </div>
  )
}

/**
 * The A/B bar — the "here's you at the start, here's you now" demo. Plays A
 * in full, then B, or either one alone.
 */
function AbBar({
  a,
  b,
  onClear,
}: {
  a: RecordingMeta | null
  b: RecordingMeta | null
  onClear: () => void
}) {
  const { url: urlA } = useRecordingUrl(a?.id ?? null)
  const { url: urlB } = useRecordingUrl(b?.id ?? null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [phase, setPhase] = useState<'idle' | 'A' | 'B'>('idle')
  const chainRef = useRef(false)

  useEffect(() => {
    const el = new Audio()
    audioRef.current = el
    const onEnd = () => {
      if (chainRef.current && urlB && el.src !== urlB) {
        chainRef.current = false
        el.src = urlB
        setPhase('B')
        void el.play()
      } else {
        setPhase('idle')
      }
    }
    el.addEventListener('ended', onEnd)
    return () => {
      el.removeEventListener('ended', onEnd)
      el.pause()
      audioRef.current = null
    }
  }, [urlB])

  const playOne = (url: string | null, tag: 'A' | 'B', chain = false) => {
    const el = audioRef.current
    if (!el || !url) return
    chainRef.current = chain
    el.src = url
    setPhase(tag)
    void el.play()
  }

  const stop = () => {
    audioRef.current?.pause()
    setPhase('idle')
    chainRef.current = false
  }

  return (
    <div className="ab-bar">
      <div className="ab-info">
        <span className={`ab-slot${phase === 'A' ? ' live' : ''}`}>
          A · {a ? a.label : 'pick one'}
        </span>
        <span className={`ab-slot${phase === 'B' ? ' live' : ''}`}>
          B · {b ? b.label : 'pick one'}
        </span>
      </div>
      <div className="ab-actions">
        <button
          className="btn sm primary"
          disabled={!urlA || !urlB}
          onClick={() => playOne(urlA, 'A', true)}
        >
          <Play size={13} /> A then B
        </button>
        <button className="btn sm" disabled={!urlA} onClick={() => playOne(urlA, 'A')}>
          A
        </button>
        <button className="btn sm" disabled={!urlB} onClick={() => playOne(urlB, 'B')}>
          B
        </button>
        {phase !== 'idle' && (
          <button className="btn sm ghost" onClick={stop}>
            Stop
          </button>
        )}
        <button className="btn icon xs ghost" onClick={onClear} aria-label="Clear compare">
          <Close size={14} />
        </button>
      </div>
    </div>
  )
}

function SaveRecordingSheet({
  blob,
  mime,
  onClose,
}: {
  blob: Blob
  mime: string
  onClose: () => void
}) {
  const players = useDrumline((s) => s.players)
  const addRecording = useDrumline((s) => s.addRecording)
  const show = useToast((s) => s.show)
  const [label, setLabel] = useState('')
  const [playerId, setPlayerId] = useState('')
  const [baseline, setBaseline] = useState(false)

  const active = players.filter((p) => p.active)

  return (
    <Sheet title="Save recording" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (!label.trim()) return
          addRecording(
            {
              playerId: playerId || null,
              sessionId: null,
              label: label.trim(),
              isBaseline: baseline,
              mime,
              size: blob.size,
            },
            blob,
          )
          show('Recording saved')
          onClose()
        }}
      >
        <div className="field">
          <label htmlFor="rec-label">Label</label>
          <input
            id="rec-label"
            className="input"
            placeholder="Week 8 8-on-a-hand"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor="rec-player">Player (optional)</label>
          <select
            id="rec-player"
            className="input"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
          >
            <option value="">Whole section</option>
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                {playerName(p)} — {p.instrument}
              </option>
            ))}
          </select>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={baseline}
            onChange={(e) => setBaseline(e.target.checked)}
          />
          <span className="track" />
          <span className="switch-label">This is a baseline</span>
        </label>
        <div className="sheet-actions">
          <button type="button" className="btn tall ghost" onClick={onClose}>
            Discard
          </button>
          <button type="submit" className="btn tall primary" disabled={!label.trim()}>
            Save
          </button>
        </div>
      </form>
    </Sheet>
  )
}
