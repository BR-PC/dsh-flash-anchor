# FlashAnchor 交接文档

> 更新时间：2026-11-14
> 版本：**1.7.0**（已安装；Host 半改动必须重启 DSH Desktop 生效）
> 仓库：https://github.com/BR-PC/dsh-flash-anchor
> 实现：DeepSeek-V4.1-Flash-1017（AI agent）；产品设计/测试/验收：BR-PC

## 0. 一页速览（1.7.0）

这一版的主线只有一句：**先修卡顿，再加功能**。BR-PC 的原话是“插件装上 DSH 就变卡、
拖慢整台电脑、反客为主”。逐条排查后，卡顿的三个真正元凶都**不在搜索算法**上：

| 元凶 | 证据 | 处理 |
| --- | --- | --- |
| 弹窗背景 `backdrop-filter` 全屏模糊 + 两个 620px `filter:blur(80px)` 的无限动画光斑 | CSS 里 `.ds-backdrop`/`.ds-modal`/`::before`/`::after`；合成器每帧重画整屏离屏缓冲 | 全部删除；模糊改成滑杆>0 才加的 `.is-blurred`，默认 0 |
| 启动即后台全量重建索引 | `bootstrap()` 里 `autoIndex && surfaces<records` 就 `startAll()`，26 个会话 ~29MB 日志全读一遍 | 启动不建索引；只有 `boot`（打开面板）或新会话事件才索引 |
| 结果页一次渲染 400 个按钮 / 每次搜索 await 42KB 写盘 | `ResultsDeck` 全量 map；`recordSearch` 后 `saveStateNow` | 分页 60 条滚动加载；状态写盘统一 `saveStateSoon` |

另外两条“看不见”的卡顿源也一起修了：
- 流式会话每秒发事件 → `flushDirty` 重读整个 9MB 会话；现在**面板关闭就完全不动**，
  面板打开时每个会话最多 20 秒重建一次，搜索进行中后台完全让路。
- 每 15 秒整库 persist；现在 30 秒、且搜索进行中跳过。

## 1. 十条需求逐条落地

| # | 需求 | 实现 |
| --- | --- | --- |
| 1 | 卡顿根治 + 懒加载 | 见上表；`boot/open/close` 三个动作控制“有人在看才索引” |
| 2 | 历史记录显示的用时 | 新增 `restoredMs`：缓存页显示 `恢复 Nms`，旁边才是 `原搜索 Nms` |
| 3 | 历史筛选条件失效/串台 | 历史按 `queryId(完整筛选)` 各成一条；打开条目用**它自己的**筛选；`viewSaved` + `homeRef` 保证返回首页还原原筛选 |
| 3b | 计算后置 | `SearchIndex.rememberMatches`（按 corpusVersion 的查询命中缓存）+ `store.findRelatedSaved`（同词更宽的快照里再筛） |
| 4 | 文件名搜不到 | 文件文档带 `name/ext`；`producesFiles` 关键词大幅放宽（screenshot/send/upload/…）；文件也进独立 class |
| 5 | 边搜边出结果 | 搜索只读“尚未索引”的少数会话，其余照现有索引返回并带 `pending`；Client 每 700ms 轮询 `status`，`pending` 下降就静默重搜补结果 |
| 6 | 仅筛选也能搜 | `scanDocs` 允许空查询；Client `filterOnlySearch()` 判定；Enter 即搜 |
| 7 | 长文独立索引 | `buildSurfaceDocs` 把每块前 4 段（16k）留在普通索引，其余进 `longDocs` → `long/<sessionId>.json.gz`；`status.longDocs/longSessions`；设置里独立重建/清空/自动开关 |
| 8 | 长文搜索入口 | 结果末尾与“无结果”处都有 CTA，附“可能较慢”提示；`long=1` 请求才会读长文分片 |
| 9 | 索引分类 | `corpus()` 产出 `{all, files, text}`；只筛文件时只扫 291 条（原来 12 500 条） |
| 10 | 工作区筛选 | `record.header.cwd` → `workspace` 请求参数；先收窄会话再扫文档；`/workspaces` 给出目录列表 |

## 2. 请求契约（1.7.0）

```
GET/POST /api/flash-anchor
  action=boot        -> { index, state, workspaces }       // 不等索引，面板秒开
  action=open/close  -> 面板在场/离场（懒索引开关）
  action=status      -> { index }                          // pending/running/longDocs
  action=workspaces  -> { workspaces:[{cwd,sessions,newest}] }
  action=sessions    -> 仅会话选择器需要时调用
  action=search
    q(可空) scope workspace types ext sort long sig auto limit threads preload
    -> { ..., signature, pending, longMs, savedId }
  action=saved&id=..&sig=.. -> { ..., restoredMs, originalTookMs, narrowed }
  action=index|clearIndex|setAutoIndex
  action=long&op=rebuild|clear|auto
```

关键不变量：
1. `signature` 由 Client 生成、Host 原样回显，**页面只在签名一致时渲染**。
2. `auto=1` 的请求（筛选条件变化）不写历史；只有显式搜索才写。
3. `pending>0` 或 `long=1` 的结果**不写快照**（半页/长文页不能当答案回放）。

## 3. 数据与落盘

```
$DSH_HOME/flash-anchor/
  state.json     偏好 / 历史（按完整筛选各一条）/ savedSearches（只存 ID+seq）
  index.json.gz  清单（每会话 seq/docCount/longCount）
  index/*.json.gz  普通索引分片（每会话一片，只写脏会话）
  long/*.json.gz   长文分片（每会话一片，可独立清空）
  errors.log      诊断，>1MB 轮转
```
`INDEX_VERSION=4`：v3 及更早的索引在升级时直接丢弃重建（文档结构变了）。

## 4. 测试

```
node test-core.mjs        # 契约：类型过滤、签名回显、scope 缺失、物化视图
node test-state.mjs       # 持久化、缓存作用域、耗时保留
node test-events.mjs      # session/event 载荷（旧代码必挂）
node test-prefs.mjs       # 偏好读写
node test-order.mjs       # hook 依赖顺序（TDZ）
node test-worker.mjs      # Worker 一致性、OOM 降级
node test-locate.mjs      # 23 个定位场景
node test-i18n.mjs        # 用到的 key 必须双语齐全
node test-v17.mjs         # 1.7.0：懒索引、仅筛选、工作区、长文、文件名、计算后置
node --expose-gc test-memory.mjs
node test-stress.mjs      # 17 会话 6120 文档：冷 150ms / 热 12ms / 84 种筛选排列
# 需本机库（不入库）：
node test-real-filters.mjs  node test-anchor.mjs  node bench-perf.mjs
```

## 5. 安装 / 回滚

```powershell
cd D:/DeepSeek-Harness/new_workspace/dsh-deepsearch
node --check index.js; node --check client.js
node test-v17.mjs; node test-core.mjs; node test-locate.mjs; node test-i18n.mjs
$env:npm_config_cache = "$PWD/.npm-cache"
cmd /c "npm.cmd pack"
powershell -ExecutionPolicy Bypass -File D:/DeepSeek-Harness/new_workspace/install-plugin.ps1 -Version 1.7.0
```
**Host 改动必须重启 DSH Desktop**（ESM 已缓存，禁用/启用插件不会重新导入模块）；Client 刷新窗口即可。

回滚：`install-plugin.ps1 -Version <旧版本>`（脚本会备份当前插件目录）。

## 6. 已知欠账（下一版候选）

1. `client.js` 仍是一个 4000 行文件、手写 `h()`、无类型；建议按 `locate / cache / ui` 机械拆分，
   现有测试是安全网。**不要重写**——DOM 契约风险不会因为重写而消失。
2. 定位依赖 DSH Chat DOM 契约（`data-chat-turn` 等），改版后只能降级到“该轮”；诊断在 `errors.log`。
3. 长文搜索是同步读分片 + 全段扫描，会话很多时可能到秒级；后续可做“长文也走 Worker”。
4. 历史 12 条是硬上限（`MAX_HISTORY`），按筛选集分条后更容易被填满，考虑提到 20。
5. 没有发布自动化的 GitHub Release 资产（tag 有、tgz 需手动上传）。
