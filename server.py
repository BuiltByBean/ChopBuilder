"""ChopBuilder server — serves the built PWA and a tiny sync API on Postgres.

Endpoints:
  GET  /api/health   -> {ok, db, auth}
  POST /api/sync     -> body {since, rows:[{id, store, updatedAt, deleted, data}]}
                        Upserts pushed rows last-write-wins on the client's
                        updatedAt, then returns every row accepted since the
                        client's watermark. The watermark is SERVER time
                        (synced_at) so device clock skew can't hide rows.

Auth: X-Chop-Key header must match the CHOP_KEY env var (if set). The app
holds coaching notes about a high-school drumline — set the key.

Static: the Vite build in dist/. index/sw/manifest are no-cache so updates
roll out immediately; hashed assets cache long.

Local dev without Postgres: CHOP_DEV=1 swaps in an in-memory store.
"""
import hmac
import json
import os
import threading
import time

from flask import Flask, abort, jsonify, request, send_from_directory

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "dist")


def _load_dotenv():
    """Minimal .env loader for local dev; Railway injects real env vars."""
    path = os.path.join(ROOT, ".env")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())


_load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql://" + DATABASE_URL[len("postgres://"):]
CHOP_KEY = os.environ.get("CHOP_KEY", "")
DEV_MEMORY = os.environ.get("CHOP_DEV", "") == "1" and not DATABASE_URL

STORES = {
    "dlPlayers",
    "dlCheckpoints",
    "dlPlayerCheckpoints",
    "dlHistory",
    "dlNotes",
    "dlSessions",
}
MAX_BATCH = 2000
MAX_ROW_BYTES = 100_000
MAX_PULL = 5000

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

# ---------------- database ----------------
_pool = None
_pool_lock = threading.Lock()
_schema_ready = False

# CHOP_DEV=1 memory store: {key: row-dict}. Lets the whole sync loop run
# locally with zero setup; wiped on restart by design.
_mem = {}
_mem_lock = threading.Lock()


def _get_pool():
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                from psycopg2.pool import SimpleConnectionPool
                _pool = SimpleConnectionPool(1, 6, DATABASE_URL)
    return _pool


def _ensure_schema(conn):
    global _schema_ready
    if _schema_ready:
        return
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS rows (
                key        TEXT PRIMARY KEY,
                row_id     TEXT   NOT NULL,
                store      TEXT   NOT NULL,
                data       JSONB,
                updated_at BIGINT NOT NULL,
                deleted    BOOLEAN NOT NULL DEFAULT FALSE,
                synced_at  BIGINT NOT NULL
            )
            """
        )
        cur.execute("CREATE INDEX IF NOT EXISTS idx_rows_synced ON rows (synced_at)")
    conn.commit()
    _schema_ready = True


class _Conn:
    """Checkout a pooled connection; retry once if the socket went stale."""

    def __enter__(self):
        self.pool = _get_pool()
        self.conn = self.pool.getconn()
        try:
            _ensure_schema(self.conn)
            with self.conn.cursor() as cur:
                cur.execute("SELECT 1")
        except Exception:
            try:
                self.pool.putconn(self.conn, close=True)
            except Exception:
                pass
            self.conn = self.pool.getconn()
            _ensure_schema(self.conn)
        return self.conn

    def __exit__(self, exc_type, exc, tb):
        try:
            if exc_type:
                self.conn.rollback()
            self.pool.putconn(self.conn)
        except Exception:
            pass
        return False


# ---------------- auth + CORS ----------------
def _authed():
    if not CHOP_KEY:
        return True
    supplied = request.headers.get("X-Chop-Key", "")
    return hmac.compare_digest(supplied, CHOP_KEY)


@app.after_request
def _cors(resp):
    # The client may run from localhost dev or a static mirror; data access is
    # gated by the key header, not the origin, and no cookies are involved.
    if request.path.startswith("/api/"):
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Chop-Key"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return resp


@app.route("/api/<path:_>", methods=["OPTIONS"])
def _preflight(_):
    return ("", 204)


# ---------------- validation ----------------
def _clean_rows(incoming):
    """Yield (key, row_id, store, updated, deleted, data) for valid rows."""
    for it in incoming:
        if not isinstance(it, dict):
            continue
        row_id = str(it.get("id") or "")[:120]
        store = str(it.get("store") or "")
        try:
            updated = int(it.get("updatedAt") or 0)
        except (TypeError, ValueError):
            updated = 0
        if not row_id or store not in STORES or updated <= 0:
            continue
        deleted = bool(it.get("deleted"))
        data = it.get("data") if isinstance(it.get("data"), dict) else None
        if not deleted and data is None:
            continue
        if data is not None and len(json.dumps(data, separators=(",", ":"))) > MAX_ROW_BYTES:
            continue
        yield (f"{store}:{row_id}", row_id, store, updated, deleted, data)


def _row_out(row_id, store, data, updated, deleted):
    return {"id": row_id, "store": store, "updatedAt": updated,
            "deleted": bool(deleted), "data": data}


# ---------------- api ----------------
@app.route("/api/health")
def health():
    db_ok = False
    if DEV_MEMORY:
        db_ok = True
    elif DATABASE_URL:
        try:
            with _Conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    db_ok = cur.fetchone()[0] == 1
        except Exception:
            db_ok = False
    return jsonify(ok=True, db=db_ok, auth=bool(CHOP_KEY), mem=DEV_MEMORY)


@app.route("/api/sync", methods=["POST"])
def sync():
    if not _authed():
        return jsonify(error="bad key"), 401
    if not DATABASE_URL and not DEV_MEMORY:
        return jsonify(error="no database configured"), 503

    body = request.get_json(silent=True) or {}
    try:
        since = int(body.get("since") or 0)
    except (TypeError, ValueError):
        since = 0
    incoming = body.get("rows") or []
    if not isinstance(incoming, list) or len(incoming) > MAX_BATCH:
        return jsonify(error="bad batch"), 400

    now = int(time.time() * 1000)
    pending = list(_clean_rows(incoming))

    if DEV_MEMORY:
        with _mem_lock:
            for key, row_id, store, updated, deleted, data in pending:
                ex = _mem.get(key)
                if ex is None or updated > ex["updatedAt"]:
                    _mem[key] = {"id": row_id, "store": store, "updatedAt": updated,
                                 "deleted": deleted, "data": data, "syncedAt": now}
            out = [_row_out(r["id"], r["store"], r["data"], r["updatedAt"], r["deleted"])
                   for r in _mem.values() if r["syncedAt"] >= since]
        return jsonify(now=now, rows=out)

    try:
        with _Conn() as conn:
            with conn.cursor() as cur:
                for key, row_id, store, updated, deleted, data in pending:
                    cur.execute(
                        """
                        INSERT INTO rows (key, row_id, store, data, updated_at, deleted, synced_at)
                        VALUES (%s, %s, %s, %s::jsonb, %s, %s, %s)
                        ON CONFLICT (key) DO UPDATE SET
                            data       = EXCLUDED.data,
                            updated_at = EXCLUDED.updated_at,
                            deleted    = EXCLUDED.deleted,
                            synced_at  = EXCLUDED.synced_at
                        WHERE rows.updated_at < EXCLUDED.updated_at
                        """,
                        (key, row_id, store,
                         json.dumps(data, separators=(",", ":")) if data is not None else None,
                         updated, deleted, now),
                    )
                cur.execute(
                    """
                    SELECT row_id, store, data, updated_at, deleted
                    FROM rows WHERE synced_at >= %s
                    ORDER BY synced_at LIMIT %s
                    """,
                    (since, MAX_PULL),
                )
                out = [_row_out(*r) for r in cur.fetchall()]
            conn.commit()
    except Exception as e:  # noqa: BLE001 — surfaces as the client's "sync error"
        app.logger.exception("sync failed: %s", e)
        return jsonify(error="db error"), 500

    return jsonify(now=now, rows=out)


# ---------------- static app (Vite build) ----------------
_TOP_ALLOWED = {"index.html", "manifest.webmanifest", "sw.js",
                "icon.svg", "icon-192.png", "icon-512.png",
                "apple-touch-icon.png"}
_NO_CACHE = {"index.html", "sw.js", "manifest.webmanifest"}


def _static(p):
    resp = send_from_directory(DIST, p)
    if p.endswith(".webmanifest"):
        resp.mimetype = "application/manifest+json"
    if p in _NO_CACHE:
        resp.headers["Cache-Control"] = "no-cache"
    else:
        resp.headers["Cache-Control"] = "public, max-age=604800"
    return resp


@app.route("/")
def home():
    return _static("index.html")


@app.route("/<path:p>")
def files(p):
    p = p.replace("\\", "/")
    ok = (
        p in _TOP_ALLOWED
        or (p.startswith("assets/") and ".." not in p)
        or (p.startswith("pdfjs/") and ".." not in p)
    )
    if ok:
        return _static(p)
    abort(404)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 4181)), debug=False)
