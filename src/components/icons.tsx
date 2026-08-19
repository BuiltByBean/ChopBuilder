interface P {
  size?: number
  className?: string
}

const svg = (path: React.ReactNode, vb = '0 0 24 24') =>
  function Icon({ size = 18, className }: P) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={vb}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {path}
      </svg>
    )
  }

export const Play = ({ size = 18, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M8 5.2v13.6c0 .8.9 1.3 1.6.9l11-6.8a1 1 0 0 0 0-1.7l-11-6.8c-.7-.5-1.6 0-1.6.8Z" />
  </svg>
)

export const Pause = ({ size = 18, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <rect x="6" y="4.5" width="4.4" height="15" rx="1.4" />
    <rect x="13.6" y="4.5" width="4.4" height="15" rx="1.4" />
  </svg>
)

export const Metro = svg(
  <>
    <path d="M9.2 3.5h5.6l4.2 17H5L9.2 3.5Z" />
    <path d="M6.6 14.5h10.8" />
    <path d="M12 19.5 17.5 7" />
  </>,
)

export const FolderIcon = svg(
  <path d="M3 7.5A2 2 0 0 1 5 5.5h3.6a2 2 0 0 1 1.5.7l1 1.2h8.9a2 2 0 0 1 2 2v7.1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11Z" />,
)

export const FolderPlus = svg(
  <>
    <path d="M3 7.5A2 2 0 0 1 5 5.5h3.6a2 2 0 0 1 1.5.7l1 1.2h8.9a2 2 0 0 1 2 2v7.1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11Z" />
    <path d="M12 11.5v5M9.5 14h5" />
  </>,
)

export const FileIcon = svg(
  <>
    <path d="M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-5.5-5.5Z" />
    <path d="M13.5 3.5V9H19" />
  </>,
)

export const ImageIcon = svg(
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4.5 17 4.6-4.3a1.6 1.6 0 0 1 2.2 0l4.4 4.2M14.5 14l1.6-1.5a1.6 1.6 0 0 1 2.2 0l2.2 2" />
  </>,
)

export const AudioIcon = svg(
  <>
    <path d="M9.5 17.5V6.2l9-1.7v11.3" />
    <circle cx="7" cy="18" r="2.6" />
    <circle cx="16.5" cy="16" r="2.6" />
  </>,
)

export const Upload = svg(
  <>
    <path d="M4 15.5v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    <path d="M12 15.5v-12M7.5 8 12 3.5 16.5 8" />
  </>,
)

export const ChevronRight = svg(<path d="m9.5 5.5 7 6.5-7 6.5" />)
export const ChevronLeft = svg(<path d="m14.5 5.5-7 6.5 7 6.5" />)
export const ChevronDown = svg(<path d="m5.5 9.5 6.5 7 6.5-7" />)
export const Plus = svg(<path d="M12 5v14M5 12h14" />)
export const Minus = svg(<path d="M5 12h14" />)
export const Close = svg(<path d="M6 6l12 12M18 6 6 18" />)
export const Dots = svg(
  <>
    <circle cx="12" cy="5.5" r="1.4" fill="currentColor" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    <circle cx="12" cy="18.5" r="1.4" fill="currentColor" />
  </>,
)
export const Trash = svg(
  <>
    <path d="M4.5 6.5h15M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
    <path d="M6.5 6.5 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.9-12.5" />
  </>,
)
export const Pencil = svg(
  <>
    <path d="M4.5 19.5h4L20 8a2.1 2.1 0 0 0 0-3l-1-1a2.1 2.1 0 0 0-3 0L4.5 15.5v4Z" />
    <path d="m14.5 6.5 3 3" />
  </>,
)
export const Sliders = svg(
  <>
    <path d="M4 8h9M17 8h3M4 16h3M11 16h9" />
    <circle cx="15" cy="8" r="2.1" />
    <circle cx="9" cy="16" r="2.1" />
  </>,
)
export const Grid1 = svg(<rect x="7" y="4" width="10" height="16" rx="1.4" />)
export const Grid2 = svg(
  <>
    <rect x="3" y="5" width="8" height="14" rx="1.3" />
    <rect x="13" y="5" width="8" height="14" rx="1.3" />
  </>,
)
export const Grid3 = svg(
  <>
    <rect x="2.5" y="6" width="5.6" height="12" rx="1.2" />
    <rect x="9.2" y="6" width="5.6" height="12" rx="1.2" />
    <rect x="15.9" y="6" width="5.6" height="12" rx="1.2" />
  </>,
)
export const Grid4 = svg(
  <>
    <rect x="3" y="4.5" width="8" height="7" rx="1.2" />
    <rect x="13" y="4.5" width="8" height="7" rx="1.2" />
    <rect x="3" y="12.8" width="8" height="7" rx="1.2" />
    <rect x="13" y="12.8" width="8" height="7" rx="1.2" />
  </>,
)
export const ZoomIn = svg(
  <>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21M10.5 7.8v5.4M7.8 10.5h5.4" />
  </>,
)
export const ZoomOut = svg(
  <>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21M7.8 10.5h5.4" />
  </>,
)
export const Back = svg(<path d="M19 12H5M11 6l-6 6 6 6" />)
export const Volume = svg(
  <>
    <path d="M11 5 6.5 8.8H3.5v6.4h3L11 19V5Z" />
    <path d="M14.8 9.2a4 4 0 0 1 0 5.6M17.6 6.4a8 8 0 0 1 0 11.2" />
  </>,
)
export const Trophy = svg(
  <>
    <path d="M7 9.5H5.6a2.5 2.5 0 0 1 0-5H7M17 9.5h1.4a2.5 2.5 0 0 0 0-5H17" />
    <path d="M17 3.8H7v6.2a5 5 0 0 0 10 0V3.8Z" />
    <path d="M12 15v3.3M8.5 20.5h7" />
  </>,
)
export const Trend = svg(
  <>
    <path d="M3.5 17.5 9 11l4 3.6 7.5-8" />
    <path d="M15.5 6.5h5v5" />
  </>,
)
export const Search = svg(
  <>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21" />
  </>,
)
export const Expand = svg(
  <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />,
)
export const Compress = svg(
  <path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5" />,
)

// --- drumline tracker ---------------------------------------------------------

export const Sticks = svg(
  <>
    <path d="M4.5 4.5 17 17" />
    <path d="M19.5 4.5 7 17" />
    <circle cx="18.6" cy="18.6" r="1.9" />
    <circle cx="5.4" cy="18.6" r="1.9" />
  </>,
)
export const HeatGrid = svg(
  <>
    <rect x="3.5" y="3.5" width="7.2" height="7.2" rx="1.2" />
    <rect x="13.3" y="3.5" width="7.2" height="7.2" rx="1.2" />
    <rect x="3.5" y="13.3" width="7.2" height="7.2" rx="1.2" />
    <rect x="13.3" y="13.3" width="7.2" height="7.2" rx="1.2" />
  </>,
)
export const Calendar = svg(
  <>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </>,
)
export const MoreH = svg(
  <>
    <circle cx="5.5" cy="12" r="1.4" fill="currentColor" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.4" fill="currentColor" />
  </>,
)
export const Mic = svg(
  <>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
  </>,
)
export const Sun = svg(
  <>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3 19 19M19 5l-1.7 1.7M6.7 17.3 5 19" />
  </>,
)
export const Lock = svg(
  <>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </>,
)
export const Star = svg(
  <path d="m12 3.5 2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.2l-5.1 2.7 1.1-5.6-4.2-3.9 5.7-.7L12 3.5Z" />,
)
export const Check = svg(<path d="m4.5 12.5 5 5L19.5 7" />)
export const RecDot = ({ size = 18, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.9" />
    <circle cx="12" cy="12" r="4.4" fill="currentColor" />
  </svg>
)
export const Download = svg(
  <>
    <path d="M4 15.5v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    <path d="M12 3.5v12M7.5 11 12 15.5 16.5 11" />
  </>,
)
export const ArrowUp = svg(<path d="M12 19V5M6 11l6-6 6 6" />)
export const ArrowDown = svg(<path d="M12 5v14M6 13l6 6 6-6" />)
export const UserPlus = svg(
  <>
    <circle cx="10" cy="8" r="3.6" />
    <path d="M3.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M18.5 8.5v5M16 11h5" />
  </>,
)
export const Users = svg(
  <>
    <circle cx="9" cy="8.5" r="3.4" />
    <path d="M3 19.5a6 6 0 0 1 12 0" />
    <path d="M15.5 5.6a3.4 3.4 0 0 1 0 5.8M17.5 13.9a6 6 0 0 1 3.5 5.6" />
  </>,
)
export const NoteIcon = svg(
  <>
    <path d="M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-5.5-5.5Z" />
    <path d="M13.5 3.5V9H19M8.5 13.5h7M8.5 17h4.5" />
  </>,
)
