import { __test } from './index.js'
const { StateStore } = __test
const store = new StateStore()
let t = performance.now()
await store.load()
console.log('state.load', (performance.now() - t).toFixed(1), 'ms')
t = performance.now()
const cached = await store.loadIndex()
console.log('loadIndex', (performance.now() - t).toFixed(1), 'ms', cached ? Object.keys(cached.sessions).length + ' shards' : 'null (rebuild)')
if (cached) {
  const docs = Object.values(cached.sessions).reduce((sum, entry) => sum + (entry.docs?.length || 0), 0)
  console.log('docs', docs)
}
