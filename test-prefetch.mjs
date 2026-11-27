// Prefetch contracts: the filter set decides which shards are decoded ahead of
// time, a search never waits for that decode, and switching filters releases
// what the new set no longer needs.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'fa-prefetch-'))
process.env.DSH_HOME = home

const { __test } = await import('./index.js')
const { SearchIndex, StateStore, parseSearchRequest } = __test

const now = Date.now()
function session(id, cwd, blocks) {
  const events = [{ seq: 1, time: now, data: { turn: 1, message: { role: 'user', id: 'u-' + id, content: [{ type: 'text', text: 'needle ' + id }] } } }]
  blocks.forEach((content, index) => {
    events.push({ type: 'assistant/message', seq: index + 2, time: now + index, data: { turn: 1, step: index, message: { role: 'assistant', id: 'a-' + id + '-' + index, content } } })
  })
  return { header: { id, createdAt: now, cwd }, capturedThroughSeq: events.length, events }
}
const sessions = [
  session('s-text', 'D:/w/a', [{ type: 'text', text: 'needle alpha' }]),
  session('s-file', 'D:/w/b', [{ type: 'tool-call', id: 'c1', name: 'write_file', arguments: JSON.stringify({ path: 'D:/o/needle.md', content: 'x' }) }]),
  session('s-other', 'D:/w/c', [{ type: 'text', text: 'needle gamma' }]),
]
const byId = new Map(sessions.map((entry) => [entry.header.id, entry]))
const ctx = {
  sessionQuery: {
    async listSessions() { return sessions.map(({ header }) => ({ header, live: false, persisted: true })) },
    async readTitleSnapshots(ids) { return ids.map((sessionId) => ({ sessionId, status: 'fulfilled', value: { title: { title: sessionId } } })) },
    async readSurface(id) { return byId.get(id) },
  },
  get() { return undefined },
}

const store = new StateStore()
await store.load()
const index = new SearchIndex(ctx, store)
await index.ensureReady()
await index.startAll()
await store.saveIndex(index.surfaces, null, new Set())

const failures = []
async function check(name, fn) {
  try { await fn() } catch (error) { failures.push(name + ': ' + error.message) }
}
const settle = async (tries = 200) => {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (index.prefetch.state !== 'running') return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('prefetch never settled')
}

await check('the remembered filter set is preloaded on boot, not the whole corpus', async () => {
  const fresh = new SearchIndex(ctx, new StateStore())
  await fresh.ensureReady()
  assert.equal(fresh.mounted.size, 0, 'bootstrap mounted something')
  fresh.prefetch({ scope: 's-text', workspace: '', types: undefined }, { debounce: 0 })
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (fresh.prefetchState.state === 'ready') break
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.equal(fresh.prefetchState.state, 'ready')
  assert.equal(fresh.mounted.has('s-text'), true, 'the selected session was not preloaded')
  assert.equal(fresh.mounted.has('s-other'), false, 'a session outside the filter was preloaded')
  assert.equal(fresh.prefetchState.total, 1)
  fresh.dispose()
})

await check('switching filters releases the shards the new set does not need', async () => {
  const fresh = new SearchIndex(ctx, new StateStore())
  await fresh.ensureReady()
  fresh.prefetch({ scope: 'all', workspace: 'D:/w/a', types: undefined }, { debounce: 0 })
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (fresh.prefetchState.state === 'ready') break
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.equal(fresh.mounted.has('s-text'), true, 'first filter not preloaded: ' + JSON.stringify(fresh.prefetchState))
  fresh.prefetch({ scope: 'all', workspace: 'D:/w/c', types: undefined }, { debounce: 0 })
  // The state is already 'ready' from the first pass, so wait for the RESULT:
  // the new selection must be resident and the old one gone.
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (fresh.mounted.has('s-other') && !fresh.mounted.has('s-text')) break
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.equal(fresh.mounted.has('s-other'), true, 'the new filter was not preloaded: ' + JSON.stringify(fresh.prefetchState) + ' mounted=' + [...fresh.mounted.keys()].join(','))
  assert.equal(fresh.mounted.has('s-text'), false, 'a shard outside the new filter stayed resident')
  fresh.dispose()
})

await check('a search never waits for a pending prefetch', async () => {
  const fresh = new SearchIndex(ctx, new StateStore())
  await fresh.ensureReady()
  // A long debounce keeps the preload queued; the search must still answer.
  fresh.prefetch({ scope: 'all', workspace: '', types: undefined }, { debounce: 5_000 })
  const started = Date.now()
  const payload = await fresh.search(parseSearchRequest(new URLSearchParams('q=needle&limit=400')))
  assert.ok(Date.now() - started < 2_000, 'the search waited for the preload')
  assert.ok(payload.total > 0, 'the search answered nothing')
  fresh.dispose()
})

await check('an un-preloaded shard is mounted inline and recorded as a miss', async () => {
  const fresh = new SearchIndex(ctx, new StateStore())
  await fresh.ensureReady()
  const payload = await fresh.search(parseSearchRequest(new URLSearchParams('q=needle&scope=s-file&limit=400')))
  assert.ok(payload.total > 0, 'a scoped search answered nothing')
  assert.equal(fresh.mounted.has('s-file'), true, 'the search did not mount what it needed')
  // A miss is a diagnostic, not a wait: the answer came back in this call.
  assert.equal(fresh.prefetchState.state, 'idle')
  fresh.dispose()
})

index.dispose()
await fs.rm(home, { recursive: true, force: true })
if (failures.length > 0) {
  console.log('flash-anchor prefetch contracts: ' + failures.length + ' FAILURES')
  for (const failure of failures) console.log('  FAIL ' + failure)
  process.exit(1)
}
console.log('flash-anchor prefetch contracts: ok')
