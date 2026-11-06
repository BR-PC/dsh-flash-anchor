import assert from 'node:assert/strict'
import { __test } from './index.js'

const { SearchIndex, parseSearchRequest, extractFilePaths } = __test
const now = Date.now()

const records = [
  {
    header: { id: 's-alpha', createdAt: now - 60_000, cwd: 'D:\\work\\alpha' },
    live: false,
    persisted: true,
  },
  {
    header: { id: 's-beta', createdAt: now - 120_000, cwd: 'D:\\work\\beta' },
    live: false,
    persisted: true,
  },
]

const events = [
  {
    type: 'user/message',
    seq: 1,
    time: now - 50_000,
    data: {
      id: 'user-1',
      role: 'user',
      source: { kind: 'user' },
      content: [
        { type: 'text', text: '请帮我检查构建错误 zeta-token' },
        { type: 'file', attachment: { name: 'input-spec.pdf', bytes: 12 } },
      ],
    },
  },
  {
    type: 'assistant/message',
    seq: 2,
    time: now - 40_000,
    data: {
      turn: 1,
      step: 1,
      message: {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'reasoning zeta-token analysis' },
          { type: 'text', text: 'final answer zeta-token' },
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'present',
            arguments: JSON.stringify({ files: [{ path: 'C:\\out\\report.pdf', description: 'report' }], note: 'zeta-token' }),
          },
          { type: 'file', attachment: { name: 'chart.PNG', bytes: 99 } },
        ],
      },
    },
  },
  {
    type: 'tool/result',
    seq: 3,
    time: now - 30_000,
    data: {
      turn: 1,
      step: 1,
      message: {
        role: 'tool',
        toolCallId: 'call-1',
        content: [{ type: 'text', text: 'Presented C:\\out\\report.pdf\ntool result zeta-token' }],
      },
    },
  },
]

const betaEvents = [
  {
    type: 'user/message',
    seq: 1,
    time: now - 110_000,
    data: { id: 'user-2', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'beta only keyword' }] },
  },
]

const ctx = {
  sessionQuery: {
    async listSessions() {
      return records
    },
    async readTitleSnapshots(ids) {
      return ids.map((sessionId) => ({
        sessionId,
        status: 'fulfilled',
        value: { title: { title: sessionId === 's-alpha' ? 'Alpha session' : 'Beta session' } },
      }))
    },
    async readSurface(sessionId) {
      return {
        capturedThroughSeq: sessionId === 's-alpha' ? 3 : 1,
        events: sessionId === 's-alpha' ? events : betaEvents,
      }
    },
  },
  get() {
    return undefined
  },
}

const store = {
  state: { revision: 0, autoIndex: false, prefs: {}, history: [], savedSearches: {} },
  async load() {},
  async loadIndex() { return null },
  bumpRevision() { this.state.revision += 1 },
  saveStateSoon() {},
  async saveIndex() {},
}
const index = new SearchIndex(ctx, store)
const listed = await index.listSessions()
assert.equal(listed.total, 2)
assert.equal(listed.sessions[0].title, 'Alpha session')

const all = await index.search(parseSearchRequest(new URLSearchParams({ q: 'zeta-token' })))
assert.ok(all.total >= 4, `expected at least four zeta hits, got ${all.total}`)
assert.ok(all.items.some((item) => item.kind === 'reasoning'))
assert.ok(all.items.some((item) => item.kind === 'modelText'))
assert.ok(all.items.some((item) => item.kind === 'userText'))
assert.ok(all.items.some((item) => item.kind === 'tools' && item.subtype === 'call'))
assert.ok(all.items.some((item) => item.kind === 'tools' && item.subtype === 'result' && item.toolName === 'present'))
assert.equal(all.sessions.length, 1)
assert.ok(all.items.every((item) => item.turn === 1))

const bodyOnly = await index.search(parseSearchRequest(new URLSearchParams({ q: 'zeta-token', types: 'modelText' })))
assert.ok(bodyOnly.items.length > 0)
assert.ok(bodyOnly.items.every((item) => item.kind === 'modelText'), 'modelText filter leaked another kind')
const userOnly = await index.search(parseSearchRequest(new URLSearchParams({ q: 'zeta-token', types: 'userText' })))
assert.ok(userOnly.items.every((item) => item.kind === 'userText'), 'userText filter leaked another kind')

const reasoningOnly = await index.search(
  parseSearchRequest(new URLSearchParams({ q: 'zeta-token', types: 'reasoning' })),
)
assert.equal(reasoningOnly.total, 1)
assert.equal(reasoningOnly.items[0].kind, 'reasoning')

const files = await index.search(parseSearchRequest(new URLSearchParams({ ext: 'png' })))
assert.ok(files.items.some((item) => item.kind === 'outputFiles' && /chart\.PNG/i.test(item.snippet)))
assert.ok(files.items.every((item) => item.kind === 'outputFiles' || item.kind === 'inputFiles'))

const inputPdf = await index.search(parseSearchRequest(new URLSearchParams({ ext: 'pdf', types: 'inputFiles' })))
assert.ok(inputPdf.items.some((item) => /input-spec\.pdf/i.test(item.snippet)))

const pdf = await index.search(parseSearchRequest(new URLSearchParams({ ext: '.pdf', types: 'outputFiles' })))
assert.ok(pdf.items.length >= 1)
assert.ok(pdf.items.every((item) => /\.pdf$/i.test(item.snippet)))

const scoped = await index.search(parseSearchRequest(new URLSearchParams({ q: 'keyword', scope: 's-alpha' })))
assert.equal(scoped.total, 0)
const beta = await index.search(parseSearchRequest(new URLSearchParams({ q: 'keyword', scope: 's-beta' })))
assert.equal(beta.total, 1)

const paths = extractFilePaths(JSON.stringify({ file_path: 'D:\\docs\\a.docx', content: 'hello' }))
assert.deepEqual(paths, ['D:\\docs\\a.docx'])

const presentPaths = extractFilePaths(JSON.stringify({ files: [{ path: '/tmp/b.pdf' }] }))
assert.deepEqual(presentPaths, ['/tmp/b.pdf'])

// Anchors: every hit must name the rendered block, not just the row.
const answerItem = all.items.find((item) => item.kind === 'modelText')
assert.equal(answerItem.blockIndex, 1)
assert.equal(answerItem.seatIndex, 0)
assert.equal(answerItem.anchor.turn, 1)
assert.equal(answerItem.anchor.step, 1)
const reasoningItem = all.items.find((item) => item.kind === 'reasoning')
assert.equal(reasoningItem.blockIndex, 0)
assert.equal(reasoningItem.seatIndex, 0)
assert.equal(reasoningItem.anchor.blockKind, 'reasoning')
const callItem = all.items.find((item) => item.kind === 'tools' && item.subtype === 'call')
assert.equal(callItem.blockIndex, 2)
assert.equal(callItem.anchor.toolCallId, 'call-1')
assert.equal(callItem.anchor.blockKind, 'tool-call')
const presentedItem = pdf.items[0]
assert.equal(presentedItem.anchor.toolCallId, 'call-1')
assert.equal(presentedItem.anchor.blockKind, 'tool-call')
assert.equal(presentedItem.anchor.blockIndex, 2)
const chartItem = files.items.find((item) => /chart/i.test(item.snippet))
assert.equal(chartItem.anchor.blockKind, 'file')
assert.equal(chartItem.anchor.blockIndex, 3)
const inputFileItem = inputPdf.items[0]
assert.equal(inputFileItem.anchor.blockKind, 'file')
assert.equal(inputFileItem.anchor.blockIndex, 1)
assert.notEqual(callItem.id, presentedItem.id)

// Scatter-gather and speculative preload are request options, not globals.
const preloadRequest = parseSearchRequest(new URLSearchParams({ q: 'x', preload: '1', limit: '5000', threads: '99' }))
assert.equal(preloadRequest.limit, 2000)
assert.equal(preloadRequest.threads, 8)
assert.equal(preloadRequest.preload, true)
const normalRequest = parseSearchRequest(new URLSearchParams({ q: 'x', limit: '5000' }))
assert.equal(normalRequest.limit, 400)
assert.equal(normalRequest.threads, 2)
assert.equal(normalRequest.preload, false)
const oneThread = parseSearchRequest(new URLSearchParams({ q: 'x', threads: '0' }))
assert.equal(oneThread.threads, 1)

// Materialized view: only IDs are stored; the payload is rebuilt from docs.
const materialized = index.resolveSaved({
  id: 'saved-1',
  idVersion: 2,
  request: { q: 'zeta-token', scope: 'all', types: ['modelText'], exts: [], sort: 'relevance' },
  ids: all.items.map((item) => item.id),
  meta: { ...all, sessions: all.sessions },
  seqs: index.snapshotSeqs(),
})
assert.ok(materialized, 'materialized view did not resolve')
assert.equal(materialized.items.length, all.items.length)
assert.equal(materialized.items[0].id, all.items[0].id)
assert.equal(materialized.mode, 'materialized')
// Old address schemes are not resolvable; the caller must re-search.
assert.equal(index.resolveSaved({ id: 'old', request: { q: 'zeta-token' }, ids: ['x'], meta: {} }), null)

// Saved-view staleness is result-scoped: live growth does not invalidate a
// page, but a persisted session changing, or a new session, does.
await index.listSessions()
const seqs = index.snapshotSeqs()
const savedView = { request: { scope: 'all' }, sessions: ['s-alpha'], seqs }
assert.equal(index.isSavedStale(savedView), false)
index.recordById.get('s-alpha').live = true
index.surfaces.set('s-alpha', { ...index.surfaces.get('s-alpha'), seq: 999 })
assert.equal(index.isSavedStale(savedView), false, 'live growth must not invalidate')
index.recordById.get('s-alpha').live = false
index.surfaces.set('s-alpha', { ...index.surfaces.get('s-alpha'), seq: 1000 })
assert.equal(index.isSavedStale(savedView), true, 'persisted change in a result session must invalidate')
index.surfaces.set('s-beta', { ...index.surfaces.get('s-beta'), seq: 999 })
assert.equal(index.isSavedStale(savedView), true)
index.surfaces.set('s-gamma', { seq: 1, docs: [] })
assert.equal(index.isSavedStale({ request: { scope: 'all' }, sessions: [], seqs }), true, 'new session must invalidate')
index.surfaces.delete('s-gamma')

console.log('deepsearch core contracts: ok')
