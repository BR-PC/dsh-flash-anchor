// Mount contracts: bootstrap reads the manifest only, the routing table decides
// what a filter can reach, and a shard is read when (and only when) a request
// needs it. This is the "按需激活索引" mechanism the reader asked for.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'fa-mount-'))
process.env.DSH_HOME = home

const { __test } = await import('./index.js')
const { SearchIndex, StateStore, parseSearchRequest } = __test

const now = Date.now()
function session(id, cwd, events) {
  return { header: { id, createdAt: now, cwd }, capturedThroughSeq: events.length, events }
}
const textOnly = session('s-text', 'D:/w/a', [
  { seq: 1, time: now, data: { turn: 1, message: { role: 'user', id: 'u1', content: [{ type: 'text', text: 'needle in text' }] } } },
  { seq: 2, time: now + 1, data: { turn: 1, step: 1, message: { role: 'assistant', id: 'a1', content: [{ type: 'text', text: 'answer needle' }] } } },
])
const fileOnly = session('s-file', 'D:/w/b', [
  { seq: 1, time: now, data: { turn: 1, message: { role: 'user', id: 'u2', content: [{ type: 'text', text: 'build it' }] } } },
  { seq: 2, time: now + 1, data: { turn: 1, step: 1, message: { role: 'assistant', id: 'a2', content: [
    { type: 'tool-call', id: 'c1', name: 'write_file', arguments: JSON.stringify({ path: 'D:/out/report-needle.md', content: 'x' }) },
  ] } } },
])
const sessions = [textOnly, fileOnly]
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
store.state.autoIndex = true
const index = new SearchIndex(ctx, store)
await index.ensureReady()
await index.startAll()
const docsBefore = index.totalDocs
assert.ok(docsBefore >= 2, 'nothing was indexed')
await store.saveIndex(index.surfaces, null, new Set())

const failures = []
async function check(name, fn) {
  try { await fn() } catch (error) { failures.push(name + ': ' + error.message) }
}

await check('bootstrap reads the manifest only', async () => {
  const fresh = new SearchIndex(ctx, new StateStore())
  await fresh.ensureReady()
  assert.equal(fresh.surfaces.size, 2, 'the manifest lost a session')
  const shells = [...fresh.surfaces.values()].filter((entry) => !Array.isArray(entry.docs))
  assert.equal(shells.length, 2, 'a shard was read before any filter reached it')
  assert.equal(fresh.totalDocs, docsBefore, 'the document count must come from the manifest')
  assert.equal(fresh.mounted.size, 0, 'something mounted at bootstrap')
  fresh.dispose()
})

await check('the routing table narrows a kind-only filter without mounting', async () => {
  const fresh = new SearchIndex(ctx, new StateStore())
  await fresh.ensureReady()
  const fileRoute = fresh.routeIds({ types: ['outputFiles'] }).map((record) => record.header.id)
  assert.deepEqual(fileRoute, ['s-file'], 'a file-only filter routed the wrong sessions: ' + fileRoute)
  // s-file also holds a user message, so it legitimately answers a text filter;
  // what must never happen is routing a session whose metadata cannot match.
  const textRoute = fresh.routeIds({ types: ['modelText'] }).map((record) => record.header.id)
  assert.ok(textRoute.includes('s-text'), 'a text filter dropped the text session: ' + textRoute)
  const toolRoute = fresh.routeIds({ types: ['tools'], workspace: 'D:/w/a' }).map((record) => record.header.id)
  assert.deepEqual(toolRoute, [], 'a session without a single tool document was routed: ' + toolRoute)
  const allRoute = fresh.routeIds({ types: ['modelText', 'outputFiles'] }).map((record) => record.header.id).sort()
  assert.deepEqual(allRoute, ['s-file', 's-text'], 'asking for both classes must keep every session')
  assert.equal(fresh.mounted.size, 0, 'routing mounted something')
  fresh.dispose()
})

await check('a scoped search mounts only what it reaches', async () => {
  const fresh = new SearchIndex(ctx, new StateStore())
  await fresh.ensureReady()
  const payload = await fresh.search(parseSearchRequest(new URLSearchParams('q=needle&types=outputFiles&scope=s-file')))
  assert.ok(payload.total > 0, 'the file hit disappeared: ' + payload.total)
  assert.equal(fresh.mounted.has('s-file'), true, 'the reached session was not mounted')
  assert.equal(fresh.mounted.has('s-text'), false, 'an unreached session was mounted')
  fresh.dispose()
})

await check('trimming releases documents but keeps the manifest counts', async () => {
  const fresh = new SearchIndex(ctx, new StateStore())
  await fresh.ensureReady()
  await fresh.search(parseSearchRequest(new URLSearchParams('q=needle&types=modelText')))
  assert.equal(fresh.mounted.size, 1)
  const record = fresh.recordById.get('s-file')
  await fresh.mountFor([record], { keep: 1 })
  assert.equal(Array.isArray(fresh.surfaces.get('s-text').docs), false, 'the released shard kept its documents')
  assert.equal(fresh.totalDocs, docsBefore, 'releasing changed the document count')
  fresh.dispose()
})

await check('a missing shard drops the shell instead of answering from nothing', async () => {
  const fresh = new SearchIndex(ctx, new StateStore())
  await fresh.ensureReady()
  await fs.rm(fresh.store.sessionIndexFile('s-text'), { force: true })
  const ok = await fresh.mountEntry('s-text')
  assert.equal(ok, false, 'a missing shard reported a successful mount')
  assert.equal(fresh.surfaces.has('s-text'), false, 'the dead shell stayed in the manifest view')
  fresh.dispose()
})

index.dispose()
// Let the debounced state writer finish before the directory disappears.
await store.close()
await fs.rm(home, { recursive: true, force: true })
if (failures.length > 0) {
  console.log('flash-anchor mount contracts: ' + failures.length + ' FAILURES')
  for (const failure of failures) console.log('  FAIL ' + failure)
  process.exit(1)
}
console.log('flash-anchor mount contracts: ok')
