// docKey is the reversible address of one indexed document. Two invariants:
//
// 1. Stability. Saved result pages store these ids, so the scheme may not move
//    under them without a migration. `test-dockey` exists because 1.8.2 shipped
//    a scheme change ("unsliced" and slice 0 became different addresses) and had
//    to revert it: every snapshot was invalidated and each open re-scanned the
//    whole corpus.
// 2. No accidental sharing. A field that stops participating in the address
//    makes two documents collapse onto one id, and the Map silently keeps one.
//
// The one deliberate fold is `chunk: null` -> 0. It is safe because a block is
// never both unsliced and sliced inside one shard (the builder slices by a fixed
// threshold, one shard is rebuilt whole, and a threshold change bumps
// INDEX_VERSION). This test locks that reasoning in place so the fold is not
// re-litigated without one.
import assert from 'node:assert/strict'
import { docKey } from './search-core.js'

const base = { seq: 7, blockIndex: 2, chunk: null, kind: 'modelText', subtype: 'text', fileIndex: null }
const id = (doc) => docKey('s', doc)

// Stability: the same document always maps to the same address.
assert.equal(id(base), id({ ...base }))
assert.equal(
  id(base),
  's:7:2:0:modelText:text:',
  'the address shape changed; saved pages key on this string',
)

// The documented fold, stated positively so a silent change shows up here.
assert.equal(id(base), id({ ...base, chunk: 0 }), 'chunk null must fold onto chunk 0 (address stability)')

// Slices of one block stay distinct from each other.
assert.notEqual(id({ ...base, chunk: 0 }), id({ ...base, chunk: 1 }))
assert.notEqual(id({ ...base, chunk: 1 }), id({ ...base, chunk: 2 }))

// Every other address field participates.
assert.notEqual(docKey('other', base), id(base), 'session id is not part of the address')
assert.notEqual(id({ ...base, seq: 8 }), id(base), 'seq is not part of the address')
assert.notEqual(id({ ...base, blockIndex: 3 }), id(base), 'blockIndex is not part of the address')
assert.notEqual(id({ ...base, blockIndex: null }), id({ ...base, blockIndex: 0 }), 'a missing blockIndex must not alias block 0')
assert.notEqual(id({ ...base, kind: 'tools' }), id(base), 'kind is not part of the address')
assert.notEqual(id({ ...base, subtype: 'result' }), id(base), 'subtype is not part of the address')
assert.notEqual(id({ ...base, fileIndex: 0 }), id({ ...base, fileIndex: null }), 'fileIndex is not part of the address')

// Two documents of the same block and kind differ by subtype, not by text.
assert.notEqual(
  id({ ...base, kind: 'tools', subtype: 'call', fileIndex: 0 }),
  id({ ...base, kind: 'tools', subtype: 'result', fileIndex: 0 }),
)

console.log('flash-anchor docKey addressing: ok')
