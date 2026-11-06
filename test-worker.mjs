// Worker-pool contract: the sharded scan must return exactly the inline scan,
// and a dead/OOM pool must degrade to the single-threaded path.
import assert from 'node:assert/strict'
import { SearchPool } from './search-pool.js'
import { scanDocs } from './search-core.js'
import { __test } from './index.js'

const docs = []
for (let index = 0; index < 3200; index += 1) {
  docs.push({
    id: 'd' + index,
    kind: index % 5 === 0 ? 'reasoning' : 'modelText',
    subtype: 'text',
    text: ('document ' + index + ' alpha beta gamma 指标中心化 块级锚点 ').repeat(3),
    ext: null,
  })
}
// A userText doc must never be returned by a modelText-only request.
docs.push({ id: 'user-1', kind: 'userText', subtype: 'text', text: 'user gamma that must not leak', ext: null })
const request = { types: ['reasoning', 'modelText'], exts: [], fileOnly: false, qLower: 'gamma' }
const userTextRequest = { types: ['userText'], exts: [], fileOnly: false, qLower: 'gamma' }
const inline = scanDocs(docs, request).sort((a, b) => (a.id < b.id ? -1 : 1))
assert.ok(inline.length > 100)

const pool = new SearchPool(new URL('./worker.js', import.meta.url))
for (const size of [2, 4]) {
  const sharded = await pool.search(request, size, docs, 10 + size)
  assert.ok(sharded, 'worker pool returned nothing for size ' + size)
  const sorted = sharded.sort((a, b) => (a.id < b.id ? -1 : 1))
  assert.equal(sorted.length, inline.length)
  assert.deepEqual(sorted.slice(0, 5), inline.slice(0, 5))
  assert.deepEqual(sorted.slice(-5), inline.slice(-5))
}
const userTextMatches = await pool.search(userTextRequest, 2, docs, 12)
assert.deepEqual(userTextMatches.map((match) => match.id), ['user-1'])
const warm = await pool.search(request, 2, docs, 12)
assert.ok(warm && warm.length === inline.length, 'warm pool changed the result')

// Simulate an OOM/crash: the pool must report itself degraded and return null
// so the Host can scan inline.
pool.fail(new Error('ERR_WORKER_OUT_OF_MEMORY'))
assert.equal(pool.degraded, true)
assert.equal(await pool.search(request, 2, docs, 13), null)

// The Host must actually select the worker path, then fall back cleanly.
const events = []
const ctx = {
  sessionQuery: {
    async listSessions() {
      return [{ header: { id: 's1', createdAt: Date.now(), cwd: null }, live: false }]
    },
    async readTitleSnapshots() {
      return [{ sessionId: 's1', status: 'fulfilled', value: { title: { title: 'Worker' } } }]
    },
    async readSurface() {
      return { capturedThroughSeq: 1, events }
    },
  },
  get() {
    return undefined
  },
}
for (let index = 0; index < 3200; index += 1) {
  events.push({
    type: 'assistant/message',
    seq: index + 1,
    time: Date.now(),
    data: {
      turn: Math.floor(index / 100) + 1,
      step: (index % 100) + 1,
      message: {
        role: 'assistant',
        id: 'm' + index,
        content: [{ type: 'text', text: ('document ' + index + ' alpha beta gamma 指标中心化 块级锚点').repeat(3) }],
      },
    },
  })
}
const store = {
  state: { revision: 0, autoIndex: false, prefs: {}, history: [], savedSearches: {} },
  async load() {},
  async loadIndex() { return null },
  bumpRevision() { this.state.revision += 1 },
  saveStateSoon() {},
  async saveIndex() {},
}
const index = new __test.SearchIndex(ctx, store)
const workerResult = await index.search(__test.parseSearchRequest(new URLSearchParams({ q: 'gamma', threads: '2' })))
assert.equal(workerResult.mode, 'worker', 'host did not use the worker path: ' + workerResult.mode)
assert.ok(workerResult.items.length > 100)
index.pool.fail(new Error('ERR_WORKER_OUT_OF_MEMORY'))
const fallback = await index.search(__test.parseSearchRequest(new URLSearchParams({ q: 'gamma', threads: '2' })))
assert.equal(fallback.mode, 'inline-fallback')
assert.equal(fallback.total, workerResult.total, 'fallback changed the total')
assert.equal(fallback.degraded, true)
index.dispose()

console.log('flash-anchor worker pool: ok (' + workerResult.items.length + ' matches)')
process.exit(0)
