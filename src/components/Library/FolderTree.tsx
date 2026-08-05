import { useState } from 'react'
import { useLibrary, childFolders, countDeep } from '../../state/useLibrary'
import { ChevronRight, FolderIcon } from '../icons'

/**
 * Nested folder navigator. Rows accept drops of files (move into folder) and of
 * other folders (re-parent), matching what you'd expect from a file manager.
 */
export function FolderTree() {
  const { folders, files, currentFolderId, openFolder } = useLibrary()
  const rootCount = files.filter((f) => !f.folderId).length

  return (
    <nav className="tree" aria-label="Folders">
      <Row
        id={null}
        name="All music"
        depth={0}
        count={rootCount}
        active={currentFolderId === null}
        onOpen={() => openFolder(null)}
      />
      {childFolders(folders, null).map((f) => (
        <Branch key={f.id} id={f.id} depth={0} />
      ))}
    </nav>
  )
}

function Branch({ id, depth }: { id: string; depth: number }) {
  const { folders, files, currentFolderId, openFolder, expanded, toggleExpanded } = useLibrary()
  const folder = folders.find((f) => f.id === id)
  const kids = childFolders(folders, id)
  if (!folder) return null
  const open = !!expanded[id]

  return (
    <>
      <Row
        id={id}
        name={folder.name}
        depth={depth}
        count={countDeep(folders, files, id)}
        active={currentFolderId === id}
        hasKids={kids.length > 0}
        open={open}
        onToggle={() => toggleExpanded(id)}
        onOpen={() => openFolder(id)}
      />
      {open && kids.map((k) => <Branch key={k.id} id={k.id} depth={depth + 1} />)}
    </>
  )
}

interface RowProps {
  id: string | null
  name: string
  depth: number
  count: number
  active: boolean
  hasKids?: boolean
  open?: boolean
  onToggle?: () => void
  onOpen: () => void
}

function Row({ id, name, depth, count, active, hasKids, open, onToggle, onOpen }: RowProps) {
  const { moveFile, moveFolder, upload } = useLibrary()
  const [over, setOver] = useState(false)

  return (
    <button
      className={`tree-row${active ? ' active' : ''}${over ? ' drop' : ''}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      onClick={onOpen}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(false)
        if (e.dataTransfer.files.length) {
          await upload(e.dataTransfer.files, id)
          return
        }
        const fileId = e.dataTransfer.getData('chop/file')
        if (fileId) return moveFile(fileId, id)
        const folderId = e.dataTransfer.getData('chop/folder')
        if (folderId && folderId !== id) return moveFolder(folderId, id)
      }}
    >
      <span
        className={`caret${open ? ' open' : ''}`}
        onClick={(e) => {
          if (!hasKids) return
          e.stopPropagation()
          onToggle?.()
        }}
        style={{ visibility: hasKids ? 'visible' : 'hidden' }}
      >
        <ChevronRight size={12} />
      </span>
      <FolderIcon size={15} />
      <span className="name">{name}</span>
      {count > 0 && <span className="count">{count}</span>}
    </button>
  )
}
