// docKey is the reversible address of one indexed document: two different
// documents must never share an id, or the index silently keeps only one.
import assert from 'node:assert/strict'
import { docKey } from './search-core.js'

const base = { seq: 7, blockIndex: 2, chunk: null, kind: 'modelText', subtype: 'text', fileIndex: null }
const id = (doc) => docKey('s', doc)

// Regression: an unsliced block and the FIRST slice of a long block used to
// fold onto the same key (chunk null -> 0), so one of them disappeared.
assert.notEqual(id(base), id({ ...base, chunk: 0 }), 'unsliced block collided with chunk 0')
assert.equal(new Set([id(base), id({ ...base, chunk: 0 })]).size, 2)

// Slices of one block stay distinct from each other.
assert.notEqual(id({ ...base, chunk: 0 }), id({ ...base, chunk: 1 }))

// Stability: the same document always maps to the same id (persisted shards rely on it).
assert.equal(id(base), id({ ...base }))

// Every address field participates.
assert.notEqual(docKey('other', base), id(base))
assert.notEqual(id({ ...base, seq: 8 }), id(base))
assert.notEqual(id({ ...base, blockIndex: 3 }), id(base))
assert.notEqual(id({ ...base, blockIndex: null }), id({ ...base, blockIndex: 0 }))
assert.notEqual(id({ ...base, kind: 'tools' }), id(base))
assert.notEqual(id({ ...base, subtype: 'result' }), id(base))
assert.notEqual(id({ ...base, fileIndex: 0 }), id({ ...base, fileIndex: null }))

console.log('flash-anchor docKey addressing: ok')
