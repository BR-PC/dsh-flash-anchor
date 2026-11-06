// Memory contract: history and its materialized view share one id; deleting a
// history row must release the snapshot and its resolved payload, and the LRU
// must cap the number of snapshots.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { __test } from './index.js'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'flash-anchor-memory-'))
process.env.DSH_HOME = home
const { SearchIndex, StateStore, parseSearchRequest } = __test

const SESSIONS = 4
const PER_SESSION = 1500
const TOKENS = 100

function surfaceFor(sessionIndex) {
  const events = []
  for (let index = 0; index < PER_SESSION; index += 1) {
    const token = (sessionIndex * PER_SESSION + index) % TOKENS
    events.push({
      type: 'assistant/message',
      seq: index + 1,
      time: Date.now() - index,
      data: {
        turn: Math.floor(index / 50) + 1,
        step: (index % 50) + 1,
        message: {
          role: 'assistant',
          id: 'm' + sessionIndex + '-' + index,
          content: [
            {
              type: 'text',
              text: ('这是第 ' + index + ' 条文档，token' + token + ' 的正文内容，用于测量物化视图的内存占用。').repeat(4),
            },
          ],
        },
      },
    })
  }
  return { capturedThroughSeq: PER_SESSION, events }
}

const records = Array.from({ length: SESSIONS }, (_, index) => ({
  header: { id: 's' + index, createdAt: Date.now(), cwd: null },
  live: false,
}))
const ctx = {
  sessionQuery: {
    async listSessions() {
      return records
    },
    async readTitleSnapshots(ids) {
      return ids.map((sessionId) => ({ sessionId, status: 'fulfilled', value: { title: { title: 'S ' + sessionId } } }))
    },
    async readSurface(sessionId) {
      return surfaceFor(Number(String(sessionId).slice(1)))
    },
  },
  get() {
    return undefined
  },
}

const store = new StateStore()
await store.load()
const index = new SearchIndex(ctx, store)
index.pool = null
await index.ensureReady()

function cacheBytes() {
  let total = 0
  for (const entry of index.resolvedCache ? index.resolvedCache.values() : []) {
    total += JSON.stringify(entry.payload).length
  }
  return total
}

for (let queryIndex = 0; queryIndex < 100; queryIndex += 1) {
  const request = parseSearchRequest(
    new URLSearchParams({ q: 'token' + (queryIndex % TOKENS), threads: '1', limit: '400' }),
  )
  const payload = await index.search(request)
  const saved = store.recordSearch(request, payload, index.snapshotSeqs())
  for (const dropped of store.droppedIds || []) index.dropResolved(dropped)
  // Touch it like the Client opening the saved page would.
  index.resolveSaved(store.savedSearch(saved.id))
}

if (global.gc) global.gc()
const before = process.memoryUsage()
const snapshotsBefore = store.snapshotCount()
const resolvedBefore = index.resolvedCache ? index.resolvedCache.size : 0
const bytesBefore = cacheBytes()
assert.ok(snapshotsBefore <= 50, 'snapshots above the LRU cap: ' + snapshotsBefore)
assert.ok(resolvedBefore <= 50, 'resolved pages above the LRU cap: ' + resolvedBefore)

// Delete every history row we still have (up to the requested 50).
const ids = Object.keys(store.state.savedSearches).slice(0, 50)
for (const id of ids) {
  store.deleteSaved(id)
  for (const dropped of store.droppedIds || []) index.dropResolved(dropped)
}
await store.saveStateNow()
if (global.gc) global.gc()
const after = process.memoryUsage()
const snapshotsAfter = store.snapshotCount()
const resolvedAfter = index.resolvedCache ? index.resolvedCache.size : 0
const bytesAfter = cacheBytes()

console.log('history rows deleted:', ids.length)
console.log('snapshots:', snapshotsBefore, '->', snapshotsAfter)
console.log('resolved pages:', resolvedBefore, '->', resolvedAfter)
console.log('resolved payload bytes:', bytesBefore, '->', bytesAfter)
console.log('heapUsed MB:', (before.heapUsed / 1048576).toFixed(2), '->', (after.heapUsed / 1048576).toFixed(2))
console.log('rss MB:', (before.rss / 1048576).toFixed(2), '->', (after.rss / 1048576).toFixed(2))

assert.equal(snapshotsAfter, snapshotsBefore - ids.length, 'every deleted row must drop its snapshot')
assert.equal(resolvedAfter, Math.max(0, resolvedBefore - ids.length), 'every deleted row must drop its resolved page')
assert.ok(bytesAfter < bytesBefore, 'resolved payload memory did not shrink')
if (global.gc && bytesBefore > 0) {
  assert.ok(after.heapUsed <= before.heapUsed, 'heap did not shrink after GC')
}

index.dispose()
await fs.rm(home, { recursive: true, force: true })
console.log('flash-anchor memory: ok')
