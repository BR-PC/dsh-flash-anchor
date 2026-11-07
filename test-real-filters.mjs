// Real-corpus contracts for filters, scope, types, and saved-view timing.
// Reads the local session store; not part of the published package.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { __test } from './index.js'

const { SearchIndex, StateStore, parseSearchRequest, ALL_TYPES_FOR_TEST } = __test
const ROOT = process.env.DSH_SESSIONS || path.join(os.homedir(), '.dsh', 'sessions')
const files = []
function collect(dir, out) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) { collect(full, out); continue }
    if (/\.jsonl(\.zstd|\.zst)?$/.test(entry.name)) out.push(full)
  }
}
collect(ROOT, files)
if (files.length === 0) { console.log('real filters: skipped (no store)'); process.exit(0) }

function load(file) {
  const raw = /\.zst(d)?$/.test(file) ? zlib.zstdDecompressSync(fs.readFileSync(file)) : fs.readFileSync(file)
  let header = null
  const events = []
  for (const line of raw.toString('utf8').split('\n')) {
    if (!line.trim()) continue
    let value
    try { value = JSON.parse(line) } catch { continue }
    if (value && (value.header || value.type === 'session')) { header = value.header || value; continue }
    if (value && typeof value.type === 'string' && Number.isFinite(value.seq)) events.push(value)
  }
  return { header, events }
}
function surfaceOf(events) {
  const surface = new Map()
  for (const event of events) {
    if (!['user/message', 'assistant/message', 'tool/result', 'system/message', 'developer/message'].includes(event.type)) continue
    const op = event.surfaceOp
    if (op && typeof op === 'object' && op.op === 'replace') {
      for (let seq = op.startSeq; seq <= op.endSeq; seq += 1) surface.delete(seq)
    }
    surface.set(event.seq, event)
  }
  return [...surface.values()].sort((a, b) => a.seq - b.seq)
}

const sessions = []
for (const file of files) {
  const { header, events } = load(file)
  if (!header) continue
  sessions.push({ header, events, surface: surfaceOf(events), live: false, persisted: true })
}
console.log('sessions:', sessions.length)

const byId = new Map(sessions.map((s) => [s.header.id, s]))
const ctx = {
  sessionQuery: {
    async listSessions() { return sessions.map(({ header, live, persisted }) => ({ header, live, persisted })) },
    async readTitleSnapshots(ids) { return ids.map((sessionId) => ({ sessionId, status: 'fulfilled', value: { title: { title: byId.get(sessionId)?.header.title || sessionId } } })) },
    async readSurface(sessionId) {
      const s = byId.get(sessionId)
      if (!s) throw new Error('no session ' + sessionId)
      return { session: s.header, capturedThroughSeq: s.surface.at(-1)?.seq ?? null, events: s.surface }
    },
  },
  get() { return undefined },
}
const home = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fa-real-'))
process.env.DSH_HOME = home
const store = new StateStore()
await store.load()
store.state.autoIndex = false
const index = new SearchIndex(ctx, store)
await index.ensureReady()
await index.listSessions()

const failures = []
function check(name, fn) { try { fn() } catch (error) { failures.push(name + ': ' + error.message) } }

// 1. Type filters never leak another kind.
for (const kind of ['reasoning', 'modelText', 'tools', 'outputFiles', 'userText', 'inputFiles']) {
  const payload = await index.search(parseSearchRequest(new URLSearchParams({ q: 'the', types: kind, limit: '400' })))
  check('type ' + kind, () => {
    const bad = payload.items.filter((item) => item.kind !== kind)
    assert.equal(bad.length, 0, bad.length + ' items leaked, e.g. ' + (bad[0] && bad[0].kind) + ' for ' + kind)
  })
}

// 2. Scope restricts to one session.
const scopeId = sessions[0].header.id
const scoped = await index.search(parseSearchRequest(new URLSearchParams({ q: 'the', scope: scopeId, limit: '400' })))
check('scope', () => {
  const bad = scoped.items.filter((item) => item.sessionId !== scopeId)
  assert.equal(bad.length, 0, bad.length + ' items came from another session')
})

// 3. A saved view must not answer a different scope/types request.
store.recordSearch(
  { q: 'the', scope: null, types: ['modelText'], exts: [], sort: 'relevance' },
  { total: 1, items: [], sessions: [] },
  index.snapshotSeqs(),
)
check('matchSaved scope', () => {
  const hit = store.matchSaved({ q: 'the', scope: scopeId, types: ['modelText'], exts: [], sort: 'relevance' })
  assert.equal(hit, null, 'matchSaved returned an all-scope view for a scoped request')
})
check('matchSaved types', () => {
  const hit = store.matchSaved({ q: 'the', scope: null, types: ['reasoning'], exts: [], sort: 'relevance' })
  assert.equal(hit, null, 'matchSaved returned a modelText view for a reasoning request')
})

// 4. Saved payload keeps the original timing instead of the materialization time.
const savedPayload = { total: 2, items: [], sessions: [], tookMs: 432, surfaceMs: 70, matchMs: 33, mode: 'worker' }
const timingEntry = store.recordSearch({ q: 'watt', scope: null, types: ['modelText'], exts: [], sort: 'relevance' }, savedPayload, index.snapshotSeqs())
check('saved timing', () => {
  const entry = store.savedSearch(timingEntry.id)
  assert.equal(Number(entry?.meta?.tookMs), 432, 'saved view did not keep the original tookMs, got ' + entry?.meta?.tookMs)
})

// 5. Long documents stay searchable past 64k characters.
const longText = 'LONGDOC ' + 'x'.repeat(70000) + ' NEEDLE_AT_END'
const longSnapshot = {
  capturedThroughSeq: 1,
  events: [{
    type: 'assistant/message', seq: 1, time: Date.now(),
    data: { turn: 1, step: 1, message: { role: 'assistant', id: 'm-long', content: [{ type: 'text', text: longText }] } },
  }],
}
const built = __test.buildSurfaceDocs(longSnapshot, { header: { id: 's-long', cwd: null } })
check('long doc', () => {
  const joined = built.docs.map((doc) => doc.text).join('')
  assert.ok(joined.includes('NEEDLE_AT_END'), 'the tail of a long document was dropped')
})

await fs.promises.rm(home, { recursive: true, force: true })
if (failures.length > 0) {
  console.log('real filters: ' + failures.length + ' FAILURES')
  for (const failure of failures) console.log('  FAIL ' + failure)
  process.exit(1)
}
console.log('real filters: ok')