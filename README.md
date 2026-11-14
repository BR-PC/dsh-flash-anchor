# FlashAnchor / 闪电锚点

[![Release](https://img.shields.io/badge/release-v1.7.1-0ea5e9)](https://github.com/BR-PC/dsh-flash-anchor/releases)
[![License](https://img.shields.io/badge/license-MIT-22c55e)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-DSH%20Desktop%20%C2%B7%20DSH%20Web-6366f1)](https://github.com/BR-PC/dsh-flash-anchor)
[![CI](https://github.com/BR-PC/dsh-flash-anchor/actions/workflows/ci.yml/badge.svg)](https://github.com/BR-PC/dsh-flash-anchor/actions/workflows/ci.yml)

> 在 **DSH（DeepSeek Harness）** 里，把所有会话正文、思维链、工具调用与结果、输入/输出文件放到一个搜索框里检索，
> 点开结果直接落到产生命中的那个**段落/代码块/文件卡片/工具卡片**，而不是会话顶部。

![FlashAnchor](icon.png)

## 发行版本

首个公开版本 **v1.5.0** 于 2026-11-06 发布，包含块级锚点、分片 Worker、物化视图与 Scroll Router：

[![v1.5.0](icon.png)](https://github.com/BR-PC/dsh-flash-anchor/releases/tag/v1.5.0)

| 版本 | 说明 |
| --- | --- |
| [v1.5.0](https://github.com/BR-PC/dsh-flash-anchor/releases/tag/v1.5.0) | 首个公开发布：块级锚点、Worker 池、物化视图、新图标 |
| v1.5.1 / v1.5.2 | 过滤条件校验、缓存签名、骨架屏、锚定严格失败、冷启动等待视图 |
| v1.6.0 / v1.6.1 | 会话筛选与会话缓存隔离、缓存耗时如实展示、按会话分片落盘、Worker 自动恢复；1.6.1 修掉审查报告里的两个 P1 |
| [v1.7.0](https://github.com/BR-PC/dsh-flash-anchor/releases/tag/v1.7.0) | **卡顿根治**（去掉全屏模糊与无限动画、启动不再全量索引、面板关闭即停索引、结果分页渲染）、历史按筛选集独立成条且耗时如实、计算后置复用缓存、文件名可搜、边索引边出结果、仅筛选也能搜、长文独立索引与长文搜索、工作区筛选 |
| **[v1.7.1](https://github.com/BR-PC/dsh-flash-anchor/releases/tag/v1.7.1)** | 修复 1.7.0 的回归：重开恢复结果、卡在“正在检索”、打开历史记录改写筛选条件、重建索引无进度、未索引时工作区为空；去掉模糊设置项、目标类型改勾选、侧边栏字号加大、索引解压改异步并行（320ms → 226ms 且不阻塞），详见[v1.7.0...v1.7.1](https://github.com/BR-PC/dsh-flash-anchor/compare/v1.7.0...v1.7.1) |

## 功能

### 搜索

- **六个目标类型**：思维链（reasoning）、正文（modelText）、工具调用/结果（tools）、输出文件（outputFiles）、输入正文（userText）、输入文件（inputFiles）。
- **范围**：所有会话，或指定一个会话；会话不存在时明确提示，而不是假装“没有匹配”。
- **工作区**：按会话的启动目录（cwd）筛选，先收窄会话再扫文档，别的目录根本不参与扫描。
- **仅筛选也能搜**：不输关键词，只选类型/工作区/会话/长文，按 Enter 就是一次完整搜索。
- **文件名可搜**：文件名、扩展名、路径都是索引字段，输入 `报告.md` 直接命中文件卡片；
  工具调用参数、`Presented` 行、Markdown 链接里的产物都会进入文件索引。
- **结果页筛选**：按类型、按会话、按时间/相关度；查询本身即匹配文件名，无需后缀筛选。
- **结果页是快照**：同一请求再次打开直接读物化视图（只存结果 ID + 每会话 seq），
  筛选条件变化时**绝不**把另一套筛选的结果显示在当前 chips 之下——页面用请求签名做门控。
- **计算后置**：同一个词换筛选条件时，先在已缓存/已物化的结果里筛，命中就不扫全表；
  只有放宽条件（缓存装不下）才真正重扫。
- **边索引边出结果**：冷索引时先返回已经索引好的会话命中，后台一个会话一个会话地补，
  结果区显示“后台索引 x/y 会话”，补齐后自动补上新增命中——不用等全库读完。

### 定位（Scroll Router）

- 每条结果携带完整块地址：`{turn, step, messageId, toolCallId, blockIndex, seatIndex, blockKind, fileIndex, chunk}`。
- 先算 Chat 节点 key（`14:assistant-step<turn>:<step>`、`9:tool-call<id>`、`13:input-message<id>`），
  再在该节点内按块文本匹配，展开折叠的思考/工具卡片，最后把**块**滚到视口中心并只高亮该块。
- 虚拟列表未挂载时：先等 Chat 视图就绪 → 点轨迹栏对应轮次 → `loadThrough` → 直接滚动转录区，四重兜底。
- **宁可报“未定位到”也不跳到同轮的另一条消息**：有自身地址的命中不会用同轮邻居顶替。

### 性能

- **卡顿根治（1.7.0 重点）**：三个真正的元凶都不是搜索算法——
  ① 弹窗覆盖层用了 `backdrop-filter` 全屏模糊，外加两个 620px、`filter:blur(80px)` 的无限动画光斑，
  合成器每帧都要重画一整屏离屏缓冲；② 每次启动都在后台把全部会话日志重读一遍建索引；
  ③ 结果页一次性渲染 400 个按钮。
  现在：背景模糊与光斑全部删除（连设置项一起）、启动不建索引、**面板关闭立即停索引**、
  结果按 60 条一页往下滚加载、索引分片异步并行解压（不再一次阻塞主线程 320ms）。
- **懒索引**：打开面板只发一个 `boot` 请求（不等索引）；只有真正被搜到的会话才在请求内读取，
  其余由后台按“最新优先”逐个补，搜索进行时后台让路。
- **语料缓存**：索引未变化时搜索不再重建 1 万+ 文档数组；命中较少的查询 p50 ≈ 6–8 ms，
  单字符这类宽匹配（上万命中）约 200 ms（26 会话 / 12 500 文档实测）。
- **索引分类**：文本与文件分成两个候选集，只筛文件时扫描量从 12 500 条降到 291 条；
  长文段落单独存放，普通搜索不碰。
- **按会话分片落盘**：`$DSH_HOME/flash-anchor/index/` 下每会话一个 gzip 分片，只重写变化的会话——
  实测单会话写入 22 ms，而整库写入 698 ms；旧版每 6 秒整库重写是 GUI 卡顿的主因之一。
- **后台索引让路**：搜索进行中不重建 surface；流式会话最多每 20 秒重建一次；只有新会话出现时才重列会话表。
- **Worker 池**：1–8 线程按语料分片；OOM/超时/崩溃自动降级为内联扫描，并带指数退避**自动恢复**（不再一降到底）。
- **资源回收**：插件卸载时清理定时器、Worker 与内存页；索引写入串行化，原子替换。

### 隐私

- 全部索引、查询与跳转都在**本机 Host** 完成，插件**没有**任何外部网络请求、没有 API Key。
- 落盘位置：`$DSH_HOME/flash-anchor/`
  - `state.json`：偏好、历史（只含查询词与筛选条件）。
  - `index/` + `index.json.gz`：**文档正文的本地索引**（gzip）。为了让历史内容可搜，
    这里确实保存了会话文本的可检索副本；它只在本机，删掉会按需重建。
  - `long/`：长文段落（每个超长块的尾部）单独存放，可在设置里独立重建/清空，不影响普通索引。
  - `errors.log`：定位诊断（点击时的目标、结果），超过 1 MB 轮转。
- 关闭“自动索引”或点“清空”即可随时移除本地索引；插件不修改任何会话数据（Host 侧只读）。

## 安装

### 方式一：从 Release 安装（推荐）

1. 打开 [Releases](https://github.com/BR-PC/dsh-flash-anchor/releases)，下载最新的 `flash-anchor-x.y.z.tgz`。
2. 在 DSH 中安装该 tgz：
   - **桌面端**：设置 → 插件 → 安装本地插件 / 插件管理器，选择下载的 tgz；或
   - **命令行/Agent**：调用插件管理器安装 `install_bundle`，目标填 `file:<tgz 绝对路径>`。
3. 确认 `flash-anchor` 出现在当前 profile 的 bundle 列表并处于启用状态。
4. **重启 DSH Desktop**（Host 半在启动时加载；Client 半会随页面热替换，必要时 Ctrl+R）。

安装后左侧栏底部出现 **闪电锚点** 入口，点击即可搜索。

### 方式二：从源码安装

```powershell
git clone https://github.com/BR-PC/dsh-flash-anchor.git
cd dsh-flash-anchor
node --check index.js; node --check client.js
node test-core.mjs; node test-state.mjs; node test-locate.mjs
$env:npm_config_cache = "$PWD/.npm-cache"
npm pack                      # 生成 flash-anchor-<version>.tgz
# 然后把该 tgz 按“方式一”第 2 步装进 DSH
```

### 方式三：手工放入 profile（离线）

把 tgz 解压到 `<DSH_HOME>/profiles/<profile>/node_modules/flash-anchor`，
并在该 profile 的 `package.json` 中加入依赖与 bundle：

```json
{
  "dependencies": { "flash-anchor": "file:D:/path/flash-anchor-1.6.0.tgz" },
  "dsh": { "profile": { "bundles": ["...", "flash-anchor"] } }
}
```

重启 DSH 生效。

## 使用

| 操作 | 说明 |
| --- | --- |
| 打开 | 左侧栏底部「闪电锚点」 |
| 搜索 | 输入关键词后 Enter；结果按会话分组，显示命中轮次与时间；也可以只选筛选条件直接 Enter |
| 筛选 | 左侧设置：范围（全部/指定会话）、工作区、目标类型（含长文）、排序；结果页顶部 chips 始终反映**当前页面**的筛选 |
| 长文 | 结果末尾与“无结果”处都有长文搜索入口；设置里可查看长文段数并独立重建/清空 |
| 历史 | 每条历史保存**那次搜索自己的筛选条件**；打开它只显示它自己的结果，返回首页会还原你原来的筛选 |
| 定位 | 点击结果 → 打开会话 → 展开折叠 → 滚动并高亮命中块；失败会明确提示，不会跳到别处 |

结果页 chips 的含义：`恢复 Nms` = **这次打开**用掉的时间（缓存页只算重建快照的时间），
`原搜索 Nms` = 当初那次搜索的耗时，`筛选命中缓存` = 换筛选后从已有结果里直接筛出来的，
`建面/匹配` = 当初的分段耗时；实时搜索显示 `耗时 Nms`。

## 架构

| 文件 | 作用 |
| --- | --- |
| `index.js` | Host：surface 索引、搜索、Worker 池调度、物化视图、状态与落盘 |
| `search-core.js` | Host/Worker 共用：匹配、打分、片段、文档地址（docKey） |
| `search-pool.js` | 分片 Worker 池：扩容/缩容、超时、OOM 降级与退避恢复 |
| `worker.js` | 单个分片语料，按请求扫描 |
| `client.js` | 弹窗、设置、结果页、Scroll Router、i18n 文案 |

搜索链路：Client 发 `q/scope/workspace/types/ext/sort/long/sig` → Host 校验并回显 `signature` →
命中物化视图则直接用 ID 快照重建页面 → 否则读（或复用）surface → 语料缓存 → Worker/内联扫描 → 只回传 ID+片段+锚点。

## 测试

```bash
node test-core.mjs        # 契约：类型过滤不泄漏、签名回显、scope 缺失
node test-state.mjs       # 状态持久化、缓存作用域、耗时保留
node test-prefs.mjs       # 偏好
node test-order.mjs       # hook 依赖顺序（TDZ）
node test-worker.mjs      # 分片一致性、OOM 降级
node test-locate.mjs      # 23 个定位场景（含冷启动、div 气泡、seq-exact）
node test-events.mjs      # session/event 载荷契约（旧代码必挂）
node test-v17.mjs         # 1.7.0 契约：懒索引、仅筛选搜索、工作区、长文、文件名、计算后置
node --expose-gc test-memory.mjs
node test-stress.mjs
# 需要本机会话库（不随包发布）：
node test-real-filters.mjs   # 真实语料：类型/范围/缓存计时/长文
node test-anchor.mjs
```

## 实机截图

<img width="1249" height="895" alt="展示0" src="https://github.com/user-attachments/assets/a38fce73-d249-412e-855e-474479862fa0" />

<img width="1237" height="894" alt="展示1" src="https://github.com/user-attachments/assets/c12b0a43-4b23-4b14-9bb2-e9b0e97ed422" />

<img width="1130" height="759" alt="展示2" src="https://github.com/user-attachments/assets/24bd2087-2bc0-43f7-a380-25da58ef7c89" />

## 已知限制

1. 首次建面（清空索引后）需读全部会话日志，本机 26 会话约 1.4 s；这发生在**打开面板之后**，
   不再发生在 DSH 启动时，而且边建边出结果。
2. 冷启动定位需等会话视图挂载，通常 2–8 s（期间显示“正在定位”）。
3. 搜索是子串匹配（大小写不敏感），不做分词/同义词；中文短词命中率取决于原文。
4. 普通索引只收每个块的前 16 000 字符（4 段），更长的尾部进入**长文索引**，要用“长文搜索”才查得到；
   长文搜索会明显更慢（要读更大的文本），界面会在结果末尾与无结果时给出入口和耗时提示。
5. 单个文档最多索引 256 段（≈1 MB），超出部分仍不可搜并有截断提示。
6. 结果默认上限 400 条，一次渲染 60 条、滚动加载；超出会提示“已截断”。
7. 历史按“查询词 + 完整筛选条件”各成一条（12 条 / 快照 LRU 50）；同一句换筛选会出现多条，
   这正是“打开哪条就还原哪条的筛选”的前提。
7. **定位依赖 Chat DOM 契约**（`data-chat-turn`、`data-chat-node-key`、`data-chat-group-part`、`data-tool` 等）：DSH 改版后若这些属性变化，定位会降级为“只到该轮”。每次跳转的诊断写在 `errors.log` 的 `[client:jump]` 行，可据此区分选择器失配与内容未挂载。
9. 真实的短查询成本高于“中位数”：单字符宽匹配约 200 ms，属单线程匹配的物理成本；
   同一查询换筛选走缓存，不再重复付这笔成本。
10. 打开面板时仍会把 26 个已落盘分片解压进内存（约 226 ms，已不阻塞界面）；
    再往下要改成“按需加载分片”，见交接文档的欠账。

## 致谢与作者

- **产品设计、测试与反馈**：**BR-PC**（[@BR-PC](https://github.com/BR-PC)）
- **开发**：**DeepSeek-V4.1-Flash-1017**（AI agent）

FlashAnchor 由 BR-PC 提出需求、制定验收标准并逐版本实测反馈；代码、测试与文档由 DeepSeek-V4.1-Flash-1017 实现。
v1.6.0 的会话筛选、缓存计时、长文截断与索引落盘改造，来自 BR-PC 的实测反馈与一份独立源码审查报告。
v1.7.0 的卡顿根治、计算后置、长文索引、工作区筛选与“边索引边出结果”，同样来自 BR-PC 的实测清单。

## 许可证

[MIT](LICENSE)

---

## English

**FlashAnchor** is a plugin for DSH (DeepSeek Harness) that full-text searches every stored session —
reasoning, answers, tool calls/results, output and input files — and jumps to the exact **block**
that produced a hit, expanding folded disclosures first and highlighting only that block.

- **Install**: download `flash-anchor-*.tgz` from Releases, install it through the DSH plugin manager
  (or add it to your profile's dependencies + bundles), then restart DSH Desktop.
- **Privacy**: everything runs in the local Host; no network calls, no API keys. The local document
  index (gzip shards under `$DSH_HOME/flash-anchor/index/`) does contain searchable copies of session
  text so old sessions stay searchable; delete it any time.
- **Performance**: corpus cache (≈6 ms warm searches), per-session index shards (≈22 ms per change),
  background indexing that yields to searches, and a worker pool that recovers after degradation.
- **Credits**: designed, tested and driven by **BR-PC**; implemented by **DeepSeek-V4.1-Flash-1017**.
