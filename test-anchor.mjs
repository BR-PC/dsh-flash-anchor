// Replays every stored Session through buildSurfaceDocs and proves the anchor
// contract: each indexed doc carries a block address that resolves back to the
// exact source block, and no two docs share one address.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { __test } from './index.js'

// MAX_CHUNKS comes from the implementation: writing 16 here again is how this
// test drifted out of date when the cap moved to 256.
const { buildSurfaceDocs, makeResultItem, CHUNK_SIZE, CHUNK_OVERLAP, MAX_CHUNKS } = __test

const ROOT = process.env.DSH_SESSIONS || path.join(os.homedir(), '.dsh', 'sessions')
const MAX_SESSIONS = Number(process.env.DSH_ANCHOR_MAX || 60)
const STEP = CHUNK_SIZE - CHUNK_OVERLAP

function collect(dir, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      collect(full, out)
      continue
    }
    if (/\.jsonl(\.zstd)?$/.test(entry.name)) out.push(full)
  }
}

function load(file) {
  const raw = Buffer.isBuffer(file)
    ? file
    : file.endsWith('.zstd')
      ? zlib.zstdDecompressSync(fs.readFileSync(file))
      : fs.readFileSync(file)
  let header = null
  const events = []
  for (const line of raw.toString('utf8').split('\n')) {
    if (!line.trim()) continue
    let value
    try {
      value = JSON.parse(line)
    } catch {
      continue
    }
    if (value && value.header) {
      header = value.header
      continue
    }
    if (value && typeof value.type === 'string' && Number.isFinite(value.seq)) events.push(value)
  }
  return { header, events }
}

function surfaceOf(events) {
  const surface = new Map()
  for (const event of events) {
    if (!['user/message', 'assistant/message', 'tool/result', 'system/message', 'developer/message'].includes(event.type)) continue
    const op = event.surfaceOp
    if (op && typeof op === 'object' && op.op === 'replace') {
      for (let seq = op.startSeq; seq <= op.endSeq; seq += 1) surface.delete(seq)
    }
    surface.set(event.seq, event)
  }
  return [...surface.values()].sort((left, right) => left.seq - right.seq)
}

/** The Client-side address of a Chat node, mirrored here to prove reversibility. */
function addressOf(item) {
  const anchor = item.anchor || {}
  if (anchor.toolCallId) return '9:tool-call' + anchor.toolCallId
  if (Number.isFinite(anchor.turn) && Number.isFinite(anchor.step) && (item.kind === 'modelText' || item.kind === 'reasoning')) {
    return '14:assistant-step' + anchor.turn + ':' + anchor.step
  }
  if (item.kind === 'userText' || item.kind === 'inputFiles' || item.kind === 'context') {
    return anchor.messageId ? '4:user' + anchor.messageId : null
  }
  if (Number.isFinite(anchor.turn) && Number.isFinite(anchor.step)) return '14:assistant-step' + anchor.turn + ':' + anchor.step
  return null
}

function messageOf(event) {
  return event?.data?.message ?? (event?.data?.role ? event.data : undefined)
}

const files = []
collect(ROOT, files)
if (files.length === 0) {
  console.log('deepsearch anchor contract: skipped (no session store at ' + ROOT + ')')
  process.exit(0)
}
files.sort((left, right) => {
  try {
    return fs.statSync(right).size - fs.statSync(left).size
  } catch {
    return 0
  }
})

let sessions = 0
let docs = 0
let addresses = 0
let chunked = 0
let withTool = 0
const failures = []

function check(condition, message) {
  if (!condition) failures.push(message)
}

for (const file of files.slice(0, MAX_SESSIONS)) {
  const { header, events } = load(file)
  if (events.length === 0) continue
  const snapshot = { events: surfaceOf(events), capturedThroughSeq: events.at(-1)?.seq ?? null }
  if (snapshot.events.length === 0) continue
  const built = buildSurfaceDocs(snapshot, { header: header ?? { id: 'unknown', cwd: null } })
  const eventBySeq = new Map(events.map((event) => [event.seq, event]))
  const seen = new Set()
  const label = path.basename(path.dirname(file)) + '/' + path.basename(file)
  sessions += 1
  for (const doc of built.docs) {
    docs += 1
    check(Number.isInteger(doc.blockIndex) && doc.blockIndex >= 0, label + ': doc without a block index (' + doc.kind + ')')
    check(typeof doc.blockKind === 'string' && doc.blockKind.length > 0, label + ': doc without a block kind')
    const key = [doc.turn, doc.step, doc.messageId, doc.blockIndex, doc.chunk, doc.fileIndex].join('\u0000')
    check(!seen.has(key), label + ': two docs share the anchor ' + JSON.stringify(key))
    seen.add(key)
    if (doc.chunk > 0) chunked += 1

    const event = eventBySeq.get(doc.seq)
    const message = messageOf(event)
    const block = message && Array.isArray(message.content) ? message.content[doc.blockIndex] : undefined
    check(block !== undefined, label + ': anchor points at a missing content block')
    if (block === undefined) continue

    const expectedKind =
      doc.blockKind === 'tool-result'
        ? 'text'
        : doc.blockKind
    check(block.type === expectedKind, label + ': block kind mismatch (' + block.type + ' vs ' + doc.blockKind + ')')
    if (doc.blockKind === 'tool-call') {
      check(doc.toolCallId === block.id, label + ': tool-call anchor lost its call id')
      withTool += 1
    }
    if (doc.blockKind === 'tool-result') {
      check(doc.toolCallId === message.toolCallId, label + ': tool-result anchor lost its call id')
      withTool += 1
    }

    if (doc.subtype !== 'file' && (doc.blockKind === 'text' || doc.blockKind === 'reasoning' || doc.blockKind === 'tool-result')) {
      const raw = String(block.text ?? '').replace(/\u0000/g, '')
      const capped = raw.length > CHUNK_SIZE * MAX_CHUNKS ? raw.slice(0, CHUNK_SIZE * MAX_CHUNKS) : raw
      const slice = capped.slice(doc.chunk * STEP, doc.chunk * STEP + CHUNK_SIZE)
      check(
        doc.text === slice,
        label +
          ': chunk text does not match its source slice (' +
          [doc.kind, doc.seq, doc.turn, doc.step, doc.blockIndex, doc.chunk, doc.fileIndex, raw.length, doc.text.length].join('/') +
          ') got=' +
          JSON.stringify(doc.text.slice(0, 60)) +
          ' want=' +
          JSON.stringify(slice.slice(0, 60)),
      )
    }
    if (doc.blockKind === 'file') {
      check(doc.text.includes(String(block.attachment?.name ?? '')), label + ': file doc lost its attachment name')
    }
    if (doc.blockKind === 'tool-call' && doc.kind === 'outputFiles') {
      const args = String(block.arguments ?? '').replace(/\\\\/g, '/')
      const target = String(doc.files?.[0]?.path ?? doc.files?.[0]?.name ?? '').replace(/\\\\/g, '/')
      check(target !== '' && (args.includes(target) || args.includes(doc.files?.[0]?.name ?? '\u0000')), label + ': file doc lost its call-site path')
    }

    const item = makeResultItem({
      sessionId: header?.id ?? 'unknown',
      sessionTitle: 't',
      record: { header: header ?? { cwd: null } },
      doc,
      matchIndex: 0,
      queryLength: 0,
      qLower: '',
      score: 0,
    })
    check(item.anchor.blockIndex === doc.blockIndex, label + ': result anchor lost blockIndex')
    check(item.anchor.blockKind === doc.blockKind, label + ': result anchor lost blockKind')
    check(item.anchor.seatIndex === doc.seatIndex, label + ': result anchor lost seatIndex')
    check(item.anchor.fileIndex === (doc.fileIndex ?? null), label + ': result anchor lost fileIndex')
    check(item.id.startsWith(String(header?.id ?? 'unknown') + ':'), label + ': result id lost its session')
    const address = addressOf(item)
    if (address) addresses += 1
    else if (doc.kind !== 'outputFiles' && doc.kind !== 'inputFiles') {
      failures.push(label + ': no node address for ' + doc.kind + ' / ' + doc.blockKind)
    }
  }
}

// Synthetic edge cases the stored corpus may not contain: a long chunked block
// and a tool call whose file lives only in its arguments.
const long = '长文本'.repeat(4000)
const syntheticEvents = [
  {
    type: 'assistant/message',
    seq: 10,
    time: 1,
    data: {
      turn: 7,
      step: 2,
      message: {
        role: 'assistant',
        id: 'm-7-2',
        content: [
          { type: 'reasoning', text: 'thinking before the answer' },
          { type: 'text', text: long },
          { type: 'tool-call', id: 'call-9', name: 'present', arguments: JSON.stringify({ files: [{ path: '/out/方案.pdf' }] }) },
        ],
      },
    },
  },
  {
    type: 'user/message',
    seq: 9,
    time: 1,
    data: { id: 'u-7', role: 'user', content: [{ type: 'text', text: '开始' }, { type: 'file', attachment: { name: '输入.png' } }] },
  },
]
const synthetic = buildSurfaceDocs(
  { events: syntheticEvents, capturedThroughSeq: 10 },
  { header: { id: 'synthetic', cwd: null } },
)
const longDocs = synthetic.docs.filter((doc) => doc.kind === 'modelText')
check(longDocs.length > 1, 'synthetic: a long block must be chunked')
check(longDocs[0].blockIndex === 1 && longDocs[1].blockIndex === 1, 'synthetic: chunks must share one block index')
check(new Set(longDocs.map((doc) => doc.chunk)).size === longDocs.length, 'synthetic: chunks must be distinct')
const toolDoc = synthetic.docs.find((doc) => doc.kind === 'tools' && doc.subtype === 'call')
check(toolDoc && toolDoc.toolCallId === 'call-9' && toolDoc.blockIndex === 2, 'synthetic: tool call anchor is wrong')
const fileDoc = synthetic.docs.find((doc) => doc.kind === 'outputFiles' && doc.files && /方案/.test(doc.files[0].name))
check(fileDoc && fileDoc.toolCallId === 'call-9' && fileDoc.blockIndex === 2, 'synthetic: presented file anchor is wrong')
const inputDoc = synthetic.docs.find((doc) => doc.kind === 'inputFiles')
check(inputDoc && inputDoc.blockIndex === 1 && inputDoc.blockKind === 'file', 'synthetic: input file anchor is wrong')

for (const failure of failures.slice(0, 12)) console.error('  FAIL ' + failure)
assert.equal(failures.length, 0, failures.length + ' anchor contract failures')
console.log(
  'deepsearch anchor contract: ok (' +
    sessions +
    ' sessions, ' +
    docs +
    ' docs, ' +
    chunked +
    ' chunked, ' +
    withTool +
    ' tool anchors, ' +
    addresses +
    ' node addresses)',
)