// Guards the class of bug that shipped in 1.3.4: a hook dependency array that
// reads a binding declared later in the same component. React evaluates the deps
// array during render, so that reference throws (TDZ) and the whole dialog dies.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const source = fs.readFileSync(path.join(HERE, 'client.js'), 'utf8')
const lines = source.split('\n')

const declared = new Map()
lines.forEach((line, index) => {
  const m = line.match(/^\s+(?:const|let|function)\s+([A-Za-z_$][\w$]*)/)
  if (m && !declared.has(m[1])) declared.set(m[1], index + 1)
})

// Names that may legitimately appear without a local declaration.
const EXTERNAL = new Set([
  't', 'ctx', 'props', 'React', 'h', 'window', 'document', 'CSS', 'NodeFilter', 'Node', 'URL',
])

const violations = []
lines.forEach((line, index) => {
  const m = line.match(/\}, \[([^\]]*)\]\)/)
  if (!m) return
  for (const entry of m[1].split(',')) {
    const name = entry.trim()
    if (!name || !/^[A-Za-z_$][\w$]*$/.test(name)) continue
    if (EXTERNAL.has(name)) continue
    const at = declared.get(name)
    if (at !== undefined && at > index + 1) {
      violations.push(
        name + ' is used in a dependency array at line ' + (index + 1) + ' but declared at line ' + at,
      )
    }
  }
})

for (const violation of violations) console.error('  ' + violation)
assert.equal(violations.length, 0, violations.join('; '))
console.log('deepsearch hook order: ok (' + declared.size + ' bindings checked)')
