// Search worker: owns ONE share of the corpus and never receives it by copy.
//
// The Host sends shard identities; the worker reads and decodes the shard files
// itself (fs + zlib). The only payload that ever crosses the boundary is the
// shard list (paths) and the match list. `docs` is accepted only for a shard
// that has not been persisted yet.
import { parentPort, workerData } from 'node:worker_threads'
import { promises as fs } from 'node:fs'
import zlib from 'node:zlib'
import { promisify } from 'node:util'
import { docKey, scanDocs } from './search-core.js'

const gunzip = promisify(zlib.gunzip)
let docs = []
let version = (workerData && workerData.version) || 0
// Per-shard query cache: LRU of the last few queries over this exact corpus.
const queryCache = new Map()

async function loadShards(shards) {
  const loaded = []
  for (const shard of Array.isArray(shards) ? shards : []) {
    let parsed = null
    if (Array.isArray(shard.docs)) {
      parsed = { id: shard.id, docs: shard.docs }
    } else {
      parsed = JSON.parse((await gunzip(await fs.readFile(shard.path))).toString('utf8'))
    }
    const sessionId = parsed.id || shard.id
    for (const doc of parsed.docs || []) {
      loaded.push({
        // A persisted shard stores documents without an address (the Host
        // derives it); a test shard may carry one, and it wins when present.
        id: doc.id || docKey(sessionId, doc),
        kind: doc.kind,
        subtype: doc.subtype,
        text: doc.text,
        ext: doc.ext || null,
        sessionId,
      })
    }
  }
  docs = loaded
  // A new corpus invalidates every cached match list.
  queryCache.clear()
}

await loadShards(workerData && workerData.shards)

parentPort.on('message', async (message) => {
  if (!message || typeof message !== 'object') return
  if (message.type === 'corpus') {
    try {
      version = message.version || 0
      await loadShards(message.shards)
      parentPort.postMessage({ type: 'ready', version })
    } catch (error) {
      parentPort.postMessage({ type: 'error', id: message.id ?? -1, message: String((error && error.message) || error) })
    }
    return
  }
  if (message.type === 'search') {
    try {
      const request = message.request || {}
      const key = JSON.stringify([
        String(request.qLower || ''),
        request.fileOnly === true ? 1 : 0,
        [...(request.types || [])].slice().sort(),
        [...(request.exts || [])].slice().sort(),
      ])
      let matches = queryCache.get(key)
      if (!matches) {
        matches = scanDocs(docs, request)
        queryCache.set(key, matches)
        if (queryCache.size > 8) queryCache.delete(queryCache.keys().next().value)
      }
      parentPort.postMessage({ type: 'result', id: message.id, matches })
    } catch (error) {
      parentPort.postMessage({ type: 'error', id: message.id, message: String((error && error.message) || error) })
    }
  }
})

// Announce readiness only after the message listener is installed.
parentPort.postMessage({ type: 'ready', version })
