import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderTree } from '../components/Library/FolderTree'
import { ConfirmModal, PromptModal } from '../components/Modal'
import {
  AudioIcon,
  Dots,
  FileIcon,
  FolderIcon,
  FolderPlus,
  ImageIcon,
  ImageIcon as Img,
  Metro,
  Pencil,
  Trash,
  Upload,
} from '../components/icons'
import { childFolders, countDeep, filesIn, folderPath, useLibrary } from '../state/useLibrary'
import { formatBytes, storageEstimate, type ScoreFile } from '../db/library'

type Dialog =
  | { kind: 'new-folder' }
  | { kind: 'rename-folder'; id: string; name: string }
  | { kind: 'rename-file'; id: string; name: string }
  | { kind: 'delete-folder'; id: string; name: string; count: number }
  | { kind: 'delete-file'; id: string; name: string }
  | null

export function LibraryPage() {
  const nav = useNavigate()
  const lib = useLibrary()
  const { folders, files, currentFolderId } = lib
  const [dialog, setDialog] = useState<Dialog>(null)
  const [dragging, setDragging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [usage, setUsage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  const path = folderPath(folders, currentFolderId)
  const subFolders = childFolders(folders, currentFolderId)
  const items = filesIn(files, currentFolderId)

  useEffect(() => {
    storageEstimate().then((e) => {
      if (e && e.usage > 0) setUsage(`${formatBytes(e.usage)} stored on this device`)
    })
  }, [files.length])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(id)
  }, [toast])

  const doUpload = async (list: FileList | File[], folderId?: string | null) => {
    const n = await lib.upload(list, folderId)
    if (n) setToast(`Added ${n} file${n > 1 ? 's' : ''}`)
  }

  return (
    <div className="library">
      <div className="tree-pane">
        <div className="tree-head">
          <h3>Library</h3>
          <button
            className="btn ghost icon"
            title="New folder"
            onClick={() => setDialog({ kind: 'new-folder' })}
          >
            <FolderPlus size={16} />
          </button>
        </div>
        <FolderTree />
        <div className="tree-actions">
          <button className="btn primary" onClick={() => inputRef.current?.click()}>
            <Upload size={15} /> Upload music
          </button>
          {usage && <div className="storage-note">{usage}</div>}
        </div>
      </div>

      <div className="content-pane">
        <div className="crumbs">
          <button className="crumb" onClick={() => lib.openFolder(null)}>
            All music
          </button>
          {path.map((f, i) => (
            <span key={f.id} style={{ display: 'contents' }}>
              <span className="crumb-sep">/</span>
              <button
                className={`crumb${i === path.length - 1 ? ' current' : ''}`}
                onClick={() => lib.openFolder(f.id)}
              >
                {f.name}
              </button>
            </span>
          ))}
          <span style={{ flex: 1 }} />
          <button className="btn sm" onClick={() => setDialog({ kind: 'new-folder' })}>
            <FolderPlus size={14} /> New folder
          </button>
          <button className="btn sm primary" onClick={() => inputRef.current?.click()}>
            <Upload size={14} /> Upload
          </button>
        </div>

        <div
          className={`drop-zone${dragging ? ' dragging' : ''}`}
          onDragEnter={(e) => {
            if (!e.dataTransfer.types.includes('Files')) return
            dragDepth.current += 1
            setDragging(true)
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => {
            dragDepth.current -= 1
            if (dragDepth.current <= 0) setDragging(false)
          }}
          onDrop={async (e) => {
            e.preventDefault()
            dragDepth.current = 0
            setDragging(false)
            if (e.dataTransfer.files.length) await doUpload(e.dataTransfer.files)
          }}
        >
          {subFolders.length === 0 && items.length === 0 ? (
            <div className="empty">
              <Img size={38} />
              <h3>{currentFolderId ? 'This folder is empty' : 'Your library is empty'}</h3>
              <p>
                Drop PDFs, scans, or audio anywhere here — or make a folder like{' '}
                <b>Snare Warmups</b> to keep things organised.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={() => setDialog({ kind: 'new-folder' })}>
                  <FolderPlus size={15} /> New folder
                </button>
                <button className="btn primary" onClick={() => inputRef.current?.click()}>
                  <Upload size={15} /> Upload music
                </button>
              </div>
            </div>
          ) : (
            <>
              {subFolders.length > 0 && (
                <>
                  <h4 className="section-label">Folders</h4>
                  <div className="grid">
                    {subFolders.map((f) => (
                      <FolderTile
                        key={f.id}
                        id={f.id}
                        name={f.name}
                        count={countDeep(folders, files, f.id)}
                        onOpen={() => lib.openFolder(f.id)}
                        onRename={() => setDialog({ kind: 'rename-folder', id: f.id, name: f.name })}
                        onDelete={() =>
                          setDialog({
                            kind: 'delete-folder',
                            id: f.id,
                            name: f.name,
                            count: countDeep(folders, files, f.id),
                          })
                        }
                      />
                    ))}
                  </div>
                </>
              )}

              {items.length > 0 && (
                <>
                  <h4 className="section-label">Music ({items.length})</h4>
                  <div className="grid">
                    {items.map((f) => (
                      <FileTile
                        key={f.id}
                        file={f}
                        onOpen={() => nav(`/practice/${f.id}`)}
                        onRename={() => setDialog({ kind: 'rename-file', id: f.id, name: f.name })}
                        onDelete={() => setDialog({ kind: 'delete-file', id: f.id, name: f.name })}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={async (e) => {
          if (e.target.files?.length) await doUpload(e.target.files)
          e.target.value = ''
        }}
      />

      {dialog?.kind === 'new-folder' && (
        <PromptModal
          title="New folder"
          label="Folder name"
          initial=""
          confirmText="Create"
          onCancel={() => setDialog(null)}
          onConfirm={async (name) => {
            await lib.addFolder(name)
            setDialog(null)
          }}
        />
      )}
      {dialog?.kind === 'rename-folder' && (
        <PromptModal
          title="Rename folder"
          label="Folder name"
          initial={dialog.name}
          onCancel={() => setDialog(null)}
          onConfirm={async (name) => {
            await lib.renameFolder(dialog.id, name)
            setDialog(null)
          }}
        />
      )}
      {dialog?.kind === 'rename-file' && (
        <PromptModal
          title="Rename file"
          label="File name"
          initial={dialog.name}
          onCancel={() => setDialog(null)}
          onConfirm={async (name) => {
            await lib.renameFile(dialog.id, name)
            setDialog(null)
          }}
        />
      )}
      {dialog?.kind === 'delete-folder' && (
        <ConfirmModal
          title={`Delete "${dialog.name}"?`}
          body={
            dialog.count > 0
              ? `This also deletes ${dialog.count} file${dialog.count > 1 ? 's' : ''} inside it. This can't be undone.`
              : "This can't be undone."
          }
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            await lib.removeFolder(dialog.id)
            setDialog(null)
            setToast('Folder deleted')
          }}
        />
      )}
      {dialog?.kind === 'delete-file' && (
        <ConfirmModal
          title={`Delete "${dialog.name}"?`}
          body="This removes it from your library on this device."
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            await lib.removeFile(dialog.id)
            setDialog(null)
            setToast('File deleted')
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function TileMenu({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  return (
    <div className="tile-menu" onClick={(e) => e.stopPropagation()}>
      <button
        className="btn ghost icon"
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
      >
        <Dots size={15} />
      </button>
      {open && (
        <div className="menu">
          <button onClick={onRename}>
            <Pencil size={14} /> Rename
          </button>
          <button className="danger" onClick={onDelete}>
            <Trash size={14} /> Delete
          </button>
        </div>
      )}
    </div>
  )
}

function FolderTile({
  id,
  name,
  count,
  onOpen,
  onRename,
  onDelete,
}: {
  id: string
  name: string
  count: number
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const { moveFile, moveFolder, upload } = useLibrary()
  const [over, setOver] = useState(false)

  return (
    <div
      className={`tile folder${over ? ' drop' : ''}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('chop/folder', id)}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(false)
        if (e.dataTransfer.files.length) return void upload(e.dataTransfer.files, id)
        const fileId = e.dataTransfer.getData('chop/file')
        if (fileId) return void moveFile(fileId, id)
        const folderId = e.dataTransfer.getData('chop/folder')
        if (folderId && folderId !== id) return void moveFolder(folderId, id)
      }}
    >
      <TileMenu onRename={onRename} onDelete={onDelete} />
      <div className="tile-icon">
        <FolderIcon size={18} />
      </div>
      <div className="tile-name">{name}</div>
      <div className="tile-meta">
        {count} file{count === 1 ? '' : 's'}
      </div>
    </div>
  )
}

function FileTile({
  file,
  onOpen,
  onRename,
  onDelete,
}: {
  file: ScoreFile
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const Icon = file.kind === 'image' ? ImageIcon : file.kind === 'audio' ? AudioIcon : FileIcon
  const label =
    file.kind === 'pdf'
      ? file.pageCount
        ? `PDF · ${file.pageCount}p`
        : 'PDF'
      : file.kind.toUpperCase()

  return (
    <div
      className="tile"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('chop/file', file.id)}
      title={`Open ${file.name} with the metronome`}
    >
      <TileMenu onRename={onRename} onDelete={onDelete} />
      <div className="tile-icon">
        <Icon size={18} />
      </div>
      <div className="tile-name">{file.name}</div>
      <div className="tile-meta">
        {label} · {formatBytes(file.size)}
      </div>
    </div>
  )
}
