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
function declare(name, index) {
  if (!declared.has(name)) declared.set(name, index + 1)
}
lines.forEach((line, index) => {
  const m = line.match(/^\s+(?:const|let|function)\s+([A-Za-z_$][\w$]*)/)
  if (m) declare(m[1], index)
  // Destructuring is a declaration too: `const [workspace, setWorkspace] =
  // React.useState(...)` declares `workspace`, and missing it made a correct
  // dependency array look like a forward reference (the 1.3.4 hook-order bug
  // this test exists for is a real forward reference, so it must stay sharp).
  const array = line.match(/^\s+(?:const|let)\s+\[([^\]]+)\]\s*=/)
  if (array) {
    for (const entry of array[1].split(',')) {
      const name = entry.trim()
      if (/^[A-Za-z_$][\w$]*$/.test(name)) declare(name, index)
    }
  }
  const object = line.match(/^\s+(?:const|let)\s+\{([^}]+)\}\s*=/)
  if (object) {
    for (const entry of object[1].split(',')) {
      const name = entry.split(':').pop().trim()
      if (/^[A-Za-z_$][\w$]*$/.test(name)) declare(name, index)
    }
  }
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
