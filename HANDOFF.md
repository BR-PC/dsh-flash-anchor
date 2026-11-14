# FlashAnchor 交接文档

> 更新时间：2026-11-15
> 版本：**1.7.1**（已安装；Host 半改动必须重启 DSH Desktop 生效）
> 仓库：https://github.com/BR-PC/dsh-flash-anchor
> 实现：DeepSeek-V4.1-Flash-1017（AI agent）；产品设计/测试/验收：BR-PC

## 0. 1.7.1：把 1.7.0 的回归修掉

1.7.0 交付后 BR-PC 实测出 5 个问题，全部来自 1.7.0 的改动本身：

| 报告 | 根因 | 修法 |
| --- | --- | --- |
| 重开插件不恢复上次结果，且**一直卡在“正在检索”** | 打开历史快照时把 `viewSaved.signature` 用作渲染门控，但随后任何一次实时搜索都不清 `viewSaved`，签名永远对不上 → 骨架屏永久；另外 `resultsOpen=true` 但没有 `savedId` 时也会开一个永远填不满的骨架 | `runSearch` 一开始就 `setViewSaved(null)`；只有 `resultsOpen && savedId` 才恢复；20s 看门狗强制收尾并报错 |
| 打开历史记录会**改写侧边栏筛选**，随后“筛选失效” | `loadSaved` 里 `applyFilters(entryFilters)` 把快照的筛选写进了用户的筛选状态 | 打开快照**只读**：不动侧边栏；快照页用快照签名渲染，实时搜索/改筛选才离开快照 |
| “更新索引”像失效、自动索引没有提示 | 客户端只在 `ready=false` 或 `pending>0` 时轮询，`indexStatus.running` 从不刷新 | 新增 running 轮询（1s）；侧边栏与首页都显示“正在索引 x/y” |
| 未索引时工作区列表为空 | `workspaces` 走 `ensureReady()`，要等 26 个分片全部解压完 | 新增 `ensureSessions()`：只读会话表（头信息）就能给工作区；boot 后立即请求一次 |
| 打开面板仍慢、DSH 仍微卡 | `loadIndex` 用 `zlib.gunzipSync` 同步解压 26 个分片，实测 **320 ms 主线程阻塞** | 改异步 `gunzip` + 4 路并行 + 每片让出事件循环：实测 226 ms 且单次阻塞 ≈8 ms |
| 模糊设置项还在 | 1.7.0 只删了效果没删 UI | 整个“外观”区移除；`blur` 一律按 0 读入，不再加 `.is-blurred` |
| 侧边栏小字、彩色圆点 | 可读性 | 字号整体 +1px；目标类型改为**勾选**，不再按类型上色 |

## 1. 1.7.0 的原始改动（仍然有效）

主线是**先修卡顿**。三个真凶都不在搜索算法里：

| 元凶 | 证据 | 处理 |
| --- | --- | --- |
| 弹窗背景 `backdrop-filter` 全屏模糊 + 两个 620px `filter:blur(80px)` 无限动画光斑 | 合成器每帧重画整屏离屏缓冲 | 全删；模糊滑杆也删了 |
| 启动即后台全量重建索引 | `bootstrap()` 里 `startAll()`，26 会话 ~29MB 日志全读 | 启动不建索引；打开面板才索引，面板关闭立即停 |
| 结果页一次渲染 400 个按钮 / 搜索后同步写 42KB | 掉帧、每次回车等磁盘 | 60 条一页滚动加载；写盘异步 |

### 十条需求

| # | 需求 | 实现 |
| --- | --- | --- |
| 1 | 卡顿根治 + 懒加载 | `boot/open/close` + 按需索引；见上表 |
| 2 | 历史用时 | `restoredMs`：`恢复 Nms` + `原搜索 Nms` |
| 3 | 历史筛选 | 历史按完整筛选各成一条；打开只读快照，不再改写侧边栏 |
| 3b | 计算后置 | `rememberMatches`（按 corpusVersion 的命中缓存）+ `findRelatedSaved`（同词更宽快照里再筛） |
| 4 | 文件名 | 文件带 `name/ext`；`producesFiles` 关键词放宽；Markdown 链接也收 |
| 5 | 边搜边出 | 先返回已索引命中 + `pending`；客户端每 700ms 轮询并静默补结果 |
| 6 | 仅筛选可搜 | `scanDocs` 允许空查询；`filterOnlySearch()` |
| 7 | 长文索引 | 每块前 4 段留普通索引，其余进 `long/*.json.gz`；独立重建/清空/自动开关 |
| 8 | 长文搜索 | 结果末尾与无结果处都有入口，附“可能较慢”提示 |
| 9 | 索引分类 | `corpus()` 产出 `{all, files, text}`，只筛文件时 12 500 → 291 条 |
| 10 | 工作区 | `header.cwd` → `workspace` 参数，先收窄会话再扫文档 |

## 2. 请求契约

```
action=boot        -> { index, state, workspaces }   // 不等索引
action=open/close  -> 面板在场/离场
action=status      -> { index }                      // ready/pending/running/longDocs
action=workspaces  -> 只读会话表，立即返回
action=sessions    -> 仅选择器需要
action=search      q(可空) scope workspace types ext sort long sig auto limit threads
action=saved&id=.. -> { restoredMs, originalTookMs, narrowed }
action=index|clearIndex|setAutoIndex
action=long&op=rebuild|clear|auto
```

不变量：① Client 生成 `signature`、Host 原样回显，**渲染以签名为门**；快照页以自己的签名渲染；
② `auto=1` 不写历史；③ `pending>0` 或 `long=1` 不写快照。

## 3. 落盘

```
$DSH_HOME/flash-anchor/
  state.json        偏好 / 历史（按完整筛选各一条）/ savedSearches（只存 ID+seq）
  index.json.gz     清单（每会话 seq/docCount/longCount）
  index/*.json.gz   普通索引分片
  long/*.json.gz    长文分片（可独立清空）
  errors.log        诊断，>1MB 轮转
```
`INDEX_VERSION=4`；升级会丢弃旧索引重建。

## 4. 测试

```
node test-core.mjs  test-state.mjs  test-events.mjs  test-prefs.mjs  test-order.mjs
node test-worker.mjs  test-locate.mjs  test-i18n.mjs  test-v17.mjs
node --expose-gc test-memory.mjs   test-stress.mjs
# 需本机库（不入库）：test-real-filters.mjs  test-anchor.mjs  bench-perf.mjs  bench-open.mjs
```
1.7.1 实测：全部套件通过；`bench-open` 记录 state 6.7ms / 索引 226ms（26 分片 11 008 文档）。

## 5. 安装 / 回滚

```powershell
cd D:/DeepSeek-Harness/new_workspace/dsh-deepsearch
node --check index.js; node --check client.js
node test-core.mjs; node test-v17.mjs
$env:npm_config_cache = "$PWD/.npm-cache"
cmd /c "npm.cmd pack"
powershell -ExecutionPolicy Bypass -File D:/DeepSeek-Harness/new_workspace/install-plugin.ps1 -Version 1.7.1
```
**Host 改动必须重启 DSH Desktop**；Client 刷新窗口即可。

## 6. 已知欠账

1. `client.js` 仍是单文件、手写 `h()`、无类型；建议按 `locate / cache / ui` 机械拆分（别重写）。
2. 定位依赖 DSH Chat DOM 契约，改版后只能降级到“该轮”；诊断在 `errors.log`。
3. 索引仍是“打开时全量解压 26 个分片”（226ms，已不阻塞但可再优化为按需加载分片）。
4. 长文搜索是同步读分片 + 全段扫描，会话很多时可能到秒级。
5. 历史 12 条硬上限，按筛选集分条后更容易填满，考虑提到 20。
