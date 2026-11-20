// Archive contracts: a Session the Workspace archived must leave the index, the
// cache pages and the history — and come back when it is unarchived.
//
// The set is delivered by the Workspace controller's follow stream. Reading
// `workspaceRegistry.archivedSessionIds` (what the Host used to do) can never
// work: that service has archive/unarchive methods but no accessor, so the set
// was always empty and archiving silently did nothing.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'fa-archive-'))
process.env.DSH_HOME = home

const { __test } = await import('./index.js')
const { SearchIndex, StateStore, parseSearchRequest } = __test

const now = Date.now()
function makeSession(id, cwd, text) {
  return {
    header: { id, createdAt: now, cwd },
    capturedThroughSeq: 2,
    events: [
      { seq: 1, time: now, data: { turn: 1, message: { role: 'user', id: 'u-' + id, content: [{ type: 'text', text: 'question ' + id }] } } },
      { seq: 2, time: now + 1, data: { turn: 1, step: 1, message: { role: 'assistant', id: 'a-' + id, content: [{ type: 'text', text }] } } },
    ],
  }
}

const sessions = [
  makeSession('keep-1', 'D:/w/a', 'ALPHAONE kept first session'),
  makeSession('keep-2', 'D:/w/a', 'ALPHATWO kept second session'),
  makeSession('arch-1', 'D:/w/b', 'ARCHIVEDTOKEN hidden session'),
]
const byId = new Map(sessions.map((session) => [session.header.id, session]))

// A follow stream the test drives by hand: a baseline, then increments.
function frameStream() {
  const frames = []
  const waiters = []
  return {
    push(frame) {
      if (waiters.length > 0) waiters.shift()(frame)
      else frames.push(frame)
    },
    close() {
      for (const waiter of waiters.splice(0)) waiter(null)
    },
    async *follow(signal) {
      for (;;) {
        if (signal && signal.aborted) return
        if (frames.length === 0) {
          const frame = await new Promise((resolve) => {
            waiters.push(resolve)
            if (signal) signal.addEventListener('abort', () => resolve(null), { once: true })
          })
          if (frame === null) return
          yield frame
          continue
        }
        yield frames.shift()
      }
    },
  }
}

const stream = frameStream()
const ctx = {
  sessionQuery: {
    async listSessions() {
      return sessions.map(({ header }) => ({ header, live: false, persisted: true }))
    },
    async readTitleSnapshots(ids) {
      return ids.map((sessionId) => ({ sessionId, status: 'fulfilled', value: { title: { title: 'T ' + sessionId } } }))
    },
    async readSurface(id) {
      const found = byId.get(id)
      if (!found) throw new Error('unknown session ' + id)
      return found
    },
  },
  get(name) {
    if (name === 'workspaceController') return { follow: (signal) => stream.follow(signal) }
    return undefined
  },
}

const store = new StateStore()
await store.load()
store.state.autoIndex = true
// A history row and a cached page that point at the session about to be archived.
const archivedRequest = parseSearchRequest(new URLSearchParams('q=ARCHIVEDTOKEN&scope=arch-1'))
const archivedRow = store.recordSearch(
  archivedRequest,
  { total: 1, items: [], sessions: [{ id: 'arch-1' }], pending: 0, signature: archivedRequest.sig },
  {},
)

const index = new SearchIndex(ctx, store)
await index.ensureReady()

const failures = []
async function check(name, fn) {
  try {
    await fn()
  } catch (error) {
    failures.push(name + ': ' + error.message)
  }
}

async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('timed out waiting for ' + label)
}

async function search(params) {
  return index.search(parseSearchRequest(new URLSearchParams(params)))
}

await check('baseline archive set filters the listing', async () => {
  assert.equal(index.records.length, 3, 'all sessions should be listed before the baseline')
  stream.push({ type: 'baseline', value: { items: [], archivedSessionIds: ['arch-1'], pinnedSessionIds: [] } })
  await waitFor(() => index.records.length === 2, 'the archived session to leave the listing')
  assert.equal(index.status().archived, 1)
  assert.equal(index.status().archivedSource, 'follow')
  assert.equal(index.recordById.has('arch-1'), false, 'the archived session is still addressable')
})

await check('archived session is not searchable', async () => {
  const payload = await search('q=ARCHIVEDTOKEN&limit=400')
  assert.equal(payload.total, 0, 'a hit pointed at an archived session')
  assert.equal(payload.items.length, 0)
})

await check('archived session loses its cached documents', async () => {
  // Index it first so the removal path has something to remove.
  index.noteUnarchived('arch-1')
  await waitFor(() => index.records.length === 3, 'the session to come back')
  const before = await search('q=ARCHIVEDTOKEN&limit=400')
  assert.ok(before.total > 0, 'the unarchived session did not index')
  assert.ok(index.surfaces.has('arch-1'), 'no surface to drop')
  index.noteArchived('arch-1')
  await waitFor(() => !index.surfaces.has('arch-1'), 'the cached surface to be dropped')
  const after = await search('q=ARCHIVEDTOKEN&limit=400')
  assert.equal(after.total, 0, 'the archived document is still in the corpus')
  assert.ok(index.removedSessions.has('arch-1'), 'the shard was not scheduled for deletion')
})

await check('history and cached pages of an archived session are dropped', async () => {
  assert.equal(
    store.state.history.some((row) => row.scope === 'arch-1'),
    false,
    'a history row survived the archive',
  )
  assert.equal(store.savedSearch(archivedRow.id), null, 'the cached page of the archived session survived')
  assert.equal(
    Object.values(store.state.savedSearches).some((saved) => String(saved?.request?.scope || '') === 'arch-1'),
    false,
    'a cached page survived the archive',
  )
})

await check('a live archive event hides the session at once', async () => {
  const before = await search('q=ALPHAONE&limit=400')
  assert.ok(before.total > 0, 'the session should be searchable before archiving')
  index.noteArchived('keep-1')
  await waitFor(() => !index.records.some((record) => record.header.id === 'keep-1'), 'the event archive to filter the listing')
  const after = await search('q=ALPHAONE&limit=400')
  assert.equal(after.total, 0, 'the archived session still answered')
  assert.equal(after.items.some((item) => item.sessionId === 'keep-1'), false)
})

await check('scope of an archived session reads as a missing session', async () => {
  const payload = await search('q=ALPHAONE&scope=keep-1&limit=400')
  assert.equal(payload.total, 0)
  assert.equal(payload.items.length, 0)
})

await check('unarchiving brings the session back', async () => {
  index.noteUnarchived('keep-1')
  await waitFor(() => index.records.some((record) => record.header.id === 'keep-1'), 'the session to be restored')
  const payload = await search('q=ALPHAONE&limit=400')
  assert.ok(payload.total > 0, 'the restored session was not reindexed on demand')
  assert.equal(index.status().archived, 1, 'the archive set did not shrink')
})

await check('a frame without archive information leaves the set alone', async () => {
  const before = index.status().archived
  stream.push({ type: 'pinned', pinnedSessionIds: ['keep-2'] })
  stream.push({ type: 'order', workspaceIds: ['w-1'] })
  stream.push({ type: 'upsert', workspace: { workspaceId: 'w-1', path: 'D:/w/a', title: 'a', sessionIds: [], createdAt: '', updatedAt: '' } })
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(index.status().archived, before, 'an unrelated frame changed the archive set')
})

await check('a replace frame sets the whole set', async () => {
  stream.push({ type: 'replace', value: { items: [], archivedSessionIds: ['keep-2'], pinnedSessionIds: [] } })
  await waitFor(() => index.archived.has('keep-2') && !index.archived.has('keep-1'), 'the replaced archive set')
  const payload = await search('q=ALPHATWO&limit=400')
  assert.equal(payload.total, 0, 'the replaced-in session is still searchable')
})

await check('dropArchived=false keeps the data but still hides it', async () => {
  store.state.dropArchived = false
  index.noteUnarchived('keep-2')
  await waitFor(() => index.records.some((record) => record.header.id === 'keep-2'), 'the session to return')
  const before = await search('q=ALPHATWO&limit=400')
  assert.ok(before.total > 0, 'sanity: the session should be searchable again')
  const kept = index.surfaces.size
  index.noteArchived('keep-2')
  await waitFor(() => !index.records.some((record) => record.header.id === 'keep-2'), 'the session to be hidden')
  const after = await search('q=ALPHATWO&limit=400')
  assert.equal(after.total, 0, 'a hidden session answered a search')
  assert.equal(index.surfaces.size, kept, 'dropArchived=false deleted the cached documents anyway')
})

await check('deleting a session takes both of its shards', async () => {
  const id = 'arch-1'
  await fs.mkdir(store.indexDir, { recursive: true })
  await fs.mkdir(store.longDir, { recursive: true })
  await fs.writeFile(store.sessionIndexFile(id), 'shard')
  await fs.writeFile(store.sessionLongFile(id), 'long shard')
  await store.saveIndex(new Map(), new Set(), new Set([id]))
  const gone = (file) => fs.access(file).then(() => false, () => true)
  assert.equal(await gone(store.sessionIndexFile(id)), true, 'the index shard survived removal')
  assert.equal(await gone(store.sessionLongFile(id)), true, 'the long shard survived removal')
})

await check('long shards nobody owns are pruned, owned ones are kept', async () => {
  await fs.mkdir(store.longDir, { recursive: true })
  const orphan = store.sessionLongFile('gone-forever')
  const ownedLive = store.sessionLongFile('keep-2')
  const ownedUnindexed = store.sessionLongFile('arch-1')
  const ownedIndexed = [...index.surfaces.keys()][0]
  const ownedIndexedFile = ownedIndexed ? store.sessionLongFile(ownedIndexed) : null
  await fs.writeFile(orphan, 'orphan')
  await fs.writeFile(ownedLive, 'kept')
  await fs.writeFile(ownedUnindexed, 'kept')
  if (ownedIndexedFile) await fs.writeFile(ownedIndexedFile, 'kept')
  await index.pruneOrphanLongShards()
  const gone = (file) => fs.access(file).then(() => false, () => true)
  assert.equal(await gone(orphan), true, 'an orphan long shard survived the sweep')
  assert.equal(await gone(ownedLive), false, 'a listed session lost its long shard')
  assert.equal(await gone(ownedUnindexed), false, 'an archived-but-known session lost its long shard')
  if (ownedIndexedFile) assert.equal(await gone(ownedIndexedFile), false, 'an indexed session lost its long shard')
})

stream.close()
await fs.rm(home, { recursive: true, force: true })
if (failures.length > 0) {
  console.log('flash-anchor archive contracts: ' + failures.length + ' FAILURES')
  for (const failure of failures) console.log('  FAIL ' + failure)
  process.exit(1)
}
console.log('flash-anchor archive contracts: ok')
