import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { MetronomeFull } from '../components/Metronome/MetronomeFull'
import { useLibrary } from '../state/useLibrary'
import { FileIcon } from '../components/icons'

export function MetronomePage() {
  const { files, loaded, load } = useLibrary()

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  const recent = [...files].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4)

  return (
    <div className="metronome-page">
      <div className="metronome-shell">
        <MetronomeFull />

        {recent.length > 0 && (
          <section className="card">
            <div className="card-head">
              <h2>Jump back in</h2>
              <Link className="btn sm ghost" to="/library">
                Open library
              </Link>
            </div>
            <div className="grid" style={{ padding: 16, marginBottom: 0 }}>
              {recent.map((f) => (
                <Link key={f.id} className="tile" to={`/practice/${f.id}`}>
                  <div className="tile-icon">
                    <FileIcon size={18} />
                  </div>
                  <div className="tile-name">{f.name}</div>
                  <div className="tile-meta">
                    {f.kind === 'pdf' && f.pageCount ? `${f.pageCount} pages` : f.kind.toUpperCase()}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
