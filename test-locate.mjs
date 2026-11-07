// Locate contracts: run the real Scroll Router from client.js against a
// layout-aware DOM and assert that the *block* lands in the viewport center.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createDom, el } from './test-dom.mjs'

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const SOURCE = fs.readFileSync(path.join(HERE, 'client.js'), 'utf8')

const HELPERS = [
  'turnOfLabel',
  'turnMarks',
  'chatScroller',
  'chatViewState',
  'waitForChatView',
  'nudgeTranscript',
  'clickTurnMark',
  'delay',
  'waitForMatch',
  'snippetFragment',
  'normalizeText',
  'isSpecificFragment',
  'flowKindsFor',
  'flowKindOf',
  'escapeAttribute',
  'finiteNumber',
  'anchorOf',
  'nodeKeyOfAnchor',
  'chatSnapshot',
  'snapshotNodes',
  'nodeTextOf',
  'nodeMessageId',
  'nodeTurnOf',
  'nodeStepOf',
  'nodeKindOf',
  'nodeToolNameOf',
  'resolveNodeKey',
  'seatPartOf',
  'mountedRows',
  'pickSeatRow',
  'pickRowInTurn',
  'rowsOfTurn',
  'squashText',
  'uniqueStrings',
  'needleOf',
  'matchText',
  'blockCandidates',
  'textCandidates',
  'deepestOf',
  'findFileCard',
  'findBlockInRow',
  'nextFrame',
  'settleFrames',
  'collapsedToggles',
  'revealProcessGroup',
  'expandForBlock',
  'rectOf',
  'scrollTopOf',
  'centerElement',
  'clearJumpHighlight',
  'highlightJumpBlock',
  'loadThroughSeq',
  'waitForRow',
  'reportJump',
  'jumpToHit',
  'basename',
]

function extractFunction(name) {
  let at = SOURCE.indexOf('function ' + name + '(')
  if (at === -1) throw new Error('client.js no longer declares ' + name)
  // Keep the async modifier: slicing from 'function' would drop it.
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
  const at = SOURCE.indexOf('    const ' + name + ' = ')
  if (at === -1) throw new Error('client.js no longer declares const ' + name)
  return SOURCE.slice(at, SOURCE.indexOf('\n', at))
}

const CONSTANTS = [
  'ASSISTANT_STEP_PREFIX',
  'TOOL_CALL_PREFIX',
  'INPUT_MESSAGE_PREFIX',
  'BLOCK_SELECTOR',
  'CARD_SELECTOR',
  'BLOCK_MAX_TEXT',
  'BLOCK_MAX_CANDIDATES',
  'JUMP_VIEW_MS',
  'JUMP_LOCATE_MS',
]
  .map(extractConst)
  .join('\n')

const HELPERS_SOURCE = 'let lastJumpRow = null\n' + CONSTANTS + '\n\n' + HELPERS.map(extractFunction).join('\n\n')

const TURN2_REASONING = '用户想知道北京今天的天气，我应该先搜索天气接口，再整理明天的预报。同一句话出现在两边。'
const TURN2_DUPLICATE = '同一句话出现在两边。'
const TURN2_ANSWER = '北京今天多云转晴，气温 18-25℃，明天有小雨。同一句话出现在两边。'
const TOOL_ARGS = 'web_search\n{"query":"北京 今天 天气"}'
const TOOL_RESULT = '查询结果：北京今天多云转晴，气温 18-25℃，明天有小雨。'
const FILE_NAME = '报告.pdf'
const LONG_FRAGMENT = '块级锚点才能被唯一定位'

function p(text, height) {
  return el('p', {}, [], { text, height: height || 60 })
}

function turn2Row(attrs, children, height) {
  return el(
    'div',
    Object.assign(
      {
        'data-chat-turn': '2',
        'data-chat-node-key': '14:assistant-step2:1',
        'data-chat-flow-kind': 'assistant-step',
        'data-chat-anchor-key': '14:assistant-step2:1',
        'data-turn-process-hidden': 'true',
        hidden: true,
      },
      attrs,
    ),
    children,
    { height },
  )
}

function buildScene() {
  const dom = createDom()
  const state = { mounted5: false, mounted6: false }
  const scroller = el('div', { id: 'chat-scroller' }, [], { scrollable: true, viewport: 800 })

  // ---- Header room so early Turns can still be centered ---------------
  scroller.append(el('div', { 'data-chat-turn': '0' }, [], { height: 700 }))

  // ---- Turn 1: user prompt + input attachment -------------------------
  const userRow = el(
    'div',
    {
      'data-chat-turn': '1',
      'data-chat-node-key': '13:input-messageu-1',
      'data-chat-flow-kind': 'user',
      'data-chat-anchor-key': '13:input-messageu-1',
    },
    [
      el('div', {}, [p('帮我查一下北京今天的天气，还有明天的。', 80)]),
      el('div', { 'data-message-attachments': 'true' }, [
        el('span', { title: '输入.png' }, [el('span', {}, [], { text: '输入.png' })]),
      ]),
    ],
    { height: 200 },
  )
  scroller.append(userRow)

  // ---- Turn 2: a folded process group with reasoning/answer/tool ------
  const thinkBody = el('div', { 'data-think-body': 'true' }, [])
  const thinkBox = el('div', { 'data-variant': 'think' }, [])
  const thinkButton = el('button', { 'aria-expanded': 'false' }, [el('span', {}, [], { text: '思考' })], {
    onClick() {
      thinkButton.setAttribute('aria-expanded', 'true')
      thinkBox.setAttribute('data-expanded', 'true')
      thinkBody.append(p(TURN2_REASONING, 140))
      dom.refresh()
    },
  })
  thinkBox.append(thinkButton)
  thinkBox.append(thinkBody)
  const reasoningRow = turn2Row({ 'data-chat-group-part': 'reasoning' }, [thinkBox], 300)

  const responseRow = turn2Row({ 'data-chat-group-part': 'response' }, [
    el('div', {}, [p(TURN2_DUPLICATE, 80), p('无关的中间段落。', 80), p(TURN2_ANSWER, 120)]),
  ], 800)

  const toolBody = el('div', {}, [])
  const toolCard = el('div', { 'data-tool': 'web_search', 'data-state': 'ok' }, [])
  const toolButton = el('button', { 'aria-expanded': 'false' }, [el('span', {}, [], { text: 'web_search' })], {
    onClick() {
      toolButton.setAttribute('aria-expanded', 'true')
      toolBody.append(el('pre', {}, [el('code', {}, [], { text: TOOL_ARGS, height: 80 })], { height: 100 }))
      toolBody.append(p(TOOL_RESULT, 80))
      toolBody.append(
        el('div', { 'data-tool': 'present', 'data-state': 'ok' }, [
          el('span', {}, [], { text: FILE_NAME }),
          el('span', {}, [], { text: 'C:/out/' + FILE_NAME }),
        ]),
      )
      dom.refresh()
    },
  })
  toolCard.append(toolButton)
  toolCard.append(toolBody)
  const toolRow = el(
    'div',
    {
      'data-chat-turn': '2',
      'data-chat-node-key': '9:tool-callcall-2',
      'data-chat-flow-kind': 'tool-call',
      'data-chat-anchor-key': '9:tool-callcall-2',
      'data-turn-process-hidden': 'true',
      hidden: true,
    },
    [toolCard],
    { height: 400 },
  )

  const groupHeader = el('button', { 'aria-expanded': 'false', 'data-process-activity': 'thinking' }, [
    el('span', {}, [], { text: '已处理 2 步' }),
  ], {
    onClick() {
      groupHeader.setAttribute('aria-expanded', 'true')
      for (const row of [reasoningRow, responseRow, toolRow]) {
        row.removeAttribute('hidden')
        row.removeAttribute('data-turn-process-hidden')
      }
      dom.refresh()
    },
  })
  const group = el(
    'div',
    { 'data-chat-group-key': 'exchange-2', 'data-chat-turn': '2', 'data-step-process': 'true' },
    [
      el('div', {}, [groupHeader]),
      el('div', { 'data-step-process-body': 'true', 'data-step-process-content': 'true' }, [
        reasoningRow,
        responseRow,
        toolRow,
      ]),
    ],
  )
  scroller.append(group)

  // ---- Turn 3: a long answer with many blocks and a code fence --------
  const longBlocks = []
  for (let index = 0; index < 10; index += 1) {
    let text = '第三轮第 ' + (index + 1) + ' 段：这是一段足够长的正文，用来把命中块推到行中间。'
    if (index === 5) text = '第三轮第五段：指标中心化以后，' + LONG_FRAGMENT + '。'
    if (index === 7) text = '重复段落 甲'
    if (index === 9) text = '重复段落 乙'
    longBlocks.push(p(text, 60))
  }
  longBlocks.splice(6, 0, el('pre', {}, [el('code', {}, [], { text: "const anchor = '14:assistant-step3:1'", height: 70 })], { height: 90 }))
  const longRow = el(
    'div',
    {
      'data-chat-turn': '3',
      'data-chat-node-key': '14:assistant-step3:1',
      'data-chat-flow-kind': 'assistant-step',
      'data-chat-group-part': 'response',
      'data-chat-anchor-key': '14:assistant-step3:1',
    },
    [el('div', {}, longBlocks)],
    { height: 1640 },
  )
  scroller.append(longRow)

  // ---- Turn 4: repeats a phrase from Turn 3 ---------------------------
  const turn4 = el(
    'div',
    {
      'data-chat-turn': '4',
      'data-chat-node-key': '14:assistant-step4:1',
      'data-chat-flow-kind': 'assistant-step',
      'data-chat-group-part': 'response',
      'data-chat-anchor-key': '14:assistant-step4:1',
    },
    [el('div', {}, [p('第三轮第五段：指标中心化以后，' + LONG_FRAGMENT + '。', 120)])],
    { height: 400 },
  )
  scroller.append(turn4)

  // ---- Trailing room so centering never clamps ------------------------
  const trail = el('div', { 'data-chat-turn': '99', 'data-chat-node-key': 'tail' }, [], { height: 600 })
  scroller.append(trail)

  function appendTurn5() {
    const row = el(
      'div',
      {
        'data-chat-turn': '5',
        'data-chat-node-key': '14:assistant-step5:1',
        'data-chat-flow-kind': 'assistant-step',
        'data-chat-group-part': 'response',
        'data-chat-anchor-key': '14:assistant-step5:1',
      },
      [el('div', {}, [p('第五轮的正文内容，用来验证虚拟列表加载后的精确定位。', 120)])],
      { height: 400 },
    )
    scroller.children.splice(scroller.children.indexOf(trail), 0, row)
    row.parentElement = scroller
    state.mounted5 = true
    dom.refresh()
  }

  function appendTurn6() {
    const row = el(
      'div',
      {
        'data-chat-turn': '6',
        'data-chat-node-key': '14:assistant-step6:1',
        'data-chat-flow-kind': 'assistant-step',
        'data-chat-group-part': 'response',
        'data-chat-anchor-key': '14:assistant-step6:1',
      },
      [el('div', {}, [p('第六轮的正文内容，只能通过 loadThrough 加载。', 120)])],
      { height: 400 },
    )
    scroller.children.splice(scroller.children.indexOf(trail), 0, row)
    row.parentElement = scroller
    state.mounted6 = true
    dom.refresh()
  }

  const rail = el('div', { class: 'scroller' }, [], { scrollable: true, viewport: 200 })
  for (let turn = 1; turn <= 6; turn += 1) {
    const index = turn - 1
    rail.append(
      el('button', { 'data-index': String(index), 'aria-label': '跳到第 ' + turn + ' 轮' }, [], {
        onClick() {
          if (turn === 5 && !state.mounted5) appendTurn5()
        },
      }),
    )
  }

  dom.mount(scroller)
  dom.mount(rail)
  dom.refresh()
  return { dom, scroller, rail, state, appendTurn5, appendTurn6, snapshot: buildSnapshot() }
}

function buildSnapshot() {
  const nodes = new Map()
  const order = []
  const add = (key, node) => {
    nodes.set(key, node)
    order.push(key)
  }
  add('13:input-messageu-1', {
    key: '13:input-messageu-1',
    kind: 'user',
    anchorSeq: 1,
    location: { kind: 'turn', turn: { turn: 1 } },
    data: { messageId: 'u-1', message: { id: 'u-1', content: [{ type: 'text', text: '帮我查一下北京今天的天气，还有明天的。' }] } },
  })
  add('14:assistant-step2:1', {
    key: '14:assistant-step2:1',
    kind: 'assistant-step',
    anchorSeq: 10,
    location: { kind: 'step', turn: { turn: 2 }, step: { step: 1 } },
    data: {
      turn: 2,
      step: 1,
      blocks: [
        { kind: 'reasoning', text: TURN2_REASONING },
        { kind: 'text', text: TURN2_ANSWER },
      ],
    },
  })
  add('9:tool-callcall-2', {
    key: '9:tool-callcall-2',
    kind: 'tool-call',
    anchorSeq: 12,
    location: { kind: 'step', turn: { turn: 2 }, step: { step: 1 } },
    data: { root: { name: 'web_search', turn: 2, step: 1 } },
  })
  add('14:assistant-step3:1', {
    key: '14:assistant-step3:1',
    kind: 'assistant-step',
    anchorSeq: 20,
    location: { kind: 'step', turn: { turn: 3 }, step: { step: 1 } },
    data: { turn: 3, step: 1, blocks: [{ kind: 'text', text: '第三轮第五段：' + LONG_FRAGMENT }] },
  })
  add('14:assistant-step4:1', {
    key: '14:assistant-step4:1',
    kind: 'assistant-step',
    anchorSeq: 30,
    location: { kind: 'step', turn: { turn: 4 }, step: { step: 1 } },
    data: { turn: 4, step: 1, blocks: [{ kind: 'text', text: '第三轮第五段：' + LONG_FRAGMENT }] },
  })
  add('14:assistant-step5:1', {
    key: '14:assistant-step5:1',
    kind: 'assistant-step',
    anchorSeq: 40,
    location: { kind: 'step', turn: { turn: 5 }, step: { step: 1 } },
    data: { turn: 5, step: 1, blocks: [{ kind: 'text', text: '第五轮的正文内容' }] },
  })
  add('14:assistant-step6:1', {
    key: '14:assistant-step6:1',
    kind: 'assistant-step',
    anchorSeq: 50,
    location: { kind: 'step', turn: { turn: 6 }, step: { step: 1 } },
    data: { turn: 6, step: 1, blocks: [{ kind: 'text', text: '第六轮的正文内容' }] },
  })
  return { order, nodes }
}

function createRuntime(scene) {
  const diags = []
  const store = { current: null }
  const apiPost = (params, body) => {
    diags.push(body)
    return Promise.resolve({ ok: true })
  }
  const jumpStore = {
    set(value) {
      store.current = value
    },
  }
  const quiet = { log: console.log, warn() {}, error: console.error }
  const factory = new Function(
    'document',
    'window',
    'CSS',
    'NodeFilter',
    'jumpStore',
    'apiPost',
    'console',
    HELPERS_SOURCE +
      '\nreturn {' +
      ' jumpToHit: jumpToHit, findBlockInRow: findBlockInRow, needleOf: needleOf, matchText: matchText,' +
      ' nodeKeyOfAnchor: nodeKeyOfAnchor, pickSeatRow: pickSeatRow, resolveNodeKey: resolveNodeKey,' +
      ' blockCandidates: blockCandidates, squashText: squashText, textCandidates: textCandidates,' +
      ' nudgeTranscript: nudgeTranscript, chatScroller: chatScroller, chatViewState: chatViewState' +
      ' };',
  )
  const runtime = factory(
    scene.dom.document,
    scene.dom.window,
    scene.dom.CSS,
    scene.dom.NodeFilter,
    jumpStore,
    apiPost,
    quiet,
  )
  const binding = {
    eventSource: { getSnapshot: () => ({ entries: [] }) },
    session: {
      async loadThrough(seq) {
        if (Number(seq) >= 250 && Number(seq) < 400) scene.appendTurn6()
      },
    },
  }
  const conversation = {
    binding: () => ({
      activate() {},
      target: () => ({ getSnapshot: () => scene.snapshot }),
    }),
  }
  const ctx = {
    get(name) {
      return name === 'uiConversation' ? conversation : undefined
    },
    sessions: { binding: () => binding },
    uiConversation: conversation,
  }
  const t = (key) => key
  return { runtime, ctx, t, diags, store }
}

async function runJump(harness, target) {
  harness.diags.length = 0
  await harness.runtime.jumpToHit(harness.ctx, target, harness.t)
  return harness.diags[harness.diags.length - 1]
}

function diagnose(diag) {
  return JSON.stringify({
    ok: diag && diag.ok,
    reason: diag && diag.reason,
    keyFound: diag && diag.keyFound,
    keyHow: diag && diag.keyHow,
    seat: diag && diag.seat,
    blockText: diag && diag.blockText,
    blockRect: diag && diag.blockRect,
    rowRect: diag && diag.rowRect,
  })
}

function assertCentered(diag, label) {
  assert.ok(diag, label + ': no diagnostic was reported')
  assert.equal(diag.ok, true, label + ': ' + diagnose(diag))
  const half = diag.blockRect && diag.blockRect.viewport ? diag.blockRect.viewport / 2 : 400
  const drift = Math.abs(diag.blockRect.center - half)
  assert.ok(drift <= 8, label + ': block center drifted ' + drift + 'px: ' + diagnose(diag))
}

const checks = []
function record(name) {
  checks.push(name)
}

// 1. Long answer row: the hit block, not the row, must be centered.
{
  const scene = buildScene()
  const harness = createRuntime(scene)
  const diag = await runJump(harness, {
    sessionId: 's1',
    kind: 'modelText',
    turn: 3,
    step: 1,
    seq: 100,
    messageId: 'm-3',
    blockIndex: 6,
    seatIndex: 5,
    anchor: { turn: 3, step: 1, messageId: 'm-3', blockIndex: 6, seatIndex: 5, blockKind: 'text', chunk: 0 },
    fragment: LONG_FRAGMENT,
    query: '块级锚点',
  })
  assertCentered(diag, 'long answer block')
  assert.equal(diag.keyFound, '14:assistant-step3:1')
  assert.equal(diag.seat, 'response')
  assert.equal(diag.reason, 'block')
  assert.ok(diag.blockText.indexOf('第三轮第五段') === 0, 'long answer block text: ' + diagnose(diag))
  assert.equal(diag.rowRect.height, 1640)
  const rowDrift = Math.abs(diag.rowRect.center - 400)
  assert.ok(rowDrift > 100, 'the row center must not be what was centered (drift ' + rowDrift + ')')
  record('long answer block')
}

// 2. Code fence: deepest match is the code block and it is centered.
{
  const scene = buildScene()
  const harness = createRuntime(scene)
  const diag = await runJump(harness, {
    sessionId: 's1',
    kind: 'modelText',
    turn: 3,
    step: 1,
    seq: 101,
    anchor: { turn: 3, step: 1, blockIndex: 7, seatIndex: 6, blockKind: 'text', chunk: 0 },
    fragment: 'const anchor =',
    query: 'const anchor',
  })
  assertCentered(diag, 'code block')
  assert.equal(diag.reason, 'block')
  assert.ok(diag.blockText.indexOf('const anchor') === 0, 'code block text: ' + diagnose(diag))
  assert.equal(diag.blockRect.height, 90)
  record('code block')
}

// 3. The same phrase exists in Turn 4; a Turn 3 hit must stay in Turn 3.
{
  const scene = buildScene()
  const harness = createRuntime(scene)
  const diag = await runJump(harness, {
    sessionId: 's1',
    kind: 'modelText',
    turn: 3,
    step: 1,
    seq: 102,
    fragment: LONG_FRAGMENT,
    query: '块级锚点',
  })
  assertCentered(diag, 'turn boundary (turn 3)')
  assert.equal(diag.keyFound, '14:assistant-step3:1')
  assert.ok(diag.blockText.indexOf('第三轮第五段') === 0, diagnose(diag))
  assert.equal(diag.turnRows > 0, true)
  record('turn boundary (turn 3)')
}

// 4. A Turn 4 hit stays in Turn 4 even though Turn 3 has the same text.
{
  const scene = buildScene()
  const harness = createRuntime(scene)
  const diag = await runJump(harness, {
    sessionId: 's1',
    kind: 'modelText',
    turn: 4,
    step: 1,
    seq: 103,
    fragment: LONG_FRAGMENT,
    query: '块级锚点',
  })
  assertCentered(diag, 'turn boundary (turn 4)')
  assert.equal(diag.keyFound, '14:assistant-step4:1')
  record('turn boundary (turn 4)')
}

// 5. A folded reasoning chain: open the process group and the disclosure,
//    land in the reasoning seat.
{
  const scene = buildScene()
  const harness = createRuntime(scene)
  const diag = await runJump(harness, {
    sessionId: 's1',
    kind: 'reasoning',
    turn: 2,
    step: 1,
    seq: 110,
    messageId: 'm-2',
    blockIndex: 0,
    seatIndex: 0,
    anchor: { turn: 2, step: 1, messageId: 'm-2', blockIndex: 0, seatIndex: 0, blockKind: 'reasoning', chunk: 0 },
    fragment: '搜索天气接口',
    query: '天气接口',
  })
  assertCentered(diag, 'reasoning seat')
  assert.equal(diag.seat, 'reasoning')
  assert.ok(diag.expanded >= 2, 'reasoning expansion count: ' + diagnose(diag))
  assert.ok(diag.blockText.indexOf('搜索天气接口') !== -1, 'reasoning block text: ' + diagnose(diag))
  record('reasoning seat')
}

// 6. Duplicate sentence in reasoning and answer: text kind must pick answer;
//    two matching answer paragraphs are disambiguated by seatIndex.
{
  const scene = buildScene()
  const harness = createRuntime(scene)
  const diag = await runJump(harness, {
    sessionId: 's1',
    kind: 'modelText',
    turn: 2,
    step: 1,
    seq: 111,
    messageId: 'm-2',
    blockIndex: 1,
    seatIndex: 2,
    anchor: { turn: 2, step: 1, messageId: 'm-2', blockIndex: 1, seatIndex: 2, blockKind: 'text', chunk: 0 },
    fragment: '同一句话出现在两边',
    query: '同一句话',
  })
  assertCentered(diag, 'duplicate sentence')
  assert.equal(diag.seat, 'response')
  assert.ok(diag.blockText.indexOf('北京今天') !== -1, 'duplicate sentence picked the wrong block: ' + diagnose(diag))
  record('duplicate sentence')
}

// 7. Tool call: the card is expanded and the log block is centered.
{
  const scene = buildScene()
  const harness = createRuntime(scene)
  const diag = await runJump(harness, {
    sessionId: 's1',
    kind: 'tools',
    subtype: 'call',
    turn: 2,
    step: 1,
    seq: 112,
    toolName: 'web_search',
    anchor: { turn: 2, step: 1, toolCallId: 'call-2', blockIndex: 0, blockKind: 'tool-call', chunk: 0 },
    fragment: 'web_search',
    query: 'web_search',
  })
  assertCentered(diag, 'tool call')
  assert.equal(diag.keyFound, '9:tool-callcall-2')
  assert.ok(diag.blockText.indexOf('web_search') !== -1, 'tool call block text: ' + diagnose(diag))
  record('tool call')
}

// 8. Tool result: only visible after the card expands.
{
  const scene = buildScene()
  const harness = createRuntime(scene)
  const diag = await runJump(harness, {
    sessionId: 's1',
    kind: 'tools',
    subtype: 'result',
    turn: 2,
    step: 1,
    seq: 113,
    toolName: 'web_search',
    anchor: { turn: 2, step: 1, toolCallId: 'call-2', blockIndex: 0, blockKind: 'tool-result', chunk: 0 },
    fragment: '查询结果',
    query: '查询结果',
  })
  assertCentered(diag, 'tool result')
  assert.ok(diag.blockText.indexOf('查询结果') === 0, 'tool result block text: ' + diagnose(diag))
  record('tool result')
}

// 9. Output file with no text fragment: land on the file card, same Turn.
{
  const scene = buildScene()
  const harness = createRuntime(scene)
  const diag = await runJump(harness, {
    sessionId: 's1',
    kind: 'outputFiles',
    subtype: 'file',
    turn: 2,
    step: 1,
    seq: 114,
    anchor: {
      turn: 2,
      step: 1,
      toolCallId: 'call-2',
      blockIndex: 0,
      blockKind: 'tool-call',
      file: FILE_NAME,
      chunk: 0,
    },
    files: [{ name: FILE_NAME, path: 'C:/out/' + FILE_NAME }],
    query: '',
    fragment: '',
    snippet: FILE_NAME,
  })
  assertCentered(diag, 'output file')
  assert.equal(diag.reason, 'file')
  assert.ok(diag.blockText.indexOf(FILE_NAME) !== -1, 'output file card text: ' + diagnose(diag))
  assert.equal(diag.keyFound, '9:tool-callcall-2')
  record('output file')
}

// 10. Input file: the user attachment card.
{
  const scene = buildScene()
  const harness = createRuntime(scene)
  const diag = await runJump(harness, {
    sessionId: 's1',
    kind: 'inputFiles',
    subtype: 'file',
    turn: 1,
    seq: 115,
    messageId: 'u-1',
    anchor: { turn: 1, step: null, messageId: 'u-1', blockIndex: 1, blockKind: 'file', file: '输入.png', chunk: 0 },
    files: [{ name: '输入.png', path: null }],
    query: '',
    fragment: '',
    snippet: '输入.png',
  })
  assertCentered(diag, 'input file')
  assert.equal(diag.keyFound, '13:input-messageu-1')
  assert.ok(diag.blockText.indexOf('输入.png') !== -1, 'input file card text: ' + diagnose(diag))
  record('input file')
}

// 11. User prompt text.
{
  const scene = buildScene()
  const harness = createRuntime(scene)
  const diag = await runJump(harness, {
    sessionId: 's1',
    kind: 'userText',
    turn: 1,
    seq: 116,
    messageId: 'u-1',
    anchor: { turn: 1, step: null, messageId: 'u-1', blockIndex: 0, blockKind: 'text', chunk: 0 },
    fragment: '北京今天的天气',
    query: '天气',
  })
  assertCentered(diag, 'user prompt')
  assert.equal(diag.keyFound, '13:input-messageu-1')
  assert.ok(diag.blockText.indexOf('北京今天的天气') !== -1, diagnose(diag))
  record('user prompt')
}

// 12. Unmounted Turn: the rail click mounts it, then the block is centered.
{
  const scene = buildScene()
  const harness = createRuntime(scene)
  const before = scene.dom.document.querySelectorAll('[data-chat-turn="5"]').length
  assert.equal(before, 0)
  const diag = await runJump(harness, {
    sessionId: 's1',
    kind: 'modelText',
    turn: 5,
    step: 1,
    seq: 200,
    anchor: { turn: 5, step: 1, blockIndex: 0, seatIndex: 0, blockKind: 'text', chunk: 0 },
    fragment: '第五轮的正文内容',
    query: '第五轮',
  })
  assertCentered(diag, 'unmounted turn by rail')
  assert.equal(diag.keyFound, '14:assistant-step5:1')
  record('unmounted turn by rail')
}

// 13. Unmounted Turn recovered by loadThrough after the rail click misses.
{
  const scene = buildScene()
  const harness = createRuntime(scene)
  const diag = await runJump(harness, {
    sessionId: 's1',
    kind: 'modelText',
    turn: 6,
    step: 1,
    seq: 300,
    anchor: { turn: 6, step: 1, blockIndex: 0, seatIndex: 0, blockKind: 'text', chunk: 0 },
    fragment: '第六轮的正文内容',
    query: '第六轮',
  })
  assertCentered(diag, 'unmounted turn by loadThrough')
  assert.equal(diag.keyFound, '14:assistant-step6:1')
  assert.equal(diag.loadedThrough, true)
  record('unmounted turn by loadThrough')
}

// 14. A Turn that never mounts must fail loudly and must not jump elsewhere.
{
  const scene = buildScene()
  const harness = createRuntime(scene)
  const diag = await runJump(harness, {
    sessionId: 's1',
    kind: 'modelText',
    turn: 9,
    step: 1,
    seq: 999,
    anchor: { turn: 9, step: 1, blockIndex: 0, seatIndex: 0, blockKind: 'text', chunk: 0 },
    fragment: '第九轮不存在',
    query: '第九轮',
  })
  assert.ok(diag, 'missing turn: no diagnostic')
  assert.equal(diag.ok, false, 'missing turn must not report success: ' + diagnose(diag))
  assert.equal(diag.reason, 'not-mounted')
  assert.equal(diag.turnRows, 0)
  record('missing turn fails loudly')
}

// 15. A fragment that no block contains degrades to the Turn, not to a lie.
{
  const scene = buildScene()
  const harness = createRuntime(scene)
  const diag = await runJump(harness, {
    sessionId: 's1',
    kind: 'modelText',
    turn: 4,
    step: 1,
    seq: 104,
    anchor: { turn: 4, step: 1, blockIndex: 0, seatIndex: 0, blockKind: 'text', chunk: 0 },
    fragment: 'zzzz-not-there',
    query: 'zzzz',
  })
  assert.ok(diag, 'partial: no diagnostic')
  assert.equal(diag.ok, false)
  assert.equal(diag.partial, 'turn-only')
  assert.equal(diag.keyFound, '14:assistant-step4:1')
  record('degraded to turn')
}

// 16. seatIndex breaks a duplicate-text tie inside one row.
{
  const scene = buildScene()
  const harness = createRuntime(scene)
  const row = el('div', {}, [
    el('div', {}, [p('重复段落 甲', 60), p('其他段落', 60), p('重复段落 乙', 60)]),
  ])
  const first = harness.runtime.findBlockInRow(row, { kind: 'modelText', fragment: '重复段落', anchor: { seatIndex: 0 } })
  const last = harness.runtime.findBlockInRow(row, { kind: 'modelText', fragment: '重复段落', anchor: { seatIndex: 2 } })
  assert.ok(first.element && first.element.textContent.indexOf('甲') !== -1, 'tie-break first: ' + (first.element && first.element.textContent))
  assert.ok(last.element && last.element.textContent.indexOf('乙') !== -1, 'tie-break last: ' + (last.element && last.element.textContent))
  record('seatIndex tie-break')
}

// 17. Markdown syntax in the raw snippet still matches rendered text.
{
  const scene = buildScene()
  const harness = createRuntime(scene)
  assert.ok(harness.runtime.matchText('加粗的文本和代码片段', '**加粗的**文本') > 0)
  assert.ok(harness.runtime.matchText('普通段落', '**完全不同的内容**') === 0)
  record('markdown needle')
}


// 18. Cold open: the Chat view of the target Session mounts *after* the click.
//     The jump must wait for the view instead of reporting not-mounted.
{
  const dom = createDom()
  const scroller = el('div', { id: 'chat-scroller' }, [], { scrollable: true, viewport: 800 })
  scroller.append(el('div', { 'data-chat-turn': '0' }, [], { height: 700 }))
  dom.mount(scroller)
  const rail = el('div', { class: 'scroller' }, [], { scrollable: true, viewport: 200 })
  for (let turn = 1; turn <= 3; turn += 1) {
    rail.append(el('button', { 'data-index': String(turn - 1), 'aria-label': '跳到第 ' + turn + ' 轮' }, [], {}))
  }
  dom.mount(rail)
  dom.refresh()
  const scene = {
    dom,
    scroller,
    rail,
    snapshot: buildSnapshot(),
    async appendTurn6() {},
    mountTurn3() {
      scroller.append(
        el(
          'div',
          {
            'data-chat-turn': '3',
            'data-chat-node-key': '14:assistant-step3:1',
            'data-chat-flow-kind': 'assistant-step',
            'data-chat-group-part': 'response',
            'data-chat-anchor-key': '14:assistant-step3:1',
          },
          [el('div', {}, [p('第三轮第五段：指标中心化以后，' + LONG_FRAGMENT + '。', 200)])],
          { height: 600 },
        ),
      )
      dom.refresh()
    },
  }
  const harness = createRuntime(scene)
  const mounting = new Promise((resolve) => setTimeout(() => (scene.mountTurn3(), resolve()), 900))
  const diag = await runJump(harness, {
    sessionId: 's1',
    kind: 'modelText',
    turn: 3,
    step: 1,
    seq: 100,
    messageId: 'm-3',
    blockIndex: 0,
    seatIndex: 0,
    anchor: { turn: 3, step: 1, messageId: 'm-3', blockIndex: 0, seatIndex: 0, blockKind: 'text', chunk: 0 },
    fragment: LONG_FRAGMENT,
    query: '块级锚点',
  })
  await mounting
  assertCentered(diag, 'cold open waits for the view')
  assert.equal(diag.keyFound, '14:assistant-step3:1')
  assert.equal(diag.reason, 'block')
  record('cold open waits for the view')
}

// 19. Strict anchor: a hit whose own node is absent must never be swapped for
//     a different message that happens to sit in the same Turn.
{
  const scene = buildScene()
  const harness = createRuntime(scene)
  const resolved = harness.runtime.resolveNodeKey(harness.ctx, {
    sessionId: 's1',
    kind: 'userText',
    turn: 2,
    seq: 999,
    messageId: 'u-9',
    anchor: { turn: 2, seq: 999, messageId: 'u-9', blockIndex: 0, blockKind: 'text', chunk: 0 },
    fragment: '不存在的用户消息',
  })
  assert.equal(resolved.key, '13:input-messageu-9', 'strict resolution invented another node: ' + JSON.stringify(resolved))
  assert.equal(resolved.how, 'anchor-unverified')
  const diag = await runJump(harness, {
    sessionId: 's1',
    kind: 'userText',
    turn: 2,
    seq: 999,
    messageId: 'u-9',
    anchor: { turn: 2, seq: 999, messageId: 'u-9', blockIndex: 0, blockKind: 'text', chunk: 0 },
    fragment: '不存在的用户消息',
    query: '不存在的用户消息',
  })
  assert.ok(diag, 'strict anchor: no diagnostic')
  assert.equal(diag.ok, false, 'strict anchor must not report success: ' + diagnose(diag))
  assert.equal(diag.reason, 'not-mounted')
  assert.equal(diag.keyFound, '13:input-messageu-9')
  record('strict anchor refuses a same-turn swap')
}

// 20. Identity by seq: when the rendered node key differs from the stored
//     message id but the event seq is exactly the node's anchor, use it.
{
  const scene = buildScene()
  const harness = createRuntime(scene)
  const resolved = harness.runtime.resolveNodeKey(harness.ctx, {
    sessionId: 's1',
    kind: 'userText',
    turn: 1,
    seq: 1,
    messageId: 'u-9',
    anchor: { turn: 1, seq: 1, messageId: 'u-9', blockIndex: 0, blockKind: 'text', chunk: 0 },
    fragment: '北京今天',
  })
  assert.equal(resolved.key, '13:input-messageu-1', 'seq-exact did not recover the node: ' + JSON.stringify(resolved))
  assert.equal(resolved.how, 'seq-exact')
  record('seq-exact recovers a re-keyed node')
}

// 21. The transcript nudge moves a virtual list toward an unmounted Turn.
{
  const dom = createDom()
  const scroller = el('div', { id: 'chat-scroller' }, [], { scrollable: true, viewport: 800 })
  for (let turn = 1; turn <= 3; turn += 1) {
    scroller.append(el('div', { 'data-chat-turn': String(turn) }, [], { height: 600 }))
  }
  dom.mount(scroller)
  dom.refresh()
  const scene = { dom, scroller, snapshot: buildSnapshot(), async appendTurn6() {} }
  const harness = createRuntime(scene)
  const before = scroller.scrollTop
  const moved = await harness.runtime.nudgeTranscript(9)
  assert.equal(moved, true, 'nudge did not move the transcript')
  assert.ok(scroller.scrollTop > before, 'nudge moved the wrong way: ' + scroller.scrollTop)
  const up = await harness.runtime.nudgeTranscript(1)
  assert.equal(up, false, 'nudge with the Turn already mounted-area must not move: ' + scroller.scrollTop)
  record('transcript nudge moves toward the Turn')
}


// 22. A user bubble built from plain divs/span (no <p>): the generic leaf match
//     must still land on the block instead of degrading to the whole row.
{
  const scene = buildScene()
  const harness = createRuntime(scene)
  const row = el('div', { 'data-chat-turn': '1' }, [
    el('div', { class: 'bubble' }, [el('span', {}, [], { text: '我上次说的那句话是蓝色的' })]),
  ])
  const found = harness.runtime.findBlockInRow(row, { kind: 'userText', fragment: '那句话', anchor: { blockIndex: 0 } })
  assert.equal(found.reason, 'block', 'user bubble was not located as a block: ' + JSON.stringify(found.reason))
  assert.ok(found.element && found.element.textContent.indexOf('那句话') !== -1)
  record('user bubble without semantic tags')
}

// 23. A reasoning body of plain divs (no <p>) must resolve to its leaf too.
{
  const scene = buildScene()
  const harness = createRuntime(scene)
  const row = el('div', { 'data-chat-turn': '2' }, [
    el('div', { class: 'think-body' }, [
      el('div', {}, [el('span', {}, [], { text: '先看日志，再决定要不要重启服务' })]),
    ]),
  ])
  const found = harness.runtime.findBlockInRow(row, { kind: 'reasoning', fragment: '先看日志', anchor: { blockIndex: 0 } })
  assert.equal(found.reason, 'block', 'reasoning body was not located as a block: ' + JSON.stringify(found.reason))
  assert.ok(found.element && found.element.textContent.indexOf('先看日志') !== -1)
  record('reasoning body without semantic tags')
}

console.log('deepsearch locate contracts: ok (' + checks.length + ' scenarios)')
for (const name of checks) console.log('  PASS ' + name)
process.exit(0)
