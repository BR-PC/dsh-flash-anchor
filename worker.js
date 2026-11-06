// Search worker: holds one shard of the corpus and scans it on demand.
// A hard heap limit makes an oversized corpus fail fast (OOM) so the Host can
// fall back to a single-threaded scan instead of taking the desktop down.
import { parentPort, workerData } from 'node:worker_threads'
import { scanDocs } from './search-core.js'

let docs = Array.isArray(workerData && workerData.docs) ? workerData.docs : []
let version = workerData && workerData.version ? workerData.version : 0


parentPort.on('message', (message) => {
  if (!message || typeof message !== 'object') return
  if (message.type === 'corpus') {
    docs = Array.isArray(message.docs) ? message.docs : []
    version = message.version || 0
    parentPort.postMessage({ type: 'ready', version })
    return
  }
  if (message.type === 'search') {
    try {
      const matches = scanDocs(docs, message.request || {})
      parentPort.postMessage({ type: 'result', id: message.id, matches })
    } catch (error) {
      parentPort.postMessage({ type: 'error', id: message.id, message: String((error && error.message) || error) })
    }
  }
})

// Announce readiness only after the message listener is installed.
parentPort.postMessage({ type: 'ready', version })
