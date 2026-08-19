import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { exportBackup, importBackup, type BackupFile } from '../db/drumline'
import { formatBytes, storageEstimate } from '../db/library'
import { useDrumline } from '../state/useDrumline'
import { useToast } from '../state/useToast'
import { ConfirmModal } from '../components/Modal'
import { Back, Download, Upload } from '../components/icons'

/**
 * Backup — the one and only way data leaves the device, and it's manual.
 * Data-only export is small enough to text yourself; the full backup carries
 * the recordings too (base64, so expect it to be chunky).
 */
export function BackupPage() {
  const reload = useDrumline((s) => s.reloadAfterImport)
  const recordings = useDrumline((s) => s.recordings)
  const show = useToast((s) => s.show)

  const [busy, setBusy] = useState<string | null>(null)
  const [pendingImport, setPendingImport] = useState<BackupFile | null>(null)
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void storageEstimate().then(setEstimate)
  }, [])

  const stamp = () => {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }

  const doExport = async (includeMedia: boolean) => {
    setBusy(includeMedia ? 'full' : 'data')
    try {
      const backup = await exportBackup(includeMedia)
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `chopbuilder-${includeMedia ? 'full' : 'data'}-${stamp()}.json`
      a.click()
      URL.revokeObjectURL(url)
      show(`Exported (${formatBytes(blob.size)})`)
    } catch {
      show('Export failed')
    } finally {
      setBusy(null)
    }
  }

  const onPickFile = async (f: File) => {
    setBusy('read')
    try {
      const parsed = JSON.parse(await f.text()) as BackupFile
      if (parsed.app !== 'chopbuilder' || parsed.kind !== 'backup' || !parsed.data) {
        show("That file isn't a ChopBuilder backup")
        return
      }
      setPendingImport(parsed)
    } catch {
      show("Couldn't read that file")
    } finally {
      setBusy(null)
    }
  }

  const recCount = recordings.length

  return (
    <div className="dl-page">
      <div className="page-head">
        <Link to="/more" className="btn icon ghost" aria-label="Back to More">
          <Back size={18} />
        </Link>
        <h2 className="page-title">Backup</h2>
      </div>

      <section className="pref-block card">
        <h4 className="section-label">Export</h4>
        <p className="pref-note">
          Players, checkpoints, statuses, history, notes, sessions and personal records go in both.
          The full backup adds the audio of your {recCount} recording{recCount === 1 ? '' : 's'}.
        </p>
        <div className="pref-actions">
          <button className="btn primary" disabled={busy !== null} onClick={() => void doExport(false)}>
            <Download size={15} /> {busy === 'data' ? 'Exporting…' : 'Export data'}
          </button>
          <button className="btn" disabled={busy !== null} onClick={() => void doExport(true)}>
            <Download size={15} /> {busy === 'full' ? 'Exporting…' : 'Full backup (with audio)'}
          </button>
        </div>
      </section>

      <section className="pref-block card">
        <h4 className="section-label">Import</h4>
        <p className="pref-note">
          Restores a backup file onto this device. Everything currently in the tracker is replaced —
          export first if in doubt.
        </p>
        <button className="btn" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
          <Upload size={15} /> {busy === 'read' ? 'Reading…' : 'Choose backup file'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onPickFile(f)
            e.target.value = ''
          }}
        />
      </section>

      {estimate && estimate.quota > 0 && (
        <p className="storage-note">
          {formatBytes(estimate.usage)} used of {formatBytes(estimate.quota)} available
        </p>
      )}

      {pendingImport && (
        <ConfirmModal
          title="Replace tracker data?"
          body={`This backup from ${new Date(pendingImport.exportedAt).toLocaleDateString()} has ${
            pendingImport.data.players?.length ?? 0
          } players, ${pendingImport.data.notes?.length ?? 0} notes and ${
            pendingImport.media?.length ?? 0
          } recordings. Everything currently on this device is replaced.`}
          confirmText="Replace"
          onCancel={() => setPendingImport(null)}
          onConfirm={() => {
            const file = pendingImport
            setPendingImport(null)
            setBusy('import')
            void importBackup(file)
              .then(async () => {
                await reload()
                show('Backup restored')
              })
              .catch(() => show('Import failed — nothing was changed'))
              .finally(() => setBusy(null))
          }}
        />
      )}
    </div>
  )
}
