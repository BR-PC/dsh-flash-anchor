// Compaction keeps the folded turns in the raw log but hides them from the
// surface. Indexing only the surface is what made search results disagree with
// the conversation after a compaction; this locks the raw-log contract.
import assert from 'node:assert/strict'
import { __test } from './index.js'

const { buildSurfaceDocs } = __test
const record = { header: { id: 's-compact', cwd: null }, live: false }
const text = (n) => ({ type: 'text', text: 'body ' + n + ' NEEDLE_' + n })

const events = []
for (let seq = 1; seq <= 6; seq += 1) {
  events.push({
    type: seq % 2 === 0 ? 'user/message' : 'assistant/message',
    seq,
    time: 1_700_000_000_000 + seq,
    data: { turn: seq, step: 1, message: { role: seq % 2 === 0 ? 'user' : 'assistant', id: 'm' + seq, content: [text(seq)] } },
  })
}
// The compaction checkpoint: it replaces seq 1..6 on the surface.
events.push({
  type: 'user/message',
  seq: 7,
  time: 1_700_000_000_100,
  surfaceOp: { op: 'replace', startSeq: 1, endSeq: 6 },
  data: { turn: 7, step: 1, message: { role: 'user', id: 'm7', content: [text(7)] }, source: { kind: 'compact-checkpoint' } },
})
events.push({
  type: 'assistant/message',
  seq: 8,
  time: 1_700_000_000_200,
  data: { turn: 8, step: 1, message: { role: 'assistant', id: 'm8', content: [text(8)] } },
})
const surface = events.filter((event) => event.seq >= 7)
const surfaceSeqs = new Set(surface.map((event) => Number(event.seq)))
const watermark = 8

// Surface-only (the old behaviour): the six folded turns are gone from the index.
const surfaceOnly = buildSurfaceDocs({ events: surface, capturedThroughSeq: watermark }, record)
assert.equal(surfaceOnly.docs.length, 2)
assert.equal(surfaceOnly.docs.some((doc) => /NEEDLE_[1-6]/.test(doc.text)), false)

// Raw log (the fix): everything stays searchable, the folded part is flagged.
const full = buildSurfaceDocs({ events, capturedThroughSeq: watermark, surfaceSeqs }, record)
assert.ok(full.docs.length >= 8, 'raw log should contribute every turn, got ' + full.docs.length)
for (let seq = 1; seq <= 6; seq += 1) {
  const doc = full.docs.find((entry) => /NEEDLE_/.test(entry.text) && entry.text.includes('NEEDLE_' + seq))
  assert.ok(doc, 'folded turn ' + seq + ' disappeared from the index')
  assert.equal(doc.shadowed, true, 'folded turn ' + seq + ' was not flagged as shadowed')
}
const live = full.docs.filter((doc) => !doc.shadowed)
assert.ok(live.every((doc) => Number(doc.seq) >= 7), 'a live doc was wrongly flagged')
assert.equal(full.docs.filter((doc) => doc.shadowed === true).length, 6, 'every folded doc must be flagged')

// Without a surface set (older Host, no compaction) nothing is flagged.
const plain = buildSurfaceDocs({ events, capturedThroughSeq: watermark }, record)
assert.equal(plain.docs.some((doc) => doc.shadowed === true), false)

console.log('flash-anchor compaction indexing: ok (' + full.docs.length + ' docs, ' + full.docs.filter((doc) => doc.shadowed === true).length + ' shadowed)')
