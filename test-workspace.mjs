// Workspace → Session cascade: a selected workspace decides which Sessions the
// picker may offer, and it must decide it the same way the Host's search does.
//
// The Host groups sessions by one exact cwd (index.js `workspaces()`) and
// narrows a search with `record.header.cwd === workspace`. The Client compared
// raw strings with a prefix test, so Windows spelling (case, separators, trailing
// slash) and subdirectories could disagree with the Host — the selector then
// "did nothing", or offered a Session the search could never match.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const SOURCE = fs.readFileSync(path.join(HERE, 'client.js'), 'utf8')

function extractFunction(name) {
  const at = SOURCE.indexOf('function ' + name + '(')
  if (at === -1) throw new Error('client.js no longer declares ' + name)
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

const HELPERS = ['normalizeCwd', 'workspaceCwds', 'cwdInWorkspace', 'sessionsInWorkspace']
const factory = new Function(
  HELPERS.map(extractFunction).join('\n') +
    '\nreturn { normalizeCwd, workspaceCwds, cwdInWorkspace, sessionsInWorkspace };',
)
const { normalizeCwd, workspaceCwds, cwdInWorkspace, sessionsInWorkspace } = factory()

const failures = []
function check(name, fn) {
  try {
    fn()
  } catch (error) {
    failures.push(name + ': ' + error.message)
  }
}

check('one spelling per path', () => {
  const one = normalizeCwd('D:\\Work\\Alpha\\')
  assert.equal(one, 'd:/work/alpha')
  assert.equal(normalizeCwd('d:/work/alpha'), one)
  assert.equal(normalizeCwd('D:/Work/Alpha///'), one)
  assert.equal(normalizeCwd(null), '')
  assert.equal(normalizeCwd(undefined), '')
})

check('a workspace owns exactly its own cwd', () => {
  assert.deepEqual([...workspaceCwds('D:\\Work\\Alpha')], ['d:/work/alpha'])
  assert.equal(workspaceCwds('').size, 0)
})

check('membership ignores Windows spelling', () => {
  assert.equal(cwdInWorkspace('d:/work/alpha', 'D:\\Work\\Alpha'), true)
  assert.equal(cwdInWorkspace('D:/work/alpha/', 'D:\\work\\alpha\\'), true)
  assert.equal(cwdInWorkspace('D:\\Work\\Beta', 'D:\\Work\\Alpha'), false)
  assert.equal(cwdInWorkspace('D:\\Work\\Alphabet', 'D:\\Work\\Alpha'), false, 'a prefix is not a match')
  assert.equal(cwdInWorkspace(null, 'D:\\Work\\Alpha'), false)
  // No workspace means every workspace.
  assert.equal(cwdInWorkspace('D:/anything', ''), true)
  assert.equal(cwdInWorkspace(null, ''), true)
})

check('a subdirectory belongs to its own workspace entry', () => {
  // The Host narrows by exact equality, so offering a nested cwd here would let
  // the panel ask for workspace + session and get an empty page.
  assert.equal(cwdInWorkspace('D:/Work/Alpha/sub', 'D:/Work/Alpha'), false)
})

check('the picker lists only the workspace sessions', () => {
  const items = [
    { id: 'a', cwd: 'D:\\Work\\Alpha' },
    { id: 'b', cwd: 'd:/work/alpha/' },
    { id: 'c', cwd: 'D:\\Work\\Beta' },
    { id: 'd', cwd: null },
  ]
  assert.deepEqual(sessionsInWorkspace(items, 'D:\\Work\\Alpha').map((item) => item.id), ['a', 'b'])
  assert.deepEqual(sessionsInWorkspace(items, '').map((item) => item.id), ['a', 'b', 'c', 'd'])
  assert.deepEqual(sessionsInWorkspace(null, 'D:\\Work\\Alpha'), [])
  assert.deepEqual(sessionsInWorkspace([null, { id: 'e', cwd: 'D:/Work/Alpha' }], 'D:/Work/Alpha').map((i) => i.id), ['e'])
})

check('the picker is actually wired to the helper', () => {
  const settings = SOURCE.slice(SOURCE.indexOf('function SettingsPane'))
  assert.ok(
    settings.includes('sessionsInWorkspace(sessionsState.items'),
    'SettingsPane stopped filtering the picker by workspace',
  )
  assert.ok(
    settings.includes('scope.emptyWorkspace'),
    'the empty workspace has no message of its own',
  )
  assert.ok(
    SOURCE.includes('cwdInWorkspace(found.cwd, next)'),
    'the selected-session cascade stopped using the shared rule',
  )
})

if (failures.length > 0) {
  console.log('flash-anchor workspace cascade: ' + failures.length + ' FAILURES')
  for (const failure of failures) console.log('  FAIL ' + failure)
  process.exit(1)
}
console.log('flash-anchor workspace cascade: ok')
