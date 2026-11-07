// Every literal t('key') used by the Client must exist in the inline
// dictionaries. A missing key renders the raw key to the user, which is how
// "jump.turnOnly" shipped.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const source = fs.readFileSync(path.join(HERE, 'client.js'), 'utf8')

const used = new Map()
for (const match of source.matchAll(/\bt\('([A-Za-z0-9_.]+)'/g)) used.set(match[1], (used.get(match[1]) || 0) + 1)

const defined = new Set()
for (const match of source.matchAll(/^\s{4,8}"([A-Za-z0-9_.]+)":/gm)) defined.add(match[1])

const missing = []
for (const key of used.keys()) {
  if (key.endsWith('.')) {
    // A dynamic family such as t('kind.' + kind): the prefix must resolve.
    if (![...defined].some((candidate) => candidate.startsWith(key))) missing.push(key + '*')
    continue
  }
  if (!defined.has(key)) missing.push(key)
}

assert.equal(missing.length, 0, 'missing i18n keys: ' + missing.join(', '))
console.log('flash-anchor i18n: ok (' + used.size + ' keys used, ' + defined.size + ' defined)')
