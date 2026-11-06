# FlashAnchor / 闪电锚点

A DSH Web GUI plugin that searches the entire stored corpus of every session:
assistant reasoning, answer text, tool calls and results, output files, user
prompts, and input files. Clicking a hit jumps to the **block** that contains it
(paragraph, code fence, file card, or tool card), expands folded disclosures,
and highlights only that block.

![icon](icon.png)

## Features

- **Block anchors**: every result carries `{turn, step, messageId, toolCallId,
  blockIndex, seatIndex, blockKind, chunk}`; the client computes the chat node
  key instead of guessing from text.
- **Sharded Worker pool**: the thread slider (1-8) selects the number of
  `worker_threads`; each worker owns a slice of the corpus. A worker crash or
  OOM (256 MB heap cap) degrades to the single-threaded scan.
- **Materialized views**: saved searches persist only result IDs, per-session
  sequence snapshots, and page metadata (no body text). Pages are rebuilt from
  the document index; history and snapshots share one id, so deleting a row
  drops the snapshot and its in-memory page. LRU cap: 50.
- **Near-memory search**: an identical query signature returns from memory for
  60 s and aborts an in-flight request.
- **Session scope**: search all sessions or one session; the selection can be
  cleared. Query already matches file names, so there is no separate suffix
  filter.
- **Appearance**: adjustable frosted-glass blur/density, persisted locally.

## Install

From this directory:

```powershell
node --check index.js
node test-core.mjs
$env:npm_config_cache = "$PWD/.npm-cache"
npm pack
# install the resulting flash-anchor-*.tgz into your DSH profile's node_modules
# and add flash-anchor to the profile bundle list, then restart DSH Desktop
```

The Host half needs a DSH restart (the client bundle reloads with the page).

## Architecture

| File | Role |
| --- | --- |
| `index.js` | Host plugin: session surface index, search, materialized views, state |
| `search-core.js` | Shared matching/scoring/snippet + doc address |
| `search-pool.js` | Worker pool, sharding, OOM/timeout degradation |
| `worker.js` | One corpus shard, scans on request |
| `client.js` | Dialog, settings, results deck, scroll router |
| `locale/*.json` | UI dictionaries |

All indexing stays on the local Host. The plugin never sends queries or session
content to a network service, contains no API keys, and writes its index under
`$DSH_HOME/flash-anchor/`.

## Tests

```bash
node test-core.mjs
node test-state.mjs
node test-prefs.mjs
node test-order.mjs
node test-worker.mjs
node --expose-gc test-memory.mjs
node test-locate.mjs
node test-anchor.mjs      # skips when no session store is present
node test-stress.mjs
```

## License

MIT. See `LICENSE`.
