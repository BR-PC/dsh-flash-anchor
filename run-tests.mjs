// One trustworthy entry point: every contract test must exit 0, and the
// runner itself exits non-zero when anything fails. Chaining tests with ";"
// in a shell hides failures because the last command decides the exit code.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const explicit = process.argv.slice(2)
const files = explicit.length > 0
  ? explicit
  : fs.readdirSync('.')
      .filter((name) => /^test-.*\.mjs$/.test(name) && name !== 'test-dom.mjs' && name !== 'test-all-sessions.mjs' && name !== 'test-real-surface.mjs')
      .sort()

const slow = new Set(['test-stress.mjs', 'test-anchor.mjs', 'test-real-filters.mjs', 'test-memory.mjs'])
const failures = []
const started = Date.now()
for (const file of files) {
  const args = file === 'test-memory.mjs' ? ['--expose-gc', file] : [file]
  const run = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 300_000 })
  const ok = run.status === 0
  const out = (run.stdout || '').trim()
  const err = (run.stderr || '').trim()
  const last = (out.split('\n').filter(Boolean).pop() || '').slice(0, 120)
  if (!ok) {
    failures.push({ file, status: run.status, signal: run.signal, out: out.slice(-1500), err: err.slice(-1500) })
  }
  process.stdout.write((ok ? 'PASS ' : 'FAIL ') + file.padEnd(26, ' ') + (ok ? last : 'exit ' + run.status) + (slow.has(file) ? '  [' + Math.round((Date.now() - started) / 1000) + 's]' : '') + '\n')
}
if (failures.length > 0) {
  console.log('\n' + failures.length + ' FAILED')
  for (const failure of failures) {
    console.log('\n=== ' + failure.file + ' (exit ' + failure.status + ')')
    console.log(failure.out)
    if (failure.err) console.log(failure.err)
  }
  process.exit(1)
}
console.log('\nall ' + files.length + ' suites passed in ' + Math.round((Date.now() - started) / 1000) + 's')
