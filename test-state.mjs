import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { __test } from './index.js'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-deepsearch-state-'))
process.env.DSH_HOME = home

const { StateStore } = __test
const store = new StateStore()
await store.load()
store.setPrefs({ query: 'hello', blur: 12 })
const request = { q: 'hello', scope: 'all', types: ['modelText'], exts: [], sort: 'relevance' }
const entry = store.recordSearch(request, { total: 3, items: [], sessions: [] })
await store.saveStateNow()

const reloaded = new StateStore()
await reloaded.load()
assert.equal(reloaded.state.prefs.query, 'hello')
assert.equal(reloaded.state.history[0].id, entry.id)
const stored = reloaded.savedSearch(entry.id)
assert.equal(stored.meta.total, 3)
// The saved page keeps the search cost it was produced with; a cached click
// must never report the time a re-search would have taken.
assert.equal(Number(stored.meta.tookMs), 0)
// A saved page belongs to one scope: another scope must miss, not reuse it.
assert.equal(reloaded.matchSaved({ ...request, scope: 's-other' }), null)
assert.ok(reloaded.matchSaved(request), 'the recorded scope must still match')
assert.deepEqual(stored.ids, [])
assert.equal(stored.payload, undefined)
assert.equal(stored.compressed ?? null, null)

await reloaded.saveIndex(new Map([['s1', { seq: 4, docs: [{ text: 'hello' }] }]]))
const loaded = await reloaded.loadIndex()
assert.equal(loaded.sessions.s1.seq, 4)
assert.equal(loaded.sessions.s1.docs.length, 1)

reloaded.deleteSaved(entry.id)
await reloaded.saveStateNow()
assert.equal(reloaded.state.history.length, 0)
assert.equal(reloaded.savedSearch(entry.id), null)

await reloaded.clearIndex()
assert.equal(await reloaded.loadIndex(), null)
// The store lives under flash-anchor now and migrates the 1.x directory once.
const legacyHome = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-flash-anchor-state-'))
await fs.mkdir(path.join(legacyHome, 'deepsearch'), { recursive: true })
await fs.writeFile(
  path.join(legacyHome, 'deepsearch', 'state.json'),
  JSON.stringify({ version: 1, prefs: { query: 'legacy' }, history: [], savedSearches: {}, autoIndex: false, revision: 5 }),
)
const previousHome = process.env.DSH_HOME
process.env.DSH_HOME = legacyHome
const migrated = new StateStore()
await migrated.load()
assert.equal(path.basename(migrated.dir), 'flash-anchor')
assert.equal(migrated.state.prefs.query, 'legacy')
const migratedFile = await fs.stat(path.join(legacyHome, 'flash-anchor', 'state.json')).then(() => true).catch(() => false)
assert.equal(migratedFile, true)
process.env.DSH_HOME = previousHome
await fs.rm(legacyHome, { recursive: true, force: true })

await fs.rm(home, { recursive: true, force: true })
console.log('flash-anchor state persistence: ok')
