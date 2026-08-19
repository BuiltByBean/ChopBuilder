# ChopBuilder

A precision metronome (20–300 BPM) with a sheet-music library you can practise alongside.

Everything runs in the browser. Your music is stored locally on your device — nothing
is uploaded to a server. The built site is a PWA: it can be installed like an app, and
after a couple of visits it loads fully offline.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5273.

To build a static site you can host anywhere:

```bash
npm run build
```

The output in `dist/` is plain static files. It uses hash-based routing, so it works on
GitHub Pages, Netlify, or any host without extra redirect rules.

## The metronome

The landing page. Timing comes from the Web Audio clock rather than JavaScript timers:
a scheduler wakes every 25 ms and queues each click at an exact time slightly in the
future, so the pulse stays sample-accurate and doesn't drift, even while pages render.

- **20–300 BPM** — drag the big number, use the slider, the ±1/±10 buttons, or tap tempo
- **Beats per bar** — 1 through 16
- **Subdivisions** — quarters, eighths, triplets, sixteenths, sextuplets, with their own
  volume so the subdivision sits under the main beat
- **Per-beat accents** — click any beat pad to cycle accent → normal → muted
- **Four click sounds** — beep, wood, click, cowbell
- **Tempo trainer** — climb by *n* BPM every *n* bars up to a target, then hold or loop.
  This is the chop builder: set 120 → 180 at +5 every 4 bars and play until it hurts.

### Keyboard

| Key | Action |
| --- | --- |
| `Space` | Start / stop |
| `←` `→` | ±1 BPM (±10 with `Shift`) — page turns on the practice screen |
| `↑` `↓` | ±1 BPM (±10 with `Shift`) on the practice screen |
| `T` | Tap tempo |
| `PgUp` `PgDn` | Page turns on the practice screen (what Bluetooth page-turner pedals send) |
| `Home` `End` | First / last page on the practice screen |
| `F` | Fullscreen practice view |
| `/` | Search, in the library |

While the click is running (or a score is open) the app holds a screen wake lock, so
your display won't sleep mid-practice.

## The music library

Upload PDFs, scans, photos, or audio and organise them into nested folders — a
`Snare Warmups` folder with `Rudiments` inside it, and so on.

- Drag files from your desktop onto any folder or the main area to upload
- Drag files and folders between folders to reorganise
- Rename and delete from the `⋯` menu on each tile
- Search the whole library at once with the box in the toolbar (`/` focuses it)

Files live in IndexedDB on this device. That makes them load instantly and work offline,
but it also means they're per-browser: they won't follow you to another machine, and
clearing site data removes them. Keep your originals somewhere safe.

## Practice view

Open any file to get the score and the metronome side by side.

- **1, 2, 3, or 4 pages at once** — four-up uses a 2×2 grid, the rest sit in a row
- **Next / previous** advance by a whole spread, so two-up jumps two pages at a time
- **Zoom** on top of the automatic fit-to-window sizing
- **Fullscreen** (`F`) hides all chrome for music-stand use
- **Tempo memory** — each piece remembers the BPM you last practised it at and restores
  it when you reopen the piece; "Jump back in" on the metronome page lists what you
  practised most recently
- The metronome panel collapses to a slim rail that still flashes the beat

The metronome is one shared engine across the whole app, so it keeps playing while you
move between the library and the score, and the header transport reflects it everywhere.

## Progress

The Progress page tracks personal records: create an exercise (Single-stroke roll,
Paradiddles, …), log the tempo you hit, and the history shows every time you beat your
old record. Records live in the same on-device database as the library.

## Layout

```
src/
  audio/metronome.ts        Web Audio scheduler and click synthesis
  db/library.ts             IndexedDB access for folders and files
  state/                    React bindings for the engine and the library
  components/
    Metronome/              Full panel, docked panel, beat pads
    Library/                Folder tree
    Viewer/                 pdf.js setup and the multi-page renderer
  pages/                    Metronome, Library, Practice
```
