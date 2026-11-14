// The diagnostics log is the only way a user's broken jump can be reproduced
// without guessing: it must exist, be structured, stay bounded, and be
// switchable from the panel.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'fa-diag-'))
process.env.DSH_HOME = home

const { __test } = await import('./index.js')
const { StateStore } = __test

const store = new StateStore()
await store.load()
assert.equal(store.logEnabled(), true, 'log collection must default to on')

store.logDiag('client:jump', { ok: false, reason: 'not-mounted', turn: 270, pickHow: 'key' })
store.logDiag('search', { q: '在吗', total: 20, pending: 0 })
await new Promise((resolve) => setTimeout(resolve, 250))

const info = await store.logInfo()
assert.ok(info.path.endsWith('diagnostics.log'), 'unexpected log path: ' + info.path)
assert.ok(info.bytes > 0, 'nothing was written')
const text = await fs.readFile(info.path, 'utf8')
const lines = text.split('\n').filter(Boolean).map((line) => JSON.parse(line))
assert.equal(lines.length, 2, 'expected one JSON object per event')
assert.equal(lines[0].type, 'client:jump')
assert.equal(lines[0].reason, 'not-mounted')
assert.equal(lines[1].type, 'search')
assert.equal(lines[1].q, '在吗')
assert.ok(lines[0].ts, 'every line carries a timestamp')

store.setLogCollection(false)
store.logDiag('search', { q: 'silent' })
await new Promise((resolve) => setTimeout(resolve, 200))
const quiet = await fs.readFile(info.path, 'utf8')
assert.equal(quiet.split('\n').filter(Boolean).length, 2, 'turning collection off must stop writes')

store.setLogCollection(true)
const cleared = await store.clearDiag()
assert.equal(cleared.bytes, 0, 'clear must empty the log')

await fs.rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
console.log('flash-anchor diagnostics log: ok')
