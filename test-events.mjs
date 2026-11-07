// The session/event payload is a Session object, not an id. Feeding the id
// through String() made the dirty set hold "[object Object]" and silently
// disabled automatic indexing; this test fires the real payload shape.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { apply } from './index.js'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'fa-events-'))
process.env.DSH_HOME = home

const read = []
const listeners = {}
const ctx = {
  sessionQuery: {
    async listSessions() {
      return [{ header: { id: 's-1', createdAt: 1 }, live: true, persisted: false }]
    },
    async readTitleSnapshots(ids) {
      return ids.map((sessionId) => ({ sessionId, status: 'fulfilled', value: { title: { title: sessionId } } }))
    },
    async readSurface(sessionId) {
      read.push(sessionId)
      return { capturedThroughSeq: 3, events: [] }
    },
  },
  connection: { fetch: { register: () => ({}) } },
  effect() {},
  on(name, handler) {
    listeners[name] = handler
  },
  get() {
    return undefined
  },
}

apply(ctx)
assert.equal(typeof listeners['session/event'], 'function', 'session/event listener was not registered')

// The DSH contract: (session: Session, event: SessionEvent).
listeners['session/event']({ id: 's-1', header: { id: 's-1' } }, { type: 'assistant/message', seq: 1 })

await new Promise((resolve) => setTimeout(resolve, 2600))
assert.ok(read.includes('s-1'), 'automatic indexing never read the session from a Session payload')

await fs.rm(home, { recursive: true, force: true })
console.log('flash-anchor event contract: ok')
