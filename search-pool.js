// Worker pool for the matching pass.
//
// The corpus is NEVER copied through postMessage. Each worker is told which
// shard FILES belong to it and reads/decodes them itself (fs + zlib), so the
// pool holds one corpus in total — split across workers — instead of one full
// clone per worker. Re-balancing after an index change costs a list of paths
// (a few KB), not 40+ MB of structured clone.
import { Worker } from 'node:worker_threads'

export class SearchPool {
  constructor(workerUrl) {
    this.workerUrl = workerUrl
    this.workers = []
    this.size = 0
    this.version = -1
    this.degraded = false
    this.failures = 0
    this.retryAt = 0
    this.seq = 0
    this.pending = new Map()
    this.ready = new Map()
    this.readyResolvers = new Map()
    this.expectedExit = new WeakSet()
  }

  async dispose() {
    const workers = this.workers
    this.workers = []
    this.size = 0
    for (const worker of workers) {
      this.expectedExit.add(worker)
      try { await worker.terminate() } catch {}
    }
    for (const entry of this.pending.values()) entry.reject(new Error('pool-disposed'))
    this.pending.clear()
    this.ready.clear()
    this.readyResolvers.clear()
  }

  fail(reason) {
    if (this.degraded) return
    this.degraded = true
    this.lastError = reason
    this.failures = (this.failures || 0) + 1
    this.retryAt = Date.now() + Math.min(15 * 60_000, 60_000 * 2 ** (this.failures - 1))
    void this.dispose()
  }

  makeReady(worker) {
    const promise = new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.readyResolvers.delete(worker)
        resolve(false)
      }, 8000)
      this.readyResolvers.set(worker, (value) => {
        clearTimeout(timer)
        resolve(value)
      })
    })
    this.ready.set(worker, promise)
  }

  spawn(assignments, version) {
    this.workers = assignments.map((shards) => {
      const worker = new Worker(this.workerUrl, {
        // Only paths (and, for a shard that has not been written yet, its docs).
        workerData: { shards, version },
        resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 },
      })
      worker.unref()
      this.makeReady(worker)
      worker.on('error', (error) => this.fail(error))
      worker.on('exit', (code) => {
        if (this.expectedExit.has(worker)) return
        if (code !== 0) this.fail(new Error('worker-exit-' + code))
      })
      worker.on('message', (message) => {
        if (!message || typeof message !== 'object') return
        if (message.type === 'ready') {
          const resolve = this.readyResolvers.get(worker)
          if (resolve) {
            this.readyResolvers.delete(worker)
            resolve(true)
          }
          return
        }
        const entry = this.pending.get(message.id)
        if (!entry) return
        this.pending.delete(message.id)
        if (message.type === 'error') entry.reject(new Error(message.message || 'worker-error'))
        else entry.resolve(message.matches || [])
      })
      return worker
    })
    this.size = assignments.length
    this.version = version
  }

  ask(worker, message, timeoutMs) {
    const id = ++this.seq
    message.id = id
    try { worker.ref() } catch {}
    return new Promise((resolve, reject) => {
      const release = () => { try { worker.unref() } catch {} }
      const timer = setTimeout(() => {
        release()
        this.pending.delete(id)
        reject(new Error('worker-timeout'))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); release(); resolve(value) },
        reject: (error) => { clearTimeout(timer); release(); reject(error) },
      })
      worker.postMessage(message)
    })
  }

  /**
   * `assignments` is one array per worker: `{ id, path, chars, docs? }` entries.
   * `docs` is only present for a shard that has not been persisted yet; it is
   * the exception, not the transport.
   */
  async search(request, size, assignments, version, timeoutMs = 20000) {
    if (this.degraded) {
      if (Date.now() < (this.retryAt || 0)) return null
      this.degraded = false
      this.failures = 0
      await this.dispose()
    }
    if (size < 2) return null
    try {
      if (this.size !== size) {
        await this.dispose()
        this.spawn(assignments, version)
      } else if (this.version !== version) {
        this.workers.forEach((worker, index) => {
          this.makeReady(worker)
          worker.postMessage({ type: 'corpus', shards: assignments[index] || [], version })
        })
        this.version = version
      }
      if (this.workers.length !== size) {
        this.fail(new Error('worker-count'))
        return null
      }
      const readiness = await Promise.all(this.workers.map((worker) => this.ready.get(worker)))
      if (readiness.some((value) => value !== true)) {
        this.fail(new Error('worker-not-ready'))
        return null
      }
      const results = await Promise.all(
        this.workers.map((worker) => this.ask(worker, { type: 'search', request }, timeoutMs)),
      )
      return results.flat()
    } catch (error) {
      this.fail(error)
      return null
    }
  }
}
