// Preference persistence contract: local storage is the restore path, so it
// must round-trip filters, the last result page, and the new switches.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const SOURCE = fs.readFileSync(path.join(HERE, 'client.js'), 'utf8')

function extractFunction(name) {
  let at = SOURCE.indexOf('function ' + name + '(')
  if (at === -1) throw new Error('client.js no longer declares ' + name)
  if (SOURCE.slice(Math.max(0, at - 6), at) === 'async ') at -= 6
  let depth = 0
  for (let index = SOURCE.indexOf('{', at); index < SOURCE.length; index += 1) {
    if (SOURCE[index] === '{') depth += 1
    else if (SOURCE[index] === '}') {
      depth -= 1
      if (depth === 0) return SOURCE.slice(at, index + 1)
    }
  }
  throw new Error('unbalanced body for ' + name)
}

function extractConst(name) {
  const at = SOURCE.indexOf('const ' + name + ' = ')
  if (at === -1) throw new Error('missing const ' + name)
  return SOURCE.slice(at, SOURCE.indexOf('\n', at))
}

const constants = ['MODEL_TYPES', 'USER_TYPES', 'ALL_TYPES', 'PREFS_KEY', 'APPEARANCE_DEFAULT']
  .map(extractConst)
  .join('\n')
const helpers = ['defaultPrefs', 'clampNumber', 'defaultTypes', 'loadPrefs', 'savePrefs']
  .map(extractFunction)
  .join('\n')

const store = new Map()
const window = {
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  },
}
const factory = new Function('window', constants + '\n' + helpers + '\nreturn { loadPrefs, savePrefs, defaultPrefs }')
const prefsApi = factory(window)

const defaults = prefsApi.loadPrefs()
assert.equal(defaults.scopeMode, 'all')
assert.equal(defaults.resultsOpen, false)

prefsApi.savePrefs({
  scopeMode: 'session',
  selectedSession: 's-1',
  objectMode: 'model',
  types: ['reasoning', 'modelText'],
  ext: 'md, pdf',
  sort: 'time',
  timeOrder: 'asc',
  query: 'handoff',
  blur: 20,
  alpha: 70,
  speculative: true,
  scatter: false,
  threads: 6,
  resultsOpen: true,
  savedId: 'abc123',
})

const loaded = prefsApi.loadPrefs()
assert.equal(loaded.scopeMode, 'session')
assert.equal(loaded.selectedSession, 's-1')
assert.deepEqual(loaded.types, ['reasoning', 'modelText'])
assert.equal(loaded.ext, 'md, pdf')
assert.equal(loaded.sort, 'time')
assert.equal(loaded.timeOrder, 'asc')
assert.equal(loaded.query, 'handoff')
assert.equal(loaded.blur, 20)
assert.equal(loaded.alpha, 70)
assert.equal(loaded.speculative, true)
assert.equal(loaded.scatter, false)
assert.equal(loaded.threads, 6)
assert.equal(loaded.resultsOpen, true)
assert.equal(loaded.savedId, 'abc123')

// Invalid values fall back instead of throwing.
store.set('flash-anchor:prefs:v1', JSON.stringify({ scopeMode: 'nope', types: ['bogus'], threads: 99 }))
const repaired = prefsApi.loadPrefs()
assert.equal(repaired.scopeMode, 'all')
assert.ok(repaired.types.includes('modelText'))
assert.equal(repaired.threads, 8)

console.log('flash-anchor preferences: ok')
