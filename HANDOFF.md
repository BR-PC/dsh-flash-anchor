# FlashAnchor 交接文档

> 更新时间：2026-11-15
> 版本：**1.8.3**（本地已安装，**未推送**；Host 半改动必须重启 DSH Desktop 生效）
> 仓库：https://github.com/BR-PC/dsh-flash-anchor
> 实现：DeepSeek-V4.1-Flash-1017（AI agent）；产品设计/测试/验收：BR-PC

## 0. 1.8.3：跳转全废的真因 —— Client 的 sessions 契约是 retain，不是 binding

日志证据（`diagnostics.log`）：

```json
{"type":"client:jump","turn":3,"kind":"tools","reason":"no-session-binding","ms":6007,"viewport":924}
{"type":"client:jump","turn":3,"step":4,"reason":"not-mounted","turnRows":0,"rowsTotal":0,"ms":11697}
```

`ctx.sessions.binding(id)` 只是**借用**（"Borrow an already-retained Session binding"），
没有别人 retain 时就返回 undefined。旧代码拿它当“打开会话”，于是永远等不到 → 6 秒超时 → `no-session-binding`，
后续所有逻辑（滚动、展开、定位）全部落空。Client 换到 retain/release 之后必然复现。

正确姿势（Client 契约）：

```ts
interface SessionReference { readonly binding: SessionBinding; readonly ready: Promise<SessionBinding>; release(): void }
ctx.sessions.retain(id, { source: 'gateway' })  // 立刻返回 reference
await reference.ready                          // 真正的 binding
try { ... } finally { reference.release() }
```

修法：新增 `acquireSession()`（retain → 竞速 ready 6s → 释放；老版本回退 binding），
`jumpToHit` 的 finally 里必定 release。诊断新增 `retained`。

**为什么测试没抓到**：假 DOM 的 `ctx.sessions.binding: () => binding` 永远返回值，
等于把 bug 挡在测试之外。现在 harness 改为
`retain() -> { binding, ready: Promise.resolve(binding), release() }`，并新增第 25 个场景
「没有 retained generation 时必须 1.5s 内报 no-session-binding，不许挂死」。

**同版修正**：`tools` 行不再一律写“工具调用”，`subtype === 'result'` 显示「工具结果」，
筛选 chip 文案改为「工具调用/结果」。这就是“工具调用里全是正文”的来源。

## 0. 1.8.2：上下文注入不再算“输入正文”

**现象**：按「输入正文」过滤搜 `bug`，命中里出现 `# 上下文注入 · skill-catalog` 这类记录；
它们的 `type` 是 `user/message`、`role` 是 `user`，看起来就是用户消息。

**真因**：DSH 把注入内容（技能目录、运行时快照、时间、压缩检查点、审批提示…）也存成
`user/message`，区别在 `data.source.kind`：

| source.kind | 是否用户输入 | 索引类型（1.8.2） |
| --- | --- | --- |
| `user` / `steering` | 是 | `userText` |
| `runtime-context` / `skill-catalog` / `time-context` / `ptc-mode` / `compact-checkpoint` / `tool-jobs` / `model-selection` / `repeat-tool-reminder` / `user-approval` | 否 | **`context`（新类型）** |
| 无 `source`（旧会话） | 是 | `userText` |

- 新类型 `context` 与其它类型平级，可单独勾选/取消；默认不勾选（老用户的存档偏好里没有它）。
- `system/message`、`developer/message` 仍然不索引（系统提示词只是噪音）。
- 块级锚点保持不变：`blockKind` 仍是 `text`，只是 `kind` 不同，所以定位链路零改动。
- 回归测试：`test-v17.mjs` 新增「injected context is not user input」（断言 kind、标题不被注入污染）。

**同版 UI**
- 面板整体改为不透明（`--ds-alpha: 100%`），不再透出下层会话文字。
- 「最近搜索」改为卡片（底色 + 边框 + 圆角），关键词 13.5px、筛选胶囊 10.5px。
- 目标类型新增「上下文注入」分组（仅“全部”模式下显示）。

## 0. 1.8.0：定位修复 + 日志收集

### 0.1 定位为什么老是失败（有日志证据）

`diagnostics.log` 里两次真实失败都是同一种形态：

```json
{"type":"client:jump","session":"cc869b2c-…","turn":270,"kind":"userText",
 "keyExpected":"13:input-messageb8153b89-…","keyHow":"anchor-unverified",
 "keyFound":"13:input-messageb8153b89-…","turnRows":12,"turnMark":true,
 "loadedThrough":true,"reason":"not-mounted","ms":5033}
```

- `turnRows: 12` → 这一轮**已经挂载了**，轮次没问题；
- `turnMark/loadedThrough: true` → 轨迹栏点了、`loadThrough` 也跑了；
- 但 `data-chat-node-key="13:input-message<b8153b89>"` 在 DOM 里不存在 → 一直重试到超时，报 `not-mounted`。

结论：**节点 key 失配**（会话被压缩 / 消息被重新编号后，正文还在，key 变了），
而旧代码只在“压根没有 key”时才用轮内兜底，有 key 但 key 失效时从不下探 —— 这就是“常谈常犯”的根因。

### 0.2 修法：三级定位 + 文本兜底（只认文本，不认邻居）

```
1) 精确 key（pickSeatRow）                    ← 原逻辑
2) key 失效 → 本轮内包含命中文本的行            ← 新增（pickRowByText(turn)）
3) 本轮没挂载 → 全量已挂载行里包含命中文本的行   ← 新增（pickRowByText(null)）
4) 都没有 → 明确失败，绝不拿同轮邻居顶替
```
第 2/3 级都要求该行 **确实包含** 命中文本（先 normalize 精确匹配，再 squash 去符号模糊匹配），
所以“跳到同轮别的消息”这条老毛病不会因为兜底而回来。诊断里新增 `pickHow`（key/turn-text/text-scan）、
`rowsTotal`、`query`、`snippet`、`viewport`、`blockReason`。

回归测试：`test-locate.mjs` 24 场景，新增「stale key falls back to the message text」
（key 指向不存在的 u-999，正文在 u-1 的气泡里 → 必须成功且落在含该文本的块）。

### 0.3 日志收集（侧边栏）

- 侧边栏底部新增「日志收集」：开关 + **日志完整路径** + 体积 + 复制路径 / 清空。
- 默认开启；关闭后不再写入。开关状态存在 `state.json` 的 `logCollection`。
- 文件：`$DSH_HOME/flash-anchor/diagnostics.log`，**每行一个 JSON**，超过 8 MB 轮转到 `.1`。
- 记录内容：
  | type | 内容 |
  | --- | --- |
  | `panel` | 面板打开/关闭 |
  | `search` | 关键词、筛选（scope/workspace/types/exts/sort/long）、auto、命中数、pending、扫描量、模式、耗时分解、签名 |
  | `client:jump` | 完整定位轨迹（见 0.1 的字段 + pickHow/rowsTotal/blockRect…） |
  | `error` | 请求失败的动作、消息、堆栈 |
- `errors.log` 仍保留（异常堆栈，始终写）。

## 1. 1.7.x 的关键改动（仍然有效）

| 版本 | 内容 |
| --- | --- |
| 1.7.0 | 卡顿根治：删全屏 `backdrop-filter` 与动画光斑、启动不建索引、面板关闭即停索引、结果分页；历史按筛选集成条、计算后置、文件名可搜、边索引边出结果、仅筛选可搜、长文索引、工作区 |
| 1.7.1 | 修复回归：快照门控导致卡在“正在检索”、打开历史改写侧边栏筛选、索引进度不可见、未索引时工作区为空；索引异步并行解压（320→226ms）；移除模糊设置项、目标类型改勾选、字号加大 |

## 2. 请求契约

```
action=boot        -> { index, state, workspaces, log }
action=open/close  -> 面板在场/离场（懒索引开关）
action=status      -> { index }（ready/pending/running/longDocs）
action=workspaces  -> 只读会话表，立即返回
action=log         -> { log:{enabled,path,bytes,updated} }；POST {enabled}/{clear}
action=diag        -> 追加一条 client:* 诊断（写入 diagnostics.log）
action=search      q(可空) scope workspace types ext sort long sig auto limit threads
action=saved&id=.. -> { restoredMs, originalTookMs, narrowed }
action=index|clearIndex|setAutoIndex
action=long&op=rebuild|clear|auto
```

不变量：Client 生成 `signature`、Host 回显，**渲染以签名为门**；快照页以自己的签名渲染；
`auto=1` 不写历史；`pending>0` 或 `long=1` 不写快照。

## 3. 落盘

```
$DSH_HOME/flash-anchor/
  state.json        偏好 / 历史 / savedSearches / autoIndex / autoLong / logCollection
  index.json.gz     清单（seq/docCount/longCount）
  index/*.json.gz   普通索引分片（每会话一片）
  long/*.json.gz    长文分片（可独立清空）
  diagnostics.log   结构化诊断（JSONL，可关可清，8MB 轮转）
  errors.log        异常堆栈，1MB 轮转
```

## 4. 测试

```
node test-core.mjs  test-state.mjs  test-events.mjs  test-prefs.mjs  test-order.mjs
node test-worker.mjs  test-locate.mjs(24)  test-i18n.mjs  test-v17.mjs  test-diag.mjs
node --expose-gc test-memory.mjs  test-stress.mjs
# 需本机库（不入库）：test-real-filters.mjs  test-anchor.mjs  bench-perf.mjs  bench-open.mjs
```

## 5. 安装 / 回滚

```powershell
cd D:/DeepSeek-Harness/new_workspace/dsh-deepsearch
node --check index.js; node --check client.js
node test-locate.mjs; node test-core.mjs; node test-v17.mjs; node test-diag.mjs
$env:npm_config_cache = "$PWD/.npm-cache"
cmd /c "npm.cmd pack"
powershell -ExecutionPolicy Bypass -File D:/DeepSeek-Harness/new_workspace/install-plugin.ps1 -Version 1.8.0
```
**Host 改动必须重启 DSH Desktop**；Client 刷新窗口即可（Ctrl+R）。

## 6. 已知欠账

1. `client.js` 仍是单文件、手写 `h()`、无类型；建议按 `locate / cache / ui` 机械拆分（别重写）。
2. 定位的第 3 级（全量文本扫描）依赖命中文本足够长；极短片段（1–2 字）可能仍然失败并明确报错。
3. 打开面板仍会把 26 个分片解压进内存（约 226 ms，已不阻塞）；下一步可改「按需加载分片」。
4. 长文搜索是同步读分片 + 全段扫描，会话很多时可能到秒级。
5. 历史 12 条硬上限，按筛选集分条后更容易填满，考虑提到 20。
6. `diagnostics.log` 只轮转一份（8 MB + 8 MB）；如果要做长期观测，需要按天分文件。
