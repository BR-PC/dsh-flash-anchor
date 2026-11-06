// The reversible address of one indexed doc. blockIndex is null only in
// indexes written before 1.4.2; subtype/fileIndex keep those distinct too.
export function docKey(sessionId, doc) {
  const block = doc.blockIndex == null ? '-' : doc.blockIndex
  const chunk = doc.chunk == null ? 0 : doc.chunk
  return sessionId + ':' + doc.seq + ':' + block + ':' + chunk + ':' + doc.kind + ':' + (doc.subtype || '') + ':' + (doc.fileIndex == null ? '' : doc.fileIndex)
}

// Pure matching shared by the Host and its search workers. Keeping it in one
// module is what makes the Worker results identical to the inline fallback.

export function scoreDoc(doc, matchIndex, queryLength, qLower) {
  let score = 100
  if (queryLength > 0) {
    if (matchIndex === 0) score += 24
    let occurrences = 0
    let cursor = 0
    while (occurrences < 8) {
      const found = doc.text.toLowerCase().indexOf(qLower, cursor)
      if (found === -1) break
      occurrences += 1
      cursor = found + Math.max(1, queryLength)
    }
    score += occurrences * 4
  }
  if (doc.kind === 'outputFiles' || doc.kind === 'inputFiles') score += 18
  else if (doc.kind === 'modelText') score += 14
  else if (doc.kind === 'userText') score += 10
  else if (doc.kind === 'reasoning') score += 7
  else score += 3
  if (doc.subtype === 'call') score += 3
  return score
}

export function makeSnippet(doc, matchIndex, queryLength) {
  if (doc.kind === 'outputFiles' || doc.kind === 'inputFiles') {
    return doc.text.replace(/\s+/g, ' ').trim()
  }
  const text = doc.text
  const radius = 110
  const start = Math.max(0, matchIndex - radius)
  const end = Math.min(text.length, matchIndex + Math.max(queryLength, 1) + radius)
  let snippet = text.slice(start, end).replace(/\s+/g, ' ').trim()
  if (start > 0) snippet = '…' + snippet
  if (end < text.length) snippet = snippet + '…'
  return snippet
}

/**
 * Scan a shard of documents. Returns only ids and scores; the Host owns the
 * records and builds the result items, so the worker never needs session data.
 */
export function scanDocs(docs, request) {
  const wanted = new Set(request.types)
  const exts = new Set(request.exts || [])
  const fileOnly = request.fileOnly === true
  const qLower = String(request.qLower || '')
  const out = []
  for (const doc of docs) {
    if (!wanted.has(doc.kind)) continue
    if (fileOnly && (!doc.ext || !exts.has(doc.ext))) continue
    if (qLower && doc.text.toLowerCase().indexOf(qLower) === -1) continue
    if (!qLower && !fileOnly) continue
    const matchIndex = qLower ? doc.text.toLowerCase().indexOf(qLower) : 0
    out.push({ id: doc.id, score: scoreDoc(doc, matchIndex, qLower.length, qLower), matchIndex })
  }
  return out
}
