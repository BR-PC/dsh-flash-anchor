// Controlled benchmark for the search path.
//
// The previous version mixed three costs in one number (corpus rebuild, worker
// spawn/transfer, and the page build), so a change to any one of them could
// "speed up" or "slow down" the result without showing which. This one isolates
// them, keeps every cache that a real search would keep, and reports p50/p95
// next to the mean so a noisy machine cannot hide a regression behind an outlier.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'fa-bench2-'))
process.env.DSH_HOME = home

const { __test } = await import('./index.js')
const { SearchIndex, StateStore, parseSearchRequest, ALL_TYPES_FOR_TEST } = __test
const { scanDocs } = await import('./search-core.js')

const RUNS = 10
const WORD = 'benchmark'
const now = Date.now()
const pad = (n) => 'lorem ipsum dolor sit amet '.repeat(n)
const SESSIONS = 60
const DOCS_PER_SESSION = 400

function makeSession(index) {
  const id = 'bench-' + String(index).padStart(2, '0')
  const events = [{ seq: 1, time: now, data: { turn: 1, message: { role: 'user', id: 'u-' + id, content: [{ type: 'text', text: WORD + ' question ' + id }] } } }]
  let seq = 2
  for (let step = 0; step < DOCS_PER_SESSION; step += 1) {
    const kind = step % 3 === 0 ? 'reasoning' : step % 3 === 1 ? 'modelText' : 'tools'
    const text = WORD + ' ' + id + ' step ' + step + ' ' + pad(step % 50 === 0 ? 220 : 22)
    const content = kind === 'tools'
      ? [{ type: 'tool-call', id: 'c-' + id + '-' + step, name: 'exec', arguments: JSON.stringify({ command: 'echo ' + text }) }]
      : [{ type: 'text', text }]
    events.push({ seq, time: now + seq, data: { turn: 1, step, message: { role: 'assistant', id: 'a-' + id + '-' + step, content } } })
    seq += 1
  }
  return { header: { id, createdAt: now, cwd: 'D:/bench' }, capturedThroughSeq: seq - 1, events }
}

const sessions = Array.from({ length: SESSIONS }, (_, i) => makeSession(i))
const byId = new Map(sessions.map((s) => [s.header.id, s]))
const ctx = {
  sessionQuery: {
    async listSessions() { return sessions.map(({ header }) => ({ header, live: false, persisted: true })) },
    async readTitleSnapshots(ids) { return ids.map((sessionId) => ({ sessionId, status: 'fulfilled', value: { title: { title: 'B ' + sessionId } } })) },
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

const all = parseSearchRequest(new URLSearchParams('q=' + WORD + '&limit=400&threads=1'))
const fourThreads = parseSearchRequest(new URLSearchParams('q=' + WORD + '&limit=400&threads=4'))
const narrow = parseSearchRequest(new URLSearchParams('q=' + WORD + '&types=modelText&limit=400&threads=1'))

const stats = (times) => {
  const sorted = [...times].sort((a, b) => a - b)
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]
  return { mean: times.reduce((s, v) => s + v, 0) / times.length, p50: at(0.5), p95: at(0.95), min: sorted[0], max: sorted[sorted.length - 1] }
}
const ms = (value) => value.toFixed(1)
const time = async (runs, fn) => {
  const out = []
  for (let run = 0; run < runs; run += 1) {
    const started = process.hrtime.bigint()
    await fn(run)
    out.push(Number(process.hrtime.bigint() - started) / 1e6)
  }
  return out
}

// One warm-up per phase: the pool spawn and the first corpus build are setup,
// not a per-search cost, and including them is what used to drown the signal.
await index.search(all)
await index.search(fourThreads)
await index.search(narrow)
const first = await index.search(all)
store.recordSearch(all, first, index.snapshotSeqs())
const saved = store.matchSaved(all)

const phases = []

phases.push(['扫描（纯 scanDocs，不含任何 HTTP/构页）', await time(RUNS, () => {
  scanDocs(index.corpus().all, { types: ALL_TYPES_FOR_TEST, exts: [], fileOnly: false, qLower: WORD })
})])

phases.push(['搜索 · 单线程 · 语料已热 · 每次清查询缓存', await time(RUNS, () => {
  index.queryCache.clear()
  index.pageCache.clear()
  return index.search(all)
})])

phases.push(['搜索 · 四线程 · 池已热 · 每次清查询缓存', await time(RUNS, () => {
  index.queryCache.clear()
  index.pageCache.clear()
  return index.search(fourThreads)
})])

// Timed separately: the first call is the cold scan, only the second is the cache hit.
const cacheTimes = []
for (let run = 0; run < RUNS; run += 1) {
  index.queryCache.clear()
  index.pageCache.clear()
  await index.search(all)
  const started = process.hrtime.bigint()
  await index.search(all)
  cacheTimes.push(Number(process.hrtime.bigint() - started) / 1e6)
}
phases.push(['搜索 · 同条件第二次（页缓存命中）', cacheTimes])

phases.push(['命中物化快照', await time(RUNS, () => {
  const page = index.resolveSaved(saved, all)
  if (!page) throw new Error('snapshot stopped resolving')
})])

phases.push(['收窄到「正文」· 语料已热', await time(RUNS, () => {
  index.queryCache.clear()
  index.pageCache.clear()
  return index.search(narrow)
})])

phases.push(['冷语料（每次丢弃语料缓存，含重建）', await time(RUNS, () => {
  index.queryCache.clear()
  index.pageCache.clear()
  index.corpusCache = null
  return index.search(all)
})])

console.log('corpus: ' + sessions.length + ' sessions, ' + index.corpus().all.length + ' documents, ' + (index.corpusChars() / 1e6).toFixed(1) + ' M chars')
console.log('')
const header = 'phase'.padEnd(44) + 'mean'.padStart(9) + 'p50'.padStart(9) + 'p95'.padStart(9) + 'min'.padStart(9) + 'max'.padStart(9)
console.log(header)
for (const [name, times] of phases) {
  const s = stats(times)
  console.log(name.padEnd(44) + ms(s.mean).padStart(9) + ms(s.p50).padStart(9) + ms(s.p95).padStart(9) + ms(s.min).padStart(9) + ms(s.max).padStart(9))
}
console.log('')
const base = stats(phases[1][1])
for (const [name, times] of phases) {
  if (name === phases[1][0]) continue
  const s = stats(times)
  console.log(name.padEnd(44) + '×' + (base.mean / s.mean).toFixed(2) + (s.mean < 1 ? '  (亚毫秒)' : ''))
}

// Memory composition of the same corpus.
const gc = async () => { global.gc && global.gc(); await new Promise((r) => setTimeout(r, 30)); return process.memoryUsage().heapUsed }
const baseHeap = await gc()
const docsNow = [...index.surfaces.values()].reduce((sum, entry) => sum + (entry.docs?.length || 0), 0)
console.log('')
console.log('memory: heap ' + (baseHeap / 1048576).toFixed(1) + ' MB for ' + docsNow + ' documents (' + (index.corpusChars() / 1e6).toFixed(1) + ' M chars of text)')
index.dispose()
await fs.rm(home, { recursive: true, force: true })
process.exit(0)
