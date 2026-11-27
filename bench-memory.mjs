// Memory curve: cloned corpus vs shard-path transport.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Worker } from 'node:worker_threads'

const LIVE = path.join(os.homedir(), '.dsh', 'flash-anchor')
const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'fa-mt-'))
process.env.DSH_HOME = home
await fsp.mkdir(path.join(home, 'flash-anchor'), { recursive: true })
await fsp.copyFile(path.join(LIVE, 'index.json.gz'), path.join(home, 'flash-anchor', 'index.json.gz'))
await fsp.cp(path.join(LIVE, 'index'), path.join(home, 'flash-anchor', 'index'), { recursive: true })

const { __test } = await import('./index.js')
const { StateStore } = __test
const { SearchPool } = await import('./search-pool.js')
const { scanDocs } = await import('./search-core.js')

const mb = (bytes) => (bytes / 1048576).toFixed(1)
const rss = async () => { global.gc && global.gc(); await new Promise((r) => setTimeout(r, 120)); global.gc && global.gc(); return process.memoryUsage().rss }

const store = new StateStore()
await store.load()
const manifest = await store.loadIndex()
const ids = Object.keys(manifest.sessions)
const all = []
for (const id of ids) {
  const shard = await store.loadShard(id)
  for (const doc of shard.docs) all.push({ ...doc, id: id + ':' + (doc.seq ?? '') + ':' + (doc.blockIndex ?? '-') + ':' + doc.kind })
}
const mainRss = await rss()
console.log('main thread, corpus loaded:        ' + mb(mainRss) + ' MB  (' + all.length + ' docs)')

// (A) the old transport: one full structured clone per worker.
const workers = []
for (let i = 0; i < 4; i += 1) {
  workers.push(new Worker(new URL('./_clone-worker.mjs', import.meta.url), { workerData: { docs: all } }))
}
await new Promise((resolve) => setTimeout(resolve, 1200))
const cloneRss = await rss()
console.log('+ 4 clones of the whole corpus:    ' + mb(cloneRss) + ' MB  (Δ +' + mb(cloneRss - mainRss) + ')')
for (const worker of workers) await worker.terminate()
await new Promise((resolve) => setTimeout(resolve, 500))
const afterTerminate = await rss()
console.log('after terminating the clones:      ' + mb(afterTerminate) + ' MB')

// (B) the new transport: shard paths only, each worker decodes its own share.
const pool = new SearchPool(new URL('./worker.js', import.meta.url))
const assignments = [[], [], [], []]
const weights = [0, 0, 0, 0]
const shards = ids.map((id) => ({ id, path: store.sessionIndexFile(id), chars: manifest.sessions[id].chars || 0 }))
  .sort((a, b) => b.chars - a.chars)
for (const shard of shards) {
  let target = 0
  for (let i = 1; i < 4; i += 1) if (weights[i] < weights[target]) target = i
  assignments[target].push(shard)
  weights[target] += shard.chars
}
const request = { types: ['reasoning', 'modelText', 'userText', 'tools', 'outputFiles', 'inputFiles', 'context'], exts: [], fileOnly: false, qLower: 'the' }
const started = Date.now()
const matches = await pool.search(request, 4, assignments, 'mem-probe')
const firstMs = Date.now() - started
const pathRss = await rss()
console.log('+ 4 path workers (own shards only): ' + mb(pathRss) + ' MB  (Δ +' + mb(pathRss - afterTerminate) + ', first scan ' + firstMs + ' ms, ' + (matches ? matches.length : 0) + ' matches)')
const inline = scanDocs(all, request).length
console.log('inline scan of the same corpus:    ' + inline + ' matches')
await pool.dispose()
await fsp.rm(home, { recursive: true, force: true })
process.exit(0)
