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
const INDEX_VERSION = 2
const TITLE_CACHE_MS = 30_000
// Background reindexing of a streaming session is a CPU furnace; searches
// still read it fresh, but automatic tracking may lag a few seconds.
const LIVE_REBUILD_MS = 15_000
const gzip = promisify(zlib.gzip)
const CHUNK_SIZE = 4_000
const CHUNK_OVERLAP = 200
const MAX_CHUNKS = 16
const ALL_TYPES = Object.freeze([
  'reasoning',
  'modelText',
  'tools',
  'outputFiles',
  'userText',
  'inputFiles',
])
const FILE_TYPES = new Set(['outputFiles', 'inputFiles'])
const SEARCH_LIMIT = 400
const PRELOAD_LIMIT = 2000
const MAX_THREADS = 8
// Spawning workers only pays off once the matching pass is worth splitting.
const WORKER_MIN_DOCS = 1500
const MAX_QUERY_LENGTH = 300
const MAX_HISTORY = 12
// Saved views are an LRU cache of ID snapshots, not an archive.
const MAX_SAVED = 50

export const inject = ['sessionQuery', 'connection']

export function apply(ctx) {
  const store = new StateStore()
  const index = new SearchIndex(ctx, store)
  void index.ensureReady()
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
  ctx.on('session/event', (sessionId) => index.noteSessionActivity(sessionId))
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

    if (action === 'sessions') {
      await index.ensureReady()
      const payload = await index.listSessions()
      return json({ ok: true, ...payload, index: index.status() })
    }
    if (action === 'status') {
      return json({ ok: true, index: index.status(), state: store.publicState() })
    }
    if (action === 'state') {
      return json({ ok: true, state: store.publicState(), index: index.status() })
    }
    if (action === 'index') {
      index.startAll()
      return json({ ok: true, index: index.status(), state: store.publicState() })
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
      const materialized = index.resolveSaved(saved)
      if (!materialized) {
        // The snapshot can no longer be resolved (index rebuilt and a doc is
        // gone); the Client will fall back to one real search.
        return json({ ok: false, error: { code: 'saved-missing', message: 'saved result not found' } }, 404)
      }
      return json({
        ok: true,
        ...materialized,
        tookMs: Date.now() - started,
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
      await store.logError('client:' + scope, JSON.stringify(body || {}))
      return json({ ok: true })
    }
    if (action !== 'search') {
      return json({ ok: false, error: { code: 'bad-action', message: `unknown action: ${action}` } }, 400)
    }
    const searchRequest = parseSearchRequest(url.searchParams)
    const started = Date.now()
    const exact = searchRequest.preload ? null : store.matchSaved(searchRequest)
    if (exact && exact.revision === store.state.revision) {
      const materialized = index.resolveSaved(exact)
      if (materialized) {
        // Memory hit: this returns before the scan starts, so there is nothing
        // left for an AbortController to cancel.
        return json({
          ok: true,
          ...materialized,
          tookMs: Date.now() - started,
          cached: true,
          stale: index.isSavedStale(exact),
          savedId: exact.id,
          history: store.state.history,
          index: index.status(),
        })
      }
    }
    const payload = await index.search(searchRequest)
    const saved = searchRequest.preload ? null : store.recordSearch(searchRequest, payload, index.snapshotSeqs())
    if (saved) {
      for (const droppedId of store.droppedIds || []) index.dropResolved(droppedId)
      await store.saveStateNow()
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
    return json({ ok: false, error: { code, message } }, 500)
  }
}

function parseSearchRequest(params) {
  const q = (params.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH)
  const scope = (params.get('scope') ?? 'all').trim()
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
  // A speculative preload may ask for the complete snapshot; ordinary
  // requests stay capped so one query cannot flood the Client.
  const preload = params.get('preload') === '1'
  const cap = preload ? PRELOAD_LIMIT : SEARCH_LIMIT
  const requestedLimit = Number.parseInt(params.get('limit') ?? '', 10)
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(cap, Math.max(1, requestedLimit))
    : cap
  const requestedThreads = Number.parseInt(params.get('threads') ?? '', 10)
  const threads = Number.isFinite(requestedThreads)
    ? Math.min(MAX_THREADS, Math.max(1, requestedThreads))
    : 2
  return {
    q,
    scope: scope === 'all' || scope === '' ? null : scope,
    types: types.length > 0 ? types : [...ALL_TYPES],
    exts,
    sort,
    limit,
    threads,
    preload,
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
    this.dirtyTimer = null
    this.persistTimer = null
    this.pool = new SearchPool(new URL('./worker.js', import.meta.url))
    this.corpusVersion = 1
    this.ready = this.bootstrap()
  }

  async bootstrap() {
    try {
      await this.store.load()
      const cached = await this.store.loadIndex()
      if (cached && cached.sessions) {
        this.surfaces = new Map(Object.entries(cached.sessions))
        this.totalDocs = [...this.surfaces.values()].reduce((sum, entry) => sum + (entry.docs?.length ?? 0), 0)
      }
      await this.reloadSessions(true)
      this.pruneRemoved()
      if (this.store.state.autoIndex && this.surfaces.size < this.records.length) {
        setTimeout(() => {
          if (!this.job?.running) this.startAll()
        }, 1200)
      }
    } catch (error) {
      this.warnings += 1
      await this.store.logError('bootstrap', error)
    }
  }

  async ensureReady() {
    await this.ready
  }

  status() {
    return {
      ready: true,
      running: this.job?.running === true,
      done: this.job?.done ?? 0,
      total: this.job?.total ?? this.records.length,
      sessions: this.surfaces.size,
      docs: this.totalDocs,
      revision: this.store.state.revision,
      autoIndex: this.store.state.autoIndex,
    }
  }

  pruneRemoved() {
    const live = new Set(this.records.map((record) => record.header.id))
    let removed = false
    for (const id of this.surfaces.keys()) {
      if (!live.has(id)) {
        removed = true
        this.totalDocs -= this.surfaces.get(id)?.docs?.length ?? 0
        this.surfaces.delete(id)
        this.corpusVersion += 1
      }
    }
    if (removed) {
      this.store.bumpRevision()
      this.schedulePersist()
    }
  }

  schedulePersist() {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    // Persisting a 14 MB index is expensive; batch bursts of live updates and
    // keep the gzip off the event loop.
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      void this.store.saveIndex(this.surfaces)
    }, 6_000)
  }

  async startAll() {
    if (this.job?.running) return this.status()
    this.job = { running: true, done: 0, total: this.records.length }
    void (async () => {
      try {
        await this.ensureReady()
        if (this.job) this.job.total = this.records.length
        // The thread setting also controls how many sessions are read in
        // parallel; surface building is I/O + parse, not the worker pool.
        const concurrency = Math.max(1, Math.min(MAX_THREADS, Number(this.store.state.prefs && this.store.state.prefs.threads) || 3))
        await mapLimit(this.records, concurrency, async (record) => {
          await this.ensureSurface(record)
          if (this.job) this.job.done += 1
        })
      } finally {
        if (this.job) {
          this.job.running = false
          this.job.done = this.job.total
        }
        this.schedulePersist()
      }
    })()
    return this.status()
  }

  noteSessionActivity(sessionId) {
    if (!this.store.state.autoIndex) return
    this.dirty.add(String(sessionId))
    if (this.dirtyTimer) clearTimeout(this.dirtyTimer)
    this.dirtyTimer = setTimeout(() => {
      this.dirtyTimer = null
      void this.flushDirty()
    }, 1400)
  }

  async flushDirty() {
    if (this.dirty.size === 0) return
    const ids = [...this.dirty]
    this.dirty.clear()
    await this.reloadSessions(false)
    for (const id of ids) {
      const record = this.recordById.get(id)
      if (!record) continue
      if (record.live) {
        const cached = this.surfaces.get(id)
        if (cached && Date.now() - (cached.builtAt || 0) < LIVE_REBUILD_MS) continue
      }
      await this.ensureSurface(record)
    }
    this.schedulePersist()
  }

  async clear() {
    await this.ensureReady()
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    this.surfaces.clear()
    this.totalDocs = 0
    this.corpusVersion += 1
    this.dirty.clear()
    this.store.clearSavedSearches()
    this.store.bumpRevision()
    await this.store.clearIndex()
  }

  /** List stored sessions with titles, newest first. Cheap cached snapshot. */
  async listSessions() {
    await this.ensureReady()
    const started = Date.now()
    await this.reloadSessions(false)
    if (this.titlePromise) await this.titlePromise
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
    const records = await this.ctx.sessionQuery.listSessions()
    const ids = records.map((record) => record.header.id)
    // The store may change while titles are folded; merge by id against the
    // exact listing we rank, and drop document caches for removed sessions.
    const liveIds = new Set(ids)
    for (const id of this.surfaces.keys()) {
      if (!liveIds.has(id)) {
        const cached = this.surfaces.get(id)
        this.totalDocs -= cached.docs.length
        this.surfaces.delete(id)
        this.corpusVersion += 1
      }
    }
    this.records = records
    this.recordById = new Map(records.map((record) => [record.header.id, record]))
    this.listAt = Date.now()
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

  async search({ q, scope, types, exts, sort, limit, threads }) {
    const started = Date.now()
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

    let targets = this.records
    if (scope) {
      const exact = this.recordById.get(scope)
      targets = exact ? [exact] : []
    }

    const warningsBefore = this.warnings
    const requestedThreads = Math.max(1, Math.min(MAX_THREADS, Number(threads) || 2))
    const surfaceStarted = Date.now()
    await mapLimit(targets, requestedThreads, (record) => this.ensureSurface(record, { reuseLive: true }))
    const surfaceMs = Date.now() - surfaceStarted

    const wanted = new Set(types)
    const qLower = q.toLowerCase()
    const extSet = new Set(exts)
    const fileOnly = extSet.size > 0 && types.some((kind) => FILE_TYPES.has(kind))

    // One flat corpus for both the worker pool and the inline fallback. The
    // id is the same address the Client uses to locate the block.
    const docs = []
    const docMeta = new Map()
    for (const record of targets) {
      const sessionId = record.header.id
      const cached = this.surfaces.get(sessionId)
      if (!cached) continue
      const sessionTitle = this.titleOf(sessionId) ?? record.header.id
      for (const doc of cached.docs) {
        const id = docKey(sessionId, doc)
        docs.push({ id, kind: doc.kind, subtype: doc.subtype, text: doc.text, ext: doc.ext || null })
        docMeta.set(id, { sessionId, record, sessionTitle, doc })
      }
    }

    const matchStarted = Date.now()
    const request = { types: [...wanted], exts: [...extSet], fileOnly, qLower }
    let matches = null
    let mode = 'inline'
    if (requestedThreads > 1 && docs.length >= WORKER_MIN_DOCS && this.pool) {
      matches = await this.pool.search(request, requestedThreads, docs, this.corpusVersion)
      mode = matches ? 'worker' : 'inline-fallback'
    } else if (requestedThreads > 1) {
      mode = 'inline-small'
    }
    if (!matches) matches = scanDocs(docs, request)
    const matchMs = Date.now() - matchStarted

    const matched = []
    const perSession = new Map()
    const scanned = docs.length
    for (const match of matches) {
      const meta = docMeta.get(match.id)
      if (!meta) continue
      const item = makeResultItem({
        sessionId: meta.sessionId,
        sessionTitle: meta.sessionTitle,
        record: meta.record,
        doc: meta.doc,
        matchIndex: match.matchIndex,
        queryLength: qLower.length,
        qLower,
        score: match.score,
      })
      matched.push(item)
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

    matched.sort((a, b) => {
      if (sort === 'time') return b.time - a.time || b.score - a.score
      if (sort === 'time-asc') return a.time - b.time || b.score - a.score
      return b.score - a.score || b.time - a.time
    })

    const items = matched.slice(0, limit)
    const sessions = [...perSession.values()].sort((a, b) => {
      if (sort === 'time') return b.createdAt - a.createdAt || b.best - a.best
      if (sort === 'time-asc') return a.createdAt - b.createdAt || b.best - a.best
      return b.best - a.best || b.createdAt - a.createdAt
    })

    return {
      query: q,
      scope: scope ?? 'all',
      types,
      exts,
      sort,
      total: matched.length,
      scanned,
      limit,
      truncated: matched.length > items.length,
      items,
      sessions,
      threads: mode === 'worker' ? requestedThreads : 1,
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
  }

  /** Rebuild one session surface when it is new or a live session advanced. */
  async ensureSurface(record, options = {}) {
    const id = record.header.id
    const cached = this.surfaces.get(id)
    const liveSession = this.optionalSessions()?.get(id)
    const liveSeq = liveSession ? Number(liveSession.seq) : undefined
    if (cached) {
      const unchanged = !record.live || (liveSeq !== undefined && cached.seq === liveSeq)
      if (unchanged) return cached
      // Two searches in a row must not rebuild and resend the live surface.
      if (options.reuseLive === true && record.live && Date.now() - (cached.builtAt || 0) < 2_000) return cached
    }
    try {
      const snapshot = await this.ctx.sessionQuery.readSurface(id)
      const built = buildSurfaceDocs(snapshot, record)
      built.seq = liveSeq ?? (snapshot.capturedThroughSeq == null ? undefined : Number(snapshot.capturedThroughSeq))
      built.builtAt = Date.now()
      if (cached) this.totalDocs -= cached.docs.length
      this.surfaces.set(id, built)
      this.totalDocs += built.docs.length
      // A streaming session grows constantly; bumping the revision for that
      // made every saved result look stale. Only structural changes count.
      if (!cached || !record.live) this.store.bumpRevision()
      this.corpusVersion += 1
      this.schedulePersist()
      return built
    } catch (error) {
      this.warnings += 1
      if (cached) return cached
      const empty = {
        docs: [],
        fallbackTitle: null,
        seq: liveSeq,
        builtAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      }
      if (cached) this.totalDocs -= cached.docs.length
      this.surfaces.set(id, empty)
      return empty
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

  /** Lazily map every doc id to its doc and owning record. */
  docIndex() {
    if (this.docIndexCache && this.docIndexCacheVersion === this.corpusVersion) return this.docIndexCache
    const map = new Map()
    for (const [sessionId, entry] of this.surfaces) {
      const record = this.recordById.get(sessionId)
      if (!record) continue
      const sessionTitle = this.titleOf(sessionId) ?? sessionId
      for (const doc of entry.docs) {
        const id = docKey(sessionId, doc)
        map.set(id, { sessionId, record, sessionTitle, doc })
      }
    }
    this.docIndexCache = map
    this.docIndexCacheVersion = this.corpusVersion
    return map
  }

  /**
   * Rebuild a saved page from its ID snapshot without persisting any text.
   * Returns null when the snapshot can no longer be resolved (a doc vanished),
   * so the caller can fall back to a real search.
   */
  resolveSaved(saved) {
    if (!saved) return null
    if (!Array.isArray(saved.ids)) return saved.payload ?? null
    // Views saved before the address scheme changed cannot be resolved; let the
    // caller re-search instead of showing a wrong page.
    if (saved.idVersion !== 2) return null
    const cached = this.resolvedCache && this.resolvedCache.get(saved.id)
    if (cached && cached.version === this.corpusVersion) return cached.payload
    const map = this.docIndex()
    const q = String(saved.request?.q || '')
    const qLower = q.toLowerCase()
    const items = []
    for (const id of saved.ids) {
      const entry = map.get(id)
      if (!entry) return null
      const matchIndex = qLower ? entry.doc.text.toLowerCase().indexOf(qLower) : 0
      if (qLower && matchIndex === -1) continue
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
    const sort = saved.request?.sort || 'relevance'
    items.sort((a, b) => {
      if (sort === 'time') return b.time - a.time || b.score - a.score
      if (sort === 'time-asc') return a.time - b.time || b.score - a.score
      return b.score - a.score || b.time - a.time
    })
    const meta = saved.meta || {}
    const payload = {
      query: q,
      scope: meta.scope ?? 'all',
      types: meta.types ?? [],
      exts: meta.exts ?? [],
      sort,
      total: meta.total ?? items.length,
      scanned: meta.scanned ?? 0,
      limit: meta.limit ?? items.length,
      truncated: meta.truncated === true,
      items,
      sessions: Array.isArray(meta.sessions) ? meta.sessions : [],
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
      tookMs: 1,
    }
    if (!this.resolvedCache) this.resolvedCache = new Map()
    this.resolvedCache.delete(saved.id)
    this.resolvedCache.set(saved.id, { version: this.corpusVersion, payload })
    this.pruneResolved()
    return payload
  }

  pruneResolved() {
    if (!this.resolvedCache) return
    while (this.resolvedCache.size > MAX_SAVED) this.resolvedCache.delete(this.resolvedCache.keys().next().value)
  }

  /** Drop one materialized page from the in-memory cache. */
  dropResolved(id) {
    if (!this.resolvedCache) return
    if (id) this.resolvedCache.delete(id)
  }

  dropAllResolved() {
    if (this.resolvedCache) this.resolvedCache.clear()
  }

  dispose() {
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

function buildSurfaceDocs(snapshot, record) {
  const docs = []
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
    const explicit = Number(event?.data?.turn)
    if (Number.isFinite(explicit)) pendingTurn = explicit
    eventTurn.set(Number(event.seq), Number.isFinite(explicit) ? explicit : pendingTurn)
  }

  const pushDoc = (kind, subtype, text, event, extra = {}) => {
    if (typeof text !== 'string') return
    const clean = text.replace(/\u0000/g, '')
    if (!clean.trim()) return
    const capped = clean.length > CHUNK_SIZE * MAX_CHUNKS ? clean.slice(0, CHUNK_SIZE * MAX_CHUNKS) : clean
    let offset = 0
    let chunk = 0
    do {
      const piece = capped.slice(offset, offset + CHUNK_SIZE)
      if (!piece.trim()) break
      docs.push({
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
      })
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
    const key = `${kind}\u0000${displayName}\u0000${path}`
    if (seenFiles.has(key)) return
    seenFiles.add(key)
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
      files: [{ name: displayName || `file.${ext}`, path: path || null }],
    })
  }

  for (const event of snapshot.events) {
    // `user/message` stores the message directly under `data`; every other
    // surface event nests it under `data.message`.
    const message = event?.data?.message ?? (event?.data?.role ? event.data : undefined)
    if (!message || !Array.isArray(message.content)) continue
    const role = message.role
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
          if (!fallbackTitle) fallbackTitle = makeFallbackTitle(text)
          pushDoc('userText', 'text', text, event, {
            messageId: message.id,
            blockIndex,
            seatIndex: nextSeatIndex('user'),
            blockKind: 'text',
          })
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
      } else if (block.type === 'image') {
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
    fallbackTitle,
    seq: snapshot.capturedThroughSeq == null ? undefined : Number(snapshot.capturedThroughSeq),
    cwd: headerCwd,
  }
}

function collectPresentedFiles(text, event, pushFile, extra = {}) {
  const pattern = /(?:^|\n)\s*Presented\s+([^\n]+)/g
  let match
  while ((match = pattern.exec(text)) !== null) {
    const path = match[1].trim()
    if (!path) continue
    pushFile('outputFiles', { name: basename(path), path }, event, extra)
  }
}

function producesFiles(name) {
  return /present|write|edit|save|export|create|render|convert|download|generate|copy|move|rename/i.test(name)
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

// History is keyed by the query alone: the same query with different filters is
// one row that keeps the newest result.
function queryId(query) {
  return createHash('sha1').update(JSON.stringify([String(query || '').trim()])).digest('hex').slice(0, 16)
}

class StateStore {
  constructor() {
    const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
    this.dir = path.join(home, 'flash-anchor')
    this.legacyDir = path.join(home, 'deepsearch')
    this.stateFile = path.join(this.dir, 'state.json')
    this.indexFile = path.join(this.dir, 'index.json.gz')
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
          const query = String(item?.query || '').trim()
          if (!query) continue
          const id = queryId(query)
          if (seen.has(id)) continue
          seen.add(id)
          history.push({ ...item, id, query })
          const saved = legacySaved[item.id] ?? legacySaved[id]
          if (saved) savedSearches[id] = saved
          if (history.length >= MAX_HISTORY) break
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
      const query = String(item?.query || '').trim()
      if (!query || seen.has(query)) continue
      seen.add(query)
      history.push(item)
    }
    return {
      prefs: this.state.prefs,
      history,
      autoIndex: this.state.autoIndex,
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

  bumpRevision() {
    this.state.revision = (Number(this.state.revision) || 0) + 1
    this.saveStateSoon()
  }

  recordSearch(request, payload, seqs) {
    const query = String(request.q || '').trim()
    const id = queryId(query)
    const entry = {
      id,
      snapshotId: id,
      query,
      scope: request.scope ?? 'all',
      types: request.types,
      exts: request.exts,
      sort: request.sort,
      at: Date.now(),
      count: payload.total,
    }
    this.state.history = [
      entry,
      ...this.state.history.filter(
        (item) => item.id !== id && String(item.query || '').trim() !== query,
      ),
    ].slice(0, MAX_HISTORY)
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
      seqs,
      sessions: Array.isArray(payload.sessions) ? payload.sessions.map((session) => session.id) : [],
      ids: Array.isArray(payload.items) ? payload.items.map((item) => item.id) : [],
      meta: {
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
    const keep = new Set(this.state.history.map((item) => item.id))
    for (const key of Object.keys(this.state.savedSearches)) {
      if (!keep.has(key)) delete this.state.savedSearches[key]
    }
    // Pages that fell out of the history must also release their resolved
    // payloads; otherwise the in-memory materialized view outlives the row.
    this.droppedIds = [...before, ...Object.keys(this.state.savedSearches)].filter(
      (key) => !(key in this.state.savedSearches),
    )
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
    const id = queryId(request.q)
    const saved = this.state.savedSearches[id]
    if (!saved || !saved.request) return null
    const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
    if (!same(saved.request.types, request.types)) return null
    if (!same(saved.request.exts, request.exts)) return null
    if (saved.request.sort !== request.sort) return null
    return { id, ...saved }
  }

  deleteSaved(id) {
    const target = this.state.history.find((item) => item.id === id)
    const query = target ? String(target.query || '').trim() : ''
    const snapshotIds = new Set([id])
    if (target && target.snapshotId) snapshotIds.add(target.snapshotId)
    this.state.history = this.state.history.filter((item) => {
      if (item.id === id) return false
      if (query !== '' && String(item.query || '').trim() === query) {
        if (item.snapshotId) snapshotIds.add(item.snapshotId)
        return false
      }
      return true
    })
    for (const snapshotId of snapshotIds) delete this.state.savedSearches[snapshotId]
    this.droppedIds = [...snapshotIds]
    if (query) {
      for (const key of Object.keys(this.state.savedSearches)) {
        if (String(this.state.savedSearches[key]?.request?.q || '').trim() === query) {
          delete this.state.savedSearches[key]
        }
      }
    }
    this.saveStateSoon()
  }

  clearSavedSearches() {
    this.droppedIds = Object.keys(this.state.savedSearches)
    this.state.savedSearches = {}
    this.saveStateSoon()
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

  async loadIndex() {
    try {
      const data = JSON.parse(zlib.gunzipSync(await fs.readFile(this.indexFile)))
      if (data?.version !== INDEX_VERSION || !data.sessions) return null
      return data
    } catch {
      return null
    }
  }

  async saveIndex(surfaces) {
    const data = {
      version: INDEX_VERSION,
      savedAt: Date.now(),
      sessions: Object.fromEntries(surfaces),
    }
    const bytes = await gzip(Buffer.from(JSON.stringify(data)))
    this.writeChain = this.writeChain
      .catch(() => {})
      .then(() => writeAtomic(this.indexFile, bytes))
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
  StateStore,
  buildSurfaceDocs,
  makeResultItem,
  parseSearchRequest,
  extractFilePaths,
  makeSnippet,
  CHUNK_SIZE,
  CHUNK_OVERLAP,
}