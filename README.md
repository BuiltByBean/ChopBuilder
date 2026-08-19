# ChopBuilder

A drumline progress tracker and a precision metronome (20–300 BPM) with a sheet-music
library — one offline-first app for running a battery and building your own chops.

**Live app:** https://chopbuilder-production-40a9.up.railway.app

Everything runs in the browser and works fully offline; the app is a PWA you install
from the browser menu. Tracker data (players, checkpoints, statuses, notes, sessions)
syncs between your devices through a tiny Railway server when sync is enabled in
More → Sync — offline-first, last-write-wins, nothing blocks on the network.
Recordings and the sheet-music library stay on the device that captured them.

## The drumline tracker

Built for a battery tech standing in a parking lot, holding sticks, with 25 seconds
before the next rep. Logging a note about a player takes under 5 seconds and 3 taps.

- **Rehearsal Mode** (the landing screen) — player tiles grouped by instrument, sorted
  by who needs attention. Tap a tile → a sheet opens with the text field already
  focused, a dictation mic, and tag chips; **tapping a tag saves and closes the sheet**.
  Long-press a tile to jump to that player's checkpoints. A persistent Section-note
  button covers the whole line, and a pinned tempo field stamps every note and status
  change with the BPM you were running (one tap pulls it from the live metronome).
- **Checkpoints** — 35 seeded technique standards across six phases (The Stroke → Time
  and Space → Two Heights → Diddles/Rolls/Flams → Marching Integration → Ensemble),
  with phase gates marked ★. Add, rename, reorder, and retire them in More →
  Checkpoints. Tapping a status pill cycles Not Started → Working → Close → Passed
  (with a "clean at X BPM" prompt on Passed). Every change appends to a season log —
  status history is never destroyed.
- **Section View** — the planning screen: a checkpoint × player heatmap with a sticky
  first column, gate status with who's blocking, weakest checkpoints ranked, and open
  notes grouped by tag.
- **Sessions** — rehearsal log. New sessions pre-fill focus from the line's lowest
  incomplete checkpoint and carry the previous session's "next time" forward. Notes
  taken that day attach automatically.
- **Recordings** — record or import reference audio, mark baselines, and play any two
  back to back (the "week 1 vs now" demo for the kids).
- **No confirmations on capture** — optimistic writes with an Undo toast.
- **Sunlight mode** — a high-contrast light theme for reading in direct sun, one tap
  from the rehearsal bar. Dark theme is the default.
- **App lock** — optional PIN on launch (More → App lock).
- **Backup** — manual JSON export/import (data-only, or full with recording audio).
  That export is the only way tracker data leaves the device.

Privacy stance: players are stored as first name + last initial at most — or with no
names at all: leave the name blank (or use Roster → Build line) and players are plain
position labels like "Snare 1" and "Bass 2". No photos, no contact info, no analytics,
no third-party services. Notes are coaching observations — technique, timing, effort,
attendance, wins.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5273.

To build the static client:

```bash
npm run build
```

The output in `dist/` is plain static files with hash routing — it also works on any
static host (sync then needs the server URL set in More → Sync).

## Sync server (Railway)

`server.py` is a small Flask app that serves the built client and `POST /api/sync` —
a single push+pull endpoint backed by Postgres (`rows` table, JSONB). Conflicts
resolve last-write-wins on the client `updatedAt`; the pull watermark uses server
time so device clock skew can't hide rows; deletes are tombstones so they propagate.
Auth is a shared key: the `X-Chop-Key` header must match the `CHOP_KEY` env var.
Every device enters the same key once in More → Sync.

Deployed on Railway from the `Dockerfile` (node build stage → python runtime), with
`DATABASE_URL` referenced from the Postgres service and `CHOP_KEY` set on the
service. Local dev without Postgres:

```bash
npm run build
CHOP_DEV=1 python server.py   # http://127.0.0.1:4181 — in-memory store
```

## The metronome

Lives under the Chops tab (with the library and personal records). Timing comes from
the Web Audio clock rather than JavaScript timers:
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
  db/library.ts             IndexedDB schema + folders/files access
  db/drumline.ts            Tracker model: players, checkpoints, notes, sessions,
                            recordings, seed data, JSON backup
  state/                    React bindings: metronome, library, records, tracker,
                            prefs (sunlight mode, tempo stamp, PIN), toasts
  components/
    Metronome/              Full panel, docked panel, beat pads
    Library/                Folder tree
    Viewer/                 pdf.js setup and the multi-page renderer
    Drumline/               Note sheet, status chips, player form
  pages/                    Rehearsal, Player, Section, Sessions, Recordings,
                            More (roster/checkpoints/backup), Metronome, Library,
                            Practice, Progress
```
