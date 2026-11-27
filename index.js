/**
 * FlashAnchor Host half.
 *
 * Reads the current model surface of every stored session through
 * `ctx.sessionQuery`, folds it into a small searchable document index, and
 * serves authenticated queries to the Web Client over an exact
 * `connection.fetch` route. The host never mutates session data.
 */

import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { promisify } from 'node:util'
import { SearchPool } from './search-pool.js'
import { docKey, makeSnippet, scanDocs, scoreDoc } from './search-core.js'
import { createHash } from 'node:crypto'

const ROUTE_PATH = '/api/flash-anchor'
const STATE_VERSION = 1
// 2: blockIndex/seatIndex/fileIndex are part of the address; a v1 cache has
// docs without them and could alias two blocks.
// 3: the index is a manifest plus one gzip shard per session, so a live
// update rewrites a few hundred KB instead of the whole corpus.
// 4: long documents split into their own shards.
// 5: injected context is its own doc kind. Bump this whenever buildSurfaceDocs
//    changes how it classifies documents — otherwise the stale shards are
//    reused and the fix silently does nothing on an existing install.
// 6: injected context became its own doc kind. The docKey scheme itself is
// deliberately stable — saved pages store addresses derived from it.
// 7: @-mentioned files became their own documents, so old shards must rebuild.
// 8: the manifest carries per-session routing metadata (cwd/kinds/chars), and
//    shards are mounted on demand instead of all being read at bootstrap.
const INDEX_VERSION = 8
const TITLE_CACHE_MS = 30_000
// Background reindexing of a streaming session is a CPU furnace; searches
// still read it fresh, but automatic tracking may lag a few seconds.
const LIVE_REBUILD_MS = 20_000
const gzip = promisify(zlib.gzip)
const gunzip = promisify(zlib.gunzip)
const CHUNK_SIZE = 4_000
const CHUNK_OVERLAP = 200
// A document is never truncated for being long: 256 chunks (≈1 MB) covers any
// real tool result, and a hit past the old 64 k cap was silently unsearchable.
const MAX_CHUNKS = 256
const ALL_TYPES = Object.freeze([
  'reasoning',
  'modelText',
  'tools',
  'outputFiles',
  'userText',
  'inputFiles',
  // Injected context (skill catalog, runtime snapshot, time, compaction
  // checkpoint, approval prompts) is a "user/message" event with a non-user
  // source. It is searchable, but it is not something the user typed.
  'context',
])
// source.kind values that really are the human: everything else a
// "user/message" carries is injected context.
const USER_SOURCES = new Set(['user', 'steering'])
const FILE_TYPES = new Set(['outputFiles', 'inputFiles'])
const SEARCH_LIMIT = 400
const PRELOAD_LIMIT = 2000
const MAX_THREADS = 8
// Spawning workers only pays off once the matching pass is worth splitting.
const WORKER_MIN_DOCS = 1500
// Threads are decided from the work, not from a number the reader has to pick:
// below AUTO_THREAD_CHARS a single thread scans the corpus as fast as posting it
// to workers costs, and every extra worker holds its own copy of the text.
const AUTO_THREAD_CHARS = 40_000_000
const AUTO_THREAD_MAX = 4
// A worker corpus is now read from disk by the workers themselves, so a pool
// costs a decode pass before its first scan. Automatic mode therefore only
// engages where the scan is genuinely bigger than that: below 40M characters a
// single thread wins on this hardware (measured: inline 150 ms vs 822 ms for a
// first 4-worker scan of 19k documents).
const AUTO_THREAD_MIN_CHARS = 40_000_000

/** Threads for one search: an explicit number, or the automatic policy. */
function resolveThreads(choice, chars, cores) {
  // A preloaded corpus is already resident in the Host, so a worker pool would
  // only duplicate it (and pay a decode/spawn pass) — measured slower on every
  // corpus this plugin has met. Automatic mode is therefore always one thread;
  // the pool is an explicit, opt-in experiment.
  const auto = 1
  if (choice === 'auto' || choice === undefined || choice === null || choice === '') return { threads: auto, auto: true }
  const wanted = Number.parseInt(String(choice), 10)
  if (!Number.isFinite(wanted)) return { threads: auto, auto: true }
  return { threads: Math.max(1, Math.min(MAX_THREADS, wanted)), auto: false }
}
const MAX_QUERY_LENGTH = 300
// Lazy indexing: a search answers from what is already indexed and lets the
// rest arrive one session per tick, never blocking the panel on a cold corpus.
const SEARCH_BUDGET_MS = 200
const WARM_TICK_MS = 24
// Nothing runs in the background while nobody is looking at the panel.
const PANEL_IDLE_MS = 120_000
const PERSIST_DEBOUNCE_MS = 30_000
// Filters settle before we spend CPU reading shards; a search never waits for it.
const PREFETCH_DEBOUNCE_MS = 300
// A block longer than this keeps only its head in the ordinary index; the rest
// lives in the long-document index and is searched on demand.
const HEAD_CHUNKS = 4
const LONG_MIN_CHARS = CHUNK_SIZE * HEAD_CHUNKS
const MAX_QUERY_CACHE = 12
// Total matched rows kept across cached queries. A high-frequency word answers
// with tens of thousands of rows, so a small number here silently disabled the
// cache after a few queries.
const MAX_QUERY_CACHE_MATCHES = 1_500_000
// Built pages kept for an exact repeat of one filter set (a filter toggle back
// and forth is the common case). Each entry is at most `limit` result items.
const MAX_PAGE_CACHE = 6
// Mounted-shard budget: how many sessions stay resident, and how many characters a
// single request may mount before the cap stops bothering (correctness first).
const MOUNT_KEEP = 40
const MOUNT_BUDGET_CHARS = 24_000_000
const MAX_HISTORY = 12
// Saved views are an LRU cache of ID snapshots, not an archive.
const MAX_SAVED = 50

export const inject = ['sessionQuery', 'connection']

export function apply(ctx) {
  const store = new StateStore()
  const index = new SearchIndex(ctx, store)
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: ROUTE_PATH,
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: (request) => handleRequest(index, store, request),
      }),
    'flash-anchor: exact /api/flash-anchor fetch route',
  )
  // The event payload is (session, event): the Session object, not its id.
  ctx.on('session/event', (session) => {
    const id = typeof session === 'string' ? session : session && session.id
    index.noteSessionActivity(id)
  })
  // Archiving must take effect before the next search, not on the next restart.
  // The follow stream supplies the initial set; these two events supply every
  // later change without waiting for that stream.
  ctx.on('workspace/session-archived', (request) => index.noteArchived(request && request.sessionId))
  ctx.on('workspace/session-unarchiving', (request) => index.noteUnarchived(request && request.sessionId))
  // Load the session table and the shards while the reader is still in the chat,
  // so the first search does not pay for it. Deferred: startup must stay quiet.
  const warmTimer = setTimeout(() => {
    void index.ensureReady().catch(() => {})
  }, 1200)
  if (typeof warmTimer === 'object' && warmTimer && typeof warmTimer.unref === 'function') warmTimer.unref()
  ctx.effect(() => () => clearTimeout(warmTimer), 'flash-anchor: deferred bootstrap')
  // Timers and workers survive a plugin reload unless the fiber owns them.
  ctx.effect(() => () => index.dispose(), 'flash-anchor: index timers and workers')
}

async function handleRequest(index, store, request) {
  try {
    const url = new URL(request.url)
    let body = null
    if (request.method === 'POST') {
      try {
        body = await request.json()
      } catch {
        body = null
      }
    }
    const action = (body && body.action) || url.searchParams.get('action') || 'search'
    await store.load()
    index.touch()

    if (action === 'boot') {
      // Restore the remembered filter set's shards in the background instead of
      // loading the whole corpus: this is the whole point of the routing table.
      const prefs = (store.state && store.state.prefs) || {}
      index.prefetch({
        scope: prefs.scopeMode === 'session' ? prefs.selectedSession || 'all' : 'all',
        workspace: prefs.workspace || '',
        types: Array.isArray(prefs.types) && prefs.types.length > 0 ? prefs.types : undefined,
        long: prefs.long === true,
      })
      // Never block the panel on the index: loading 26 shards takes a few
      // hundred milliseconds and the reader should see the window first. The
      // first request is what starts bootstrap, so DSH startup stays free.
      void index.ensureReady()
      index.setPanelOpen(true)
      store.logDiag('panel', { event: 'open' })
      return json({
        ok: true,
        index: index.status(),
        state: store.publicState(),
        workspaces: index.workspaces(),
        log: await store.logInfo(),
      })
    }
    if (action === 'open') {
      index.setPanelOpen(true)
      return json({ ok: true, index: index.status() })
    }
    if (action === 'close') {
      index.setPanelOpen(false)
      index.cancelPrefetch()
      store.logDiag('panel', { event: 'close' })
      return json({ ok: true })
    }
    if (action === 'log') {
      if (body && body.clear === true) return json({ ok: true, log: await store.clearDiag() })
      if (body && typeof body.enabled === 'boolean') store.setLogCollection(body.enabled)
      return json({ ok: true, log: await store.logInfo() })
    }
    if (action === 'prefetch') {
      // Fire and forget: the client reports the selection and moves on.
      index.prefetch((body && body.selection) || {})
      return json({ ok: true, prefetch: index.prefetchState })
    }
    if (action === 'workspaces') {
      // Deliberately does not wait for the index: the workspace list comes from
      // the session headers and must work while nothing is indexed yet.
      await index.ensureSessions()
      return json({ ok: true, workspaces: index.workspaces(), index: index.status() })
    }
    if (action === 'sessions') {
      await index.ensureReady()
      const payload = await index.listSessions()
      return json({ ok: true, ...payload, index: index.status() })
    }
    if (action === 'status') {
      // The Client polls this while the index loads, so it has to be the thing
      // that starts the load.
      void index.ensureReady()
      return json({ ok: true, index: index.status(), state: store.publicState() })
    }
    if (action === 'indexStatus') {
      void index.ensureReady()
      return json({ ok: true, ...index.indexReport() })
    }
    if (action === 'export') {
      const ids = Array.isArray(body && body.ids) ? body.ids.slice(0, 500) : []
      await index.mountForDocIds(ids)
      const map = index.docIndex()
      const texts = ids.map((id) => {
        const entry = map.get(id)
        return entry && entry.doc ? String(entry.doc.text || '') : ''
      })
      return json({ ok: true, texts })
    }
    if (action === 'state') {
      return json({ ok: true, state: store.publicState(), index: index.status() })
    }
    if (action === 'index') {
      const only = String((body && body.id) || url.searchParams.get('id') || '')
      if (only) {
        const rebuilt = await index.rebuildSessionOnly(only)
        return json({ ok: true, id: only, rebuilt, index: index.status(), state: store.publicState() })
      }
      index.rebuild()
      return json({ ok: true, index: index.status(), state: store.publicState() })
    }
    if (action === 'long') {
      const op = String((body && body.op) || url.searchParams.get('op') || 'rebuild')
      let result = {}
      if (op === 'clear') result = { cleared: await index.clearLong() }
      else if (op === 'auto') index.setAutoLong(body ? body.autoLong !== false : true)
      else result = { started: await index.rebuildLong() }
      return json({ ok: true, op, ...result, index: index.status(), state: store.publicState() })
    }
    if (action === 'indexEvents') {
      if (body && body.clear === true) index.clearIndexEvents()
      return json({ ok: true, events: Array.isArray(index.indexEvents) ? index.indexEvents : [] })
    }
    if (action === 'clearIndex') {
      index.dropAllResolved()
      await index.clear()
      return json({ ok: true, index: index.status(), state: store.publicState() })
    }
    if (action === 'setAutoIndex') {
      store.setAutoIndex(body ? body.autoIndex !== false : true)
      if (store.state.autoIndex) index.startAll()
      return json({ ok: true, state: store.publicState(), index: index.status() })
    }
    if (action === 'savePrefs') {
      store.setPrefs(body && body.prefs)
      return json({ ok: true })
    }
    if (action === 'clearHistory') {
      const dropped = store.clearHistory()
      for (const id of dropped) index.dropResolved(id)
      await store.saveStateNow()
      return json({ ok: true, state: store.publicState(), snapshots: store.snapshotCount() })
    }
    if (action === 'deleteSaved') {
      const deletedId = body && body.id
      store.deleteSaved(deletedId)
      // Destroy the materialized page in memory, not just the history row.
      index.dropResolved(deletedId)
      await store.saveStateNow()
      return json({ ok: true, state: store.publicState(), snapshots: store.snapshotCount() })
    }
    if (action === 'saved') {
      const started = Date.now()
      const id = (body && body.id) || url.searchParams.get('id')
      const saved = store.savedSearch(id)
      if (!saved) return json({ ok: false, error: { code: 'saved-missing', message: 'saved result not found' } }, 404)
      // Saved views are keyed by query; verify the caller's filters so a page
      // from a different type/scope/sort can never be shown as this one.
      const wantedTypes = url.searchParams.get('types')
      if (wantedTypes !== null) {
        const requested = wantedTypes.split(',').map((value) => value.trim()).filter(Boolean).sort()
        const stored = Array.isArray(saved.request?.types) ? [...saved.request.types].sort() : []
        if (JSON.stringify(requested) !== JSON.stringify(stored)) {
          return json({ ok: false, error: { code: 'saved-missing', message: 'saved result not found' } }, 404)
        }
      }
      const wantedScope = url.searchParams.get('scope')
      if (wantedScope !== null && String(saved.request?.scope ?? 'all') !== wantedScope) {
        return json({ ok: false, error: { code: 'saved-missing', message: 'saved result not found' } }, 404)
      }
      const wantedSort = url.searchParams.get('sort')
      if (wantedSort !== null && String(saved.request?.sort ?? 'relevance') !== wantedSort) {
        return json({ ok: false, error: { code: 'saved-missing', message: 'saved result not found' } }, 404)
      }
      // The Client's signature is the exact filter set it is showing.
      const wantedSig = url.searchParams.get('sig')
      if (wantedSig && saved.signature && wantedSig !== saved.signature) {
        return json({ ok: false, error: { code: 'saved-missing', message: 'saved result not found' } }, 404)
      }
      const materialized = index.resolveSaved(saved)
      if (!materialized) {
        // The snapshot can no longer be resolved (index rebuilt and a doc is
        // gone); the Client will fall back to one real search.
        return json({ ok: false, error: { code: 'saved-missing', message: 'saved result not found' } }, 404)
      }
      return json({
        ok: true,
        ...materialized,
        // How long *this* click took, next to the original search cost.
        tookMs: Date.now() - started,
        restoredMs: Date.now() - started,
        cached: true,
        stale: index.isSavedStale(saved),
        savedId: id,
        history: store.state.history,
        index: index.status(),
      })
    }
    if (action === 'diag') {
      const scope = String((body && body.scope) || 'diag')
      // Log the payload itself: a synthetic Error stack only adds noise to
      // every click.
      // Same-origin only, but a diagnostic payload has no business growing
      // without a bound in a rotated log file.
      await store.logError('client:' + scope, JSON.stringify(body || {}).slice(0, 4_000))
      // The structured log keeps the whole payload: it is what makes a jump
      // failure reproducible without guessing.
      const { scope: _scope, ...payload } = body || {}
      store.logDiag('client:' + scope, payload)
      return json({ ok: true })
    }
    if (action !== 'search') {
      return json({ ok: false, error: { code: 'bad-action', message: `unknown action: ${action}` } }, 400)
    }
    const searchRequest = parseSearchRequest(url.searchParams)
    const started = Date.now()
    const exact = searchRequest.preload ? null : store.matchSaved(searchRequest)
    if (exact) {
      await index.mountForDocIds(Object.keys(exact.seqs || {}).map((id) => id + ':'))
      const materialized = index.resolveSaved(exact, searchRequest)
      if (materialized) {
        // Memory hit: this returns before the scan starts, so there is nothing
        // left for an AbortController to cancel.
        return json({
          ok: true,
          ...materialized,
          tookMs: Date.now() - started,
          restoredMs: Date.now() - started,
          cached: true,
          stale: index.isSavedStale(exact),
          savedId: exact.id,
          history: store.state.history,
          index: index.status(),
        })
      }
    }
    // 计算后置: the same query was already answered under a wider filter set.
    // Re-filtering that snapshot is what keeps a filter tweak from paying for a
    // whole-corpus scan.
    const related = searchRequest.preload ? null : store.findRelatedSaved(searchRequest)
    if (related) {
      await index.mountForDocIds(Object.keys(related.seqs || {}).map((id) => id + ':'))
      const narrowed = index.resolveSaved(related, searchRequest)
      if (narrowed) {
        return json({
          ok: true,
          ...narrowed,
          tookMs: Date.now() - started,
          restoredMs: Date.now() - started,
          cached: true,
          narrowedFrom: related.id,
          savedId: null,
          stale: index.isSavedStale(related),
          history: store.state.history,
          index: index.status(),
        })
      }
    }
    const payload = await index.search(searchRequest)
    store.logDiag('search', {
      q: payload.query,
      scope: payload.scope,
      workspace: payload.workspace,
      types: payload.types,
      exts: payload.exts,
      sort: payload.sort,
      long: payload.long,
      auto: searchRequest.auto === true,
      total: payload.total,
      items: Array.isArray(payload.items) ? payload.items.length : 0,
      pending: payload.pending,
      scanned: payload.scanned,
      mode: payload.mode,
      threads: payload.threads,
      tookMs: payload.tookMs,
      surfaceMs: payload.surfaceMs,
      matchMs: payload.matchMs,
      // Split the pre-match cost: the 5s first search has no surface or match
      // time, so it is sitting in session listing or bootstrap.
      ensureMs: payload.ensureMs,
      listMs: payload.listMs,
      otherMs: payload.otherMs,
      signature: payload.signature,
    })
    // A partial page (indexing still in flight) must not be remembered as the
    // answer to this query: the next open would replay fewer hits.
    // recordSearch decides whether the page is complete enough to snapshot.
    const saved =
      searchRequest.preload || searchRequest.auto ? null : store.recordSearch(searchRequest, payload, index.snapshotSeqs())
    if (saved) {
      for (const droppedId of store.droppedIds || []) index.dropResolved(droppedId)
      // Record asynchronously: the reader should not wait for a 42 kB write.
      void store.saveStateNow()
    }
    return json({
      ok: true,
      ...payload,
      savedId: saved ? saved.id : null,
      history: store.state.history,
      index: index.status(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'search-failed'
    await store.logError('request:' + new URL(request.url).searchParams.get('action'), error)
    store.logDiag('error', {
      action: new URL(request.url).searchParams.get('action'),
      message,
      stack: error && error.stack ? String(error.stack).slice(0, 4_000) : null,
    })
    return json({ ok: false, error: { code, message } }, 500)
  }
}

/**
 * The Client's own name for this exact request. The Host only echoes it, so a
 * page can never be shown under chips that describe another filter set.
 */
function canonicalSignature({ q, scope, workspace, types, exts, sort, long }) {
  return JSON.stringify([
    String(q || ''),
    scope || 'all',
    workspace || '',
    [...(types || [])].slice().sort(),
    [...(exts || [])].slice().sort(),
    sort || 'relevance',
    long === true || long === '1' ? 1 : 0,
  ])
}

function parseSearchRequest(params) {
  const q = (params.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH)
  const scope = (params.get('scope') ?? 'all').trim()
  const sig = (params.get('sig') ?? '').slice(0, 600)
  const rawTypes = (params.get('types') ?? '').split(',').map((value) => value.trim()).filter(Boolean)
  const types = rawTypes.filter((value) => ALL_TYPES.includes(value))
  const rawExt = params.get('ext') ?? ''
  const exts = [
    ...new Set(
      rawExt
        .split(/[,，;\s]+/)
        .map((value) => value.trim().replace(/^\.+/, '').toLowerCase())
        .filter((value) => /^[a-z0-9][a-z0-9+_-]{0,15}$/.test(value)),
    ),
  ].slice(0, 12)
  const rawSort = params.get('sort')
  const sort = rawSort === 'time-asc' ? 'time-asc' : rawSort === 'time' ? 'time' : 'relevance'
  // Workspace is the session's cwd: one exact string, never a prefix.
  const workspace = (params.get('workspace') ?? '').trim().slice(0, 400)
  const long = params.get('long') === '1'
  // A filter tweak re-runs the query; it must not create a history row.
  const auto = params.get('auto') === '1'
  // A speculative preload may ask for the complete snapshot; ordinary
  // requests stay capped so one query cannot flood the Client.
  const preload = params.get('preload') === '1'
  const cap = preload ? PRELOAD_LIMIT : SEARCH_LIMIT
  const requestedLimit = Number.parseInt(params.get('limit') ?? '', 10)
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(cap, Math.max(1, requestedLimit))
    : cap
  // 'auto' is the default: the Host decides from the corpus size.
  const rawThreads = params.get('threads')
  const requestedThreads = rawThreads === null || rawThreads === 'auto' ? 'auto' : Number.parseInt(rawThreads, 10)
  const threads = requestedThreads === 'auto'
    ? 'auto'
    : Number.isFinite(requestedThreads)
      ? Math.min(MAX_THREADS, Math.max(1, requestedThreads))
      : 'auto'
  const resolvedTypes = types.length > 0 ? types : [...ALL_TYPES]
  const resolvedScope = scope === 'all' || scope === '' ? null : scope
  return {
    q,
    scope: resolvedScope,
    workspace,
    long,
    auto,
    types: resolvedTypes,
    exts,
    sort,
    limit,
    threads,
    preload,
    sig: sig || canonicalSignature({ q, scope: resolvedScope, workspace, types: resolvedTypes, exts, sort, long }),
  }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

class SearchIndex {
  constructor(ctx, store) {
    this.ctx = ctx
    this.store = store
    this.records = []
    this.recordById = new Map()
    this.titles = new Map()
    this.listAt = 0
    this.listPromise = null
    this.surfaces = new Map()
    this.totalDocs = 0
    this.warnings = 0
    this.job = null
    this.dirty = new Set()
    this.dirtySessions = new Set()
    this.removedSessions = new Set()
    this.dirtyTimer = null
    this.persistTimer = null
    this.persisting = null
    this.pool = new SearchPool(new URL('./worker.js', import.meta.url))
    this.corpusVersion = 1
    this.titleVersion = 0
    this.activeSearches = 0
    this.corpusCache = null
    // Lazy indexing state: nothing is read until the panel is opened or the
    // user's own session emits an event.
    this.openClients = 0
    this.lastPanelAt = 0
    this.warming = false
    this.warmState = { running: false, done: 0, total: 0 }
    this.attemptAt = new Map()
    this.longCache = new Map()
    this.queryCache = new Map()
    // Built pages by exact request; invalidated with the corpus version.
    this.pageCache = new Map()
    this.bootstrapDone = false
    this.longDocs = 0
    this.longSessions = 0
    // Sessions the Workspace marks archived. The durable registry exposes no
    // accessor for this set — the only contract that publishes it is the
    // workspace controller's follow stream — so it is learned, never guessed.
    // Sessions whose shard documents are currently in memory (LRU by mount time).
    this.mounted = new Map()
    // Preload driven by the filter set: see prefetch() / runPrefetch().
    this.prefetchState = { state: 'idle', done: 0, total: 0, chars: 0 }
    this.prefetchTimer = null
    this.prefetchGeneration = 0
    this.archived = new Set()
    this.archiveSource = 'none'
    this.archiveWatch = null
    // Nothing is read at plugin activation: DSH startup must pay zero cost for
    // a search plugin nobody has opened yet. The first request starts bootstrap.
    this.ready = null
  }

  /**
   * Structured diagnostic, never a failure: the Host may be driven by a store
   * that has no log (the contract tests use one), and a diagnostic must not be
   * able to break indexing.
   */
  diag(type, payload) {
    try {
      if (this.store && typeof this.store.logDiag === 'function') this.store.logDiag(type, payload)
    } catch {
      /* diagnostics never throw */
    }
  }

  /** The panel is open: start filling the index in the background. */
  setPanelOpen(open) {
    this.openClients = open ? this.openClients + 1 : Math.max(0, this.openClients - 1)
    if (open) this.lastPanelAt = Date.now()
    if (this.openClients > 0) this.startWarm()
  }

  /** Any request from the panel proves somebody is still looking. */
  touch() {
    if (this.openClients > 0) this.lastPanelAt = Date.now()
  }

  panelActive() {
    if (this.openClients <= 0) return false
    // A closed window cannot send 'close': stop after a couple of idle minutes.
    if (Date.now() - this.lastPanelAt > PANEL_IDLE_MS) return false
    return true
  }

  /** Distinct working directories, newest session first. */
  workspaces() {
    const byCwd = new Map()
    for (const record of this.records) {
      const cwd = record.header.cwd ?? null
      if (!cwd) continue
      let bucket = byCwd.get(cwd)
      if (!bucket) {
        bucket = { cwd, sessions: 0, newest: 0 }
        byCwd.set(cwd, bucket)
      }
      bucket.sessions += 1
      const created = Number(record.header.createdAt) || 0
      if (created > bucket.newest) bucket.newest = created
    }
    return [...byCwd.values()].sort((left, right) => right.newest - left.newest)
  }

  /** Fresh means "no read needed for this request". */
  surfaceState(record) {
    const cached = this.surfaces.get(record.header.id)
    if (!cached) return 'missing'
    if (cached.error) return Date.now() < Number(cached.retryAt || 0) ? 'fresh' : 'stale'
    if (!record.live) return 'fresh'
    const live = this.optionalSessions()?.get(record.header.id)
    if (!live) return 'fresh'
    const liveSeq = Number(live.seq)
    if (Number.isFinite(liveSeq) && cached.seq === liveSeq) return 'fresh'
    return 'stale'
  }

  /**
   * Sessions that have never been read. A live session that merely grew is
   * "stale", not pending: counting it would keep the Client polling forever.
   */
  pendingSessions() {
    let pending = 0
    for (const record of this.records) {
      if (this.surfaceState(record) === 'missing') pending += 1
    }
    return pending
  }

  /**
   * Fill the index one session per tick. It stops the moment nobody is looking
   * or a search is waiting, so it can never compete with the user.
   */
  startWarm() {
    if (this.warming) return
    if (!this.store.state.autoIndex) return
    if (!this.panelActive()) return
    this.warming = true
    this.warmState = { running: true, done: 0, total: this.records.length, startedAt: Date.now() }
    const step = async () => {
      try {
        if (!this.panelActive() || !this.store.state.autoIndex) {
          this.warming = false
          this.warmState = { ...this.warmState, running: false }
          this.schedulePersist()
          return
        }
        if (this.activeSearches > 0) {
          setTimeout(step, 120)
          return
        }
        const record = this.nextWarmRecord()
        if (!record) {
          this.warming = false
          this.warmState = { ...this.warmState, running: false, done: this.records.length }
          this.schedulePersist()
          return
        }
        this.attemptAt.set(record.header.id, Date.now())
        await this.ensureSurface(record)
        this.warmState.done += 1
        setTimeout(step, WARM_TICK_MS)
      } catch {
        this.warming = false
        this.warmState = { ...this.warmState, running: false }
      }
    }
    setTimeout(step, 0)
  }

  nextWarmRecord(force = false) {
    // Newest first: the session the reader is most likely to search for is
    // indexed before a year-old one.
    const now = Date.now()
    for (const record of this.records) {
      const id = record.header.id
      // An explicit rebuild re-reads everything, including sessions that are
      // already fresh. Without `passDone` that is an endless loop; without the
      // force flag it is a no-op that only touched stale sessions — which is why
      // "重建索引" and "重建长文" did nothing after a completed pass.
      if (this.passDone && this.passDone.has(id)) continue
      if (!force && this.surfaceState(record) === 'fresh') continue
      const tried = this.attemptAt.get(id) || 0
      if (now - tried < 5_000) continue
      return record
    }
    return null
  }

  /** Index everything, whatever the panel state: an explicit rebuild. */
  rebuild(options = {}) {
    if (!this.bootstrapDone) {
      void this.ensureReady().then(() => this.rebuild(options))
      return this.status()
    }
    if (this.warming || this.job?.running) return this.status()
    if (options.long === true) this.setAutoLong(true)
    this.passDone = new Set()
    this.warming = true
    this.warmState = { running: true, done: 0, total: this.records.length, startedAt: Date.now() }
    this.job = { running: true, done: 0, total: this.records.length }
    const step = async () => {
      try {
        const record = this.nextWarmRecord(true)
        if (!record) {
          this.warming = false
          this.job = null
          this.passDone = null
          this.warmState = { ...this.warmState, running: false, done: this.records.length }
          this.schedulePersist()
          // A long rebuild asked for while this pass was running was refused by
          // `rebuild()`; dropping it silently is why "重建长文" looked dead.
          if (this.longQueued) {
            this.longQueued = false
            this.rebuildLong()
          }
          return
        }
        // An explicit rebuild ignores the live-session cooldown.
        this.surfaces.delete(record.header.id)
        this.attemptAt.set(record.header.id, Date.now())
        await this.ensureSurface(record)
        if (this.passDone) this.passDone.add(record.header.id)
        if (this.job) this.job.done += 1
        this.warmState.done += 1
        setTimeout(step, this.activeSearches > 0 ? 250 : WARM_TICK_MS)
      } catch {
        this.warming = false
        this.job = null
        this.passDone = null
      }
    }
    setTimeout(step, 0)
    return this.status()
  }

  setAutoLong(value) {
    this.store.setAutoLong(value !== false)
  }

  /**
   * Re-read every session and rewrite its long shard.
   *
   * Long documents are derived from the session text, so this is a full re-read.
   * It used to be a silent no-op while the ordinary index was warming — which is
   * exactly when a reader clicks it — so it now queues itself behind that pass.
   * The per-session long counts are NOT zeroed up front: the table must keep
   * showing what is currently indexed while the rebuild walks it.
   */
  async rebuildLong() {
    this.longCache.clear()
    this.forceLong = true
    this.store.setAutoLong(true)
    if (this.warming || this.job?.running) {
      this.longQueued = true
      this.diag('long-rebuild', { queued: true })
      return { queued: true, running: this.warmState?.running === true }
    }
    this.longQueued = false
    this.diag('long-rebuild', { queued: false, docs: this.longDocs, sessions: this.longSessions })
    this.rebuild()
    return { queued: false, running: true }
  }

  async clearLong() {
    const dropped = { docs: this.longDocs, sessions: this.longSessions }
    this.longCache.clear()
    const dirty = new Set()
    for (const [id, entry] of this.surfaces) {
      const count = Number(entry.longCount) || 0
      if (count === 0 && !Array.isArray(entry.longDocs)) continue
      delete entry.longDocs
      delete entry.longTagged
      entry.longCount = 0
      dirty.add(id)
    }
    this.longDocs = 0
    this.longSessions = 0
    await this.store.clearLongIndex()
    // The manifest must stop advertising chunks whose shards are gone.
    await this.store.saveIndex(this.surfaces, dirty, new Set())
    for (const id of dirty) this.dirtySessions.delete(id)
    this.diag('long-clear', dropped)
    return dropped
  }

  /**
   * Long chunks of one session, loaded from their own shard on first use. They
   * are the part of a long block that the ordinary index deliberately drops.
   */
  async longDocsOf(sessionId) {
    const entry = this.surfaces.get(sessionId)
    if (!entry) return null
    if (entry.longTagged) return entry.longTagged
    let docs = null
    if (Array.isArray(entry.longDocs) && entry.longDocs.length > 0) docs = entry.longDocs
    else if (Number(entry.longCount) > 0) docs = await this.store.loadLongShard(sessionId)
    if (!docs || docs.length === 0) return null
    const tagged = docs.map((doc) => ({
      id: docKey(sessionId, doc),
      kind: doc.kind,
      subtype: doc.subtype,
      text: doc.text,
      ext: doc.ext || null,
      sessionId,
      long: true,
    }))
    entry.longTagged = tagged
    while (this.longCache.size >= 24) {
      const oldest = this.longCache.keys().next().value
      this.longCache.delete(oldest)
      // Dropping the Map entry alone left the full long corpus pinned on the
      // surface through longTagged, so memory never came back.
      const surface = this.surfaces.get(oldest)
      if (surface) delete surface.longTagged
    }
    this.longCache.set(sessionId, tagged)
    return tagged
  }

  async bootstrap() {
    try {
      // Learn the archive set first: the session listing it filters is the very
      // next thing this bootstrap reads.
      this.startArchiveWatch()
      // The session table is cheap and everything else needs it; load it first
      // so the workspace list is answerable before a single shard is read.
      await this.ensureSessions()
      const cached = await this.store.loadIndex()
      if (cached && cached.sessions) {
        this.surfaces = new Map(Object.entries(cached.sessions))
        this.totalDocs = [...this.surfaces.values()].reduce((sum, entry) => sum + (Number(entry.docCount) || entry.docs?.length || 0), 0)
        // A legacy unified index is migrated to per-session shards on the first
        // persist instead of being rewritten inside bootstrap.
        if (cached.legacy) for (const id of this.surfaces.keys()) this.dirtySessions.add(id)
      }
      // Never prune against a restored cache: it cannot know about sessions
      // created since, and pruning deletes their shards.
      if (this.recordsFromCache !== true) this.pruneRemoved()
      this.countLong()
      // Long shards for Sessions nobody lists any more: a cache with no owner.
      await this.pruneOrphanLongShards()
    } catch (error) {
      this.warnings += 1
      await this.store.logError('bootstrap', error)
    } finally {
      this.bootstrapDone = true
      // The panel may already be waiting for a workspace list that needed the
      // session table this bootstrap just loaded.
      if (this.panelActive()) this.startWarm()
    }
  }

  async ensureReady() {
    if (!this.ready) this.ready = this.bootstrap()
    await this.ready
  }

  /** Only the session table: enough to answer the workspace list. */
  async ensureSessions() {
    if (!this.sessionsReady) {
      this.sessionsReady = (async () => {
        await this.store.load()
        const cached = Array.isArray(this.store.state.sessionCache) ? this.store.state.sessionCache : []
        if (cached.length > 0 && this.records.length === 0) {
          // Answer from the persisted table now; the real listing refreshes behind
          // this search. Titles come back with it, so the panel never shows the
          // first user line as a session name.
          this.records = cached.map((entry) => ({
            header: { id: entry.id, createdAt: entry.createdAt ?? null, cwd: entry.cwd ?? null },
            live: false,
            persisted: true,
          }))
          this.recordById = new Map(this.records.map((record) => [record.header.id, record]))
          for (const entry of cached) if (entry.title) this.titles.set(entry.id, entry.title)
          this.listAt = Date.now()
          this.recordsFromCache = true
          void this.reloadSessions(true)
            .then(() => {
              this.recordsFromCache = false
              this.pruneRemoved()
            })
            .then(() => this.pruneRemoved())
            .catch(() => {})
        } else {
          await this.reloadSessions(true)
        }
      })().catch(() => {})
    }
    await this.sessionsReady
  }

  countLong() {
    let docs = 0
    let sessions = 0
    for (const entry of this.surfaces.values()) {
      const count = Number(entry.longCount) || 0
      if (count <= 0) continue
      sessions += 1
      docs += count
    }
    this.longDocs = docs
    this.longSessions = sessions
  }

  /** Rebuild one session in place; the index panel's per-row button. */
  async rebuildSessionOnly(id) {
    const record = this.recordById.get(id)
    if (!record) return false
    const cached = this.surfaces.get(id)
    if (cached) {
      this.totalDocs -= Number(cached.docCount) || cached.docs?.length || 0
      const previousLong = Number(cached.longCount) || 0
      if (previousLong > 0) {
        this.longDocs -= previousLong
        this.longSessions -= 1
      }
      this.surfaces.delete(id)
    }
    await this.ensureSurface(record)
    this.dirtySessions.add(id)
    this.corpusVersion += 1
    try {
      await this.store.saveIndex(this.surfaces, new Set([id]), new Set())
    } catch (error) {
      await this.store.logError('rebuild-session', error)
      return false
    }
    return true
  }

  /**
   * Learn the archive set from the Workspace controller.
   *
   * `follow(signal)` streams a complete baseline — which carries
   * `archivedSessionIds` — followed by increments. This is the only contract
   * that publishes the set: the durable registry has archive/unarchive
   * *methods* but no accessor, so the old `workspaceRegistry.archivedSessionIds`
   * read always came back empty and nothing was ever filtered. The set is left
   * empty (not guessed) when the controller is absent, which is what an older
   * Host looks like.
   */
  startArchiveWatch() {
    if (this.archiveWatch) return
    this.archiveWatch = new AbortController()
    let service = null
    try {
      service = this.ctx.get('workspaceController')
    } catch {
      service = null
    }
    if (!service || typeof service.follow !== 'function') {
      this.archiveSource = 'unavailable'
      this.diag('archived', { source: 'unavailable', size: 0 })
      return
    }
    const loop = async () => {
      for await (const frame of service.follow(this.archiveWatch.signal)) {
        const ids = archivedIdsOfFrame(frame)
        if (ids) this.noteArchiveSet(ids, 'follow')
      }
    }
    void loop().catch((error) => {
      // A stream that ends is not a failure of this plugin: keep whatever set
      // was last delivered and let the archive events keep it current.
      this.diag('archived', {
        source: 'follow-stopped',
        size: this.archived.size,
        message: String((error && error.message) || error),
      })
    })
  }

  /** One archive change: remember it, then make the index agree with it. */
  noteArchiveSet(next, source) {
    const previous = this.archived
    const changed = previous.size !== next.size || [...next].some((id) => !previous.has(id))
    this.archived = next
    this.archiveSource = source
    this.diag('archived', { size: next.size, source, changed })
    if (changed) this.applyArchive()
  }

  noteArchived(sessionId) {
    if (typeof sessionId !== 'string' || sessionId === '') return
    if (this.archived.has(sessionId)) return
    this.noteArchiveSet(new Set([...this.archived, sessionId]), 'event')
  }

  noteUnarchived(sessionId) {
    if (typeof sessionId !== 'string' || sessionId === '' || !this.archived.has(sessionId)) return
    const next = new Set(this.archived)
    next.delete(sessionId)
    this.noteArchiveSet(next, 'event')
  }

  /** Hide archived sessions at once instead of on the next listing TTL. */
  applyArchive() {
    // `dropArchived=false` keeps the shards (a cheap un-archive), but hiding is
    // not optional: a hidden Session must never answer a search.
    if (this.store.state.dropArchived !== false) {
      if (typeof this.store.dropArchivedData === 'function') this.store.dropArchivedData(this.archived)
      for (const id of this.archived) this.forgetSession(id)
    }
    if (this.records.some((record) => this.archived.has(record.header.id))) {
      this.records = this.records.filter((record) => !this.archived.has(record.header.id))
      this.recordById = new Map(this.records.map((record) => [record.header.id, record]))
      this.listAt = 0
    }
    // The corpus is keyed by recordById, so a hidden Session leaves it as soon
    // as the version moves.
    this.corpusVersion += 1
    // Re-list in the background: the archive event is not the moment to spend
    // on headers, but the next search must not see the hidden Session.
    void this.reloadSessions(true).catch(() => {})
  }

  /** Drop one session from memory and from the shards on disk. */
  forgetSession(id) {
    const cached = this.surfaces.get(id)
    if (!cached) return
    this.totalDocs -= Number(cached.docCount) || cached.docs?.length || 0
    const long = Number(cached.longCount) || 0
    if (long > 0) {
      this.longDocs -= long
      this.longSessions = Math.max(0, this.longSessions - 1)
    }
    this.surfaces.delete(id)
    this.longCache.delete(id)
    this.dirtySessions.delete(id)
    this.removedSessions.add(id)
    this.queryCache.clear()
    this.corpusCache = null
  }

  /** Ids the workspace marks as archived; empty while nothing is known yet. */
  archivedIds() {
    if (this.archived.size > 0) return this.archived
    // A Host from before the workspace controller published the set on the
    // registry. Kept as a fallback only: this Host's registry has no such field.
    try {
      const registry = this.ctx.get('workspaceRegistry') || this.ctx.get('workspace')
      const ids = registry && registry.archivedSessionIds
      if (Array.isArray(ids) && ids.length > 0) return new Set(ids)
      if (ids && typeof ids[Symbol.iterator] === 'function') {
        const found = new Set([...ids])
        if (found.size > 0) return found
      }
    } catch {
      /* older Host without a workspace registry */
    }
    return this.archived
  }

  /** Per-session state for the index panel; never rebuilds anything. */
  /** Keep the last few indexing events for the panel. */
  noteIndexEvent(type, detail = {}) {
    if (!this.indexEvents) this.indexEvents = []
    this.indexEvents.push({ at: Date.now(), type, ...detail })
    while (this.indexEvents.length > 20) this.indexEvents.shift()
  }

  clearIndexEvents() {
    this.indexEvents = []
  }

  indexReport() {
    const rows = []
    for (const record of this.records) {
      const id = record.header.id
      const entry = this.surfaces.get(id)
      rows.push({
        id,
        title: this.titles.get(id) || entry?.fallbackTitle || null,
        cwd: record.header.cwd ?? null,
        docs: Number(entry?.docCount) || entry?.docs?.length || 0,
        longDocs: Number(entry?.longCount) || 0,
        state: entry ? (entry.error ? 'failed' : 'fresh') : 'missing',
        updatedAt: entry?.builtAt ?? null,
        error: entry?.error ? String(entry.error.message || entry.error) : null,
      })
    }
    rows.sort((left, right) => (right.docs || 0) - (left.docs || 0))
    return {
      rows,
      sessions: rows.length,
      missing: rows.filter((row) => row.state === 'missing').length,
      failed: rows.filter((row) => row.state === 'failed').length,
      events: (this.indexEvents || []).slice(-20),
      running: this.warming === true || this.job?.running === true,
      done: this.warmState?.done ?? 0,
      total: this.warmState?.total ?? rows.length,
      docs: this.totalDocs,
      longDocs: this.longDocs,
      longSessions: this.longSessions,
      autoIndex: this.store.state.autoIndex,
      autoLong: this.store.state.autoLong !== false,
      longQueued: this.longQueued === true,
      archived: this.archived.size,
      archivedSource: this.archiveSource,
    }
  }

  status() {
    return {
      ready: this.bootstrapDone === true,
      running: this.warming === true || this.job?.running === true || this.prefetchState.state === 'running',
      prefetch: this.prefetch,
      done: this.warmState?.done ?? 0,
      total: this.warmState?.total ?? this.records.length,
      pending: this.bootstrapDone ? this.pendingSessions() : 0,
      sessions: this.surfaces.size,
      docs: this.totalDocs,
      longDocs: this.longDocs,
      longSessions: this.longSessions,
      autoLong: this.store.state.autoLong !== false,
      workspaces: this.records.length === 0 ? 0 : this.workspaces().length,
      totalSessions: this.records.length,
      warnings: this.warnings,
      autoIndex: this.store.state.autoIndex,
      revision: this.store.state.revision,
      // How many sessions the Workspace hides from search, and where the set
      // came from — the diagnostic that was missing when archiving "did nothing".
      archived: this.archived.size,
      archivedSource: this.archiveSource,
    }
  }

  pruneRemoved() {
    const live = new Set(this.records.map((record) => record.header.id))
    let removed = false
    for (const id of this.surfaces.keys()) {
      if (!live.has(id)) {
        removed = true
        this.totalDocs -= Number(this.surfaces.get(id)?.docCount) || this.surfaces.get(id)?.docs?.length || 0
        this.surfaces.delete(id)
        this.removedSessions.add(id)
        this.corpusVersion += 1
      }
    }
    if (removed) {
      this.store.bumpRevision()
      this.schedulePersist()
    }
  }

  /**
   * Delete long shards whose Session is neither listed nor indexed.
   *
   * The long index is a cache of the Session log, so a shard nobody owns can
   * only be rebuilt — and a Session that left the listing before the removal
   * fix shipped is exactly that (three archived Sessions still had one on disk
   * here). Runs after the manifest is loaded, never on a search.
   */
  async pruneOrphanLongShards() {
    let names = []
    try {
      names = await fs.readdir(this.store.longDir)
    } catch {
      return 0
    }
    const owned = new Set()
    for (const id of this.surfaces.keys()) owned.add(this.store.shardStem(id))
    for (const id of this.recordById.keys()) owned.add(this.store.shardStem(id))
    let removed = 0
    for (const name of names) {
      if (!name.endsWith('.json.gz')) continue
      const stem = name.slice(0, -'.json.gz'.length)
      if (owned.has(stem)) continue
      try {
        await fs.rm(path.join(this.store.longDir, name), { force: true })
        removed += 1
      } catch {
        /* a file that cannot be removed is a warning, not a failure */
      }
    }
    if (removed > 0) this.diag('long-orphans', { removed })
    return removed
  }

  schedulePersist() {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    // Only changed sessions are rewritten, but a streaming session still
    // updates every few seconds; batch a longer window to keep the CPU quiet.
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      if (this.persisting) return this.schedulePersist()
      // Writing shards while a search is running is what made the panel hitch.
      if (this.activeSearches > 0) return this.schedulePersist()
      const dirty = new Set(this.dirtySessions)
      const removed = new Set(this.removedSessions)
      this.dirtySessions.clear()
      this.removedSessions.clear()
      this.persistInflight = dirty
      this.persisting = this.store
        .saveIndex(this.surfaces, dirty, removed)
        .catch(() => {})
        .finally(() => {
          this.persisting = null
          this.persistInflight = null
          if (this.dirtySessions.size > 0 || this.removedSessions.size > 0) this.schedulePersist()
        })
    }, PERSIST_DEBOUNCE_MS)
  }

  /** Index every session and wait for it: tests and explicit full rebuilds. */
  async startAll() {
    await this.ensureReady()
    for (const record of this.records) {
      this.attemptAt.delete(record.header.id)
      await this.ensureSurface(record)
    }
    this.countLong()
    this.schedulePersist()
    return this.status()
  }

  noteSessionActivity(sessionId) {
    if (!this.store.state.autoIndex) return
    // Anything other than a real id would poison the dirty set forever.
    if (typeof sessionId !== 'string' || sessionId === '') return
    this.dirty.add(sessionId)
    if (this.dirtyTimer) clearTimeout(this.dirtyTimer)
    this.dirtyTimer = setTimeout(() => {
      this.dirtyTimer = null
      void this.flushDirty()
    }, 1400)
  }

  async flushDirty() {
    if (this.dirty.size === 0) return
    await this.ensureReady()
    // Background re-indexing competes with the search the user is waiting for.
    if (this.activeSearches > 0) {
      this.dirtyTimer = setTimeout(() => {
        this.dirtyTimer = null
        void this.flushDirty()
      }, 3_000)
      return
    }
    const ids = [...this.dirty]
    this.dirty.clear()
    // A streaming Session fires an event batch every second. Re-listing on
    // every batch kept the Host parsing headers for nothing; the list only has
    // to learn about new or removed Sessions.
    const unknown = ids.some((id) => !this.recordById.has(id))
    if (unknown || Date.now() - this.listAt > 30_000) await this.reloadSessions(false)
    for (const id of ids) {
      const record = this.recordById.get(id)
      if (!record) continue
      const cached = this.surfaces.get(id)
      // A session that was never indexed is cheap and worth reading at once, so
      // its own event still makes it searchable. Re-reading an already indexed
      // session is the furnace: only while the panel is open, and at most once
      // per LIVE_REBUILD_MS.
      if (!cached) {
        await this.ensureSurface(record)
        continue
      }
      if (!this.panelActive()) continue
      if (record.live && Date.now() - (cached.builtAt || 0) < LIVE_REBUILD_MS) continue
      await this.ensureSurface(record)
    }
    this.schedulePersist()
  }

  async clear() {
    await this.ensureReady()
    this.pageCache.clear()
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    this.surfaces.clear()
    this.totalDocs = 0
    this.longDocs = 0
    this.longSessions = 0
    this.longCache.clear()
    this.queryCache.clear()
    this.corpusVersion += 1
    this.corpusCache = null
    this.dirty.clear()
    this.dirtySessions.clear()
    this.removedSessions.clear()
    this.store.clearSavedSearches()
    this.store.bumpRevision()
    await this.store.clearIndex()
  }

  /** List stored sessions with titles, newest first. Cheap cached snapshot. */
  async listSessions() {
    await this.ensureReady()
    const started = Date.now()
    await this.reloadSessions(false)
    if (this.titlePromise && this.titles.size === 0) {
      // Cosmetic data must never gate the listing; the Client re-reads it.
      await Promise.race([this.titlePromise.catch(() => {}), new Promise((resolve) => setTimeout(resolve, 250))])
    }
    const sessions = this.records.map((record) => this.describeRecord(record))
    return {
      sessions,
      total: sessions.length,
      indexedSessions: this.surfaces.size,
      indexedDocs: this.totalDocs,
      warnings: this.warnings,
      tookMs: Date.now() - started,
    }
  }

  async reloadSessions(force) {
    if (!force && this.records.length > 0 && Date.now() - this.listAt < TITLE_CACHE_MS) return
    if (this.listPromise) return this.listPromise
    this.listPromise = this.loadSessions().finally(() => {
      this.listPromise = null
    })
    return this.listPromise
  }

  async loadSessions() {
    let records = await this.ctx.sessionQuery.listSessions()
    const ids = records.map((record) => record.header.id)
    // The store may change while titles are folded; merge by id against the
    // exact listing we rank, and drop document caches for removed sessions.
    const liveIds = new Set(ids)
    for (const id of this.surfaces.keys()) {
      if (!liveIds.has(id)) {
        const cached = this.surfaces.get(id)
        this.totalDocs -= Number(cached.docCount) || cached.docs?.length || 0
        this.surfaces.delete(id)
        this.removedSessions.add(id)
        this.corpusVersion += 1
      }
    }
    // Archived sessions are dropped from the index, so no hit can point at a
    // conversation the sidebar no longer shows. The `dropArchived` preference
    // only decides whether their shards are deleted with them — hiding is not
    // optional, and gating both on one flag made "keep the data" keep the hits.
    const archived = this.archivedIds()
    if (archived.size > 0) {
      const kept = records.filter((record) => !archived.has(record.header.id))
      if (kept.length !== records.length) {
        if (this.store.state.dropArchived !== false) this.store.dropArchivedData(archived)
        records = kept
      }
    }
    this.records = records
    this.recordById = new Map(records.map((record) => [record.header.id, record]))
    this.listAt = Date.now()
    // Persist a compact copy: reloading the real table reads every session header
    // and takes seconds on a cold disk, which is exactly the first-search stall.
    this.store.state.sessionCache = records.map((record) => ({
      id: record.header.id,
      createdAt: record.header.createdAt ?? null,
      cwd: record.header.cwd ?? null,
      title: this.titles.get(record.header.id) || null,
    }))
    this.store.saveStateSoon()
    // Titles are a separate Host call and can take seconds. Never hold a
    // search (or startup) on them; the UI reads them when it needs them.
    this.titlePromise = this.loadTitles(ids)
    return records
  }

  async loadTitles(ids) {
    try {
      const titleResults = await this.ctx.sessionQuery.readTitleSnapshots(ids)
      const titles = new Map()
      for (const result of titleResults) {
        if (result.status !== 'fulfilled') continue
        const title = result.value.title
        if (title && typeof title.title === 'string' && title.title.trim()) {
          titles.set(result.sessionId, title.title.trim())
        }
      }
      this.titles = titles
      this.titleVersion += 1
      // Persist the names with the session table: after a restart the panel must
      // not fall back to the first user line while titles are being re-read.
      const cache = Array.isArray(this.store.state.sessionCache) ? this.store.state.sessionCache : []
      if (cache.length > 0) {
        this.store.state.sessionCache = cache.map((entry) => ({
          ...entry,
          title: this.titles.get(entry.id) || entry.title || null,
        }))
        this.store.saveStateSoon()
      }
    } catch {
      /* titles are cosmetic */
    }
  }

  describeRecord(record) {
    const header = record.header
    return {
      id: header.id,
      title: this.titleOf(header.id),
      createdAt: header.createdAt,
      cwd: header.cwd ?? null,
      live: record.live === true,
      persisted: record.persisted === true,
      parentSession: header.parentSession ?? null,
      agentPreset: header.agentPreset ?? null,
    }
  }

  titleOf(sessionId) {
    const title = this.titles.get(sessionId)
    if (title) return title
    const cached = this.surfaces.get(sessionId)
    return cached?.fallbackTitle || null
  }

  async search(request) {
    this.activeSearches += 1
    try {
      return await this.searchOnce(request)
    } finally {
      this.activeSearches -= 1
    }
  }

  async searchOnce({ q, scope, workspace, long, types, exts, sort, limit, threads, sig }) {
    const started = Date.now()
    // Titles are cosmetic but the Client groups results by them; without this a
    // fast first search showed the first user line instead of the session title.
    if (this.titlePromise && !this.titles.size) {
      await Promise.race([this.titlePromise.catch(() => {}), new Promise((resolve) => setTimeout(resolve, 300))])
    }
    const ensureStarted = Date.now()
    await this.ensureReady()
    const ensureMs = Date.now() - ensureStarted
    // Titles/list refresh is the modal's job. Refreshing here made the first
    // search pay for 21 title reads and look like a slow "match".
    let listMs = 0
    if (this.records.length === 0) {
      const listStarted = Date.now()
      await this.reloadSessions(false)
      listMs = Date.now() - listStarted
    }

    let scopeMissing = false
    if (scope && !this.recordById.get(scope)) {
      // An unknown session id must read as "this session is gone", never as
      // "this session has no matches".
      scopeMissing = true
    }
    // Route first (metadata only), then mount: a session that holds no requested
    // kind is never read from disk at all.
    let targets = this.routeIds({ scope, workspace, types })
    if (targets.length > 0) await this.mountFor(targets)

    const warningsBefore = this.warnings
    const cores = (os.cpus() || []).length || 4
    const choice = resolveThreads(threads, this.corpusChars(), cores)
    const requestedThreads = choice.threads
    const surfaceStarted = Date.now()
    // Lazy: only never-indexed sessions are read inside this request, and only a
    // handful of them. Everything else is answered from the index as it is and
    // completed by the background pass, which the Client polls.
    let budget = SEARCH_BUDGET_MS
    let inlineReads = 0
    for (const record of targets) {
      if (this.surfaceState(record) !== 'missing') continue
      if (inlineReads >= 6 || budget <= 0) break
      const before = Date.now()
      await this.ensureSurface(record)
      budget -= Date.now() - before
      inlineReads += 1
    }
    const surfaceMs = Date.now() - surfaceStarted

    let pending = 0
    for (const record of targets) {
      if (this.surfaceState(record) === 'missing') pending += 1
    }

    const wanted = new Set(types)
    const qLower = q.toLowerCase()
    const extSet = new Set(exts)
    const hasFile = types.some((kind) => FILE_TYPES.has(kind))
    const hasText = types.some((kind) => !FILE_TYPES.has(kind))
    const fileOnly = extSet.size > 0 && hasFile

    // One flat corpus for both the worker pool and the inline fallback, built
    // once per index change instead of on every keystroke's search. It is split
    // by class so a files-only search never walks the text corpus.
    const corpus = this.corpus()
    const docMeta = corpus.meta
    let docs = hasFile && hasText ? corpus.all : hasFile ? corpus.files : corpus.text
    if (scope || workspace) {
      const allowed = new Set(targets.map((record) => record.header.id))
      docs = docs.filter((doc) => allowed.has(doc.sessionId))
    }

    const matchStarted = Date.now()
    let longList = null
    let longMeta = null
    let longMs = 0
    if (long) {
      const longStarted = Date.now()
      const ids = (scope || workspace ? targets : this.records).map((record) => record.header.id)
      longList = []
      longMeta = new Map()
      for (const id of ids) {
        const docsOfSession = await this.longDocsOf(id)
        if (!docsOfSession) continue
        const record = this.recordById.get(id)
        if (!record) continue
        const sessionTitle = this.titleOf(id) ?? id
        for (const doc of docsOfSession) {
          longList.push(doc)
          longMeta.set(doc.id, { sessionId: id, record, sessionTitle, doc: { ...doc, chunk: doc.chunk ?? 0 } })
        }
      }
      longMs = Date.now() - longStarted
      if (longList.length > 0) docs = docs.concat(longList)
    }

    // A repeat of the exact same request (same words, same filters, same order,
    // same page size) has already been answered; its page is the answer. This is
    // what makes flipping a filter back and forth cost nothing.
    const pageKey = JSON.stringify([
      qLower,
      scope || '',
      workspace || '',
      long ? 1 : 0,
      [...(types || [])].sort(),
      [...(exts || [])].sort(),
      sort,
      limit,
    ])
    const cachedPage = this.pageCache.get(pageKey)
    if (cachedPage && cachedPage.version === this.corpusVersion) {
      return { ...cachedPage.payload, tookMs: Date.now() - started, cachedPage: true }
    }

    // 计算后置: the raw match list of one query is what a filter change reuses.
    // It is keyed by the corpus version, so any index change invalidates it.
    const cacheKey = JSON.stringify([
      qLower,
      scope || '',
      workspace || '',
      long ? 1 : 0,
      // The scanned document set depends on the asked-for kinds; without this a
      // file-only search poisoned the cache for the same query over all kinds.
      [...(types || [])].sort().join(','),
    ])
    const cachedMatches = this.queryCache.get(cacheKey)
    let matches
    let mode = 'cache'
    if (cachedMatches && cachedMatches.version === this.corpusVersion) {
      matches = cachedMatches.matches
    } else {
      const scanRequest = { types: ALL_TYPES, exts: [], fileOnly: false, qLower }
      matches = null
      // Long documents are huge; copying them into worker threads costs seconds
      // for the structured clone alone. Scan those requests inline instead.
      if (!long && requestedThreads > 1 && docs.length >= WORKER_MIN_DOCS && this.pool) {
        // The worker corpus is a *subset* (scope / workspace / kind filters).
        // Keying it on corpusVersion alone let a scoped scan be reused for an
        // unscoped query, which returned one session's hits for the whole store.
        const assignments = await this.workerAssignments(targets, requestedThreads)
        // The key changes only when a scanned shard's identity or content does.
        const shardKey = this.routeSignature(targets) + '|' + requestedThreads + '|' + docs.length
        matches = await this.pool.search(scanRequest, requestedThreads, assignments, shardKey)
        mode = matches ? 'worker' : 'inline-fallback'
      } else if (requestedThreads > 1) {
        mode = 'inline-small'
      } else {
        mode = 'inline'
      }
      if (!matches) matches = scanDocs(docs, scanRequest)
      this.rememberMatches(cacheKey, matches)
    }
    // Type and extension filtering happens on the match list, never on the
    // corpus: changing a filter on a cached query costs no scan at all.
    const filtered = []
    for (const match of matches) {
      const entry = docMeta.get(match.id) || (longMeta ? longMeta.get(match.id) : undefined)
      if (!entry) continue
      if (!wanted.has(entry.doc.kind)) continue
      if (fileOnly && (!entry.doc.ext || !extSet.has(entry.doc.ext))) continue
      filtered.push(match)
    }
    const matchMs = Date.now() - matchStarted

    // A high-frequency word can match tens of thousands of documents, and the
    // page needs `limit` of them. Materializing every hit first (snippet, file
    // list, anchor) was the single largest cost of such a search, and it was
    // paid for rows the reader never sees. Keep a scalar candidate per hit,
    // order the candidates, then build items only for the page.
    const candidates = []
    const perSession = new Map()
    const scanned = docs.length
    for (const match of filtered) {
      const meta = docMeta.get(match.id) || (longMeta ? longMeta.get(match.id) : undefined)
      if (!meta) continue
      candidates.push({ match, meta, time: Number(meta.doc.time) || 0 })
      let bucket = perSession.get(meta.sessionId)
      if (!bucket) {
        bucket = {
          id: meta.sessionId,
          title: meta.sessionTitle,
          cwd: meta.record.header.cwd ?? null,
          createdAt: meta.record.header.createdAt,
          live: meta.record.live === true,
          count: 0,
          best: 0,
        }
        perSession.set(meta.sessionId, bucket)
      }
      bucket.count += 1
      if (match.score > bucket.best) bucket.best = match.score
    }

    const compare = (left, right) => {
      if (sort === 'time') return right.time - left.time || right.match.score - left.match.score
      if (sort === 'time-asc') return left.time - right.time || right.match.score - left.match.score
      return right.match.score - left.match.score || right.time - left.time
    }
    candidates.sort(compare)
    const items = candidates.slice(0, limit).map(({ match, meta }) =>
      makeResultItem({
        sessionId: meta.sessionId,
        sessionTitle: meta.sessionTitle,
        record: meta.record,
        doc: meta.doc,
        matchIndex: match.matchIndex,
        queryLength: qLower.length,
        qLower,
        score: match.score,
      }),
    )
    const sessions = [...perSession.values()].sort((a, b) => {
      if (sort === 'time') return b.createdAt - a.createdAt || b.best - a.best
      if (sort === 'time-asc') return a.createdAt - b.createdAt || b.best - a.best
      return b.best - a.best || b.createdAt - a.createdAt
    })

    let truncatedDocs = 0
    for (const record of targets) {
      const cached = this.surfaces.get(record.header.id)
      if (cached?.truncated) truncatedDocs += 1
    }

    const payload = {
      query: q,
      scope: scope ?? 'all',
      workspace: workspace || '',
      long: long === true,
      types,
      exts,
      sort,
      signature: sig || canonicalSignature({ q, scope, workspace, types, exts, sort, long }),
      scopeMissing,
      // Sessions this page could not read yet; the Client keeps polling until
      // this reaches zero, adding the hits that arrive meanwhile.
      pending,
      longMs,
      truncatedDocs,
      total: candidates.length,
      scanned,
      limit,
      truncated: candidates.length > items.length,
      items,
      sessions,
      threads: mode === 'worker' ? requestedThreads : 1,
      threadsAuto: choice.auto === true,
      corpusChars: this.corpusChars(),
      mode,
      surfaceMs,
      matchMs,
      degraded: this.pool ? this.pool.degraded === true : false,
      ensureMs,
      listMs,
      otherMs: Math.max(0, Date.now() - started - ensureMs - listMs - surfaceMs - matchMs),
      indexedSessions: this.surfaces.size,
      indexedDocs: this.totalDocs,
      warnings: this.warnings - warningsBefore,
      tookMs: Date.now() - started,
    }
    if (pending === 0) {
      this.pageCache.set(pageKey, { version: this.corpusVersion, payload })
      while (this.pageCache.size > MAX_PAGE_CACHE) this.pageCache.delete(this.pageCache.keys().next().value)
    }
    return payload
  }

  /** Rebuild one session surface when it is new or a live session advanced. */
  /**
   * Background check for shards built before the compaction fix. A session with
   * a checkpoint gets dropped from the cache so the next warm pass rebuilds it
   * from the raw log; everything else is marked and left alone.
   */
  async verifyCompaction(record) {
    const id = record.header.id
    const cached = this.surfaces.get(id)
    if (!cached || cached.compactChecked === true) return
    try {
      const probe = await this.ctx.sessionQuery.readSurface(id)
      const events = Array.isArray(probe.events) ? probe.events : []
      if (!hasCompactionMarker(events)) {
        cached.compactChecked = true
        this.dirtySessions.add(id)
      } else {
        this.totalDocs -= Number(cached.docCount) || cached.docs?.length || 0
        this.surfaces.delete(id)
        this.corpusVersion += 1
      }
    } catch {
      /* a session that cannot be probed keeps its cached surface */
    }
  }

  /**
   * The raw log, cached per (session, watermark): a live compacted session is
   * rebuilt as it streams, and re-reading and replay-validating the whole log on
   * every rebuild is seconds of work on the search path.
   */
  async fullEventsFor(id, watermark) {
    const key = id + '|' + watermark
    if (!this.fullLogCache) this.fullLogCache = new Map()
    const hit = this.fullLogCache.get(key)
    if (hit) return hit
    const events = await this.readFullEvents(id)
    if (Array.isArray(events)) {
      this.fullLogCache.set(key, events)
      while (this.fullLogCache.size > 6) this.fullLogCache.delete(this.fullLogCache.keys().next().value)
    }
    return events
  }

  /**
   * The complete raw event log. Only used for sessions that were compacted: the
   * surface hides the folded turns, and those turns must stay searchable.
   */
  async readFullEvents(id) {
    try {
      const query = this.ctx.sessionQuery
      if (!query || typeof query.readSession !== 'function') return null
      const loaded = await query.readSession(id)
      return Array.isArray(loaded?.events) ? loaded.events : null
    } catch {
      // An older Host may not expose readSession; the surface is still usable.
      return null
    }
  }

  async ensureSurface(record, options = {}) {
    const id = record.header.id
    const cached = this.surfaces.get(id)
    const liveSession = this.optionalSessions()?.get(id)
    const liveSeq = liveSession ? Number(liveSession.seq) : undefined
    if (cached) {
      // A failed read leaves an error shell. Treating it as "unchanged" hid
      // that session until the plugin reloaded; retry it with backoff instead.
      if (cached.error && Date.now() < Number(cached.retryAt || 0)) return cached
      const unchanged =
        !cached.error && (!record.live || (liveSeq !== undefined && cached.seq === liveSeq))
      if (unchanged) {
        // A shell looks "fresh" by its seq but holds no documents; mount it so
        // the caller (and the corpus) sees the real content.
        if (!Array.isArray(cached.docs)) await this.mountEntry(id)
        // Shards written before the compaction fix may hold only the checkpoint,
        // but verifying that costs one readSurface per session — never on a
        // search. Hand it to the background pass and answer from the cache now.
        if (cached.compactChecked !== true) void this.verifyCompaction(record)
        return cached
      }
      // Two searches in a row must not rebuild and resend the live surface.
      if (options.reuseLive === true && record.live && Date.now() - (cached.builtAt || 0) < 2_000) return cached
    }
    try {
      const snapshot = await this.ctx.sessionQuery.readSurface(id)
      // Compaction hides the folded turns from the surface but keeps them in the
      // raw log. Indexing only the surface is what made the result page and the
      // conversation disagree after a compaction.
      const surfaceEvents = Array.isArray(snapshot.events) ? snapshot.events : []
      const fullEvents = hasCompactionMarker(surfaceEvents)
        ? await this.fullEventsFor(id, Number(snapshot.capturedThroughSeq) || 0)
        : null
      const source =
        fullEvents && fullEvents.length > surfaceEvents.length
          ? { ...snapshot, events: fullEvents, surfaceSeqs: new Set(surfaceEvents.map((event) => Number(event.seq))) }
          : snapshot
      const built = buildSurfaceDocs(source, record)
      built.seq = liveSeq ?? (snapshot.capturedThroughSeq == null ? undefined : Number(snapshot.capturedThroughSeq))
      built.builtAt = Date.now()
      built.compactChecked = true
      this.noteIndexEvent(cached ? 'rebuild' : 'index', { id, docs: built.docs.length, long: Array.isArray(built.longDocs) ? built.longDocs.length : 0 })
      // Long chunks are kept apart from the ordinary documents and written to
      // their own shard, so the main index stays small and its scan stays fast.
      const keepLong = this.store.state.autoLong !== false || this.forceLong === true
      const longDocs = keepLong && Array.isArray(built.longDocs) ? built.longDocs : []
      built.longDocs = longDocs
      built.longCount = longDocs.length
      if (cached) {
        this.totalDocs -= Number(cached.docCount) || cached.docs?.length || 0
        const previousLong = Number(cached.longCount) || 0
        if (previousLong > 0) {
          this.longDocs -= previousLong
          this.longSessions -= 1
        }
      }
      built.docCount = built.docs.length
      built.chars = built.docs.reduce((sum, doc) => sum + (doc.text ? doc.text.length : 0), 0)
      built.kinds = [...new Set(built.docs.map((doc) => doc.kind))]
      built.cwd = record.header.cwd ?? null
      this.mounted.set(id, Date.now())
      this.surfaces.set(id, built)
      this.totalDocs += built.docs.length
      if (longDocs.length > 0) {
        this.longDocs += longDocs.length
        this.longSessions += 1
      }
      this.longCache.delete(id)
      // A streaming session grows constantly; bumping the revision for that
      // made every saved result look stale. Only structural changes count.
      if (!cached || !record.live) this.store.bumpRevision()
      this.corpusVersion += 1
      this.dirtySessions.add(id)
      this.schedulePersist()
      return built
    } catch (error) {
      this.warnings += 1
      const message = error instanceof Error ? error.message : String(error)
      if (cached) {
        cached.error = message
        cached.failures = Number(cached.failures || 0) + 1
        cached.retryAt = Date.now() + Math.min(300_000, 5_000 * 2 ** (cached.failures - 1))
        return cached
      }
      const empty = {
        docs: [],
        longDocs: [],
        longCount: 0,
        fallbackTitle: null,
        seq: liveSeq,
        builtAt: Date.now(),
        error: message,
        failures: 1,
        retryAt: Date.now() + 5_000,
      }
      this.surfaces.set(id, empty)
      return empty
    }
  }

  /**
   * Attach one session's documents. A missing/corrupt shard drops the shell so
   * the next search re-indexes that session from its log instead of silently
   * answering from nothing.
   */
  async mountEntry(sessionId) {
    const entry = this.surfaces.get(sessionId)
    if (!entry) return false
    if (Array.isArray(entry.docs)) {
      this.mounted.set(sessionId, Date.now())
      return true
    }
    const shard = await this.store.loadShard(sessionId)
    if (!shard) {
      this.forgetSession(sessionId)
      this.surfaces.delete(sessionId)
      this.totalDocs -= Number(entry.docCount) || 0
      return false
    }
    entry.docs = shard.docs
    if (shard.fallbackTitle) entry.fallbackTitle = shard.fallbackTitle
    entry.docCount = shard.docs.length
    entry.chars = shard.docs.reduce((sum, doc) => sum + (doc.text ? doc.text.length : 0), 0)
    this.mounted.set(sessionId, Date.now())
    this.corpusVersion += 1
    return true
  }

  /**
   * Mount the Sessions a request actually needs, then release the ones that fell
   * out of the hot set. The budget bounds a pathological corpus; correctness
   * wins when a request genuinely spans more than it (everything is mounted).
   */
  async mountFor(records, options = {}) {
    const keep = Math.max(1, Number(options.keep) || MOUNT_KEEP)
    const budget = Math.max(1_000_000, Number(options.budget) || MOUNT_BUDGET_CHARS)
    const wanted = new Set(records.map((record) => record.header.id))
    // Release first: the freed text is what makes room for this request.
    for (const [id, at] of [...this.mounted].sort((left, right) => left[1] - right[1])) {
      if (this.mounted.size <= keep && !wanted.has(id)) continue
      const entry = this.surfaces.get(id)
      if (entry && Array.isArray(entry.docs) && !wanted.has(id)) {
        entry.docCount = entry.docs.length
        entry.chars = entry.docs.reduce((sum, doc) => sum + (doc.text ? doc.text.length : 0), 0)
        delete entry.docs
        this.mounted.delete(id)
      }
    }
    let spent = 0
    let mounted = 0
    const queue = []
    for (const record of records) {
      const id = record.header.id
      const entry = this.surfaces.get(id)
      if (!entry) continue
      if (Array.isArray(entry.docs)) {
        this.mounted.set(id, Date.now())
        continue
      }
      spent += Number(entry.chars) || 0
      queue.push(id)
    }
    const cap = Math.max(queue.length > 0 ? 1 : 0, spent > budget ? queue.length : queue.length)
    let cursor = 0
    const workers = Array.from({ length: Math.min(4, cap) }, async () => {
      while (cursor < queue.length) {
        const id = queue[cursor]
        cursor += 1
        if (await this.mountEntry(id)) mounted += 1
        await new Promise((resolve) => setImmediate(resolve))
      }
    })
    await Promise.all(workers)
    if (mounted > 0 && options.prefetchMiss !== false) {
      // The request needed shards the preload had not prepared. Fast (a few ms
      // per shard) but it is the one number that says the preload lost the race.
      this.diag('prefetch-miss', { mounted, wanted: queue.length, state: this.prefetchState.state })
      this.noteIndexEvent('prefetch-miss', { docs: mounted, wanted: queue.length })
    }
    // Release again: the request's own mounts are what pushed the set over.
    for (const [id, at] of [...this.mounted].sort((left, right) => left[1] - right[1])) {
      if (this.mounted.size <= keep) break
      if (wanted.has(id)) continue
      const entry = this.surfaces.get(id)
      if (!entry || !Array.isArray(entry.docs)) {
        this.mounted.delete(id)
        continue
      }
      entry.docCount = entry.docs.length
      entry.chars = entry.docs.reduce((sum, doc) => sum + (doc.text ? doc.text.length : 0), 0)
      delete entry.docs
      this.mounted.delete(id)
    }
    return mounted
  }

  /** Mount the shards that hold the given document addresses. */
  async mountForDocIds(ids) {
    const sessions = new Set()
    for (const id of ids) {
      const at = String(id || '').indexOf(':')
      if (at > 0) sessions.add(String(id).slice(0, at))
    }
    if (sessions.size === 0) return 0
    const records = [...sessions].map((id) => this.recordById.get(id)).filter(Boolean)
    return this.mountFor(records, { keep: Math.max(MOUNT_KEEP, records.length) })
  }

  /**
   * Sessions a filter can reach. Metadata only: a session that holds no
   * requested kind is never mounted, which is the whole point of the routing
   * table.
   */
  routeIds({ scope, workspace, types }) {
    const wanted = new Set(Array.isArray(types) && types.length > 0 ? types : ALL_TYPES)
    return this.records.filter((record) => {
      const id = record.header.id
      if (scope && id !== scope) return false
      if (workspace && (record.header.cwd ?? '') !== workspace) return false
      const meta = this.surfaces.get(id)
      // A shell without kinds is unknown, not empty: keep it.
      if (meta && Array.isArray(meta.kinds) && meta.kinds.length > 0) {
        // Kind-level: a session that holds none of the requested kinds cannot
        // contribute a hit, so it is never read from disk.
        if (!meta.kinds.some((kind) => wanted.has(kind))) return false
      }
      return true
    })
  }

  /** Characters of indexed text: what the thread policy is decided on. */
  corpusChars() {
    let total = 0
    for (const entry of this.surfaces.values()) total += Number(entry.chars) || 0
    return total
  }

  /**
   * Fingerprint of the sessions one search will scan. It replaces corpusVersion
   * as the worker-corpus key: that counter moves whenever ANY session is
   * re-indexed (the background pass does this constantly while the panel is
   * open), and every move re-posted the whole corpus to every worker.
   */
  routeSignature(records) {
    let hash = 2166136261
    const mix = (value) => {
      const text = String(value)
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index)
        hash = Math.imul(hash, 16777619) >>> 0
      }
    }
    for (const record of records) {
      const entry = this.surfaces.get(record.header.id)
      mix(record.header.id)
      mix(entry && entry.seq != null ? entry.seq : '')
      mix(entry && entry.docCount != null ? entry.docCount : '')
    }
    return records.length + ':' + hash.toString(36)
  }
  /**
   * One array per worker: which shard FILES it owns, balanced by the characters
   * each session holds. Only identities travel — the worker decodes the files
   * itself, so the corpus is never cloned through postMessage.
   *
   * A shard that is not on disk yet (freshly indexed, persist debounced) is the
   * one exception: its documents are sent so the scan stays correct.
   */
  async workerAssignments(records, size) {
    const shards = []
    for (const record of records) {
      const id = record.header.id
      const entry = this.surfaces.get(id)
      const chars = Number(entry && entry.chars) || 0
      const canRead = typeof this.store.sessionIndexFile === 'function'
      const path = canRead ? this.store.sessionIndexFile(id) : null
      let persisted = false
      if (path) {
        const dirty = this.dirtySessions.has(id) || (this.persistInflight && this.persistInflight.has(id))
        if (!dirty) {
          try {
            await fs.access(path)
            persisted = true
          } catch {
            persisted = false
          }
        }
      }
      shards.push(persisted ? { id, path, chars } : { id, path, chars, docs: (entry && entry.docs) || [] })
    }
    shards.sort((left, right) => right.chars - left.chars)
    const buckets = Array.from({ length: size }, () => [])
    const weight = new Array(size).fill(0)
    for (const shard of shards) {
      let target = 0
      for (let index = 1; index < size; index += 1) if (weight[index] < weight[target]) target = index
      buckets[target].push(shard)
      weight[target] += shard.chars
    }
    return buckets
  }

  /**
   * Preload the shards a filter set can reach, while the reader is still typing.
   *
   * The search path must never pay for gzip: a shard is decoded here, in the
   * 300 ms window after the filters settle, and released when a later filter set
   * no longer includes it. A search that still finds an unmounted shard mounts
   * it inline and records `prefetch-miss`, which is the signal that this preload
   * failed to keep up — never a reason to make the search wait.
   */
  prefetch(selection, options = {}) {
    const generation = (this.prefetchGeneration || 0) + 1
    this.prefetchGeneration = generation
    if (this.prefetchTimer) clearTimeout(this.prefetchTimer)
    const delay = Math.max(0, Number(options.debounce != null ? options.debounce : PREFETCH_DEBOUNCE_MS))
    this.prefetchTimer = setTimeout(() => {
      this.prefetchTimer = null
      void this.runPrefetch(selection || {}, generation)
    }, delay)
  }

  async runPrefetch(selection, generation) {
    try {
      await this.ensureReady()
      if (generation !== this.prefetchGeneration) return
      const filters = {
        scope: selection.scope && selection.scope !== 'all' ? String(selection.scope) : null,
        workspace: String(selection.workspace || ''),
        types: Array.isArray(selection.types) && selection.types.length > 0 ? selection.types : ALL_TYPES,
      }
      const records = this.routeIds(filters)
      const total = records.length
      this.prefetchState = { state: 'running', done: 0, total, chars: this.mountedChars(), startedAt: Date.now() }
      // Release first, so the new selection fits in the same budget.
      this.releaseBeyond(new Set(records.map((record) => record.header.id)))
      let done = 0
      let cursor = 0
      const batch = 4
      while (cursor < records.length) {
        if (generation !== this.prefetchGeneration) {
          this.prefetchState = { ...this.prefetchState, state: 'cancelled' }
          return
        }
        const slice = records.slice(cursor, cursor + batch)
        cursor += batch
        for (const record of slice) {
          const id = record.header.id
          const entry = this.surfaces.get(id)
          if (!entry) continue
          if (!Array.isArray(entry.docs)) await this.mountEntry(id)
          done += 1
        }
        this.prefetchState = { state: 'running', done, total, chars: this.mountedChars() }
        await new Promise((resolve) => setImmediate(resolve))
      }
      this.prefetchState = { state: 'ready', done, total, chars: this.mountedChars(), at: Date.now() }
      this.diag('prefetch', { done, total, chars: this.prefetchState.chars, selection: filters })
    } catch (error) {
      this.prefetchState = { ...this.prefetchState, state: 'error' }
      this.diag('prefetch', { error: String((error && error.message) || error) })
    }
  }

  /** A closed panel must not keep decoding shards in the background. */
  cancelPrefetch() {
    this.prefetchGeneration = (this.prefetchGeneration || 0) + 1
    if (this.prefetchTimer) clearTimeout(this.prefetchTimer)
    this.prefetchTimer = null
    if (this.prefetchState.state === 'running') this.prefetchState = { ...this.prefetchState, state: 'idle' }
  }

  /** Characters currently resident (mounted shards only). */
  mountedChars() {
    let total = 0
    for (const id of this.mounted.keys()) {
      const entry = this.surfaces.get(id)
      total += Array.isArray(entry && entry.docs)
        ? entry.docs.reduce((sum, doc) => sum + (doc.text ? doc.text.length : 0), 0)
        : Number(entry && entry.chars) || 0
    }
    return total
  }

  /** Release every mounted shard that is not in `keep`. */
  releaseBeyond(keep) {
    for (const id of [...this.mounted.keys()]) {
      if (keep.has(id)) continue
      const entry = this.surfaces.get(id)
      if (entry && Array.isArray(entry.docs)) {
        entry.docCount = entry.docs.length
        entry.chars = entry.docs.reduce((sum, doc) => sum + (doc.text ? doc.text.length : 0), 0)
        delete entry.docs
        this.corpusVersion += 1
      }
      this.mounted.delete(id)
    }
  }

  /** Sequence per indexed session at this instant. */
  snapshotSeqs() {
    const out = {}
    for (const [id, entry] of this.surfaces) out[id] = entry.seq ?? null
    return out
  }

  isLiveSession(sessionId) {
    const record = this.recordById.get(sessionId)
    return record ? record.live === true : false
  }

  /**
   * A saved view is stale only when a session that produced it changed in a
   * way that can change the hits: persisted sessions, removals, or a new
   * session. A live session grows constantly; that alone must not invalidate
   * the page the reader is looking at.
   */
  isSavedStale(saved) {
    if (!saved) return false
    // Views recorded before per-session snapshots existed cannot be compared;
    // showing a permanent stale banner would be a lie.
    if (!saved.seqs || typeof saved.seqs !== 'object') return false
    const stored = saved.seqs
    const scope = saved.request && saved.request.scope ? String(saved.request.scope) : null
    const relevant = new Set(Array.isArray(saved.sessions) ? saved.sessions : [])
    if (scope && scope !== 'all') relevant.add(scope)
    for (const id of relevant) {
      if (this.isLiveSession(id)) continue
      const current = this.surfaces.get(id)?.seq ?? null
      if (current !== (stored[id] ?? null)) return true
    }
    if (!scope || scope === 'all') {
      for (const id of this.surfaces.keys()) {
        if (!(id in stored)) return true
      }
    }
    return false
  }

  /**
   * The flat corpus and its id map. Rebuilt only when the index or the titles
   * change, never per search: this is the difference between a 40 ms search and
   * a 300 ms search on a large corpus.
   */
  corpus() {
    if (this.corpusCache && this.corpusCacheVersion === this.corpusVersion && this.corpusCacheTitles === this.titleVersion) {
      return this.corpusCache
    }
    // Split by class: a files-only search never walks the text corpus, and a
    // workspace-scoped one only intersects the sessions it was given.
    const all = []
    const files = []
    const text = []
    const meta = new Map()
    for (const [sessionId, entry] of this.surfaces) {
      const record = this.recordById.get(sessionId)
      if (!record) continue
      const sessionTitle = this.titleOf(sessionId) ?? sessionId
      // A shell is not mounted: its documents are not part of this corpus.
      if (!Array.isArray(entry.docs)) continue
      for (const doc of entry.docs) {
        const id = docKey(sessionId, doc)
        const item = {
          id,
          kind: doc.kind,
          subtype: doc.subtype,
          text: doc.text,
          ext: doc.ext || null,
          sessionId,
          long: doc.long === true,
        }
        all.push(item)
        if (FILE_TYPES.has(doc.kind)) files.push(item)
        else text.push(item)
        meta.set(id, { sessionId, record, sessionTitle, doc })
      }
    }
    this.corpusCache = { all, files, text, docs: all, meta }
    this.corpusCacheVersion = this.corpusVersion
    this.corpusCacheTitles = this.titleVersion
    return this.corpusCache
  }

  /** Map every doc id to its doc and owning record. */
  docIndex() {
    return this.corpus().meta
  }

  /**
   * Keep the raw match list of a query. A filter change reuses it, which is the
   * difference between a filter tweak costing a scan or costing a few
   * hundred array lookups.
   */
  rememberMatches(key, matches) {
    if (!Array.isArray(matches) || matches.length > 40_000) return
    const previous = this.queryCache.get(key)
    if (previous) this.queryCacheSize -= previous.matches.length
    this.queryCache.delete(key)
    this.queryCache.set(key, { version: this.corpusVersion, matches })
    this.queryCacheSize = (this.queryCacheSize || 0) + matches.length
    // The cap used to be 120k MATCHES: four high-frequency queries filled it,
    // and from then on the freshly stored entry was the oldest one and got
    // evicted immediately — so the cache was off exactly for the queries that
    // needed it. Cap by entry count, keep a generous match budget, and never
    // evict the entry that was just written.
    while (this.queryCache.size > MAX_QUERY_CACHE || (this.queryCacheSize || 0) > MAX_QUERY_CACHE_MATCHES) {
      const oldest = this.queryCache.keys().next().value
      if (oldest === undefined || oldest === key) break
      this.queryCacheSize -= this.queryCache.get(oldest)?.matches.length ?? 0
      this.queryCache.delete(oldest)
    }
  }

  /**
   * Rebuild a saved page from its ID snapshot without persisting any text.
   * Returns null when the snapshot can no longer be resolved (a doc vanished),
   * so the caller can fall back to a real search.
   */
  /**
   * Rebuild a saved page from its ID snapshot without persisting any text.
   *
   * `request` carries the filters the reader is asking for now. They are applied
   * to the snapshot, never to the corpus: narrowing a filter on a query that was
   * already answered is what keeps it from paying for a full scan ("计算后置").
   * Returns null when the snapshot can no longer be resolved (a doc vanished),
   * so the caller can fall back to a real search.
   */
  resolveSaved(saved, request = {}) {
    if (!saved) return null
    if (!Array.isArray(saved.ids)) return saved.payload ?? null
    // Views saved before the address scheme changed cannot be resolved; let the
    // caller re-search instead of showing a wrong page.
    if (saved.idVersion !== 2) return null
    // Filters are applied only when the caller states them. Without them the
    // snapshot is resolved as it was recorded (its rows are already the answer).
    const savedTypes = Array.isArray(saved.request?.types) && saved.request.types.length > 0 ? saved.request.types : null
    const filterTypes = Array.isArray(request.types) && request.types.length > 0
    const types = filterTypes ? request.types : savedTypes
    const wanted = filterTypes ? new Set(types) : null
    const filterExts = Array.isArray(request.exts) && request.exts.length > 0
    const exts = filterExts ? request.exts : Array.isArray(saved.request?.exts) ? saved.request.exts : []
    const extSet = new Set(exts)
    const fileOnly = filterExts && types !== null && types.some((kind) => FILE_TYPES.has(kind))
    const workspace = String(request.workspace || '')
    const filterWorkspace = workspace !== ''
    // A workspace filter can only narrow a page that was not already scoped.
    const savedWorkspace = String(saved.request?.workspace || '')
    if (workspace && savedWorkspace && workspace !== savedWorkspace) return null
    const sort = request.sort || saved.request?.sort || 'relevance'
    const cacheKey = [saved.id, wanted ? [...wanted].sort().join(',') : '*', [...extSet].sort().join(','), workspace, sort].join('|')
    const cached = this.resolvedCache && this.resolvedCache.get(cacheKey)
    if (cached && cached.version === this.corpusVersion) return cached.payload
    const map = this.docIndex()
    const q = String(saved.request?.q || '')
    const qLower = q.toLowerCase()
    const cap = Number(saved.meta?.limit) || SEARCH_LIMIT
    const items = []
    let total = 0
    let missing = 0
    for (const id of saved.ids) {
      const entry = map.get(id)
      // A rebuilt index can move a handful of documents. Dropping them keeps the
      // cached page instant; losing most of them means the page is stale beyond
      // use, so the caller re-searches instead.
      if (!entry) {
        missing += 1
        continue
      }
      if (wanted && !wanted.has(entry.doc.kind)) continue
      if (fileOnly && (!entry.doc.ext || !extSet.has(entry.doc.ext))) continue
      if (filterWorkspace && (entry.record.header.cwd ?? '') !== workspace) continue
      const matchIndex = qLower ? entry.doc.text.toLowerCase().indexOf(qLower) : 0
      if (qLower && matchIndex === -1) continue
      total += 1
      if (items.length >= cap) continue
      items.push(
        makeResultItem({
          sessionId: entry.sessionId,
          sessionTitle: entry.sessionTitle,
          record: entry.record,
          doc: entry.doc,
          matchIndex,
          queryLength: qLower.length,
          qLower,
          score: scoreDoc(entry.doc, matchIndex, qLower.length, qLower),
        }),
      )
    }
    items.sort((a, b) => {
      if (sort === 'time') return b.time - a.time || b.score - a.score
      if (sort === 'time-asc') return a.time - b.time || b.score - a.score
      return b.score - a.score || b.time - a.time
    })
    if (missing > 0) {
      void this.store.logDiag('saved-drop', { id: saved.id, missing, total: saved.ids.length })
    }
    if (missing > saved.ids.length / 2) return null
    const meta = saved.meta || {}
    const buckets = new Map()
    for (const item of items) {
      let bucket = buckets.get(item.sessionId)
      if (!bucket) {
        bucket = {
          id: item.sessionId,
          title: item.sessionTitle,
          cwd: item.cwd,
          createdAt: item.createdAt,
          live: this.isLiveSession(item.sessionId),
          count: 0,
          best: 0,
        }
        buckets.set(item.sessionId, bucket)
      }
      bucket.count += 1
      if (item.score > bucket.best) bucket.best = item.score
    }
    const sessions = [...buckets.values()].sort((left, right) => right.best - left.best)
    const payload = {
      query: q,
      scope: saved.request?.scope ?? 'all',
      workspace,
      long: false,
      types: wanted ? [...wanted] : types || ALL_TYPES,
      exts: [...extSet],
      sort,
      // The signature of the request the reader is asking for now, so the page
      // can only be rendered under chips that describe it.
      signature:
        request.sig ||
        canonicalSignature({
          q,
          scope: saved.request?.scope,
          workspace,
          types: wanted ? [...wanted] : types || ALL_TYPES,
          exts: [...extSet],
          sort,
        }),
      cached: true,
      // What the original search cost, kept so a cached page never reports the
      // time a re-search would have taken.
      originalTookMs: Number.isFinite(Number(meta.tookMs)) ? Number(meta.tookMs) : null,
      original: {
        surfaceMs: Number(meta.surfaceMs) || 0,
        matchMs: Number(meta.matchMs) || 0,
        ensureMs: Number(meta.ensureMs) || 0,
        listMs: Number(meta.listMs) || 0,
        otherMs: Number(meta.otherMs) || 0,
        mode: meta.mode || 'materialized',
      },
      scopeMissing: false,
      pending: 0,
      longMs: 0,
      truncatedDocs: Number(meta.truncatedDocs) || 0,
      total,
      snapshotSize: saved.ids.length,
      totalExact: saved.meta?.truncated !== true,
      narrowed: items.length !== saved.ids.length || String(request.sig || '') !== String(saved.signature || ''),
      scanned: 0,
      limit: cap,
      truncated: saved.ids.length > cap,
      items,
      sessions,
      threads: 1,
      mode: 'materialized',
      surfaceMs: 0,
      matchMs: 0,
      ensureMs: 0,
      listMs: 0,
      otherMs: 0,
      degraded: false,
      indexedSessions: this.surfaces.size,
      indexedDocs: this.totalDocs,
      warnings: 0,
      tookMs: 0,
      restoredMs: 0,
      // Served from a snapshot that lost a few documents; the deck shows its
      // "may be stale" bar instead of pretending nothing changed.
      stale: missing > 0,
    }
    if (!this.resolvedCache) this.resolvedCache = new Map()
    this.resolvedCache.delete(cacheKey)
    this.resolvedCache.set(cacheKey, { version: this.corpusVersion, payload })
    this.pruneResolved()
    return payload
  }

  pruneResolved() {
    if (!this.resolvedCache) return
    while (this.resolvedCache.size > MAX_SAVED) this.resolvedCache.delete(this.resolvedCache.keys().next().value)
  }

  /** Drop one saved page and every filtered variant of it. */
  dropResolved(id) {
    if (!this.resolvedCache) return
    if (!id) {
      this.resolvedCache.clear()
      return
    }
    const prefix = String(id) + '|'
    for (const key of [...this.resolvedCache.keys()]) {
      if (key === String(id) || key.startsWith(prefix)) this.resolvedCache.delete(key)
    }
  }

  dropAllResolved() {
    if (this.resolvedCache) this.resolvedCache.clear()
  }

  dispose() {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    if (this.dirtyTimer) clearTimeout(this.dirtyTimer)
    this.persistTimer = null
    this.dirtyTimer = null
    // The follow stream outlives the plugin unless it is cancelled here.
    if (this.archiveWatch) this.archiveWatch.abort()
    this.archiveWatch = null
    if (this.prefetchTimer) clearTimeout(this.prefetchTimer)
    this.prefetchTimer = null
    try {
      if (this.store && typeof this.store.close === 'function') void this.store.close()
    } catch {
      /* a store that cannot close is not a reason to fail the reload */
    }
    this.warming = false
    this.openClients = 0
    this.longCache.clear()
    this.queryCache.clear()
    this.dropAllResolved()
    void this.pool?.dispose()
  }

  optionalSessions() {
    try {
      return this.ctx.get('sessions')
    } catch {
      return undefined
    }
  }
}

/**
 * The archive set a workspace follow frame carries, or null for frames that say
 * nothing about it (upsert / remove / order / pinned).
 */
function archivedIdsOfFrame(frame) {
  if (!frame || typeof frame !== 'object') return null
  if (frame.type === 'baseline' || frame.type === 'replace') {
    const value = frame.value && typeof frame.value === 'object' ? frame.value : {}
    return new Set(Array.isArray(value.archivedSessionIds) ? value.archivedSessionIds : [])
  }
  if (frame.type === 'archived') {
    return Array.isArray(frame.archivedSessionIds) ? new Set(frame.archivedSessionIds) : null
  }
  return null
}

/** True when a checkpoint replaced an earlier range of the log. */
function hasCompactionMarker(events) {
  for (const event of events) {
    if (!event || typeof event !== 'object') continue
    if (event.surfaceOp && event.surfaceOp.op === 'replace') return true
    const kind = event.data && event.data.source && event.data.source.kind
    if (kind === 'compact-checkpoint') return true
  }
  return false
}

/** Absolute-looking file paths mentioned in a message body. */
function pathsInText(text) {
  const out = []
  const pattern = /(?:^|[\s(（"'])((?:[A-Za-z]:\\|~?\/)[^\s"'`<>|)）]+\.[A-Za-z0-9]{1,8})/g
  let match = pattern.exec(String(text || ''))
  let guard = 0
  while (match && guard < 20) {
    out.push(match[1])
    guard += 1
    match = pattern.exec(text)
  }
  return out
}

function buildSurfaceDocs(snapshot, record) {
  // Set only when the caller indexed the raw log: any event missing from it was
  // folded away by a compaction and is reported as such.
  const surfaceSeqs = snapshot.surfaceSeqs instanceof Set ? snapshot.surfaceSeqs : null
  const docs = []
  // Everything past the head of a long block. Stored in its own shard and only
  // searched by an explicit long-document search.
  const longDocs = []
  const seenFiles = new Set()
  // Several files can come from one block (arguments, Presented text, an
  // image group); fileIndex keeps their anchors distinct.
  const fileCounters = new Map()
  const toolNames = new Map()
  let fallbackTitle = ''
  const headerCwd = record.header.cwd ?? null
  // A user/message carries no turn of its own; walk backwards so it belongs to
  // the Turn its following request opens. Every other surface event states it.
  const eventTurn = new Map()
  let pendingTurn = null
  for (let index = snapshot.events.length - 1; index >= 0; index -= 1) {
    const event = snapshot.events[index]
    const rawTurn = event?.data?.turn
    // Number(null) is 0: a missing turn must not become Turn 0.
    const explicit = rawTurn === null || rawTurn === undefined ? null : Number(rawTurn)
    if (explicit !== null && Number.isFinite(explicit)) pendingTurn = explicit
    eventTurn.set(Number(event.seq), explicit !== null && Number.isFinite(explicit) ? explicit : pendingTurn)
  }

  const pushDoc = (kind, subtype, text, event, extra = {}) => {
    if (typeof text !== 'string') return
    const clean = text.replace(/\u0000/g, '')
    if (!clean.trim()) return
    const capped = clean.length > CHUNK_SIZE * MAX_CHUNKS ? clean.slice(0, CHUNK_SIZE * MAX_CHUNKS) : clean
    if (capped.length < clean.length) docs.truncated = true
    // Injected context (compaction checkpoints especially) can be tens of KB of
    // harness scaffolding. Its tail is noise, and keeping it in the long index
    // made a long search read megabytes for nothing.
    const isLong = clean.length > LONG_MIN_CHARS && kind !== 'context'
    let offset = 0
    let chunk = 0
    do {
      const piece = capped.slice(offset, offset + CHUNK_SIZE)
      if (!piece.trim()) break
      const doc = {
        kind,
        subtype,
        text: piece,
        seq: Number(event.seq),
        time: Number(event.time) || Date.now(),
        turn: eventTurn.get(Number(event.seq)) ?? null,
        step: Number.isFinite(Number(event?.data?.step)) ? Number(event.data.step) : null,
        messageId: extra.messageId ?? null,
        toolName: extra.toolName ?? null,
        toolCallId: extra.toolCallId ?? null,
        blockIndex: Number.isInteger(extra.blockIndex) ? extra.blockIndex : null,
        seatIndex: Number.isInteger(extra.seatIndex) ? extra.seatIndex : null,
        blockKind: extra.blockKind ?? null,
        chunk,
      }
      if (surfaceSeqs && !surfaceSeqs.has(Number(event.seq))) {
        doc.shadowed = true
      }
      if (isLong) {
        doc.long = true
        docs.truncated = true
      }
      if (!isLong || chunk < HEAD_CHUNKS) docs.push(doc)
      else longDocs.push(doc)
      chunk += 1
      offset += CHUNK_SIZE - CHUNK_OVERLAP
    } while (offset < capped.length && chunk < MAX_CHUNKS)
  }

  const pushFile = (kind, file, event, extra = {}) => {
    const name = String(file?.name ?? '').trim()
    const path = String(file?.path ?? '').trim()
    if (!name && !path) return
    const displayName = name || basename(path)
    const ext = extensionOf(displayName) || extensionOf(path)
    if (!displayName && !ext) return
    // Dedupe inside one Turn only: the args of a tool call and its "Presented"
    // line name the same file once, but the same file shown in two Turns is two
    // distinct hits and the old key kept just the first one.
    const turnKey = eventTurn.get(Number(event.seq)) ?? Number(event.seq)
    const key = `${turnKey}\u0000${kind}\u0000${displayName}\u0000${path}`
    if (seenFiles.has(key)) return
    seenFiles.add(key)
    // The name comes first and on its own line: it is what the reader types,
    // and it keeps the snippet readable.
    const text = [displayName, path].filter(Boolean).join('\n')
    const slot = `${Number(event.seq)}:${extra.blockIndex ?? 'x'}:${kind}`
    const fileIndex = fileCounters.get(slot) ?? 0
    fileCounters.set(slot, fileIndex + 1)
    docs.push({
      kind,
      subtype: 'file',
      text,
      seq: Number(event.seq),
      time: Number(event.time) || Date.now(),
      turn: eventTurn.get(Number(event.seq)) ?? null,
      step: Number.isFinite(Number(event?.data?.step)) ? Number(event.data.step) : null,
      messageId: extra.messageId ?? null,
      toolName: null,
      toolCallId: extra.toolCallId ?? null,
      blockIndex: Number.isInteger(extra.blockIndex) ? extra.blockIndex : null,
      seatIndex: Number.isInteger(extra.seatIndex) ? extra.seatIndex : null,
      blockKind: extra.blockKind ?? null,
      fileIndex,
      chunk: 0,
      ext: ext || null,
      name: displayName || `file.${ext}`,
      files: [{ name: displayName || `file.${ext}`, path: path || null }],
    })
  }

  for (const event of snapshot.events) {
    // `user/message` stores the message directly under `data`; every other
    // surface event nests it under `data.message`.
    const message = event?.data?.message ?? (event?.data?.role ? event.data : undefined)
    if (!message || !Array.isArray(message.content)) continue
    const role = message.role
    const sourceKind =
      message.source && typeof message.source === 'object' ? String(message.source.kind || '') : ''
    // A user/message with a non-user source is context the harness injected.
    const injected = sourceKind !== '' && !USER_SOURCES.has(sourceKind)
    // A rendered seat is not one message: the answer rail splits reasoning
    // from text, and every tool block becomes its own card. seatIndex is the
    // ordinal inside that rendered seat, so the client can pick the third
    // answer paragraph rather than guessing from text alone.
    const seatTotals = new Map()
    const nextSeatIndex = (seat) => {
      const value = seatTotals.get(seat) ?? 0
      seatTotals.set(seat, value + 1)
      return value
    }
    for (let blockIndex = 0; blockIndex < message.content.length; blockIndex += 1) {
      const block = message.content[blockIndex]
      if (!block || typeof block !== 'object') continue
      if (block.type === 'text') {
        const text = typeof block.text === 'string' ? block.text : ''
        if (!text) continue
        if (role === 'user') {
          if (injected) {
            // The DOM block is still a text block in a user-style row; only the
            // search classification differs, so the anchor stays the same.
            pushDoc('context', 'text', text, event, {
              messageId: message.id,
              blockIndex,
              seatIndex: nextSeatIndex('context'),
              blockKind: 'text',
            })
            continue
          }
          if (!fallbackTitle) fallbackTitle = makeFallbackTitle(text)
          pushDoc('userText', 'text', text, event, {
            messageId: message.id,
            blockIndex,
            seatIndex: nextSeatIndex('user'),
            blockKind: 'text',
          })
          // A file the reader attached shows up as "@C:\path\name.ext" in the
          // message text. Index it as a file too, otherwise searching it under
          // "input files" only ever matched the sentence that names it.
          // Only real @-mentions: prose that names a file must not add a document,
          // or the block anchors of that turn shift.
          for (const path of pathsInText(text).filter((item) => text.includes('@' + item))) {
            pushFile('inputFiles', { name: basename(path), path }, event, {
              messageId: message.id,
              blockIndex,
              seatIndex: nextSeatIndex('input-file'),
              blockKind: 'file',
            })
          }
        } else if (role === 'assistant') {
          pushDoc('modelText', 'text', text, event, {
            messageId: message.id,
            blockIndex,
            seatIndex: nextSeatIndex('response'),
            blockKind: 'text',
          })
        } else if (role === 'tool') {
          const toolName = message.toolCallId ? toolNames.get(message.toolCallId) : undefined
          const seatIndex = nextSeatIndex('result')
          pushDoc('tools', 'result', text, event, {
            toolName,
            toolCallId: message.toolCallId ?? null,
            messageId: message.id,
            blockIndex,
            seatIndex,
            blockKind: 'tool-result',
          })
          collectPresentedFiles(text, event, pushFile, {
            messageId: message.id,
            toolCallId: message.toolCallId ?? null,
            blockIndex,
            seatIndex,
            blockKind: 'tool-result',
          })
        }
      } else if (block.type === 'reasoning') {
        if (role !== 'assistant') continue
        pushDoc('reasoning', 'reasoning', typeof block.text === 'string' ? block.text : '', event, {
          messageId: message.id,
          blockIndex,
          seatIndex: nextSeatIndex('reasoning'),
          blockKind: 'reasoning',
        })
      } else if (block.type === 'tool-call') {
        const name = typeof block.name === 'string' && block.name ? block.name : 'tool'
        const args = typeof block.arguments === 'string' ? block.arguments : ''
        if (block.id) toolNames.set(block.id, name)
        pushDoc('tools', 'call', `${name}\n${args}`, event, {
          toolName: name,
          toolCallId: block.id ?? null,
          messageId: message.id,
          blockIndex,
          seatIndex: nextSeatIndex('tool'),
          blockKind: 'tool-call',
        })
        if (producesFiles(name)) {
          const seatIndex = nextSeatIndex('tool-file')
          for (const path of extractFilePaths(args)) {
            pushFile('outputFiles', { name: basename(path), path }, event, {
              messageId: message.id,
              toolCallId: block.id ?? null,
              blockIndex,
              seatIndex,
              blockKind: 'tool-call',
            })
          }
        }
      } else if (block.type === 'file') {
        const attachment = block.attachment ?? {}
        pushFile(role === 'user' ? 'inputFiles' : 'outputFiles', {
          name: attachment.name,
          path: attachment.path,
        }, event, {
          messageId: message.id,
          blockIndex,
          seatIndex: nextSeatIndex(role === 'user' ? 'input-file' : 'output-file'),
          blockKind: 'file',
        })
      } else if (block.type === 'image-not-indexed') {
        // Images are deliberately not indexed: no text to search, no node to jump
        // to, and a bare filename rarely identifies which picture was meant.
        const attachment = block.attachment ?? {}
        const mediaType = typeof attachment.mediaType === 'string' ? attachment.mediaType : ''
        const ext = mediaType.split('/')[1] || 'png'
        const name = attachment.name || `image.${ext.replace('jpeg', 'jpg')}`
        pushFile(role === 'user' ? 'inputFiles' : 'outputFiles', { name, path: null }, event, {
          messageId: message.id,
          blockIndex,
          seatIndex: nextSeatIndex(role === 'user' ? 'input-image' : 'output-image'),
          blockKind: 'image',
        })
      }
    }
  }

  return {
    docs,
    longDocs,
    fallbackTitle,
    truncated: docs.truncated === true,
    seq: snapshot.capturedThroughSeq == null ? undefined : Number(snapshot.capturedThroughSeq),
    cwd: headerCwd,
  }
}

function collectPresentedFiles(text, event, pushFile, extra = {}) {
  // Two shapes name a produced file: the "Presented <path>" line and a markdown
  // link in the answer. Both are user-visible file names, so both are indexed.
  const presented = /(?:^|\n)\s*Presented\s+([^\n]+)/g
  let match
  while ((match = presented.exec(text)) !== null) {
    const path = match[1].trim()
    if (!path || !looksLikeFilePath(path)) continue
    pushFile('outputFiles', { name: basename(path), path }, event, extra)
  }
  if (text.length > 400_000) return
  const linked = /\[[^\]\n]{1,120}\]\(([^)\n]{1,400})\)/g
  while ((match = linked.exec(text)) !== null) {
    const path = match[1].trim()
    if (!path || !looksLikeFilePath(path)) continue
    pushFile('outputFiles', { name: basename(path), path }, event, extra)
  }
}

function producesFiles(name) {
  // Broad on purpose: a tool that writes a screenshot is as much a file
  // producer as one called write_file, and a missed path is unsearchable.
  return /present|write|edit|save|export|create|render|convert|download|generate|copy|move|rename|screenshot|screen|capture|snap|shot|send|upload|attach|image|img|draw|plot|chart|paint|photo|video|audio|record|merge|split|compress|zip|pack|build|dump|print|report/i.test(
    name,
  )
}

function extractFilePaths(rawArgs) {
  if (!rawArgs || rawArgs.length > 200_000) return []
  let parsed
  try {
    parsed = JSON.parse(rawArgs)
  } catch {
    return []
  }
  const found = new Set()
  const allowedKey = /^(path|paths|file|files|file_path|filepath|filename|name|target|output|outputs|destination|dest)$/i
  const walk = (value, key, depth) => {
    if (depth > 5 || found.size >= 40) return
    if (typeof value === 'string') {
      const candidate = value.trim()
      if (!candidate || candidate.length > 500) return
      if (!allowedKey.test(key ?? '') && !/[/\\]/.test(candidate)) return
      if (!looksLikeFilePath(candidate)) return
      found.add(candidate)
      return
    }
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry, key, depth + 1)
      return
    }
    if (value && typeof value === 'object') {
      for (const [childKey, child] of Object.entries(value)) walk(child, childKey, depth + 1)
    }
  }
  walk(parsed, '', 0)
  return [...found]
}

function looksLikeFilePath(value) {
  if (/^https?:\/\//i.test(value)) return false
  return /(?:^|[/\\])[^/\\:*?"<>|\n\r\t]{1,240}\.[A-Za-z0-9][A-Za-z0-9+_-]{0,11}$/.test(value)
}

function extensionOf(value) {
  if (typeof value !== 'string') return ''
  const clean = value.split(/[?#]/, 1)[0].trim()
  const match = /\.([A-Za-z0-9][A-Za-z0-9+_-]{0,11})$/.exec(clean)
  return match ? match[1].toLowerCase() : ''
}

function basename(value) {
  const clean = String(value ?? '').replace(/[\\/]+$/, '')
  const parts = clean.split(/[\\/]/)
  return parts[parts.length - 1] || clean
}

function makeFallbackTitle(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48)
}

/**
 * Project one indexed doc into the result the Client receives.
 *
 * The anchor is the reversible address of the rendered block: the Chat node
 * key comes from (turn, step), the block from (messageId, blockIndex,
 * seatIndex), and the chunk picks one slice of a long block. Without it a
 * click could only guess from text.
 */
function makeResultItem({ sessionId, sessionTitle, record, doc, matchIndex, queryLength, qLower, score }) {
  return {
    id: docKey(sessionId, doc),
    sessionId,
    sessionTitle,
    cwd: record.header.cwd ?? null,
    createdAt: record.header.createdAt,
    time: doc.time,
    seq: doc.seq,
    kind: doc.kind,
    subtype: doc.subtype,
    turn: doc.turn ?? null,
    step: doc.step ?? null,
    messageId: doc.messageId ?? null,
    toolName: doc.toolName ?? null,
    toolCallId: doc.toolCallId ?? null,
    blockIndex: doc.blockIndex ?? null,
    seatIndex: doc.seatIndex ?? null,
    blockKind: doc.blockKind ?? null,
    fileIndex: doc.fileIndex ?? null,
    anchor: {
      turn: doc.turn ?? null,
      step: doc.step ?? null,
      messageId: doc.messageId ?? null,
      toolCallId: doc.toolCallId ?? null,
      blockIndex: doc.blockIndex ?? null,
      seatIndex: doc.seatIndex ?? null,
      blockKind: doc.blockKind ?? null,
      fileIndex: doc.fileIndex ?? null,
      chunk: doc.chunk ?? 0,
      file: doc.files && doc.files[0] ? doc.files[0].name : null,
    },
    snippet: makeSnippet(doc, matchIndex, queryLength),
    score,
    name: doc.name ?? (doc.files && doc.files[0] ? doc.files[0].name : null),
    long: doc.long === true,
    // An image has no text node to land on, so the client must not claim a jump.
    locate: doc.blockKind === 'image' ? false : true,
    // The turn was folded away by a compaction: still searchable, but the chat
    // no longer renders it, so the client can say so instead of failing to jump.
    shadowed: doc.shadowed === true,
    files: doc.files ?? null,
  }
}



async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await mapper(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

// History is keyed by the whole filter set, not just the words: two searches
// for the same text with different filters are two entries, each of which keeps
// its own filters and its own materialized page.
function queryId(request) {
  const value = typeof request === 'string' ? { q: request } : request || {}
  const key = [
    String(value.q || '').trim(),
    String(value.scope ?? 'all'),
    String(value.workspace ?? ''),
    [...(Array.isArray(value.types) ? value.types : [])].sort().join(','),
    [...(Array.isArray(value.exts) ? value.exts : [])].sort().join(','),
    String(value.sort ?? 'relevance'),
    value.long === true ? '1' : '0',
  ].join('\u0000')
  return createHash('sha1').update(key).digest('hex').slice(0, 16)
}

function requestOf(item) {
  return {
    q: String(item?.query || '').trim(),
    scope: item?.scope ?? 'all',
    workspace: item?.workspace ?? '',
    types: Array.isArray(item?.types) ? item.types : [],
    exts: Array.isArray(item?.exts) ? item.exts : [],
    sort: item?.sort ?? 'relevance',
    long: item?.long === true,
  }
}

class StateStore {
  constructor() {
    const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
    this.dir = path.join(home, 'flash-anchor')
    this.legacyDir = path.join(home, 'deepsearch')
    this.stateFile = path.join(this.dir, 'state.json')
    // The manifest names every indexed session; each session's docs live in
    // their own file so a live update rewrites one session, not 16 MB.
    this.indexFile = path.join(this.dir, 'index.json.gz')
    this.indexDir = path.join(this.dir, 'index')
    // Long documents live in their own directory: they can be deleted and
    // rebuilt without touching the ordinary index.
    this.longDir = path.join(this.dir, 'long')
    // Structured, line-per-event diagnostics. The path is shown in the panel so
    // a bug report can name the file it came from.
    this.diagFile = path.join(this.dir, 'diagnostics.log')
    this.diagChained = Promise.resolve()
    this.state = defaultState()
    this.loadPromise = null
    this.stateTimer = null
    this.indexTimer = null
    this.writeChain = Promise.resolve()
  }

  async load() {
    if (this.loadPromise) return this.loadPromise
    this.loadPromise = (async () => {
      await this.migrateLegacyDir()
      try {
        const parsed = JSON.parse(await fs.readFile(this.stateFile, 'utf8'))
        const legacySaved =
          parsed && typeof parsed.savedSearches === 'object' && parsed.savedSearches ? parsed.savedSearches : {}
        const seen = new Set()
        const history = []
        const savedSearches = {}
        const entries = (Array.isArray(parsed?.history) ? parsed.history : [])
          .slice()
          .sort((left, right) => (Number(right.at) || 0) - (Number(left.at) || 0))
        // Older builds keyed the id by query+scope, so the same query could sit
        // in the file twice with different ids. Re-key by query on load.
        for (const item of entries) {
          const request = requestOf(item)
          if (!request.q) continue
          const id = queryId(request)
          if (seen.has(id)) continue
          seen.add(id)
          history.push({ ...item, ...request, id })
          const saved = legacySaved[item.id] ?? legacySaved[id]
          if (saved) savedSearches[id] = saved
          if (history.length >= MAX_HISTORY) break
        }
        // Pages behind older filter sets of a kept keyword are not reachable
        // from a history row (the row carries the newest filters), but they are
        // exactly what 计算后置 re-filters instead of rescanning. Load them too,
        // and let the same MAX_SAVED cap that bounds the writes bound the file.
        for (const [key, saved] of Object.entries(legacySaved)) {
          if (savedSearches[key] || !saved || typeof saved !== 'object') continue
          savedSearches[key] = saved
        }
        const loaded = Object.entries(savedSearches)
        if (loaded.length > MAX_SAVED) {
          loaded.sort(
            (left, right) =>
              (Number(right[1].lastUsed || right[1].at) || 0) - (Number(left[1].lastUsed || left[1].at) || 0),
          )
          for (const [key] of loaded.slice(MAX_SAVED)) delete savedSearches[key]
        }
        this.state = {
          ...defaultState(),
          ...parsed,
          prefs: parsed && typeof parsed.prefs === 'object' && parsed.prefs ? parsed.prefs : {},
          history,
          savedSearches,
          autoIndex: parsed?.autoIndex !== false,
          revision: Number.isFinite(Number(parsed?.revision)) ? Number(parsed.revision) : 0,
        }
      } catch {
        this.state = defaultState()
      }
    })()
    await this.loadPromise
  }

  /** Move the 1.x deepsearch data directory into the flash-anchor namespace once. */
  async migrateLegacyDir() {
    try {
      await fs.access(this.stateFile)
      return
    } catch {
      /* first run under the new name */
    }
    try {
      await fs.cp(this.legacyDir, this.dir, { recursive: true, force: false, errorOnExist: false })
    } catch {
      /* nothing to migrate, or the legacy directory is absent */
    }
  }

  publicState() {
    const seen = new Set()
    const history = []
    for (const item of this.state.history) {
      const id = String(item?.id || '')
      if (!id || seen.has(id)) continue
      seen.add(id)
      history.push(item)
    }
    return {
      prefs: this.state.prefs,
      history,
      autoIndex: this.state.autoIndex,
      autoLong: this.state.autoLong !== false,
      logCollection: this.state.logCollection !== false,
      revision: this.state.revision,
    }
  }

  setPrefs(prefs) {
    if (!prefs || typeof prefs !== 'object') return
    this.state.prefs = prefs
    this.saveStateSoon()
  }

  setAutoIndex(value) {
    this.state.autoIndex = value !== false
    this.saveStateSoon()
  }

  setAutoLong(value) {
    this.state.autoLong = value !== false
    this.saveStateSoon()
  }

  setLogCollection(value) {
    this.state.logCollection = value !== false
    this.saveStateSoon()
  }

  logEnabled() {
    return this.state.logCollection !== false
  }

  /**
   * Append one structured line. Never throws and never awaits the caller: a
   * diagnostic must not be able to slow a search down or break a request.
   */
  logDiag(type, payload) {
    if (!this.logEnabled()) return
    let line
    try {
      line = JSON.stringify({ ts: new Date().toISOString(), type, ...(payload || {}) }).slice(0, 8_000)
    } catch {
      return
    }
    this.diagChained = this.diagChained
      .catch(() => {})
      .then(async () => {
        try {
          await fs.mkdir(this.dir, { recursive: true })
          try {
            const stat = await fs.stat(this.diagFile)
            if (stat.size > 8_000_000) await fs.rename(this.diagFile, this.diagFile + '.1')
          } catch {
            /* first write */
          }
          await fs.appendFile(this.diagFile, line + '\n')
        } catch {
          /* diagnostics must never break the route */
        }
      })
  }

  async logInfo() {
    // Flush pending appends first: the panel reads the size right after a jump,
    // and a delete/rmdir racing an open handle fails on Windows.
    await this.diagChained.catch(() => {})
    let bytes = 0
    let updated = null
    try {
      const stat = await fs.stat(this.diagFile)
      bytes = stat.size
      updated = stat.mtime.toISOString()
    } catch {
      /* no log yet */
    }
    return { enabled: this.logEnabled(), path: this.diagFile, bytes, updated }
  }

  async clearDiag() {
    await this.diagChained.catch(() => {})
    try {
      await fs.rm(this.diagFile, { force: true })
    } catch {
      /* already gone */
    }
    return this.logInfo()
  }

  bumpRevision() {
    this.state.revision = (Number(this.state.revision) || 0) + 1
    this.saveStateSoon()
  }

  /** Drop history rows and cached pages that belong to archived sessions. */
  dropArchivedData(ids) {
    if (!ids || ids.size === 0) return 0
    let dropped = 0
    this.state.history = (this.state.history || []).filter((item) => {
      if (!ids.has(String(item.scope || 'all'))) return true
      dropped += 1
      return false
    })
    for (const [key, saved] of Object.entries(this.state.savedSearches || {})) {
      const scope = String(saved?.request?.scope || 'all')
      const sessions = Array.isArray(saved?.sessions) ? saved.sessions : []
      if (!ids.has(scope) && !sessions.some((id) => ids.has(id))) continue
      delete this.state.savedSearches[key]
      if (!this.droppedIds) this.droppedIds = []
      this.droppedIds.push(key)
      dropped += 1
    }
    if (dropped > 0) this.saveStateSoon()
    return dropped
  }

  recordSearch(request, payload, seqs) {
    const query = String(request.q || '').trim()
    const types = Array.isArray(request.types) ? request.types : []
    const exts = Array.isArray(request.exts) ? request.exts : []
    // "Everything, unfiltered" is not a search worth a history row.
    if (!query && !request.workspace && exts.length === 0 && types.length === ALL_TYPES.length && request.long !== true) {
      return null
    }
    const id = queryId(request)
    const keyword = query.toLowerCase()
    if (keyword) {
      for (const existing of [...(this.state.history || [])]) {
        if (existing.id === id) continue
        if (String(existing.query || '').trim().toLowerCase() !== keyword) continue
        // Only the history row is merged; the snapshot stays for 计算后置 (a wider
        // page answering a narrower filter) and is left to the saved-view LRU.
        this.state.history = this.state.history.filter((item) => item.id !== existing.id)
      }
    }
    const entry = {
      id,
      snapshotId: id,
      query,
      scope: request.scope ?? 'all',
      workspace: request.workspace ?? '',
      types,
      exts,
      sort: request.sort,
      long: request.long === true,
      at: Date.now(),
      count: payload.total,
    }
    this.state.history = [entry, ...this.state.history.filter((item) => item.id !== id)].slice(0, MAX_HISTORY)
    // A page that is still missing sessions (or a long-text page) is not the
    // answer to this query. The row is still written — the reader must see the
    // search they just made — but no snapshot is kept, so reopening it runs a
    // real search instead of replaying a half page.
    const complete = (Number(payload.pending) || 0) === 0 && payload.long !== true
    if (!complete) {
      // An older complete snapshot for the same query must not survive this
      // search: reopening the row would replay the stale page instead.
      if (this.state.savedSearches[id]) {
        delete this.state.savedSearches[id]
        if (!this.droppedIds) this.droppedIds = []
        this.droppedIds.push(id)
      }
      this.saveStateSoon()
      return entry
    }
    const before = new Set(Object.keys(this.state.savedSearches))
    // Materialized view: only the result IDs, the per-session sequence
    // snapshot, and the page metadata. No document text is persisted.
    this.state.savedSearches[id] = {
      revision: this.state.revision,
      at: entry.at,
      lastUsed: entry.at,
      historyId: id,
      idVersion: 2,
      request,
      // The Client's own signature for the request that produced this page.
      signature: payload.signature || canonicalSignature(request),
      seqs,
      sessions: Array.isArray(payload.sessions) ? payload.sessions.map((session) => session.id) : [],
      ids: Array.isArray(payload.items) ? payload.items.map((item) => item.id) : [],
      meta: {
        // The cost of the search that produced this page, so reopening a
        // history entry can show it instead of a materialization time.
        tookMs: Number(payload.tookMs) || 0,
        surfaceMs: Number(payload.surfaceMs) || 0,
        matchMs: Number(payload.matchMs) || 0,
        ensureMs: Number(payload.ensureMs) || 0,
        listMs: Number(payload.listMs) || 0,
        otherMs: Number(payload.otherMs) || 0,
        mode: payload.mode || null,
        truncatedDocs: Number(payload.truncatedDocs) || 0,
        query: payload.query,
        scope: payload.scope,
        types: payload.types,
        exts: payload.exts,
        sort: payload.sort,
        total: payload.total,
        scanned: payload.scanned,
        limit: payload.limit,
        truncated: payload.truncated,
        sessions: payload.sessions,
        indexedSessions: payload.indexedSessions,
        indexedDocs: payload.indexedDocs,
      },
    }
    this.pruneSaved()
    // Older filter sets of the same keyword are NOT dropped here. The history row
    // carries only the newest filters, but the wider page behind an older set is
    // exactly what 计算后置 re-filters instead of rescanning — pruning it made a
    // filter tweak pay for the whole corpus again. `pruneSaved` (an LRU of
    // MAX_SAVED) is what bounds them.
    this.droppedIds = [...before].filter((key) => !(key in this.state.savedSearches))
    this.saveStateSoon()
    return entry
  }

  savedSearch(id) {
    if (typeof id !== 'string') return null
    const saved = this.state.savedSearches[id] ?? null
    if (saved) {
      // The map key is the query id; the resolver needs it on the object.
      saved.id = id
      saved.lastUsed = Date.now()
    }
    return saved
  }

  /** Keep the newest MAX_SAVED views by last use. */
  pruneSaved() {
    const entries = Object.entries(this.state.savedSearches)
    if (entries.length <= MAX_SAVED) return
    entries.sort((left, right) => (Number(right[1].lastUsed || right[1].at) || 0) - (Number(left[1].lastUsed || left[1].at) || 0))
    for (const [key] of entries.slice(MAX_SAVED)) delete this.state.savedSearches[key]
  }

  matchSaved(request) {
    const id = queryId(request)
    const saved = this.state.savedSearches[id]
    if (!saved || !saved.request) return null
    const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
    if (!same(saved.request.types, request.types)) return null
    if (!same(saved.request.exts, request.exts)) return null
    if (saved.request.sort !== request.sort) return null
    // A saved page belongs to one scope. Returning the all-sessions page for a
    // one-session search is how the session filter used to disappear.
    if (String(saved.request.scope ?? 'all') !== String(request.scope ?? 'all')) return null
    if (String(saved.request.workspace ?? '') !== String(request.workspace ?? '')) return null
    if ((saved.request.long === true) !== (request.long === true)) return null
    if (request.sig && saved.signature && request.sig !== saved.signature) return null
    return { id, ...saved }
  }

  /**
   * The newest saved page for the same words under a filter set that contains
   * the one asked for now. Narrowing its rows is a filter change, not a scan.
   */
  findRelatedSaved(request) {
    const query = String(request.q || '').trim()
    if (!query) return null
    const wantedTypes = Array.isArray(request.types) ? request.types : []
    const wantedExts = Array.isArray(request.exts) ? request.exts : []
    let best = null
    for (const [id, saved] of Object.entries(this.state.savedSearches)) {
      if (!saved || !saved.request || !Array.isArray(saved.ids)) continue
      if (String(saved.request.q || '').trim() !== query) continue
      if (String(saved.request.scope ?? 'all') !== String(request.scope ?? 'all')) continue
      const savedWorkspace = String(saved.request.workspace ?? '')
      if (savedWorkspace && savedWorkspace !== String(request.workspace ?? '')) continue
      if (saved.request.long !== true && request.long === true) continue
      const savedTypes = Array.isArray(saved.request.types) ? saved.request.types : []
      if (savedTypes.length === 0) continue
      if (!wantedTypes.every((kind) => savedTypes.includes(kind))) continue
      const savedExts = Array.isArray(saved.request.exts) ? saved.request.exts : []
      if (wantedExts.length > 0 && !wantedExts.every((ext) => savedExts.includes(ext))) continue
      if (wantedExts.length === 0 && savedExts.length > 0) continue
      if (!best || Number(saved.at) > Number(best.at)) best = { id, ...saved }
    }
    return best
  }

  deleteSaved(id) {
    // One row is one filter set: deleting it must never take a sibling row of
    // the same words with other filters with it.
    const target = this.state.history.find((item) => item.id === id)
    const snapshotIds = new Set([id])
    if (target && target.snapshotId) snapshotIds.add(target.snapshotId)
    this.state.history = this.state.history.filter((item) => item.id !== id)
    for (const snapshotId of snapshotIds) delete this.state.savedSearches[snapshotId]
    this.droppedIds = [...snapshotIds]
    this.saveStateSoon()
  }

  clearSavedSearches() {
    this.droppedIds = Object.keys(this.state.savedSearches)
    this.state.savedSearches = {}
    this.saveStateSoon()
  }

  /** Drop every history row *and* the pages materialized for it. */
  clearHistory() {
    const dropped = new Set(Object.keys(this.state.savedSearches))
    for (const item of this.state.history) {
      if (item && item.id) dropped.add(item.id)
      if (item && item.snapshotId) dropped.add(item.snapshotId)
    }
    this.state.history = []
    this.state.savedSearches = {}
    this.droppedIds = [...dropped]
    this.saveStateSoon()
    return [...dropped]
  }

  snapshotCount() {
    return Object.keys(this.state.savedSearches).length
  }

  saveStateSoon() {
    if (this.stateTimer) clearTimeout(this.stateTimer)
    this.stateTimer = setTimeout(() => {
      this.stateTimer = null
      void this.saveStateNow()
    }, 220)
  }

  /**
   * Stop the debounced writers and hand back whatever is still being written.
   * Without this a reload (or a test that removes the data directory) could race
   * a pending state write and fail on Windows with EPERM.
   */
  close() {
    if (this.stateTimer) clearTimeout(this.stateTimer)
    if (this.indexTimer) clearTimeout(this.indexTimer)
    this.stateTimer = null
    this.indexTimer = null
    return this.writeChain.catch(() => {})
  }

  async saveStateNow() {
    if (this.stateTimer) {
      clearTimeout(this.stateTimer)
      this.stateTimer = null
    }
    const snapshot = JSON.stringify(this.state)
    // One writer at a time: a settings save and a search record can never
    // interleave their JSON writes.
    this.writeChain = this.writeChain.catch(() => {}).then(() => writeAtomic(this.stateFile, snapshot))
    await this.writeChain
  }

  /** The file name stem one session owns (shards are named, not nested). */
  shardStem(sessionId) {
    return encodeURIComponent(String(sessionId)).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180)
  }

  sessionIndexFile(sessionId) {
    return path.join(this.indexDir, this.shardStem(sessionId) + '.json.gz')
  }

  sessionLongFile(sessionId) {
    return path.join(this.longDir, this.shardStem(sessionId) + '.json.gz')
  }

  async loadLongShard(sessionId) {
    try {
      // Async like loadIndex: a multi-megabyte long shard must not block the
      // Host event loop while a search is in flight.
      const parsed = JSON.parse(await gunzip(await fs.readFile(this.sessionLongFile(sessionId))))
      return Array.isArray(parsed?.docs) ? parsed.docs : null
    } catch {
      return null
    }
  }

  async clearLongIndex() {
    try {
      await fs.rm(this.longDir, { recursive: true, force: true })
    } catch {
      /* already gone */
    }
  }

  /**
   * Read the manifest only. Its per-session entries are the routing table: who
   * exists, which kinds they hold, and how many characters they cost. Reading
   * every shard at bootstrap is what put the whole corpus in memory before a
   * single search ran; a shard is now read when a filter actually reaches it.
   */
  async loadIndex() {
    let manifest
    try {
      manifest = JSON.parse((await gunzip(await fs.readFile(this.indexFile))).toString('utf8'))
    } catch {
      return null
    }
    // A unified 1.x/1.5.x index is still readable; it is rewritten as
    // per-session files by the next persist.
    if (manifest?.version === 2 && manifest.sessions) return { ...manifest, legacy: true }
    if (manifest?.version !== INDEX_VERSION || !manifest.sessions) return null
    const sessions = {}
    for (const [id, entry] of Object.entries(manifest.sessions)) {
      // A shell: metadata plus (later) the documents. `docs` absent means
      // "not mounted".
      sessions[id] = { ...entry }
    }
    return { version: INDEX_VERSION, savedAt: manifest.savedAt, sessions }
  }

  /** Read one session's shard and attach its documents (idempotent). */
  async loadShard(sessionId) {
    try {
      const parsed = JSON.parse((await gunzip(await fs.readFile(this.sessionIndexFile(sessionId)))).toString('utf8'))
      return Array.isArray(parsed?.docs) ? parsed : null
    } catch {
      return null
    }
  }

  /**
   * Persist only the sessions that changed. The old writer serialized the whole
   * corpus (≈16 MB) every few seconds, which is what made the GUI hitch while a
   * session was streaming.
   */
  async saveIndex(surfaces, dirtyIds, removedIds) {
    // An explicit empty set means "only removals changed": write the manifest,
    // never every shard.
    const ids = dirtyIds ? [...dirtyIds] : [...surfaces.keys()]
    const removed = removedIds ? [...removedIds] : []
    const manifest = { version: INDEX_VERSION, savedAt: Date.now(), sessions: {} }
    for (const [id, entry] of surfaces) {
      manifest.sessions[id] = {
        seq: entry.seq ?? null,
        builtAt: entry.builtAt ?? null,
        truncated: entry.truncated === true,
        docCount: Number(entry.docCount) || entry.docs?.length || 0,
        longCount: Number(entry.longCount) || 0,
        chars: Number(entry.chars) || 0,
        kinds: Array.isArray(entry.kinds) ? entry.kinds : [],
        cwd: entry.cwd ?? null,
        fallbackTitle: entry.fallbackTitle ?? null,
      }
    }
    this.writeChain = this.writeChain
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(this.indexDir, { recursive: true })
        // Write shards one at a time: never hold two gzip buffers of the whole
        // corpus at once.
        for (const id of ids) {
          const entry = surfaces.get(id)
          if (!entry) continue
          const shard = { version: INDEX_VERSION, id, savedAt: Date.now(), docs: entry.docs, fallbackTitle: entry.fallbackTitle }
          const bytes = await gzip(Buffer.from(JSON.stringify(shard)))
          await writeAtomic(this.sessionIndexFile(id), bytes)
          const longDocs = Array.isArray(entry.longDocs) ? entry.longDocs : []
          if (longDocs.length > 0) {
            await fs.mkdir(this.longDir, { recursive: true })
            const longShard = { version: INDEX_VERSION, id, savedAt: Date.now(), docs: longDocs }
            await writeAtomic(this.sessionLongFile(id), await gzip(Buffer.from(JSON.stringify(longShard))))
          } else {
            await fs.rm(this.sessionLongFile(id), { force: true }).catch(() => {})
          }
        }
        for (const id of removed) {
          await fs.rm(this.sessionIndexFile(id), { force: true }).catch(() => {})
          // The long shard is a separate file; leaving it behind kept every
          // archived Session's long text on disk forever (three of six archived
          // Sessions still had one after archiving had "cleaned" them).
          await fs.rm(this.sessionLongFile(id), { force: true }).catch(() => {})
        }
        const manifestBytes = await gzip(Buffer.from(JSON.stringify(manifest)))
        await writeAtomic(this.indexFile, manifestBytes)
      })
    await this.writeChain
  }

  async logError(scope, error) {
    try {
      await fs.mkdir(this.dir, { recursive: true })
      const file = path.join(this.dir, 'errors.log')
      // One line per click: rotate instead of growing without a bound.
      try {
        const stat = await fs.stat(file)
        if (stat.size > 1_000_000) await fs.rename(file, path.join(this.dir, 'errors.log.1'))
      } catch {
        /* first write */
      }
      const message = error && error.stack ? error.stack : String(error)
      await fs.appendFile(file, new Date().toISOString() + ' [' + scope + '] ' + message + '\n')
    } catch {
      /* diagnostics must never break the route */
    }
  }

  async clearIndex() {
    if (this.indexTimer) {
      clearTimeout(this.indexTimer)
      this.indexTimer = null
    }
    this.writeChain = this.writeChain.catch(() => {})
    await this.writeChain
    try {
      await fs.rm(this.indexFile, { force: true })
      await fs.rm(this.indexDir, { recursive: true, force: true })
    } catch {
      /* already gone */
    }
  }
}

function defaultState() {
  return {
    version: STATE_VERSION,
    prefs: {},
    history: [],
    savedSearches: {},
    autoIndex: true,
    autoLong: true,
    logCollection: true,
    revision: 0,
  }
}

async function writeAtomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
  await fs.writeFile(temporary, data)
  try {
    await fs.rename(temporary, file)
  } catch {
    await fs.rm(file, { force: true })
    await fs.rename(temporary, file)
  }
}

/** Pure helpers exported for local contracts tests; not a public plugin API. */
export const __test = {
  SearchIndex,
  resolveThreads,
  StateStore,
  buildSurfaceDocs,
  makeResultItem,
  parseSearchRequest,
  canonicalSignature,
  queryId,
  requestOf,
  extractFilePaths,
  makeSnippet,
  ALL_TYPES_FOR_TEST: ALL_TYPES,
  CHUNK_SIZE,
  CHUNK_OVERLAP,
  HEAD_CHUNKS,
  LONG_MIN_CHARS,
  MAX_CHUNKS,
}