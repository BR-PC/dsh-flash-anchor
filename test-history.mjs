// History contracts: a search must show up as a row immediately, a partial
// page must not be replayed, and clearing the history must take the cached
// result pages with it.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'fa-history-'))
process.env.DSH_HOME = home

const { __test } = await import('./index.js')
const { SearchIndex, StateStore, parseSearchRequest } = __test

const plainCtx = {
  sessionQuery: {
    async listSessions() { return [] },
    async readTitleSnapshots() { return [] },
    async readSurface() { throw new Error('no sessions in this fixture') },
  },
  get() { return undefined },
}

const store = new StateStore()
await store.load()
const index = new SearchIndex(plainCtx, store)
await index.ensureReady()

function payloadOf(overrides) {
  return {
    query: 'alpha',
    scope: 'all',
    types: ['userText'],
    exts: [],
    sort: 'relevance',
    signature: 'SIG-A',
    total: 3,
    items: [{ id: 'a:1:0:0:userText:text:' }],
    sessions: [{ id: 's-1' }],
    pending: 0,
    tookMs: 12,
    limit: 400,
    truncated: false,
    ...overrides,
  }
}
const request = parseSearchRequest(new URLSearchParams('q=alpha&types=userText'))

// 1. A partial page (indexing still running) still creates the row, but no
//    snapshot: reopening must re-search instead of replaying half a page.
const partial = store.recordSearch(request, payloadOf({ pending: 4, signature: request.sig }), {})
assert.ok(partial && partial.id, 'a partial search must still create a history row')
assert.equal(store.state.history.length, 1)
assert.equal(store.savedSearch(partial.id), null, 'a partial page must not be stored as a snapshot')
assert.equal(store.matchSaved(request), null, 'a partial page must not answer a later request')

// 2. The complete search replaces that row (same signature => same id) and
//    stores the page.
const complete = store.recordSearch(request, payloadOf({ signature: request.sig }), {})
assert.equal(complete.id, partial.id, 'the same filter set must update the row, not add another')
assert.equal(store.state.history.length, 1, 'history grew a duplicate row')
const stored = store.savedSearch(complete.id)
assert.ok(stored, 'a complete search must be stored as a snapshot')
assert.equal(stored.meta.total, 3)
assert.ok(store.matchSaved(request), 'a complete snapshot must answer the same request')

// 3. A different filter set is a separate row.
const other = parseSearchRequest(new URLSearchParams('q=alpha&types=reasoning'))
store.recordSearch(other, payloadOf({ types: ['reasoning'], signature: other.sig }), {})
assert.equal(store.state.history.length, 2, 'a different filter set must be its own row')
assert.equal(store.state.history[0].id, store.state.history.find((item) => item.id !== complete.id).id)

// 4. Clearing takes every row and every snapshot, and reports the ids so the
//    in-memory materialized pages can be released too.
const before = Object.keys(store.state.savedSearches).length
assert.ok(before >= 2, 'expected snapshots before clearing, got ' + before)
const dropped = store.clearHistory()
assert.equal(store.state.history.length, 0, 'clearHistory left rows behind')
assert.equal(Object.keys(store.state.savedSearches).length, 0, 'clearHistory left snapshots behind')
assert.ok(dropped.length >= 2, 'clearHistory must report every dropped id, got ' + dropped.length)
assert.equal(store.matchSaved(request), null, 'a cleared snapshot still answered')

// 5. The dropped ids release the in-memory pages as well.
index.resolvedCache = new Map([[complete.id + '|*||relevance', { version: 1, payload: { items: [] } }]])
index.dropResolved(complete.id)
assert.equal(index.resolvedCache.size, 0, 'dropResolved did not release the page')

// 6. The clear survives a reload.
await store.saveStateNow()
const reopened = new StateStore()
await reopened.load()
assert.equal(reopened.state.history.length, 0, 'cleared history came back after a reload')
assert.equal(Object.keys(reopened.state.savedSearches).length, 0, 'cleared snapshots came back after a reload')

// 7. The row remembers the filters it was made with, so the panel can render
//    them next to the keyword.
const shaped = parseSearchRequest(new URLSearchParams('q=beta&types=modelText,userText&workspace=D:/w&sort=time&long=1'))
const entry = store.recordSearch(shaped, payloadOf({ query: 'beta', long: true, signature: shaped.sig }), {})
assert.equal(entry.query, 'beta')
assert.deepEqual(entry.types.slice().sort(), ['modelText', 'userText'])
assert.equal(entry.workspace, 'D:/w')
assert.equal(entry.sort, 'time')
assert.equal(entry.long, true)
assert.equal(store.savedSearch(entry.id), null, 'a long-text page must not be snapshotted')

await fs.rm(home, { recursive: true, force: true })
console.log('flash-anchor history contracts: ok')
