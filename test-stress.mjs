import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-deepsearch-stress-'))
process.env.DSH_HOME = home

const { __test } = await import('./index.js')
const { SearchIndex, StateStore, parseSearchRequest } = __test

const SESSIONS = 17
const TURNS = 60
const now = Date.now()

function makeEvents(sessionIndex) {
  const events = []
  let seq = 1
  const tag = 's' + sessionIndex
  for (let turn = 1; turn <= TURNS; turn += 1) {
    const time = now - (SESSIONS - sessionIndex) * 1e7 - turn * 1000
    events.push({
      seq: seq++,
      time,
      data: {
        turn,
        message: { role: 'user', id: 'u-' + tag + '-' + turn, content: [{ type: 'text', text: 'deploy ' + tag + ' turn ' + turn + ' please review' }] },
      },
    })
    events.push({
      seq: seq++,
      time: time + 10,
      data: {
        turn,
        step: 1,
        message: {
          role: 'assistant',
          id: 'a-' + tag + '-' + turn,
          content: [
            { type: 'reasoning', text: 'thinking about deploy for ' + tag + ' at turn ' + turn },
            { type: 'text', text: 'deploy answer ' + tag + ' number ' + turn + ' with details' },
            { type: 'tool-call', id: 'call-' + tag + '-' + turn, name: 'write_file', arguments: JSON.stringify({ path: 'out/' + tag + '-' + turn + '.md' }) },
          ],
        },
      },
    })
    events.push({
      seq: seq++,
      time: time + 20,
      data: {
        turn,
        step: 1,
        message: { role: 'tool', id: 't-' + tag + '-' + turn, toolCallId: 'call-' + tag + '-' + turn, content: [{ type: 'text', text: 'Presented out/' + tag + '-' + turn + '.md' }] },
      },
    })
  }
  return { events, capturedThroughSeq: seq }
}

const surfaces = new Map()
const records = []
for (let i = 0; i < SESSIONS; i += 1) {
  const id = 'sess-' + i
  surfaces.set(id, makeEvents(i))
  records.push({
    header: { id, createdAt: now - (SESSIONS - i) * 1e7, cwd: 'D:/work/' + id },
    live: false,
    persisted: true,
  })
}

const ctx = {
  sessionQuery: {
    listSessions: async () => records,
    readTitleSnapshots: async (ids) =>
      ids.map((sessionId) => ({ status: 'fulfilled', sessionId, value: { title: { title: 'Session ' + sessionId } } })),
    readSurface: async (id) => surfaces.get(id),
  },
}
const store = new StateStore()
const index = new SearchIndex(ctx, store)
await index.ensureReady()
await index.startAll()
while (index.status().running) await new Promise((resolve) => setTimeout(resolve, 20))

const status = index.status()
assert.equal(status.sessions, SESSIONS)
assert.ok(status.docs >= 6000, 'expected 6000+ docs, got ' + status.docs)
console.log('indexed', status.docs, 'docs across', status.sessions, 'sessions')

const base = { q: 'deploy', scope: null, types: ['reasoning', 'modelText', 'tools', 'userText', 'outputFiles'], exts: [], sort: 'relevance', limit: 400 }

const coldStart = Date.now()
const first = await index.search(base)
const coldMs = Date.now() - coldStart
assert.equal(first.total, SESSIONS * TURNS * 3, 'unexpected total ' + first.total)
assert.equal(first.items.length, 400)

const warmStart = Date.now()
const second = await index.search(base)
const warmMs = Date.now() - warmStart
assert.equal(second.total, first.total)
assert.ok(warmMs < 900, 'warm search took ' + warmMs + 'ms')
console.log('cold', coldMs + 'ms', 'warm', warmMs + 'ms', 'total', first.total)

// relevance order must be non-increasing
const scores = second.items.map((item) => item.score)
for (let i = 1; i < scores.length; i += 1) assert.ok(scores[i - 1] >= scores[i], 'relevance order broken at ' + i)

// scope isolation
const scoped = await index.search({ ...base, scope: 'sess-3' })
assert.equal(scoped.total, TURNS * 3)
assert.ok(scoped.items.every((item) => item.sessionId === 'sess-3'))

// type filter
const modelOnly = await index.search({ ...base, types: ['modelText'] })
assert.equal(modelOnly.total, SESSIONS * TURNS)
assert.ok(modelOnly.items.every((item) => item.kind === 'modelText'))

// time ordering, both directions
const newest = await index.search({ ...base, sort: 'time' })
const oldest = await index.search({ ...base, sort: 'time-asc' })
for (let i = 1; i < newest.items.length; i += 1) assert.ok(newest.items[i - 1].time >= newest.items[i].time, 'time sort broken')
for (let i = 1; i < oldest.items.length; i += 1) assert.ok(oldest.items[i - 1].time <= oldest.items[i].time, 'time-asc sort broken')
assert.notEqual(newest.items[0].id, oldest.items[0].id)

// file suffix filter only applies to file hits
const mdOnly = await index.search({ ...base, q: '', types: ['outputFiles'], exts: ['md'] })
assert.ok(mdOnly.total > 0)
assert.ok(mdOnly.items.every((item) => item.kind === 'outputFiles'))
const pngOnly = await index.search({ ...base, q: '', types: ['outputFiles'], exts: ['png'] })
assert.equal(pngOnly.total, 0)

// every filter permutation stays consistent and bounded
const typeSets = [['reasoning'], ['modelText'], ['tools'], ['userText'], ['outputFiles'], ['reasoning', 'modelText'], ['reasoning', 'modelText', 'tools', 'userText', 'outputFiles']]
const sorts = ['relevance', 'time', 'time-asc']
let combos = 0
let slowest = 0
for (const scope of [null, 'sess-0', 'sess-16', 'missing-session']) {
  for (const types of typeSets) {
    for (const sort of sorts) {
      const started = Date.now()
      const result = await index.search({ ...base, scope, types, sort })
      const took = Date.now() - started
      slowest = Math.max(slowest, took)
      combos += 1
      assert.ok(result.items.length <= 400)
      assert.ok(result.items.every((item) => types.includes(item.kind)), 'type leak in ' + JSON.stringify({ scope, types, sort }))
      if (scope === 'missing-session') assert.equal(result.total, 0)
      if (scope && scope !== 'missing-session') assert.ok(result.items.every((item) => item.sessionId === scope))
    }
  }
}
console.log('filter permutations', combos, 'slowest', slowest + 'ms')
assert.ok(slowest < 1200, 'slowest search ' + slowest + 'ms')

// history keeps exactly one row per query no matter how the filters change
const requests = [
  parseSearchRequest(new URLSearchParams('q=deploy&types=modelText&sort=relevance')),
  parseSearchRequest(new URLSearchParams('q=deploy&types=reasoning&sort=time')),
  parseSearchRequest(new URLSearchParams('q=deploy&types=tools&sort=time-asc&ext=md')),
  parseSearchRequest(new URLSearchParams('q=other query&types=modelText')),
]
for (const request of requests) store.recordSearch(request, { total: 1, items: [], sessions: [] })
assert.equal(store.state.history.filter((item) => item.query === 'deploy').length, 1)
assert.equal(store.state.history.length, 2)
const deployEntry = store.state.history.find((item) => item.query === 'deploy')
assert.equal(store.savedSearch(deployEntry.id).request.sort, 'time-asc')
await store.saveStateNow()

const reopened = new StateStore()
await reopened.load()
assert.equal(reopened.state.history.filter((item) => item.query === 'deploy').length, 1)
assert.equal(reopened.state.history.length, 2)

reopened.deleteSaved(deployEntry.id)
assert.equal(reopened.state.history.some((item) => item.query === 'deploy'), false)
assert.equal(reopened.savedSearch(deployEntry.id), null)

// prefs round-trip is what restores the previous result page
reopened.setPrefs({ resultsOpen: true, savedId: deployEntry.id, types: ['tools'], sort: 'time', timeOrder: 'asc' })
await reopened.saveStateNow()
const third = new StateStore()
await third.load()
assert.equal(third.state.prefs.resultsOpen, true)
assert.deepEqual(third.state.prefs.types, ['tools'])

await fs.rm(home, { recursive: true, force: true })
console.log('deepsearch stress: ok')
