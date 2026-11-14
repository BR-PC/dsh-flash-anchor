// v1.7 contracts: lazy index reports pending work, a filter-only search is a
// search, workspace narrows sessions, long documents live in their own index,
// file names are searchable, and a narrower filter reuses a saved page instead
// of rescanning the corpus.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'fa-v17-'))
process.env.DSH_HOME = home

const { __test } = await import('./index.js')
const { SearchIndex, StateStore, parseSearchRequest } = __test

const now = Date.now()
const LONG_TEXT = 'L'.repeat(30_000) + ' NEONTAIL ' + 'x'.repeat(400)

function makeSession(id, cwd, blocks) {
  const events = [
    { seq: 1, time: now, data: { turn: 1, message: { role: 'user', id: 'u-' + id, content: [{ type: 'text', text: 'alpha request for ' + id }] } } },
    { seq: 2, time: now + 1, data: { turn: 1, step: 1, message: { role: 'assistant', id: 'a-' + id, content: blocks } } },
  ]
  return { header: { id, createdAt: now, cwd }, events, capturedThroughSeq: 2 }
}

const sessions = [
  makeSession('w-a', 'D:/work/a', [
    { type: 'text', text: 'alpha answer in workspace a' },
    { type: 'tool-call', id: 'c1', name: 'screenshot', arguments: JSON.stringify({ path: 'C:/shots/\u9762\u677f.png' }) },
  ]),
  makeSession('w-a2', 'D:/work/a', [{ type: 'text', text: 'alpha second answer in a' }]),
  makeSession('w-b', 'D:/work/b', [
    { type: 'text', text: 'alpha answer in workspace b' },
    { type: 'text', text: LONG_TEXT },
  ]),
]
const byId = new Map(sessions.map((session) => [session.header.id, session]))
const ctx = {
  sessionQuery: {
    async listSessions() {
      return sessions.map(({ header }) => ({ header, live: false, persisted: true }))
    },
    async readTitleSnapshots(ids) {
      return ids.map((sessionId) => ({ sessionId, status: 'fulfilled', value: { title: { title: 'T ' + sessionId } } }))
    },
    async readSurface(id) {
      return byId.get(id)
    },
  },
}
const store = new StateStore()
await store.load()
store.state.autoIndex = true
const index = new SearchIndex(ctx, store)
await index.ensureReady()
await index.listSessions()
await index.startAll()

const failures = []
async function check(name, fn) {
  try {
    await fn()
  } catch (error) {
    failures.push(name + ': ' + error.message)
  }
}

await check('filter-only search', async () => {
  const payload = await index.search(parseSearchRequest(new URLSearchParams('types=modelText&limit=400')))
  assert.ok(payload.items.length >= 4, 'expected every modelText document, got ' + payload.items.length)
  assert.ok(payload.items.every((item) => item.kind === 'modelText'), 'the type filter leaked')
})

await check('workspace filter', async () => {
  const payload = await index.search(parseSearchRequest(new URLSearchParams('q=alpha&workspace=D:/work/a&limit=400')))
  assert.ok(payload.items.length > 0, 'workspace filter returned nothing')
  assert.ok(payload.items.every((item) => item.cwd === 'D:/work/a'), 'a hit came from another workspace')
  assert.equal((await index.search(parseSearchRequest(new URLSearchParams('q=alpha&workspace=D:/work/zzz')))).total, 0)
})

await check('workspaces listing', async () => {
  const list = index.workspaces()
  assert.deepEqual(list.map((entry) => entry.cwd).sort(), ['D:/work/a', 'D:/work/b'])
  assert.equal(list.find((entry) => entry.cwd === 'D:/work/a').sessions, 2)
})

await check('file name search', async () => {
  const payload = await index.search(parseSearchRequest(new URLSearchParams('q=\u9762\u677f.png&limit=400')))
  const file = payload.items.find((item) => item.kind === 'outputFiles')
  assert.ok(file, 'a file produced by a screenshot tool was not indexed')
  assert.equal(file.name, '\u9762\u677f.png')
})

await check('long docs are out of the ordinary index', async () => {
  const payload = await index.search(parseSearchRequest(new URLSearchParams('q=NEONTAIL&limit=400')))
  assert.equal(payload.total, 0, 'the long tail must not be in the ordinary index')
})

await check('long search finds the tail', async () => {
  const payload = await index.search(parseSearchRequest(new URLSearchParams('q=NEONTAIL&long=1&limit=400')))
  assert.equal(payload.total, 1, 'long search did not find the tail')
  assert.equal(payload.items[0].long, true)
})

await check('long index count', async () => {
  const status = index.status()
  assert.ok(status.longDocs > 0, 'the long index is empty')
  assert.equal(status.longSessions, 1)
})

await check('narrowing reuses a saved page', async () => {
  const wide = await index.search(parseSearchRequest(new URLSearchParams('q=alpha&limit=400')))
  const wideRequest = parseSearchRequest(new URLSearchParams('q=alpha&limit=400'))
  store.recordSearch(wideRequest, wide, index.snapshotSeqs())
  const narrowRequest = parseSearchRequest(new URLSearchParams('q=alpha&types=modelText&limit=400'))
  assert.equal(store.matchSaved(narrowRequest), null, 'a different filter set must not match exactly')
  const related = store.findRelatedSaved(narrowRequest)
  assert.ok(related, 'a narrower filter set must find the wider page')
  const narrowed = index.resolveSaved(related, narrowRequest)
  assert.ok(narrowed, 'the narrower page did not resolve')
  assert.ok(narrowed.items.length > 0, 'narrowing dropped everything')
  assert.ok(narrowed.items.every((item) => item.kind === 'modelText'), 'narrowing leaked another kind')
  assert.equal(narrowed.narrowed, true)
})

await check('one history row per filter set', async () => {
  const first = parseSearchRequest(new URLSearchParams('q=alpha&types=modelText&sort=relevance'))
  const second = parseSearchRequest(new URLSearchParams('q=alpha&types=modelText&sort=time'))
  store.recordSearch(first, { total: 1, items: [], sessions: [] })
  store.recordSearch(second, { total: 1, items: [], sessions: [] })
  const rows = store.state.history.filter(
    (item) => item.query === 'alpha' && item.types.length === 1 && item.types[0] === 'modelText',
  )
  assert.equal(rows.length, 2, 'the sort must be part of the row key')
})

await check('lazy status', async () => {
  const status = index.status()
  assert.equal(status.pending, 0, 'every session is indexed after startAll')
  assert.ok(status.ready === true)
})

await fs.rm(home, { recursive: true, force: true })
if (failures.length > 0) {
  console.log('v1.7 contracts: ' + failures.length + ' FAILURES')
  for (const failure of failures) console.log('  FAIL ' + failure)
  process.exit(1)
}
console.log('flash-anchor v1.7 contracts: ok')
