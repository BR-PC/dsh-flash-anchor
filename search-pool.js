// Worker pool for the matching pass. Each worker owns one shard, so memory is
// roughly one extra copy of the corpus in total, not one per thread. A worker
// that dies (including its heap limit) marks the pool degraded and the Host
// falls back to the in-process scan for the rest of the session.
import { Worker } from 'node:worker_threads'

export class SearchPool {
  constructor(workerUrl) {
    this.workerUrl = workerUrl
    this.workers = []
    this.size = 0
    this.version = -1
    this.degraded = false
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
    void this.dispose()
  }

  shards(docs, size) {
    const out = Array.from({ length: size }, () => [])
    for (let index = 0; index < docs.length; index += 1) out[index % size].push(docs[index])
    return out
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

  spawn(shards, version) {
    this.workers = shards.map((shard) => {
      const worker = new Worker(this.workerUrl, {
        workerData: { docs: shard, version },
        resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 },
      })
      // Idle workers must not keep the process alive (tests, shutdown); a
      // pending search refs them again.
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
    this.size = shards.length
    this.version = version
  }

  ask(worker, message, timeoutMs) {
    // One id per request: the same id for two workers would let the first
    // reply resolve the wrong promise.
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

  /** Scan with size workers; null means the caller must scan inline. */
  async search(request, size, docs, version, timeoutMs = 20000) {
    if (this.degraded || size < 2) return null
    try {
      if (this.size !== size) {
        await this.dispose()
        this.spawn(this.shards(docs, size), version)
      } else if (this.version !== version) {
        const shards = this.shards(docs, size)
        this.workers.forEach((worker, index) => {
          worker.postMessage({ type: 'corpus', docs: shards[index], version })
        })
        this.version = version
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
