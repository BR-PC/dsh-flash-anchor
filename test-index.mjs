// Index-pane and export contracts. Both are UI surfaces with no DOM harness, so
// they are pinned structurally: the header must share the row's column widths and
// sit directly above the list, the event log must be bounded and clearable, the
// long index must be explainable and rebuildable, and an export must be able to
// take a subset while telling the reader what happens to attachments.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const CLIENT = fs.readFileSync(path.join(HERE, 'client.js'), 'utf8')
const HOST = fs.readFileSync(path.join(HERE, 'index.js'), 'utf8')

const failures = []
function check(name, fn) {
  try {
    fn()
  } catch (error) {
    failures.push(name + ': ' + error.message)
  }
}

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  if (start < 0) throw new Error('missing ' + startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (end < 0) throw new Error('missing ' + endMarker)
  return source.slice(start, end)
}

const pane = between(CLIENT, 'function IndexPane(props)', 'function WelcomePane(props)')

check('the header and the rows share one column definition', () => {
  assert.ok(pane.includes('INDEX_COLS'), 'IndexPane stopped using the shared column widths')
  for (const column of ['state', 'long', 'time', 'docs', 'action']) {
    assert.ok(
      new RegExp('INDEX_COLS\\.' + column).test(pane),
      'column ' + column + ' is not laid out from INDEX_COLS',
    )
  }
  const header = pane.slice(pane.indexOf('ds-index-cols'), pane.indexOf('ds-index-row'))
  const body = pane.slice(pane.indexOf('ds-index-row'))
  for (const column of ['state', 'long', 'time', 'docs', 'action']) {
    assert.ok(header.includes('INDEX_COLS.' + column), 'the header does not lay out ' + column)
    assert.ok(body.includes('INDEX_COLS.' + column), 'a row does not lay out ' + column)
  }
})

check('the table header sits right above the list, after the event log', () => {
  const events = pane.indexOf('ds-index-events')
  const header = pane.indexOf('ds-index-cols')
  const rows = pane.indexOf('ds-index-row')
  assert.ok(events > 0 && header > 0 && rows > 0)
  assert.ok(header > events, 'the table header is still above the event log')
  assert.ok(header < rows, 'the table header is not above the rows')
})

check('the event log is bounded, scrollable and clearable', () => {
  assert.ok(CLIENT.includes('.ds-index-event-list{max-height:'), 'the event log has no height cap')
  assert.ok(/ds-index-event-list\{[^}]*overflow:auto/.test(CLIENT), 'the event log does not scroll')
  assert.ok(pane.includes('onClearEvents'), 'the event log cannot be cleared from the pane')
  assert.ok(/action: 'indexEvents'/.test(CLIENT), 'the client never asks the Host to clear events')
  assert.ok(HOST.includes("action === 'indexEvents'"), 'the Host has no indexEvents route')
  assert.ok(HOST.includes('clearIndexEvents()'), 'the Host cannot clear the event list')
})

check('the progress bar describes the corpus, not a stuck 100%', () => {
  assert.ok(/running \|\| pending > 0\s*\n\s*\? h\(/.test(pane) || pane.includes('running || pending > 0'), 'the bar is drawn even when nothing runs')
  assert.ok(pane.includes("' is-running'") && pane.includes("' is-paused'"), 'the bar has no state classes')
  assert.ok(/aria-valuenow/.test(pane), 'the bar is not a progressbar')
})

check('the long index is explainable, counted and rebuildable', () => {
  assert.ok(pane.includes('index.colLong'), 'the pane has no long-text column')
  assert.ok(pane.includes("t('index.longSummary'"), 'the pane does not report the long totals')
  assert.ok(pane.includes("t('index.longEmpty'"), 'an empty long index is unexplained')
  assert.ok(CLIENT.includes("t('long.hint')"), 'the sidebar does not say what a long document is')
  // Rebuilding while a pass runs must queue, not vanish.
  assert.ok(/longQueued = true/.test(HOST), 'a long rebuild during another pass is still dropped')
  assert.ok(HOST.includes('started: await index.rebuildLong()'), 'the long route does not report what it did')
  assert.ok(CLIENT.includes("t('long.started'") && CLIENT.includes("t('long.queued'"), 'the long rebuild has no feedback')
  assert.ok(HOST.includes('longDocs: entry?.longCount') || HOST.includes('longDocs: Number(entry?.longCount)'), 'the report stopped carrying per-session long counts')
})

check('an export can take a subset and explains attachments', () => {
  assert.ok(CLIENT.includes('export.selectedChip'), 'there is no selection feedback')
  assert.ok(CLIENT.includes("t('export.selectAll')") && CLIENT.includes("t('export.selectNone')"), 'there is no select-all control')
  assert.ok(/selectedItems\.length > 0 \? selectedItems : items/.test(CLIENT), 'export still ignores the selection')
  assert.ok(CLIENT.includes('export.doneFiles'), 'the export notice never mentions attachments')
  assert.ok(CLIENT.includes('附件：只列文件名与原始路径'), 'the exported Markdown does not state the attachment policy')
})

if (failures.length > 0) {
  console.log('flash-anchor index-pane contracts: ' + failures.length + ' FAILURES')
  for (const failure of failures) console.log('  FAIL ' + failure)
  process.exit(1)
}
console.log('flash-anchor index-pane contracts: ok')
