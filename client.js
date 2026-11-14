window.__ModuleLoader__.load({
  id: 'flash-anchor',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'flash-anchor'
    function BrandMark(props) {
      const size = props && props.size ? props.size : 30
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 32 32', 'aria-hidden': 'true', focusable: 'false' },
        h(
          'defs',
          null,
          h(
            'linearGradient',
            { id: 'fa-brand-grad', x1: '0', y1: '0', x2: '1', y2: '1' },
            h('stop', { offset: '0', stopColor: '#22d3ee' }),
            h('stop', { offset: '1', stopColor: '#2563eb' }),
          ),
        ),
        h('rect', { x: '1', y: '1', width: '30', height: '30', rx: '9', fill: 'url(#fa-brand-grad)' }),
        // Two shapes only: the bolt and the anchor's curved arms (a half ring).
        h('path', { d: 'M8 18.6c0 7.8 16 7.8 16 0', fill: 'none', stroke: '#ffffff', strokeWidth: '2.6', strokeLinecap: 'round' }),
        h('path', { d: 'M18.8 3.6 9.4 17h4.6l1.9 7.6 6.7-10.2h-4.6l0.8-10.8Z', fill: '#ffffff' }),
      )
    }

    const MODEL_TYPES = ['reasoning', 'modelText', 'tools', 'outputFiles']
    const USER_TYPES = ['userText', 'inputFiles']
    // Injected context (skill catalog, runtime/time snapshots, compaction
    // checkpoints, approval prompts) is stored as a user/message with a
    // non-user source; it is its own kind so it never reads as user input.
    const CONTEXT_TYPES = ['context']
    // Literal on purpose: the contract tests extract this constant by name, and a
    // spread would drag its neighbours into their sandbox.
    const ALL_TYPES = ['reasoning', 'modelText', 'tools', 'outputFiles', 'userText', 'inputFiles', 'context']
    const HISTORY_KEY = 'flash-anchor:history'
    const FILE_KINDS = new Set(['outputFiles', 'inputFiles'])

    const ZH = {
      "meta.title": "FlashAnchor",
      "meta.description": "跨所有会话检索模型思维链、工具调用、正文、输出文件，以及用户输入正文与输入文件。",
      "entry.label": "闪电锚点",
      "entry.title": "闪电锚点：检索所有会话的任意内容",
      "title": "闪电锚点",
      "subtitle": "FlashAnchor · 全库会话检索",
      "close": "关闭",
      "search.placeholder": "搜索所有会话中的任意内容…",
      "search.button": "搜索",
      "search.clear": "清空",
      "search.hint": "Enter 搜索",
      "scope": "搜索范围",
      "scope.all": "所有会话",
      "scope.session": "指定会话",
      "scope.allHint": "搜索全部已保存会话",
      "scope.sessionHint": "只在指定会话内搜索",
      "scope.filter": "筛选会话…",
      "scope.empty": "没有匹配的会话",
      "scope.loading": "加载会话列表…",
      "scope.noSession": "尚未选择会话",
      "scope.selected": "当前会话",
      "object": "搜索对象",
      "object.model": "模型输出",
      "object.user": "用户输入",
      "object.all": "全部",
      "object.context": "上下文注入",
      "target": "目标类型",
      "target.reasoning": "思维链",
      "target.modelText": "正文",
      "target.tools": "工具调用",
      "target.outputFiles": "输出文件",
      "target.userText": "输入正文",
      "target.inputFiles": "输入文件",
      "ext": "文件后缀",
      "ext.placeholder": "png, pdf, docx",
      "ext.hint": "留空不限；多个后缀用逗号分隔，自动忽略点号",
      "sort": "结果排序",
      "sort.relevance": "相关度",
      "sort.time": "时间",
      "back": "返回设置",
      "results": "搜索结果",
      "results.summary": "{count} 条匹配 · {sessions} 个会话 · {ms} ms",
      "results.truncated": "结果较多，仅展示前 {limit} 条；可缩小范围或增加筛选条件",
      "results.empty": "没有找到匹配内容",
      "results.emptyHint": "换个关键词，或放宽搜索范围与目标类型",
      "results.loading": "正在检索会话…",
      "results.error": "搜索失败",
      "results.retry": "重试",
      "results.refresh": "重新搜索",
      "welcome.title": "搜索每一次对话",
      "welcome.subtitle": "跨会话检索思维链、工具调用、正文与文件；索引只在本机建立。",
      "welcome.tip": "试试搜索报错信息、文件名，或某段代码。",
      "welcome.categories": "可检索的内容",
      "welcome.privacy": "数据不会离开这台设备",
      "stats.sessions": "会话",
      "stats.indexed": "已索引内容",
      "stats.indexedSessions": "已索引会话",
      "history": "最近搜索",
      "history.empty": "还没有搜索记录",
      "need.query": "请输入关键词，或指定文件后缀",
      "need.session": "请选择一个会话",
      "need.types": "请至少选择一种目标类型",
      "indexed": "已索引 {sessions} 个会话 · {docs} 条内容",
      "auth.error": "会话鉴权失败，请刷新页面后重试",
      "error.network": "网络请求失败，请稍后重试",
      "result.open": "打开会话",
      "result.untitled": "未命名会话",
      "result.session": "会话",
      "result.file": "文件",
      "file.badge": "文件",
      "kind.reasoning": "思维链",
      "kind.modelText": "正文",
      "kind.tools": "工具调用",
      "kind.outputFiles": "输出文件",
      "kind.userText": "输入正文",
      "kind.inputFiles": "输入文件",
      "kind.context": "上下文注入",
      "subtype.call": "调用",
      "subtype.result": "结果",
      "badge.model": "模型",
      "badge.user": "用户",
      "empty.query": "输入关键词开始搜索",
      "deck.filters": "当前条件",
      "deck.allSessions": "所有会话",
      "deck.within": "会话内",
      "deck.noExt": "不限后缀",
      "deck.cached": "缓存",
    "deck.original": "原搜索 {ms}ms",
    "deck.degraded": "单线程降级",
    "results.scopeMissing": "该会话已不存在，请重新选择会话",
      "deck.threads": "{n} 线程",
      "deck.inline": "单线程",
      "deck.timing": "建面 {surface}ms · 匹配 {match}ms",
      "deck.wait": "准备 {ms}ms",
      "results.staleRebuild": "旧快照已失效，已重新搜索",
    "jump.turnOnly": "已定位到第 {turn} 轮，但未找到具体段落",
      "time.justNow": "刚刚",
      "time.minutes": "{n} 分钟前",
      "time.hours": "{n} 小时前",
      "time.days": "{n} 天前",
      "error.openSession": "无法打开该会话",
      "appearance": "外观",
      "appearance.blur": "模糊程度",
      "appearance.alpha": "玻璃浓度",
      "appearance.reset": "恢复默认",
      "appearance.hint": "调节本插件弹窗的毛玻璃效果，设置会自动记忆",
      "jump.searching": "正在定位搜索结果…",
      "jump.found": "已定位并高亮",
      "jump.failed": "已打开会话，但未能定位到该消息",
      "jump.turn": "第 {turn} 轮",
      "result.turn": "第 {turn} 轮",
      "boot.loading": "正在加载配置…",
      "scope.clear": "取消选择",
      "preload.running": "静默预加载中…",
      "preload.ready": "已缓存完整结果 {count} 条",
      "preload.hit": "内存命中 · 未重新检索",
      "preload.complete": "完整结果已就绪",
      "settings.advanced": "性能与索引",
      "settings.preload": "静默预加载",
      "settings.preloadHint": "搜索时后台拉取完整结果并缓存，命中缓存立即返回。",
      "settings.scatter": "多线程分片搜索",
      "settings.scatterHint": "按线程数并发扫描会话；建议不超过 CPU 物理核心数。",
      "settings.threads": "线程数",
      "settings.autoIndex": "自动索引",
      "settings.autoIndexHint": "会话有新内容时自动更新索引。",
      "index.title": "索引",
      "index.autoOn": "自动索引：开",
      "index.autoOff": "自动索引：关",
      "index.running": "正在索引 {done}/{total}",
      "index.ready": "已索引 {sessions} 个会话 · {docs} 条",
      "index.empty": "尚未建立索引",
      "index.start": "建立索引",
      "index.rebuild": "重建索引",
      "index.clear": "清空",
      "index.clearConfirm": "清空本地索引和缓存搜索结果？历史搜索记录会保留。",
      "index.failed": "索引操作失败",
      "history.remove": "删除该搜索记录",
      "results.stale": "缓存结果可能已过期（索引已变化）",
      "results.update": "更新结果",
      "results.updated": "结果已更新 · {count} 条",
      "results.timeout": "请求超时，已取消。请重试，或在设置里重建索引。",
      "ws": "工作区",
      "ws.all": "全部工作区",
      "ws.hint": "按会话的启动目录筛选",
      "ws.sessions": "个会话",
      "long": "长文",
      "long.included": "含长文",
      "long.excluded": "不含长文",
      "long.title": "长文索引",
      "long.ready": "{docs} 段 · {sessions} 个会话",
      "long.empty": "暂无长文",
      "long.auto": "自动索引长文",
      "long.rebuild": "重建长文",
      "long.clear": "清空长文",
      "long.clearConfirm": "清空长文索引？普通索引不受影响。",
      "long.cta": "在长文索引里再搜一次",
      "long.ctaHint": "长文内容不在普通索引里，长文搜索要扫更大的文本，可能需要几秒。",
      "long.emptyHint": "长文段落被普通索引截断了，长文搜索能找到它们。",
      "long.running": "正在搜索长文索引…",
      "deck.restored": "恢复 {ms}ms",
      "deck.took": "耗时 {ms}ms",
      "deck.narrowed": "筛选命中缓存",
      "deck.originalOnly": "原搜索 {ms}ms",
      "deck.pending": "后台索引 {done}/{total} 会话",
      "deck.longOn": "含长文",
      "deck.more": "显示更多（还有 {count} 条）",
      "deck.snapshot": "历史快照",
      "need.filters": "请输入关键词，或至少选择一个筛选条件",
      "history.filters": "筛选",
      "history.clear": "清空全部",
      "history.clearConfirm": "清空全部搜索历史？同时删除它们缓存的搜索结果页（不影响索引）。",
      "log.title": "日志收集",
      "log.hint": "记录搜索、定位与错误的详细信息，供排查问题；关闭后不再写入。",
      "log.path": "日志地址",
      "log.size": "当前 {size}",
      "log.copy": "复制路径",
      "log.copied": "日志路径已复制",
      "log.clear": "清空日志",
      "log.clearConfirm": "清空诊断日志？不影响搜索结果与索引。",
      "sort.order": "时间顺序",
      "sort.newest": "新→旧",
      "sort.oldest": "旧→新"
    }
    const EN = {
      "meta.title": "FlashAnchor",
      "meta.description": "Search every session's reasoning, tool calls, text, output files, and user text or input files.",
      "entry.label": "FlashAnchor",
      "entry.title": "FlashAnchor: search anything across every session",
      "title": "FlashAnchor",
      "subtitle": "FlashAnchor · corpus-wide session search",
      "close": "Close",
      "search.placeholder": "Search anything across every session…",
      "search.button": "Search",
      "search.clear": "Clear",
      "search.hint": "Enter to search",
      "scope": "Scope",
      "scope.all": "All sessions",
      "scope.session": "One session",
      "scope.allHint": "Search every stored session",
      "scope.sessionHint": "Search inside the selected session only",
      "scope.filter": "Filter sessions…",
      "scope.empty": "No matching sessions",
      "scope.loading": "Loading sessions…",
      "scope.noSession": "No session selected",
      "scope.selected": "Selected",
      "object": "Search in",
      "object.model": "Model output",
      "object.user": "User input",
      "object.all": "Everything",
      "object.context": "Injected context",
      "target": "Target types",
      "target.reasoning": "Reasoning",
      "target.modelText": "Answer text",
      "target.tools": "Tool calls",
      "target.outputFiles": "Output files",
      "target.userText": "Prompt text",
      "target.inputFiles": "Input files",
      "ext": "File suffixes",
      "ext.placeholder": "png, pdf, docx",
      "ext.hint": "Leave empty for all; separate suffixes with commas; dots are ignored",
      "sort": "Sort",
      "sort.relevance": "Relevance",
      "sort.time": "Newest",
      "back": "Back to settings",
      "results": "Results",
      "results.summary": "{count} matches · {sessions} sessions · {ms} ms",
      "results.truncated": "Showing the first {limit} results; narrow the filters to see more",
      "results.empty": "No matching content",
      "results.emptyHint": "Try another phrase or widen the scope and target types",
      "results.loading": "Searching sessions…",
      "results.error": "Search failed",
      "results.retry": "Retry",
      "results.refresh": "Search again",
      "welcome.title": "Search every conversation",
      "welcome.subtitle": "Reasoning, tool calls, answers, and files across sessions; the index stays on this machine.",
      "welcome.tip": "Try an error message, a file name, or a piece of code.",
      "welcome.categories": "Searchable content",
      "welcome.privacy": "Data never leaves this device",
      "stats.sessions": "Sessions",
      "stats.indexed": "Indexed items",
      "stats.indexedSessions": "Indexed sessions",
      "history": "Recent searches",
      "history.empty": "No searches yet",
      "need.query": "Enter a keyword or a file suffix",
      "need.session": "Select a session first",
      "need.types": "Select at least one target type",
      "indexed": "{sessions} sessions indexed · {docs} items",
      "auth.error": "Session authentication failed. Refresh the page and retry.",
      "error.network": "Network request failed. Try again shortly.",
      "result.open": "Open session",
      "result.untitled": "Untitled session",
      "result.session": "Session",
      "result.file": "File",
      "file.badge": "File",
      "kind.reasoning": "Reasoning",
      "kind.modelText": "Answer",
      "kind.tools": "Tool",
      "kind.outputFiles": "Output file",
      "kind.userText": "Prompt",
      "kind.inputFiles": "Input file",
      "kind.context": "Injected context",
      "subtype.call": "call",
      "subtype.result": "result",
      "badge.model": "Model",
      "badge.user": "User",
      "empty.query": "Type a keyword to begin",
      "deck.filters": "Active filters",
      "deck.allSessions": "All sessions",
      "deck.within": "within session",
      "deck.noExt": "Any suffix",
      "deck.cached": "cached",
    "deck.original": "search {ms}ms",
    "deck.degraded": "degraded",
    "results.scopeMissing": "That session no longer exists; pick another one",
      "deck.threads": "{n} threads",
      "deck.inline": "single thread",
      "deck.timing": "build {surface}ms · match {match}ms",
      "deck.wait": "prepare {ms}ms",
      "results.staleRebuild": "The old snapshot expired; searched again",
    "jump.turnOnly": "Turn {turn} opened, but the exact block was not found",
      "time.justNow": "just now",
      "time.minutes": "{n} min ago",
      "time.hours": "{n} h ago",
      "time.days": "{n} d ago",
      "error.openSession": "Could not open that session",
      "appearance": "Appearance",
      "appearance.blur": "Blur",
      "appearance.alpha": "Glass density",
      "appearance.reset": "Reset",
      "appearance.hint": "Adjusts this dialog’s frosted glass; the choice is remembered",
      "jump.searching": "Locating the search hit…",
      "jump.found": "Located and highlighted",
      "jump.failed": "Session opened, but the message could not be located",
      "jump.turn": "Turn {turn}",
      "result.turn": "Turn {turn}",
      "boot.loading": "Loading preferences…",
      "scope.clear": "Clear selection",
      "preload.running": "Preloading the full result set…",
      "preload.ready": "Cached the full result set ({count})",
      "preload.hit": "Memory hit · no rescan",
      "preload.complete": "Complete result set ready",
      "settings.advanced": "Performance & index",
      "settings.preload": "Speculative preload",
      "settings.preloadHint": "Fetch the full result set in the background and serve a cache hit instantly.",
      "settings.scatter": "Scatter-gather search",
      "settings.scatterHint": "Scan sessions concurrently; keep the thread count at or below physical cores.",
      "settings.threads": "Threads",
      "settings.autoIndex": "Auto indexing",
      "settings.autoIndexHint": "Refresh the index when a session gets new content.",
      "index.title": "Index",
      "index.autoOn": "Auto index: on",
      "index.autoOff": "Auto index: off",
      "index.running": "Indexing {done}/{total}",
      "index.ready": "{sessions} sessions · {docs} items indexed",
      "index.empty": "No index yet",
      "index.start": "Build index",
      "index.rebuild": "Rebuild index",
      "index.clear": "Clear",
      "index.clearConfirm": "Clear the local index and cached search results? Search history is kept.",
      "index.failed": "Index operation failed",
      "history.remove": "Delete this search",
      "results.stale": "Cached result may be stale because the index changed",
      "results.update": "Update results",
      "results.updated": "Results updated · {count}",
      "results.timeout": "The request timed out. Retry, or rebuild the index in the settings.",
      "ws": "Workspace",
      "ws.all": "All workspaces",
      "ws.hint": "Filter sessions by their working directory",
      "ws.sessions": "sessions",
      "long": "Long text",
      "long.included": "With long text",
      "long.excluded": "Without long text",
      "long.title": "Long-text index",
      "long.ready": "{docs} chunks · {sessions} sessions",
      "long.empty": "No long text yet",
      "long.auto": "Index long text automatically",
      "long.rebuild": "Rebuild long text",
      "long.clear": "Clear long text",
      "long.clearConfirm": "Clear the long-text index? The ordinary index is kept.",
      "long.cta": "Search the long-text index",
      "long.ctaHint": "Long text is not in the ordinary index. This search reads more text and can take a few seconds.",
      "long.emptyHint": "Long passages are truncated out of the ordinary index; the long search can still find them.",
      "long.running": "Searching the long-text index…",
      "deck.restored": "Restored in {ms}ms",
      "deck.took": "Took {ms}ms",
      "deck.narrowed": "Filters served from cache",
      "deck.originalOnly": "Original search {ms}ms",
      "deck.pending": "Indexing {done}/{total} sessions in the background",
      "deck.longOn": "Including long text",
      "deck.more": "Show more ({count} left)",
      "deck.snapshot": "History snapshot",
      "need.filters": "Type a keyword, or pick at least one filter",
      "history.filters": "Filters",
      "history.clear": "Clear all",
      "history.clearConfirm": "Clear all search history and the cached result pages kept for it? The index is untouched.",
      "log.title": "Log collection",
      "log.hint": "Records search, jump and error details for troubleshooting; nothing is written when off.",
      "log.path": "Log file",
      "log.size": "{size} on disk",
      "log.copy": "Copy path",
      "log.copied": "Log path copied",
      "log.clear": "Clear log",
      "log.clearConfirm": "Clear the diagnostics log? Results and the index are untouched.",
      "sort.order": "Time order",
      "sort.newest": "New → old",
      "sort.oldest": "Old → new"
    }

    const CSS = String.raw`
.ds-root{position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;padding:22px;pointer-events:auto;font-family:inherit;color:var(--dsw-alias-label-primary,#e8ecf5)}
.ds-root *{box-sizing:border-box}
/* No backdrop-filter anywhere: a full-viewport blur forces the compositor to
   re-render an offscreen buffer on every frame and is the single biggest
   cause of dropped frames while this dialog is open. */
.ds-backdrop{position:absolute;inset:0;background:radial-gradient(1100px 720px at 18% 8%,rgba(14,165,233,.16),transparent 62%),radial-gradient(900px 640px at 86% 92%,rgba(37,99,235,.12),transparent 60%),rgba(6,9,16,.72);animation:ds-fade .18s ease}
.ds-modal{position:relative;display:flex;flex-direction:column;width:min(1200px,94vw);height:min(860px,92vh);border-radius:26px;overflow:hidden;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#8ea0c0) 48%,transparent);background:linear-gradient(145deg,color-mix(in srgb,var(--dsw-alias-bg-overlay,#121620) var(--ds-alpha,96%),transparent),color-mix(in srgb,var(--dsw-alias-bg-base,#0b0f18) var(--ds-alpha-soft,92%),transparent));box-shadow:0 44px 120px rgba(0,0,0,.55),inset 0 1px 0 color-mix(in srgb,#fff 18%,transparent);animation:ds-pop .22s cubic-bezier(.2,.85,.25,1)}
/* Blur is opt-in: the slider starts at 0 and a non-zero value is the only way
   the compositor pays for it. */
.ds-root.is-blurred .ds-modal{backdrop-filter:blur(var(--ds-blur,16px)) saturate(1.2)}

.ds-top{position:relative;z-index:3;display:flex;align-items:center;gap:18px;padding:14px 18px;border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 32%,transparent);background:linear-gradient(180deg,color-mix(in srgb,#fff 5%,transparent),transparent)}
.ds-brand{display:flex;align-items:center;gap:10px;min-width:186px;flex:none}
.ds-logo svg{display:block;border-radius:inherit}
.ds-logo{width:38px;height:38px;flex:none;border-radius:11px;display:grid;place-items:center;background:transparent;box-shadow:none;overflow:visible}
.ds-name{font-size:15px;font-weight:650;letter-spacing:.2px;line-height:1.25}
.ds-sub{font-size:10.5px;color:var(--dsw-alias-label-secondary,#98a6bf);letter-spacing:.25px;white-space:nowrap}
.ds-search{flex:1;max-width:690px;margin:0 auto;display:flex;align-items:center;gap:9px;height:46px;padding:0 7px 0 14px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,#182030) 76%,transparent);border:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#8ea0c0) 40%,transparent);box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 9%,transparent),0 6px 18px rgba(0,0,0,.12);transition:border-color .18s,box-shadow .18s}
.ds-search:focus-within{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 72%,transparent);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 22%,transparent),0 10px 26px rgba(0,0,0,.18)}
.ds-search-icon{flex:none;color:var(--dsw-alias-label-secondary,#98a6bf)}
.ds-search input{flex:1;min-width:0;height:100%;border:0;outline:0;background:transparent;color:var(--dsw-alias-label-primary,#e8ecf5);font:inherit;font-size:13.5px;letter-spacing:.1px}
.ds-search input::placeholder{color:color-mix(in srgb,var(--dsw-alias-label-secondary,#98a6bf) 82%,transparent)}
.ds-kbd{flex:none;font-size:10px;color:var(--dsw-alias-label-secondary,#98a6bf);border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 44%,transparent);border-radius:6px;padding:2px 6px;background:color-mix(in srgb,var(--dsw-alias-bg-base,#0b0f18) 40%,transparent)}
.ds-clear{flex:none;width:24px;height:24px;display:grid;place-items:center;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-secondary,#98a6bf);cursor:pointer}
.ds-clear:hover{background:color-mix(in srgb,var(--dsw-alias-label-secondary,#98a6bf) 16%,transparent);color:var(--dsw-alias-label-primary,#e8ecf5)}
.ds-go{flex:none;width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:50%;color:#fff;cursor:pointer;background:linear-gradient(135deg,#0ea5e9,#2563eb);box-shadow:0 6px 16px rgba(14,165,233,.4);transition:transform .16s,filter .16s}
.ds-go:hover{transform:translateY(-1px) scale(1.03);filter:brightness(1.08)}
.ds-go:disabled{cursor:default;opacity:.7;transform:none}
.ds-top-right{display:flex;align-items:center;gap:10px;flex:none}
.ds-indexed{font-size:10.5px;color:var(--dsw-alias-label-secondary,#98a6bf);white-space:nowrap}
.ds-icon-btn{width:34px;height:34px;display:grid;place-items:center;border:1px solid transparent;border-radius:10px;background:transparent;color:var(--dsw-alias-label-secondary,#98a6bf);cursor:pointer;transition:background .16s,color .16s}
.ds-icon-btn:hover{background:color-mix(in srgb,var(--dsw-alias-label-secondary,#98a6bf) 14%,transparent);color:var(--dsw-alias-label-primary,#e8ecf5)}
.ds-body{position:relative;z-index:1;flex:1;min-height:0;display:flex}
.ds-side{width:312px;flex:none;height:100%;min-height:0;display:flex;flex-direction:column;gap:0;padding:16px 14px 12px;overflow:auto;overscroll-behavior:contain;border-right:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 30%,transparent);background:linear-gradient(180deg,color-mix(in srgb,var(--dsw-alias-bg-layer-1,#10141c) 38%,transparent),color-mix(in srgb,var(--dsw-alias-bg-base,#0b0f18) 18%,transparent))}
.ds-section{margin-bottom:13px}
.ds-label{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 7px;font-size:11.5px;font-weight:650;letter-spacing:.85px;text-transform:uppercase;color:var(--dsw-alias-label-secondary,#98a6bf)}
.ds-label-hint{font-size:10.5px;font-weight:450;letter-spacing:.1px;text-transform:none;color:color-mix(in srgb,var(--dsw-alias-label-secondary,#98a6bf) 78%,transparent)}
.ds-seg{display:flex;gap:2px;padding:3px;border-radius:11px;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 32%,transparent);background:color-mix(in srgb,var(--dsw-alias-bg-base,#0b0f18) 34%,transparent)}
.ds-seg-btn{flex:1;min-width:0;height:30px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#98a6bf);font:inherit;font-size:12.5px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:background .16s,color .16s,box-shadow .16s}
.ds-seg-btn:hover{color:var(--dsw-alias-label-primary,#e8ecf5)}
.ds-seg-btn.is-active{background:color-mix(in srgb,var(--dsw-alias-bg-overlay,#fff) 82%,transparent);color:var(--dsw-alias-label-primary,#e8ecf5);box-shadow:0 2px 8px rgba(0,0,0,.18),inset 0 1px 0 color-mix(in srgb,#fff 16%,transparent)}
.ds-chips{display:flex;flex-wrap:wrap;gap:6px}
.ds-chip{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border-radius:9px;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 34%,transparent);background:color-mix(in srgb,var(--dsw-alias-bg-base,#0b0f18) 26%,transparent);color:var(--dsw-alias-label-secondary,#98a6bf);font:inherit;font-size:12.5px;cursor:pointer;transition:all .16s}
.ds-chip:hover{color:var(--dsw-alias-label-primary,#e8ecf5);border-color:color-mix(in srgb,var(--dsw-alias-border-l2,#8ea0c0) 55%,transparent)}
.ds-chip.is-active{color:var(--dsw-alias-label-primary,#e8ecf5);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 55%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 12%,transparent)}
.ds-chip-check{width:11px;flex:none;font-size:10px;line-height:1;color:var(--dsw-alias-brand-primary,#0ea5e9)}
.ds-chip kbd{font:inherit}
.ds-input{width:100%;height:33px;border-radius:9px;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 34%,transparent);background:color-mix(in srgb,var(--dsw-alias-bg-base,#0b0f18) 32%,transparent);color:var(--dsw-alias-label-primary,#e8ecf5);padding:0 10px;font:inherit;font-size:12.5px;outline:none;transition:border-color .16s,box-shadow .16s}
.ds-input::placeholder{color:color-mix(in srgb,var(--dsw-alias-label-secondary,#98a6bf) 78%,transparent)}
.ds-input:focus{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 65%,transparent);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 18%,transparent)}
.ds-hint{margin-top:6px;font-size:11px;line-height:1.55;color:color-mix(in srgb,var(--dsw-alias-label-secondary,#98a6bf) 88%,transparent)}
.ds-picker{margin-top:8px;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 32%,transparent);border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-bg-base,#0b0f18) 34%,transparent);overflow:hidden}
.ds-picker-head{padding:8px;border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 26%,transparent)}
.ds-picker-list{max-height:174px;overflow:auto;padding:4px}
.ds-picker-item{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;padding:7px 8px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary,#e8ecf5);text-align:left;cursor:pointer}
.ds-picker-item:hover{background:color-mix(in srgb,var(--dsw-alias-label-secondary,#98a6bf) 12%,transparent)}
.ds-picker-item.is-active{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 18%,transparent);box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary,#0ea5e9)}
.ds-picker-title{width:100%;font-size:12.5px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ds-picker-meta{width:100%;font-size:10.5px;color:var(--dsw-alias-label-secondary,#98a6bf);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ds-picker-empty{padding:12px 8px;font-size:10.5px;text-align:center;color:var(--dsw-alias-label-secondary,#98a6bf)}
.ds-selected-card{display:flex;align-items:center;gap:8px;margin-top:8px;padding:7px 9px;border-radius:9px;border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 36%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 11%,transparent)}
.ds-selected-card span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px}
.ds-selected-card svg{flex:none;color:var(--dsw-alias-brand-primary,#0ea5e9)}
.ds-side-foot{margin-top:auto;padding-top:12px;border-top:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 28%,transparent)}
.ds-index-status{margin-top:5px;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary,#98a6bf)}
.ds-index-actions{display:flex;gap:6px;margin-top:7px}
.ds-mini-btn{height:27px;padding:0 9px;border-radius:7px;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 34%,transparent);background:color-mix(in srgb,var(--dsw-alias-bg-base,#0b0f18) 26%,transparent);color:var(--dsw-alias-label-secondary,#98a6bf);font:inherit;font-size:11px;cursor:pointer}
.ds-mini-btn:hover{color:var(--dsw-alias-label-primary,#e8ecf5);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 42%,transparent)}
.ds-mini-btn:disabled{opacity:.55;cursor:default}
.ds-stale{display:flex;align-items:center;gap:8px;margin:8px 16px 0;padding:7px 10px;border-radius:9px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d29922) 34%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d29922) 9%,transparent);font-size:10.5px;color:var(--dsw-alias-label-secondary,#98a6bf)}
.ds-stale button{margin-left:auto;flex:none;height:24px;padding:0 9px;border-radius:6px;border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 45%,transparent);background:transparent;color:var(--dsw-alias-label-primary,#e8ecf5);font:inherit;font-size:10px;cursor:pointer}
.ds-stat-row{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10.5px;color:var(--dsw-alias-label-secondary,#98a6bf);padding:2px 0}
.ds-stat-row strong{font-weight:600;color:var(--dsw-alias-label-primary,#e8ecf5)}
.ds-log-path{margin-top:7px;padding:6px 8px;border-radius:7px;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 30%,transparent);background:color-mix(in srgb,var(--dsw-alias-bg-base,#0b0f18) 34%,transparent);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:9.5px;line-height:1.45;color:var(--dsw-alias-label-secondary,#98a6bf);word-break:break-all;user-select:text}
.ds-privacy{display:flex;align-items:center;gap:5px;margin-top:7px;font-size:10px;color:var(--dsw-alias-state-success-primary,#34d399)}
.ds-main{position:relative;flex:1;min-width:0;overflow:auto;padding:28px 30px}
.ds-welcome{max-width:760px;margin:2.5vh auto 0;display:flex;flex-direction:column;gap:18px;animation:ds-rise .35s ease}
.ds-hero{font-size:clamp(26px,2.5vw,38px);line-height:1.12;font-weight:750;letter-spacing:-.9px;background:linear-gradient(110deg,var(--dsw-alias-label-primary,#e8ecf5) 16%,color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 78%,#fff) 62%,#06b6d4);-webkit-background-clip:text;background-clip:text;color:transparent}
.ds-hero-sub{max-width:620px;font-size:13px;line-height:1.8;color:var(--dsw-alias-label-secondary,#98a6bf)}
.ds-hero-chips{display:flex;flex-wrap:wrap;gap:7px}
.ds-hero-chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:999px;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 34%,transparent);background:color-mix(in srgb,var(--dsw-alias-bg-layer-1,#10141c) 44%,transparent);font-size:11px;color:var(--dsw-alias-label-secondary,#98a6bf)}
.ds-hero-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:2px}
.ds-hero-card{padding:14px 13px;border-radius:14px;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 30%,transparent);background:linear-gradient(150deg,color-mix(in srgb,var(--dsw-alias-bg-layer-2,#182030) 52%,transparent),color-mix(in srgb,var(--dsw-alias-bg-base,#0b0f18) 20%,transparent));box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 7%,transparent)}
.ds-hero-card-top{display:flex;align-items:center;gap:7px;font-size:11.5px;font-weight:600}
.ds-hero-card p{margin:6px 0 0;font-size:10.5px;line-height:1.55;color:var(--dsw-alias-label-secondary,#98a6bf)}
.ds-history{display:flex;flex-direction:column;gap:7px;padding:12px 14px;border-radius:14px;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 26%,transparent);background:color-mix(in srgb,var(--dsw-alias-bg-layer-1,#10141c) 62%,transparent);box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 5%,transparent)}
.ds-history-list{display:flex;flex-direction:column;gap:3px;max-height:240px;overflow:auto}
.ds-history-chip{flex:1 1 auto;min-width:0;height:26px;padding:0 2px;border:0;background:transparent;color:var(--dsw-alias-label-primary,#e8ecf5);font:inherit;font-size:13.5px;text-align:left;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ds-history-chip:hover{color:var(--dsw-alias-brand-primary,#0ea5e9)}
.ds-history-item{display:flex;align-items:center;gap:8px;width:100%;padding:5px 6px;border-radius:9px}
.ds-history-item:hover{background:color-mix(in srgb,var(--dsw-alias-label-secondary,#98a6bf) 9%,transparent)}
.ds-history-remove{width:18px;height:18px;flex:none;display:grid;place-items:center;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-secondary,#98a6bf);cursor:pointer}
.ds-history-remove:hover{background:color-mix(in srgb,var(--dsw-alias-label-secondary,#98a6bf) 16%,transparent);color:var(--dsw-alias-state-error-primary,#e5534b)}
.ds-history-chip:hover{color:var(--dsw-alias-label-primary,#e8ecf5);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 45%,transparent)}
.ds-empty-history{font-size:10.5px;color:color-mix(in srgb,var(--dsw-alias-label-secondary,#98a6bf) 80%,transparent)}
.ds-deck{position:absolute;inset:11px;z-index:6;display:flex;flex-direction:column;border-radius:19px;overflow:hidden;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#8ea0c0) 45%,transparent);background:linear-gradient(155deg,color-mix(in srgb,var(--dsw-alias-bg-overlay,#121620) 97%,transparent),color-mix(in srgb,var(--dsw-alias-bg-base,#0b0f18) 93%,transparent));box-shadow:0 26px 70px rgba(0,0,0,.42),inset 0 1px 0 color-mix(in srgb,#fff 13%,transparent);animation:ds-deck .28s cubic-bezier(.2,.85,.25,1)}
.ds-deck-head{display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 30%,transparent)}
.ds-back{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border-radius:9px;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 34%,transparent);background:color-mix(in srgb,var(--dsw-alias-bg-base,#0b0f18) 24%,transparent);color:var(--dsw-alias-label-secondary,#98a6bf);font:inherit;font-size:11px;cursor:pointer;white-space:nowrap}
.ds-back:hover{color:var(--dsw-alias-label-primary,#e8ecf5);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 45%,transparent)}
.ds-deck-titles{flex:1;min-width:0}
.ds-deck-titles h2{margin:0;font-size:14px;font-weight:650;letter-spacing:.1px;line-height:1.3}
.ds-deck-titles p{margin:3px 0 0;font-size:10.5px;color:var(--dsw-alias-label-secondary,#98a6bf);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ds-progress{height:2px;background:linear-gradient(90deg,transparent,var(--dsw-alias-brand-primary,#0ea5e9),#06b6d4,transparent);background-size:200% 100%;animation:ds-progress 1.1s linear infinite}
.ds-deck-filters{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 16px;border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 24%,transparent);background:color-mix(in srgb,var(--dsw-alias-bg-base,#0b0f18) 14%,transparent)}
.ds-deck-filter-label{font-size:9.5px;letter-spacing:.7px;text-transform:uppercase;color:color-mix(in srgb,var(--dsw-alias-label-secondary,#98a6bf) 82%,transparent);margin-right:2px}
.ds-deck-chip{display:inline-flex;align-items:center;height:23px;padding:0 8px;border-radius:999px;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 30%,transparent);background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,#182030) 42%,transparent);font-size:10px;color:var(--dsw-alias-label-secondary,#98a6bf);white-space:nowrap}
.ds-deck-scroll{flex:1;min-height:0;overflow:auto;padding:10px 12px 18px;scrollbar-width:thin}
.ds-group{padding:4px 0 10px}
.ds-group .ds-result:first-of-type{margin-top:4px}
.ds-group-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:9px;padding:9px 6px;background:linear-gradient(180deg,color-mix(in srgb,var(--dsw-alias-bg-overlay,#121620) 97%,transparent) 82%,color-mix(in srgb,var(--dsw-alias-bg-overlay,#121620) 86%,transparent))}
.ds-avatar{width:29px;height:29px;flex:none;border-radius:10px;display:grid;place-items:center;font-size:11.5px;font-weight:700;color:#fff;background:linear-gradient(135deg,#0ea5e9,#2563eb);box-shadow:0 4px 12px rgba(14,165,233,.28)}
.ds-group-title{font-size:12px;font-weight:600;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:620px}
.ds-group-meta{font-size:9.5px;color:var(--dsw-alias-label-secondary,#98a6bf);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
.ds-result{display:flex;flex-direction:column;gap:5px;width:100%;margin:0 0 6px;padding:9px 11px;border-radius:11px;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 20%,transparent);background:color-mix(in srgb,var(--dsw-alias-bg-base,#0b0f18) 24%,transparent);color:var(--dsw-alias-label-primary,#e8ecf5);text-align:left;font:inherit;cursor:pointer;transition:background .15s,border-color .15s,transform .15s}
.ds-result:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 9%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 34%,transparent);transform:translateY(-1px)}
.ds-result:focus-visible{outline:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 70%,transparent);outline-offset:1px}
.ds-result-top{display:flex;align-items:center;gap:7px;min-width:0}
.ds-kind{display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 7px;border-radius:6px;font-size:9.5px;font-weight:650;letter-spacing:.2px;color:var(--dsw-alias-label-primary,#e8ecf5);background:color-mix(in srgb,var(--k,#0ea5e9) 17%,transparent);border:1px solid color-mix(in srgb,var(--k,#0ea5e9) 30%,transparent);white-space:nowrap}
.ds-kind::before{content:"";width:5px;height:5px;border-radius:50%;background:var(--k,#0ea5e9);box-shadow:0 0 8px var(--k,#0ea5e9)}
.ds-toolname{font-size:10px;color:var(--dsw-alias-label-secondary,#98a6bf);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:250px}
.ds-time{margin-left:auto;flex:none;font-size:9.5px;color:color-mix(in srgb,var(--dsw-alias-label-secondary,#98a6bf) 88%,transparent);white-space:nowrap}
.ds-snippet{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-primary,#e8ecf5);word-break:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.ds-snippet mark{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 30%,transparent);color:inherit;border-radius:3px;padding:0 1px;box-shadow:0 0 0 1px color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 16%,transparent)}
.ds-files{display:flex;flex-wrap:wrap;gap:5px;margin-top:1px}
.ds-file-chip{display:inline-flex;align-items:center;gap:4px;max-width:100%;padding:2px 7px;border-radius:6px;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 26%,transparent);background:color-mix(in srgb,var(--dsw-alias-bg-base,#0b0f18) 30%,transparent);font-size:9.5px;color:var(--dsw-alias-label-secondary,#98a6bf);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ds-deck-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;min-height:300px;padding:44px 22px;text-align:center}
.ds-empty-icon{width:54px;height:54px;border-radius:17px;display:grid;place-items:center;color:var(--dsw-alias-brand-primary,#0ea5e9);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 12%,transparent);border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 24%,transparent);box-shadow:0 12px 32px rgba(14,165,233,.14)}
.ds-deck-empty h3{margin:4px 0 0;font-size:14px;font-weight:600}
.ds-deck-empty p{margin:0;max-width:380px;font-size:11px;line-height:1.6;color:var(--dsw-alias-label-secondary,#98a6bf)}
.ds-error{margin:12px 16px;padding:10px 12px;border-radius:10px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary,#e5534b) 36%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#e5534b) 10%,transparent);font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-primary,#e8ecf5);display:flex;align-items:flex-start;gap:8px}
.ds-error button{margin-left:auto;flex:none;height:24px;padding:0 8px;border-radius:6px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary,#e5534b) 40%,transparent);background:transparent;color:var(--dsw-alias-label-primary,#e8ecf5);font:inherit;font-size:10px;cursor:pointer}
.ds-skeleton{display:flex;flex-direction:column;gap:9px;padding:16px 16px}
.ds-skel{height:60px;border-radius:11px;background:linear-gradient(90deg,color-mix(in srgb,var(--dsw-alias-label-secondary,#98a6bf) 8%,transparent),color-mix(in srgb,var(--dsw-alias-label-secondary,#98a6bf) 18%,transparent),color-mix(in srgb,var(--dsw-alias-label-secondary,#98a6bf) 8%,transparent));background-size:200% 100%;animation:ds-shimmer 1.3s linear infinite}
.ds-skel.short{height:38px;width:62%}
.ds-notice{position:absolute;left:50%;bottom:16px;z-index:12;transform:translateX(-50%);padding:8px 14px;border-radius:999px;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#8ea0c0) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-bg-overlay,#121620) 90%,transparent);backdrop-filter:blur(18px);box-shadow:0 12px 34px rgba(0,0,0,.35);font-size:11px;color:var(--dsw-alias-label-primary,#e8ecf5);animation:ds-rise .2s ease}
.ds-truncated{padding:4px 18px 12px;font-size:10px;line-height:1.5;color:var(--dsw-alias-state-warn-primary,#d29922)}
.ds-label-action{border:0;background:transparent;color:var(--dsw-alias-brand-primary,#0ea5e9);font:inherit;font-size:9.5px;letter-spacing:.1px;text-transform:none;cursor:pointer;padding:2px 4px;border-radius:6px}
.ds-label-action:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 12%,transparent)}
.ds-range-row{display:grid;grid-template-columns:52px 1fr 36px;align-items:center;gap:7px;margin:7px 0;font-size:10.5px;color:var(--dsw-alias-label-secondary,#98a6bf)}
.ds-range{width:100%;height:16px;margin:0;accent-color:var(--dsw-alias-brand-primary,#0ea5e9);cursor:pointer}
.ds-range-value{text-align:right;font-variant-numeric:tabular-nums;font-size:10px;color:var(--dsw-alias-label-primary,#e8ecf5)}
.ds-boot{position:absolute;inset:80px 0 0;display:flex;align-items:center;justify-content:center;gap:8px;font-size:11.5px;color:var(--dsw-alias-label-secondary,#98a6bf);z-index:8;pointer-events:none}
.ds-preload-chip{display:inline-flex;align-items:center;gap:5px;font-size:10px;line-height:1;padding:4px 8px;border-radius:999px;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 32%,transparent);color:var(--dsw-alias-label-secondary,#98a6bf)}
.ds-preload-chip.is-running{border-color:color-mix(in srgb,#22d3ee 55%,transparent);color:#22d3ee}
.ds-preload-chip.is-ready,.ds-preload-chip.is-hit{border-color:color-mix(in srgb,#34c759 55%,transparent);color:#34c759}
.ds-selected-card{display:flex;align-items:center;gap:7px}
.ds-selected-clear{margin-left:auto;flex:none;display:grid;place-items:center;width:18px;height:18px;border:0;border-radius:50%;background:transparent;color:inherit;cursor:pointer;opacity:.7}
.ds-selected-clear:hover{opacity:1;background:color-mix(in srgb,#fff 10%,transparent)}
.ds-switch-row{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:8px 0;border-top:.5px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 26%,transparent)}
.ds-switch-row:first-of-type{border-top:0;padding-top:2px}
.ds-switch-copy{min-width:0}
.ds-switch-title{font-size:12.5px;line-height:1.35;color:var(--dsw-alias-label-primary,#e8ecf5)}
.ds-switch-hint{font-size:11px;line-height:1.4;color:var(--dsw-alias-label-secondary,#98a6bf);margin-top:2px}
.ds-switch{position:relative;flex:none;width:38px;height:22px;padding:0;border:0;border-radius:999px;cursor:pointer;background:color-mix(in srgb,var(--dsw-alias-label-secondary,#98a6bf) 42%,transparent);transition:background .18s ease}
.ds-switch.is-on{background:var(--dsw-alias-state-success-primary,#34c759)}
.ds-switch-knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.28);transition:transform .18s ease}
.ds-switch.is-on .ds-switch-knob{transform:translateX(16px)}
.ds-thread-row{margin:2px 0 8px}
.ds-turn{flex:none;font-size:9px;color:var(--dsw-alias-label-secondary,#98a6bf);border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 28%,transparent);border-radius:5px;padding:1px 5px;white-space:nowrap}
.ds-jump-toast{position:fixed;left:50%;bottom:26px;z-index:95;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:9px 15px;border-radius:999px;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#8ea0c0) 45%,transparent);background:color-mix(in srgb,var(--dsw-alias-bg-overlay,#121620) 92%,transparent);backdrop-filter:blur(22px) saturate(1.3);box-shadow:0 16px 44px rgba(0,0,0,.35),inset 0 1px 0 color-mix(in srgb,#fff 16%,transparent);color:var(--dsw-alias-label-primary,#e8ecf5);font-size:11.5px;pointer-events:none;animation:ds-rise .22s ease}
.ds-jump-toast.is-failed{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#e5534b) 50%,transparent);color:var(--dsw-alias-state-error-primary,#e5534b)}
.ds-jump-toast.is-partial{border-color:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#d7a33a) 55%,transparent);color:var(--dsw-alias-state-warning-primary,#d7a33a)}
.ds-jump-dot{width:7px;height:7px;flex:none;border-radius:50%;background:var(--dsw-alias-brand-primary,#0ea5e9);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 18%,transparent)}
.ds-jump-toast.is-done .ds-jump-dot{background:var(--dsw-alias-state-success-primary,#34d399);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-success-primary,#34d399) 18%,transparent)}
.ds-jump-toast.is-failed .ds-jump-dot{background:currentColor;box-shadow:none}
.ds-jump-target{border-radius:10px;animation:ds-hit-glow 3.2s ease}
@keyframes ds-hit-glow{0%,100%{box-shadow:0 0 0 0 transparent;background-color:transparent}10%,76%{box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 70%,transparent),0 0 34px color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 26%,transparent);background-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 9%,transparent)}}
::highlight(flash-anchor-hit){background-color:rgba(14,165,233,.42);color:inherit;text-decoration:underline;text-decoration-color:rgba(14,165,233,.8)}
.ds-entry{box-sizing:border-box;width:calc(100% + 4px);height:42px;display:flex;align-items:center;gap:8px;margin:0 -2px;padding:0 10px 0 8px;border:0;border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary,#e6e6e6);font:inherit;font-size:14px;line-height:22px;cursor:pointer;overflow:hidden;text-decoration:none;transition:background .16s}
.ds-entry:hover{background:color-mix(in srgb,var(--dsw-alias-label-secondary,#98a6bf) 14%,transparent)}
.ds-entry-rail{width:36px;height:36px;flex:none;justify-content:center;gap:0;margin:0;padding:0;border-radius:50%}
.ds-entry-icon{flex:none;color:var(--dsw-alias-brand-primary,#0ea5e9)}
.ds-entry-label{flex:auto;min-width:0;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* The sidebar footer action seat is a single flex row; with more than one
   installed action the labels collide. Stack the seat while our entry is
   present so every action keeps the full sidebar width. */
[class*="footerActions"]:has(.ds-entry){flex-direction:column;align-items:stretch;gap:2px}
.ds-spin{animation:ds-spin .9s linear infinite}
@keyframes ds-fade{from{opacity:0}to{opacity:1}}
@keyframes ds-pop{from{opacity:0;transform:translateY(16px) scale(.985)}to{opacity:1;transform:none}}
@keyframes ds-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes ds-deck{from{opacity:0;transform:translateY(14px) scale(.99)}to{opacity:1;transform:none}}
@keyframes ds-float{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(28px,26px,0) scale(1.08)}}
@keyframes ds-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
@keyframes ds-spin{to{transform:rotate(360deg)}}
@keyframes ds-progress{0%{background-position:200% 0}100%{background-position:-200% 0}}
.ds-select{width:100%;height:33px;border-radius:9px;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 34%,transparent);background:color-mix(in srgb,var(--dsw-alias-bg-base,#0b0f18) 32%,transparent);color:var(--dsw-alias-label-primary,#e8ecf5);padding:0 8px;font:inherit;font-size:12.5px;outline:none;cursor:pointer}
.ds-select:focus{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 65%,transparent)}
.ds-history-meta{flex:0 1 auto;display:flex;align-items:center;gap:3px;min-width:0;max-width:58%;overflow:hidden}
.ds-badge{display:inline-flex;align-items:center;height:19px;min-width:0;max-width:100%;padding:0 7px;border-radius:6px;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 30%,transparent);background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,#182030) 55%,transparent);font-size:10.5px;color:var(--dsw-alias-label-secondary,#98a6bf);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ds-badge.is-long{border-color:color-mix(in srgb,#a855f7 55%,transparent);color:#c084fc}
.ds-badge.is-ws{border-color:color-mix(in srgb,#22d3ee 45%,transparent);color:#67e8f9}
.ds-history-item{align-items:flex-start}
.ds-deck-foot{display:flex;align-items:center;gap:8px;padding:10px 16px 16px;flex-wrap:wrap}
.ds-more{height:30px;padding:0 14px;border-radius:9px;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,#7f8da8) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-bg-base,#0b0f18) 30%,transparent);color:var(--dsw-alias-label-primary,#e8ecf5);font:inherit;font-size:11px;cursor:pointer}
.ds-more:hover{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#0ea5e9) 55%,transparent)}
.ds-long-cta{display:flex;align-items:flex-start;gap:10px;width:calc(100% - 32px);margin:6px 16px 0;padding:11px 13px;border-radius:11px;border:1px dashed color-mix(in srgb,#a855f7 55%,transparent);background:color-mix(in srgb,#a855f7 8%,transparent);color:var(--dsw-alias-label-primary,#e8ecf5);font:inherit;text-align:left;cursor:pointer}
.ds-long-cta:hover{background:color-mix(in srgb,#a855f7 14%,transparent)}
.ds-long-cta strong{display:block;font-size:11.5px;font-weight:650;margin-bottom:2px}
.ds-long-cta span{font-size:10px;line-height:1.5;color:var(--dsw-alias-label-secondary,#98a6bf)}
.ds-long-icon{flex:none;width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:color-mix(in srgb,#a855f7 18%,transparent);color:#c084fc}
.ds-pending{display:inline-flex;align-items:center;gap:5px}
.ds-pending .ds-dot{width:5px;height:5px;border-radius:50%;background:#22d3ee;animation:ds-blink 1s ease-in-out infinite}
@keyframes ds-blink{0%,100%{opacity:.25}50%{opacity:1}}
@media (max-width:1100px){.ds-side{width:278px}.ds-indexed{display:none}.ds-sub{display:none}.ds-brand{min-width:auto}.ds-top{gap:10px}}
@media (max-width:860px){.ds-root{padding:0}.ds-modal{width:100vw;height:100vh;border-radius:0}.ds-side{display:none}.ds-main{padding:18px}.ds-hero-cards{grid-template-columns:1fr}.ds-top{padding:10px 12px}.ds-search{height:42px}.ds-kbd{display:none}.ds-deck{inset:0;border-radius:0}}
@media (prefers-reduced-motion:reduce){.ds-backdrop,.ds-modal,.ds-deck,.ds-welcome,.ds-skel,.ds-modal::before,.ds-modal::after,.ds-progress{animation:none!important}.ds-result:hover{transform:none}}
`

    const openStore = createStore(false)
    const jumpStore = createStore({ state: 'idle', message: '' })

    // Survive closing the dialog: reopening must show the last result page
    // instead of scanning the corpus again.
    const resultCache = { savedId: null, payload: null, at: 0 }
    // Near-memory search: identical signatures within a minute return without a
    // request. A request already in flight is aborted first.
    const searchCache = new Map()
    const SEARCH_CACHE_MS = 60_000
    // A click opens the target Session before its Chat view exists. The old
    // 4s budget expired mid-mount and reported "not-mounted" for a Turn that
    // simply had not rendered yet; waiting for the view is the fix.
    const JUMP_VIEW_MS = 7_000
    const JUMP_LOCATE_MS = 8_000
    let sessionsCache = { at: 0, payload: null }
    const PREFS_KEY = 'flash-anchor:prefs:v1'
    // 0 = no compositor blur. Anything above costs a full-screen offscreen pass
    // per frame, which is why the default is off.
    const APPEARANCE_DEFAULT = { blur: 0, alpha: 96 }
    // Results are appended in pages: 400 buttons at once is what made the deck
    // scroll stutter.
    const PAGE_SIZE = 60
    const PROGRESS_MS = 700

    function defaultPrefs() {
      return {
        scopeMode: 'all',
        selectedSession: '',
        objectMode: 'all',
        types: defaultTypes('all'),
        ext: '',
        sort: 'relevance',
        timeOrder: 'desc',
        query: '',
        workspace: '',
        long: false,
        blur: APPEARANCE_DEFAULT.blur,
        alpha: APPEARANCE_DEFAULT.alpha,
        speculative: false,
        scatter: true,
        threads: 2,
        resultsOpen: false,
        savedId: null,
      }
    }

    function clampNumber(value, min, max, fallback) {
      const number = Number(value)
      if (!Number.isFinite(number)) return fallback
      return Math.min(max, Math.max(min, Math.round(number)))
    }

    function loadPrefs() {
      const defaults = defaultPrefs()
      try {
        const raw = window.localStorage.getItem(PREFS_KEY)
        if (!raw) return defaults
        const saved = JSON.parse(raw)
        if (!saved || typeof saved !== 'object') return defaults
        const objectMode = ['model', 'user', 'all'].includes(saved.objectMode) ? saved.objectMode : defaults.objectMode
        const savedTypes = Array.isArray(saved.types)
          ? saved.types.filter((kind) => ALL_TYPES.includes(kind))
          : []
        return {
          scopeMode: saved.scopeMode === 'session' ? 'session' : 'all',
          selectedSession: typeof saved.selectedSession === 'string' ? saved.selectedSession : '',
          objectMode,
          types: savedTypes.length > 0 ? savedTypes : defaultTypes(objectMode),
          ext: typeof saved.ext === 'string' ? saved.ext : '',
          sort: saved.sort === 'time' ? 'time' : 'relevance',
          timeOrder: saved.timeOrder === 'asc' ? 'asc' : 'desc',
          query: typeof saved.query === 'string' ? saved.query : '',
          workspace: typeof saved.workspace === 'string' ? saved.workspace : '',
          long: saved.long === true,
          blur: 0,
          alpha: clampNumber(saved.alpha, 55, 100, defaults.alpha),
          speculative: saved.speculative === true,
          scatter: saved.scatter !== false,
          threads: clampNumber(saved.threads, 1, 8, 2),
          resultsOpen: saved.resultsOpen === true,
          savedId: typeof saved.savedId === 'string' ? saved.savedId : null,
        }
      } catch {
        return defaults
      }
    }

    function savePrefs(prefs) {
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
      } catch {
        /* private mode or a full quota must not break the UI */
      }
    }

    function searchSignature(parts) {
      return JSON.stringify([
        String((parts && parts.query) || '').trim(),
        parts && parts.scopeMode === 'session' ? String(parts.selectedSession || '') : 'all',
        String((parts && parts.workspace) || ''),
        [...((parts && parts.types) || [])].slice().sort(),
        String((parts && parts.ext) || '').trim(),
        (parts && parts.sort) || 'relevance',
        (parts && parts.timeOrder) || 'desc',
        parts && parts.long === true ? 1 : 0,
      ])
    }

    /** Does the current filter set describe a search at all? */
    function filterOnlySearch(filters) {
      if (!filters) return false
      if (String(filters.query || '').trim()) return true
      if (String(filters.ext || '').trim()) return true
      if (String(filters.workspace || '')) return true
      if (filters.scopeMode === 'session' && filters.selectedSession) return true
      if (filters.long === true) return true
      const types = Array.isArray(filters.types) ? filters.types : []
      return types.length !== ALL_TYPES.length
    }

    function delay(ms) {
      return new Promise((resolve) => window.setTimeout(resolve, ms))
    }

    function waitForMatch(find, timeout = 5000, interval = 90) {
      return new Promise((resolve) => {
        const started = Date.now()
        const tick = () => {
          let value = null
          try {
            value = find()
          } catch {
            value = null
          }
          if (value) {
            resolve(value)
            return
          }
          if (Date.now() - started >= timeout) {
            resolve(null)
            return
          }
          window.setTimeout(tick, interval)
        }
        tick()
      })
    }

    function turnOfLabel(label) {
      const matches = String(label || '').match(/\d+/g)
      if (!matches || matches.length === 0) return null
      const value = Number(matches[matches.length - 1])
      return Number.isFinite(value) ? value : null
    }

    function turnMarks() {
      const marks = []
      for (const element of document.querySelectorAll('button[data-index]')) {
        const label = element.getAttribute('aria-label') || ''
        if (!/轮|turn/i.test(label)) continue
        const index = Number(element.dataset.index)
        const turn = turnOfLabel(label)
        if (!Number.isFinite(index) || !Number.isFinite(turn)) continue
        marks.push({ element, index, turn })
      }
      return marks
    }

    /** The Chat transcript scroller: a virtual list mounts Turns only near it. */
    function chatScroller() {
      const anchor = document.querySelector('[data-chat-flow]') || document.querySelector('[data-chat-turn]')
      let node = anchor ? anchor.parentElement : null
      while (node && node !== document.body) {
        try {
          const view = Number(node.clientHeight) || 0
          const total = Number(node.scrollHeight) || 0
          if (view > 0 && total > view + 8) return node
        } catch {
          /* a detached node ends the walk */
        }
        node = node.parentElement
      }
      return null
    }

    function chatViewState() {
      const rows = document.querySelectorAll('[data-chat-turn]').length
      const marks = turnMarks().length
      const flow = document.querySelector('[data-chat-flow]') !== null
      return { flow, rows, marks, ready: flow || rows > 0 || marks > 0 }
    }

    /** Wait for the freshly opened Session's Chat view, not just its binding. */
    async function waitForChatView(deadline) {
      const timeout = Math.max(200, deadline - Date.now())
      const ready = await waitForMatch(() => (chatViewState().ready ? true : null), timeout, 80)
      return ready === true
    }

    /**
     * Walk the virtualized transcript toward one Turn so its rows mount. The
     * rail is the fast path; this covers views whose rail is absent or whose
     * mark list has not materialized yet.
     */
    async function nudgeTranscript(turn) {
      const target = Number(turn)
      if (!Number.isFinite(target)) return false
      const scroller = chatScroller()
      if (!scroller) return false
      const mounted = [...document.querySelectorAll('[data-chat-turn]')]
        .map((row) => Number(row.getAttribute('data-chat-turn')))
        .filter((value) => Number.isFinite(value))
      if (mounted.length === 0) return false
      const first = Math.min(...mounted)
      const last = Math.max(...mounted)
      const view = Number(scroller.clientHeight) || 0
      const total = Number(scroller.scrollHeight) || 0
      const step = Math.max(160, Math.round(view * 0.85))
      const current = Number(scroller.scrollTop) || 0
      let next = null
      if (target < first) next = Math.max(0, current - step)
      else if (target > last) next = Math.min(Math.max(0, total - view), current + step)
      if (next === null || Math.abs(next - current) < 4) return false
      scroller.scrollTop = next
      await settleFrames(1)
      return true
    }

    /**
     * Click the rail mark that names this Turn. The rail is virtualized too, so
     * a missing mark means "scroll the rail and look again", never "this Turn
     * does not exist".
     */
    async function clickTurnMark(turn, timeout = 1200) {
      const marks = await waitForMatch(() => {
        const current = turnMarks()
        return current.length > 0 ? current : null
      }, timeout)
      if (!marks) return false
      const exact = () => turnMarks().find((candidate) => candidate.turn === turn) || null
      const rail = marks[0].element.closest('[class*="scroller"]') || marks[0].element.parentElement
      let mark = exact()
      if (!mark) {
        const first = marks[0]
        const offset = first.turn - first.index
        let targetIndex = turn - offset
        if (!Number.isFinite(targetIndex) || targetIndex < 0) targetIndex = turn - 1
        if (rail) {
          rail.scrollTop = Math.max(0, targetIndex * 10 - rail.clientHeight / 2)
          await delay(140)
        }
        mark = exact()
      }
      if (!mark && rail) {
        // The rail virtualizes its marks as well: sweep it instead of guessing.
        const total = Math.max(0, Number(rail.scrollHeight) || 0)
        const step = Math.max(80, Math.round((Number(rail.clientHeight) || 0) * 0.9))
        for (let at = 0; at <= total; at += step) {
          rail.scrollTop = at
          await delay(60)
          mark = exact()
          if (mark) break
        }
      }
      if (!mark) return false
      try {
        mark.element.click()
      } catch {
        return false
      }
      return true
    }

    let lastJumpRow = null

    function snippetFragment(query, snippet) {
      const needle = String(query || '').trim().toLowerCase()
      const text = String(snippet || '').replace(/^[\s\u2026]+|[\s\u2026]+$/g, '').trim()
      if (!needle) return ''
      const at = text.toLowerCase().indexOf(needle)
      if (at === -1) return text.slice(0, 80)
      let start = at
      let end = at + needle.length
      while (start > 0 && !/\s/.test(text[start - 1]) && at - start < 45) start -= 1
      while (end < text.length && !/\s/.test(text[end]) && end - at < 90) end += 1
      return text.slice(start, end).trim() || needle
    }

    // A rendered Turn holds one row per flow node. The reasoning chain and the
    // answer of one Step are two seats that share a node key, so a seat must be
    // chosen by the hit kind instead of by document order.
    function normalizeText(value) {
      return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().toLowerCase()
    }

    // A three-character CJK phrase is as telling as a six-character Latin one.
    function isSpecificFragment(value) {
      if (value.length >= 6) return true
      return /[\u4e00-\u9fff]/.test(value) && value.length >= 3
    }

    function flowKindsFor(target) {
      switch (String((target && target.kind) || '')) {
        case 'userText':
          return ['user', 'steering', 'context', 'command', 'turn-trigger']
        case 'inputFiles':
          return ['user', 'steering', 'context', 'command', 'turn-trigger']
        case 'context':
          return ['context', 'user', 'steering', 'command', 'turn-trigger']
        case 'reasoning':
        case 'modelText':
          return ['assistant-step']
        case 'tools':
          return ['tool-call', 'turn-tail']
        case 'outputFiles':
          return ['tool-call', 'assistant-step', 'turn-tail', 'turn']
        default:
          return []
      }
    }

    function flowKindOf(row) {
      return String((row && row.dataset && row.dataset.chatFlowKind) || '')
    }

    function escapeAttribute(value) {
      return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    }

    /* ------------------------------------------------------------------ *
     * Anchor address
     *
     * The Chat target keys every flow node as "<kind.length>:<kind><id>".
     * assistant-step ids are "<turn>:<step>", tool-call ids are the call id,
     * input-message ids are the message id. That makes the node address a
     * computation, not a guess.
     * ------------------------------------------------------------------ */

    const ASSISTANT_STEP_PREFIX = '14:assistant-step'
    const TOOL_CALL_PREFIX = '9:tool-call'
    const INPUT_MESSAGE_PREFIX = '13:input-message'

    function finiteNumber(value) {
      if (value === null || value === undefined || value === '') return null
      const number = Number(value)
      return Number.isFinite(number) ? number : null
    }

    function anchorOf(target) {
      return (target && target.anchor) || {}
    }

    function nodeKeyOfAnchor(target) {
      const anchor = anchorOf(target)
      const kind = String((target && target.kind) || '')
      const toolCallId = anchor.toolCallId ?? (target && target.toolCallId)
      if (toolCallId) return TOOL_CALL_PREFIX + String(toolCallId)
      const turn = finiteNumber(anchor.turn ?? (target && target.turn))
      const step = finiteNumber(anchor.step ?? (target && target.step))
      if (kind === 'modelText' || kind === 'reasoning') {
        return turn !== null && step !== null ? ASSISTANT_STEP_PREFIX + turn + ':' + step : null
      }
      if (kind === 'outputFiles') {
        if (turn !== null && step !== null) return ASSISTANT_STEP_PREFIX + turn + ':' + step
      }
      if (kind === 'userText' || kind === 'inputFiles' || kind === 'context') {
        const messageId = anchor.messageId ?? (target && target.messageId)
        if (messageId) return INPUT_MESSAGE_PREFIX + String(messageId)
      }
      return null
    }

    function chatSnapshot(ctx, sessionId) {
      try {
        const conversation = ctx.get ? ctx.get('uiConversation') : ctx.uiConversation
        if (!conversation || !sessionId) return null
        const binding = conversation.binding(sessionId)
        binding.activate('chat')
        const snapshot = binding.target('chat').getSnapshot()
        if (!snapshot || !Array.isArray(snapshot.order) || !snapshot.nodes) return null
        return snapshot
      } catch {
        return null
      }
    }

    function snapshotNodes(snapshot) {
      const list = []
      for (const key of snapshot.order) {
        const node = snapshot.nodes.get ? snapshot.nodes.get(key) : snapshot.nodes[key]
        if (node) list.push({ key: String(key), node })
      }
      return list
    }

    function nodeTextOf(node) {
      const parts = []
      const walk = (value, depth) => {
        if (value == null || depth > 5) return
        if (typeof value === 'string') {
          if (value) parts.push(value)
          return
        }
        if (Array.isArray(value)) {
          for (const item of value) walk(item, depth + 1)
          return
        }
        if (typeof value !== 'object') return
        for (const key of ['blocks', 'content', 'message', 'text', 'root', 'payload', 'data', 'args', 'arguments']) {
          if (key in value) walk(value[key], depth + 1)
        }
      }
      walk(node && node.data, 0)
      return normalizeText(parts.join(' '))
    }

    function nodeMessageId(node) {
      const data = node && node.data
      if (!data) return ''
      const direct =
        data.messageId ?? data.id ?? (data.message && data.message.id) ?? (data.finalNode && data.finalNode.messageId)
      if (direct != null && direct !== '') return String(direct)
      if (Array.isArray(data.blocks)) {
        for (const block of data.blocks) {
          if (block && block.messageId != null && block.messageId !== '') return String(block.messageId)
        }
      }
      return ''
    }

    function nodeTurnOf(node) {
      const data = node && node.data
      const location = node && node.location
      const fromLocation = location && location.turn ? location.turn.turn : undefined
      let value = data && data.turn != null ? data.turn : undefined
      if (value == null && data && data.root && data.root.turn != null) value = data.root.turn
      if (value == null) value = fromLocation
      return finiteNumber(value)
    }

    function nodeStepOf(node) {
      const data = node && node.data
      let value = data && data.step != null ? data.step : undefined
      if (value == null && data && data.root && data.root.step != null) value = data.root.step
      if (value == null && node && node.location && node.location.kind === 'step' && node.location.step) {
        value = node.location.step.step
      }
      return finiteNumber(value)
    }

    function nodeKindOf(node) {
      return String((node && node.kind) || '')
    }

    function nodeToolNameOf(node) {
      const data = node && node.data
      const root = data && data.root
      if (root && typeof root.name === 'string') return root.name
      if (root && root.call && typeof root.call.name === 'string') return root.call.name
      return ''
    }

    /**
     * Resolve the Chat node that owns a hit. The direct address wins; the
     * snapshot scan below is a fallback for old payloads and for live nodes
     * the DOM has not published yet. It never leaves the hit's Turn.
     */
    function resolveNodeKey(ctx, target) {
      const anchor = anchorOf(target)
      const direct = nodeKeyOfAnchor(target)
      const turn = finiteNumber(anchor.turn ?? target.turn)
      const step = finiteNumber(anchor.step ?? target.step)
      const seq = finiteNumber(target.seq)
      const kinds = flowKindsFor(target)
      const wantedId = String(anchor.messageId ?? target.messageId ?? '')
      const toolName = String(target.toolName || '')
      const snapshot = chatSnapshot(ctx, target.sessionId)
      if (!snapshot) return { key: direct, how: direct ? 'anchor' : 'no-snapshot' }
      const nodes = snapshotNodes(snapshot)
      if (nodes.length === 0) return { key: direct, how: direct ? 'anchor' : 'empty-snapshot' }
      const known = new Set(nodes.map((entry) => entry.key))
      if (direct && known.has(direct)) return { key: direct, how: 'anchor' }

      const sameTurn = turn !== null ? nodes.filter((entry) => nodeTurnOf(entry.node) === turn) : []
      const kindMatch = (entry) => kinds.length === 0 || kinds.includes(nodeKindOf(entry.node))
      const stepMatch = (entry) => step !== null && nodeStepOf(entry.node) === step

      if (sameTurn.length > 0) {
        const order = sameTurn
        if (wantedId) {
          const byId = order.find((entry) => nodeMessageId(entry.node) === wantedId && kindMatch(entry))
          if (byId) return { key: byId.key, how: 'message-id' }
        }
        // An event seq names the node that contains it; equality is an
        // identity, unlike "the newest node at or before this seq".
        if (seq !== null) {
          const bySeq = order.find((entry) => kindMatch(entry) && Number(entry.node.anchorSeq) === seq)
          if (bySeq) return { key: bySeq.key, how: 'seq-exact' }
        }
        if (step !== null) {
          const byStep = order.find((entry) => stepMatch(entry) && kindMatch(entry))
          if (byStep) return { key: byStep.key, how: 'step' }
          const byStepLoose = order.find((entry) => stepMatch(entry))
          if (byStepLoose) return { key: byStepLoose.key, how: 'step-loose' }
        }
        if (toolName) {
          const byTool = order.find((entry) => nodeToolNameOf(entry.node) === toolName)
          if (byTool) return { key: byTool.key, how: 'tool-name' }
        }
        if (direct) {
          // A hit with its own address is never swapped for a neighbour in the
          // same Turn; that exchange is what "landed somewhere unrelated"
          // looked like. The caller reports not-mounted instead.
          return { key: direct, how: 'anchor-unverified' }
        }
        // Legacy payloads carry no address; the owning node is the best guess.
        if (seq !== null) {
          let owner = null
          let bestAnchor = -Infinity
          for (const entry of order) {
            if (!kindMatch(entry)) continue
            const value = Number(entry.node.anchorSeq)
            if (!Number.isFinite(value) || value > seq) continue
            if (value >= bestAnchor) {
              bestAnchor = value
              owner = entry
            }
          }
          if (owner) return { key: owner.key, how: 'seq-owner' }
        }
        const first = order.find(kindMatch) || order[0]
        if (first) return { key: first.key, how: 'turn-first' }
      }
      if (direct) return { key: direct, how: 'anchor-unverified' }
      return { key: null, how: sameTurn.length === 0 ? 'other-turn' : 'no-node' }
    }

    function seatPartOf(target) {
      const kind = String((target && target.kind) || '')
      if (kind === 'reasoning') return 'reasoning'
      if (kind === 'modelText') return 'response'
      return ''
    }

    function mountedRows(rows) {
      const visible = rows.filter(
        (row) => !row.hasAttribute('hidden') && row.getAttribute('data-turn-process-hidden') === null,
      )
      return visible.length > 0 ? visible : rows
    }

    function pickSeatRow(nodeKey, target) {
      if (!nodeKey) return null
      const rows = [...document.querySelectorAll('[data-chat-node-key="' + escapeAttribute(nodeKey) + '"]')]
      if (rows.length === 0) return null
      const preferred = seatPartOf(target)
      if (preferred) {
        const exact = rows.filter((row) => String(row.getAttribute('data-chat-group-part') || '') === preferred)
        if (exact.length > 0) return mountedRows(exact)[0]
        if (preferred === 'response') {
          const plain = rows.filter((row) => !row.getAttribute('data-chat-group-part'))
          if (plain.length > 0) return mountedRows(plain)[0]
        }
      }
      return mountedRows(rows)[0]
    }

    // Last resort that still respects the Turn boundary: pick a row of this
    // Turn whose flow kind and seat match the hit. Never scans other Turns.
    function pickRowInTurn(turn, target) {
      if (turn === null) return null
      const rows = rowsOfTurn(turn).filter((row) => flowKindOf(row) !== 'turn-process')
      if (rows.length === 0) return null
      const kinds = flowKindsFor(target)
      const preferred = seatPartOf(target)
      const needle = needleOf(target).text
      let pick = null
      let score = -Infinity
      for (const row of mountedRows(rows)) {
        let value = 0
        if (kinds.includes(flowKindOf(row))) value += 20
        const part = String(row.getAttribute('data-chat-group-part') || '')
        if (preferred === part) value += 12
        else if (preferred === 'response' && part === '') value += 8
        else if (preferred && part !== '') value -= 6
        // Text is the strongest signal available once the key is unreliable:
        // a row that literally contains the hit outranks a kind-only guess.
        if (needle && normalizeText(row.textContent).includes(needle)) value += 40
        else if (needle && squashText(row.textContent).includes(squashText(needle))) value += 30
        if (row.getAttribute('data-turn-process-hidden') !== null) value -= 20
        if (value > score) {
          score = value
          pick = row
        }
      }
      return pick
    }

    function rowsOfTurn(turn) {
      if (turn === null) return []
      return [...document.querySelectorAll('[data-chat-turn="' + turn + '"]')]
    }

    /* ------------------------------------------------------------------ *
     * Block inside one row
     * ------------------------------------------------------------------ */

    const BLOCK_SELECTOR = 'p,li,pre,blockquote,td,h1,h2,h3,h4,h5,h6,dt,dd'
    const CARD_SELECTOR = '[data-tool][data-state],[data-message-attachments],[data-chat-call-id]'

    // Markdown splits raw text into inline elements and drops syntax markers,
    // so squashing both sides keeps the match stable across bold, code, and
    // link rendering while staying exact for CJK.
    function squashText(value) {
      return String(value == null ? '' : value)
        .toLowerCase()
        .replace(/[\s\u00a0\u0060*_#>|~()[\]{}"'“”‘’·,，。;；:：!?！？\-—…\\/]+/g, '')
    }

    function uniqueStrings(values) {
      const seen = new Set()
      const out = []
      for (const value of values) {
        const text = String(value || '').trim()
        if (!text || seen.has(text)) continue
        seen.add(text)
        out.push(text)
      }
      return out
    }

    function needleOf(target) {
      const anchor = anchorOf(target)
      const query = String((target && target.query) || '')
      let fragment = String((target && target.fragment) || '')
      if (!fragment) fragment = snippetFragment(query, target && target.snippet)
      let text = normalizeText(fragment)
      if (!text) text = normalizeText(query)
      if (!text && target && target.snippet) {
        text = normalizeText(String(target.snippet).replace(/^[\s\u2026]+|[\s\u2026]+$/g, '').slice(0, 120))
      }
      const names = []
      if (anchor.file) names.push(String(anchor.file))
      if (Array.isArray(target && target.files)) {
        for (const file of target.files) {
          if (file && (file.name || file.path)) names.push(String(file.name || basename(file.path)))
        }
      }
      if (target && target.fileName) names.push(String(target.fileName))
      return { text, names: uniqueStrings(names), query }
    }

    function matchText(text, needle) {
      const hay = normalizeText(text)
      if (!hay || !needle) return 0
      if (hay.includes(needle)) return 100
      const squashedNeedle = squashText(needle)
      if (squashedNeedle.length >= 5 && squashText(text).includes(squashedNeedle)) return 70
      const tokens = uniqueStrings(
        String(needle)
          .split(/\s+/)
          .filter((token) => token.length >= 3)
          .sort((left, right) => right.length - left.length)
          .slice(0, 3),
      )
      if (tokens.length === 0) return 0
      const squashed = squashText(text)
      const hits = tokens.filter((token) => squashed.includes(squashText(token)))
      if (hits.length === tokens.length) return 50
      if (tokens.length >= 2 && hits.length >= 2) return 40
      return 0
    }

    function blockCandidates(row) {
      if (!row) return []
      return [...row.querySelectorAll(BLOCK_SELECTOR)]
    }

    // The Chat DOM wraps user bubbles and reasoning bodies in plain divs, so a
    // tag whitelist alone misses exactly those two kinds (0/14 user prompts and
    // 0/4 reasoning chains ever located). Any element may be the hit block; the
    // smallest one that still contains the needle is the most specific answer.
    const BLOCK_MAX_TEXT = 4_000
    const BLOCK_MAX_CANDIDATES = 800

    function textCandidates(row, needleText) {
      if (!row || !needleText) return []
      const out = []
      let visited = 0
      const visit = (element) => {
        if (visited >= BLOCK_MAX_CANDIDATES) return
        visited += 1
        const text = element.textContent
        if (!text) return
        if (text.length <= BLOCK_MAX_TEXT && matchText(text, needleText) > 0) out.push(element)
        for (const child of element.children) visit(child)
      }
      for (const child of row.children) visit(child)
      return out
    }

    function deepestOf(elements) {
      return elements.filter((element) => !elements.some((other) => other !== element && element.contains(other)))
    }

    function findFileCard(row, names) {
      if (!row || names.length === 0) return null
      const wanted = names.map((name) => normalizeText(name)).filter(Boolean)
      if (wanted.length === 0) return null
      let best = null
      for (const element of row.querySelectorAll('*')) {
        const text = normalizeText(element.textContent)
        if (!text || text.length > 600) continue
        if (!wanted.some((name) => text.includes(name))) continue
        if (best && text.length >= best.length) continue
        let card = element
        const tool = element.closest('[data-tool][data-state]')
        if (tool && row.contains(tool)) card = tool
        best = { element: card, length: text.length }
      }
      return best ? best.element : null
    }

    /**
     * Find the block that shows the hit inside one row. Returns the deepest
     * matching block; the row itself only comes back as a degraded result.
     */
    function findBlockInRow(row, target) {
      if (!row) return { element: null, reason: 'no-row', needle: '' }
      const needle = needleOf(target)
      const kind = String((target && target.kind) || '')
      if (needle.names.length > 0) {
        const card = findFileCard(row, needle.names)
        if (card) return { element: card, reason: 'file', needle: needle.names[0] }
      }
      if (!needle.text) {
        const card = row.querySelector(CARD_SELECTOR)
        if (card) return { element: card, reason: 'card', needle: '' }
        return { element: null, reason: 'no-fragment', needle: '' }
      }
      const candidates = blockCandidates(row)
      const matches = []
      for (const element of candidates) {
        const score = matchText(element.textContent, needle.text)
        if (score > 0) matches.push({ element, score })
      }
      if (matches.length > 0) {
        const best = Math.max(...matches.map((match) => match.score))
        const top = matches.filter((match) => match.score === best).map((match) => match.element)
        const deepest = deepestOf(top)
        const ordered = candidates.filter((element) => deepest.includes(element))
        let pick = ordered[0]
        // Duplicate text inside one seat: the block's index in the message
        // disambiguates. It is only a tie-break, never a guess.
        const seatIndex = finiteNumber(target && (target.seatIndex ?? anchorOf(target).seatIndex))
        if (ordered.length > 1 && seatIndex !== null) {
          pick = ordered[Math.min(Math.max(seatIndex, 0), ordered.length - 1)]
        }
        return { element: pick || deepest[0], reason: 'block', needle: needle.text }
      }
      const card = row.querySelector(CARD_SELECTOR)
      if (card && (kind === 'tools' || kind === 'outputFiles' || kind === 'inputFiles')) {
        const element = deepestOf([card])[0] || card
        if (matchText(element.textContent, needle.text) > 0) return { element, reason: 'card', needle: needle.text }
      }
      const generic = textCandidates(row, needle.text)
      if (generic.length > 0) {
        let smallest = generic[0].textContent.length
        for (const element of generic) smallest = Math.min(smallest, element.textContent.length)
        const tied = generic.filter((element) => element.textContent.length === smallest)
        return { element: deepestOf(tied)[0] || generic[0], reason: 'block', needle: needle.text }
      }
      if (matchText(row.textContent, needle.text) > 0) return { element: row, reason: 'row-text', needle: needle.text }
      return { element: null, reason: 'no-block', needle: needle.text }
    }

    /* ------------------------------------------------------------------ *
     * Expand, scroll, highlight
     * ------------------------------------------------------------------ */

    function nextFrame() {
      return new Promise((resolve) => {
        if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(() => resolve())
        else window.setTimeout(resolve, 16)
      })
    }

    async function settleFrames(count) {
      for (let index = 0; index < count; index += 1) await nextFrame()
      await delay(60)
    }

    function collapsedToggles(root) {
      const toggles = []
      const seen = new Set()
      const add = (button) => {
        if (!button || seen.has(button)) return
        if (button.getAttribute('aria-expanded') === 'true') return
        seen.add(button)
        toggles.push(button)
      }
      const clickable = (element) => element.querySelector('button, [role="button"]') || element
      if (root && typeof root.querySelector === 'function') {
        for (const button of root.querySelectorAll('button[aria-expanded="false"]')) add(button)
        for (const element of root.querySelectorAll('[data-variant="think"]')) {
          if (!element.hasAttribute('data-expanded')) add(clickable(element))
        }
        for (const element of root.querySelectorAll('[data-tool][data-state]')) add(clickable(element))
        // The seat itself can be the disclosure row (expandOnRowClick).
        if (root.matches && root.matches('[data-variant="think"]') && !root.hasAttribute('data-expanded')) {
          add(clickable(root))
        }
      }
      return toggles.slice(0, 8)
    }

    async function revealProcessGroup(row) {
      const group = row.closest ? row.closest('[data-chat-group-key]') : null
      if (!group) return 0
      const button =
        group.querySelector('button[aria-expanded="false"]') || group.querySelector('[data-step-process] button')
      if (!button) return 0
      try {
        button.click()
      } catch {
        return 0
      }
      await settleFrames(2)
      return 1
    }

    async function expandForBlock(row, target) {
      let expanded = 0
      if (row.getAttribute('data-turn-process-hidden') !== null || row.hasAttribute('hidden')) {
        expanded += await revealProcessGroup(row)
        // React may replace the row when the group opens; never click into a
        // detached tree.
        const key = String(row.getAttribute('data-chat-node-key') || '')
        const fresh = key ? pickSeatRow(key, target) : null
        if (fresh) row = fresh
      }
      const toggles = collapsedToggles(row)
      for (const button of toggles) {
        try {
          button.click()
          expanded += 1
        } catch {
          /* a detached disclosure must not abort the jump */
        }
      }
      if (toggles.length > 0) await settleFrames(2)
      return expanded
    }

    function rectOf(element) {
      if (!element) return null
      try {
        const rect = element.getBoundingClientRect()
        const height = window.innerHeight || document.documentElement.clientHeight
        return {
          top: Math.round(rect.top),
          height: Math.round(rect.height),
          center: Math.round(rect.top + rect.height / 2),
          viewport: Math.round(height),
        }
      } catch {
        return null
      }
    }

    function scrollTopOf(element) {
      try {
        let node = element && element.parentElement
        while (node) {
          if (node.scrollTop > 0) return Math.round(node.scrollTop)
          node = node.parentElement
        }
      } catch {
        /* detached row */
      }
      return 0
    }

    function centerElement(element) {
      if (!element) return
      const apply = () => {
        try {
          element.scrollIntoView({ block: 'center', behavior: 'auto' })
        } catch {
          try {
            element.scrollIntoView()
          } catch {
            /* the element may already be unmounted */
          }
        }
      }
      apply()
      // Layout can settle one frame later; correct once, instantly.
      window.setTimeout(() => {
        try {
          const rect = element.getBoundingClientRect()
          const height = window.innerHeight || document.documentElement.clientHeight
          const drift = rect.top + rect.height / 2 - height / 2
          if (Math.abs(drift) > 8) apply()
        } catch {
          /* the element may already be unmounted */
        }
      }, 140)
    }

    function clearJumpHighlight() {
      try {
        if (window.CSS && CSS.highlights) CSS.highlights.delete('flash-anchor-hit')
      } catch {
        /* Highlight support is optional */
      }
    }

    /**
     * Highlight the hit block only. The old code highlighted the row and then
     * scrolled the row back over the block, which is what left the reader at
     * the top of the bubble.
     */
    function highlightJumpBlock(block, target, needle) {
      if (!block) return
      clearJumpHighlight()
      if (lastJumpRow && lastJumpRow !== block) {
        try {
          lastJumpRow.classList.remove('ds-jump-target')
        } catch {
          /* detached */
        }
      }
      lastJumpRow = block
      try {
        block.classList.remove('ds-jump-target')
        void block.offsetWidth
        block.classList.add('ds-jump-target')
      } catch {
        /* detached */
      }
      const text = String(needle || '').trim()
      if (text) {
        try {
          if (window.CSS && CSS.highlights && typeof window.Highlight === 'function') {
            const ranges = []
            const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
            let node = walker.nextNode()
            while (node && ranges.length < 60) {
              const parent = node.parentElement
              if (parent && parent.tagName !== 'SCRIPT' && parent.tagName !== 'STYLE') {
                const value = node.nodeValue || ''
                const lower = value.toLowerCase()
                let from = 0
                let index = lower.indexOf(text.toLowerCase(), from)
                while (index !== -1 && ranges.length < 60) {
                  const range = document.createRange()
                  range.setStart(node, index)
                  range.setEnd(node, index + text.length)
                  ranges.push(range)
                  from = index + text.length
                  index = lower.indexOf(text.toLowerCase(), from)
                }
              }
              node = walker.nextNode()
            }
            if (ranges.length > 0) {
              CSS.highlights.set('flash-anchor-hit', new window.Highlight(...ranges))
            }
          }
        } catch {
          /* Text highlight is a progressive enhancement */
        }
      }
      window.setTimeout(() => {
        try {
          block.classList.remove('ds-jump-target')
        } catch {
          /* detached */
        }
        clearJumpHighlight()
      }, 6500)
    }

    async function loadThroughSeq(binding, seq) {
      const target = finiteNumber(seq)
      if (target === null) return false
      try {
        const snapshot = binding.eventSource.getSnapshot()
        const entries = Array.isArray(snapshot.entries) ? snapshot.entries : []
        const covered = entries.some(
          (entry) => entry.type === 'event' && entry.event && Number(entry.event.seq) >= target,
        )
        if (covered) return true
        if (typeof binding.session.loadThrough === 'function') {
          await binding.session.loadThrough(target)
          return true
        }
      } catch {
        /* the rail can still page an unloaded Turn by itself */
      }
      return false
    }

    async function waitForRow(key, target, timeout) {
      const turn = finiteNumber(anchorOf(target).turn ?? target.turn)
      return waitForMatch(
        () => pickSeatRow(key, target) || (key ? pickRowByText(target, turn) : pickRowInTurn(turn, target)),
        timeout,
        60,
      )
    }

    /**
     * Last resort when neither the node key nor the Turn mounts.
     *
     * A compacted (or re-keyed) message keeps its text in the transcript but
     * loses the key the anchor was derived from. Scanning the mounted rows of
     * the matching flow kind for the hit text still lands on the message that
     * produced the hit, which is the whole point of the search.
     */
    function pickRowByText(target, turn = null) {
      const needle = needleOf(target).text
      if (!needle) return null
      const squashed = squashText(needle)
      const kinds = flowKindsFor(target)
      const scope = turn === null ? [...document.querySelectorAll('[data-chat-node-key]')] : rowsOfTurn(turn)
      const rows = mountedRows(scope.filter((row) => kinds.length === 0 || kinds.includes(flowKindOf(row))))
      const exact = rows.find((row) => normalizeText(row.textContent).includes(needle))
      if (exact) return exact
      if (!squashed) return null
      return rows.find((row) => squashText(row.textContent).includes(squashed)) || null
    }

    function reportJump(details) {
      try {
        void apiPost({ action: 'diag' }, { scope: 'jump', ...details }).catch(() => {})
      } catch {
        /* diagnostics must never break the jump */
      }
    }

    async function jumpToHit(ctx, target, t) {
      jumpStore.set({ state: 'jumping', message: t('jump.searching') })
      const anchor = anchorOf(target)
      const turn = finiteNumber(anchor.turn ?? target.turn)
      const step = finiteNumber(anchor.step ?? target.step)
      const trace = {
        session: target.sessionId ?? null,
        turn,
        step,
        seq: target.seq ?? null,
        kind: target.kind ?? null,
        messageId: target.messageId ?? anchor.messageId ?? null,
        blockIndex: target.blockIndex ?? anchor.blockIndex ?? null,
        seatIndex: target.seatIndex ?? anchor.seatIndex ?? null,
        fragment: String(target.fragment || '').slice(0, 48),
        query: String(target.query || '').slice(0, 80),
        snippet: String(target.snippet || '').slice(0, 160),
        blockIndex: target.blockIndex ?? null,
        seatWanted: String(target.seatIndex ?? '').slice(0, 8),
        viewport: (chatScroller() && Number(chatScroller().clientHeight)) || 0,
        ok: false,
      }
      const started = Date.now()
      try {
        const binding = await waitForMatch(() => ctx.sessions.binding(target.sessionId), 6000)
        if (!binding) throw new Error('no-session-binding')
        trace.keyExpected = nodeKeyOfAnchor(target)
        let resolved = resolveNodeKey(ctx, target)
        trace.keyHow = resolved.how
        trace.keyFound = resolved.key
        trace.turnRows = rowsOfTurn(turn).length
        trace.rowsTotal = document.querySelectorAll('[data-chat-node-key]').length

        // A derived key can be right about the Turn and wrong about the node
        // (compacted or re-keyed messages). When the key fails, only a row that
        // literally contains the hit text is acceptable — never a same-Turn
        // neighbour, which is how "jumped somewhere unrelated" came back.
        let row = pickSeatRow(resolved.key, target)
        if (row) trace.pickHow = 'key'
        else if (resolved.key) {
          row = pickRowByText(target, turn)
          if (row) trace.pickHow = 'turn-text'
        } else {
          row = pickRowInTurn(turn, target)
          if (row) trace.pickHow = 'turn-kind'
        }
        if (!row && turn !== null) {
          // A cold click opens the Session; its Chat view mounts after the
          // binding, so the locate attempt starts once the view exists rather
          // than against an empty document.
          if (!chatViewState().ready) await waitForChatView(Date.now() + JUMP_VIEW_MS)
          const deadline = Date.now() + JUMP_LOCATE_MS
          let idle = 0
          let attempt = 0
          while (!row && Date.now() < deadline) {
            attempt += 1
            const before = [
              rowsOfTurn(turn).length,
              turnMarks().length,
              document.querySelectorAll('[data-chat-turn]').length,
              chatScroller() ? Math.round(Number(chatScroller().scrollTop) || 0) : -1,
            ].join(':')
            if (attempt > 1) {
              resolved = resolveNodeKey(ctx, target)
              if (resolved.key) {
                trace.keyHow = resolved.how
                trace.keyFound = resolved.key
              }
            }
            row =
              pickSeatRow(resolved.key, target) ||
              (resolved.key ? pickRowByText(target, turn) : pickRowInTurn(turn, target))
            if (row) break
            if (!trace.turnMark || attempt % 3 === 0) {
              trace.turnMark = await clickTurnMark(turn, attempt === 1 ? 900 : 150)
              row = await waitForRow(resolved.key, target, 260)
              if (row) break
            }
            if (!trace.loadedThrough) {
              trace.loadedThrough = await loadThroughSeq(binding, target.seq)
              row = await waitForRow(resolved.key, target, 300)
              if (row) break
            }
            if (await nudgeTranscript(turn)) row = await waitForRow(resolved.key, target, 300)
            const after = [
              rowsOfTurn(turn).length,
              turnMarks().length,
              document.querySelectorAll('[data-chat-turn]').length,
              chatScroller() ? Math.round(Number(chatScroller().scrollTop) || 0) : -1,
            ].join(':')
            idle = row ? 0 : before === after ? idle + 1 : 0
            trace.turnRows = rowsOfTurn(turn).length
            // Six stalls in a row mean the Turn cannot be mounted at all; say
            // so instead of spinning out the whole budget.
            if (idle >= 6) break
            if (!row) await delay(120)
          }
        }
        if (!row) {
          // The Turn never mounted (or the message lives outside it): scan the
          // mounted transcript for the hit text before giving up.
          row = pickRowByText(target)
          if (row) {
            trace.pickHow = 'text-scan'
            trace.scanned = true
          }
        }
        if (!row) throw new Error(resolved.key ? 'not-mounted' : 'no-anchor')

        trace.rowKey = String(row.getAttribute('data-chat-node-key') || '')
        trace.seat = String(row.getAttribute('data-chat-group-part') || '')

        let found = findBlockInRow(row, target)
        const folded =
          row.getAttribute('data-turn-process-hidden') !== null || row.hasAttribute('hidden')
        if (folded || !found.element || found.reason === 'row-text') {
          const expanded = await expandForBlock(row, target)
          trace.expanded = expanded
          if (expanded > 0) {
            await delay(140)
            const fresh = resolved.key ? pickSeatRow(resolved.key, target) : null
            if (fresh) row = fresh
            found = findBlockInRow(row, target)
          }
        }
        const block = found.element || row
        highlightJumpBlock(block, target, found.needle)
        centerElement(block)
        await delay(420)
        trace.rowRect = rectOf(row)
        trace.blockRect = rectOf(block)
        trace.scrollTop = scrollTopOf(row)
        trace.blockText = normalizeText(block.textContent).slice(0, 40)
        trace.reason = found.reason
        trace.blockReason = found.reason
        trace.blockFound = found.element !== null
        trace.rowsTotal = document.querySelectorAll('[data-chat-node-key]').length
        trace.ok = found.element !== null && found.reason !== 'row-text'
        if (!trace.ok) trace.partial = 'turn-only'
        trace.ms = Date.now() - started
        reportJump(trace)
        if (trace.ok) {
          jumpStore.set({ state: 'done', message: t('jump.found') })
          window.setTimeout(() => jumpStore.set({ state: 'idle', message: '' }), 2400)
        } else {
          // Located the Turn but not the block: say so instead of pretending.
          jumpStore.set({ state: 'partial', message: t('jump.turnOnly', { turn: turn ?? '?' }) })
          window.setTimeout(() => jumpStore.set({ state: 'idle', message: '' }), 4600)
        }
      } catch (error) {
        trace.ok = false
        trace.reason = String((error && error.message) || error)
        trace.ms = Date.now() - started
        reportJump(trace)
        console.warn('[flash-anchor] could not locate the search hit:', error)
        jumpStore.set({ state: 'failed', message: t('jump.failed') })
        window.setTimeout(() => jumpStore.set({ state: 'idle', message: '' }), 4600)
      }
    }

    function createStore(initial) {
      let value = initial
      const listeners = new Set()
      return {
        get() {
          return value
        },
        set(next) {
          if (value === next) return
          value = next
          for (const listener of Array.from(listeners)) {
            try {
              listener()
            } catch {
              /* a broken subscriber must not block the rest */
            }
          }
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      }
    }

    function useStore(store) {
      if (React.useSyncExternalStore) {
        return React.useSyncExternalStore(store.subscribe, store.get, store.get)
      }
      const pair = React.useState(store.get())
      React.useEffect(() => store.subscribe(() => pair[1](store.get())), [store])
      return pair[0]
    }

    function installStyles() {
      if (typeof document === 'undefined') return () => {}
      const selector = 'style[data-flash-anchor="styles"]'
      if (document.querySelector(selector) !== null) return () => {}
      const tag = document.createElement('style')
      tag.dataset.flashAnchor = 'styles'
      tag.textContent = CSS
      document.head.appendChild(tag)
      return () => {
        tag.remove()
      }
    }

    function api(params, signal) {
      const url = new URL('/api/flash-anchor', window.location.origin)
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue
        url.searchParams.set(key, String(value))
      }
      return fetch(url.toString(), {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
        headers: { accept: 'application/json' },
      }).then(async (response) => {
        if (response.status === 401) throw new Error('AUTH')
        let payload = null
        try {
          payload = await response.json()
        } catch {
          /* fall through with a readable status error */
        }
        if (!response.ok || !payload || payload.ok === false) {
          const message = payload && payload.error && payload.error.message
          throw new Error(message || 'HTTP ' + response.status)
        }
        return payload
      })
    }

    function apiPost(params, body, signal) {
      const url = new URL('/api/flash-anchor', window.location.origin)
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue
        url.searchParams.set(key, String(value))
      }
      return fetch(url.toString(), {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      }).then(async (response) => {
        if (response.status === 401) throw new Error('AUTH')
        let payload = null
        try {
          payload = await response.json()
        } catch {
          /* readable status fallback */
        }
        if (!response.ok || !payload || payload.ok === false) {
          const message = payload && payload.error && payload.error.message
          throw new Error(message || 'HTTP ' + response.status)
        }
        return payload
      })
    }

    function loadHistory() {
      try {
        const raw = window.localStorage.getItem(HISTORY_KEY)
        const parsed = raw ? JSON.parse(raw) : []
        return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string').slice(0, 8) : []
      } catch {
        return []
      }
    }

    function saveHistory(items) {
      try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items))
      } catch {
        /* private mode or a full quota is not fatal */
      }
    }

    function defaultTypes(mode) {
      if (mode === 'user') return [...USER_TYPES]
      if (mode === 'all') return [...ALL_TYPES]
      return [...MODEL_TYPES]
    }

    function objectTypes(mode) {
      if (mode === 'user') return USER_TYPES
      if (mode === 'context') return CONTEXT_TYPES
      if (mode === 'all') return ALL_TYPES
      return MODEL_TYPES
    }

    function kindLabel(t, kind) {
      return t('kind.' + kind)
    }

    function kindColor(kind) {
      if (kind === 'reasoning') return '#a78bfa'
      if (kind === 'modelText') return '#38bdf8'
      if (kind === 'tools') return '#f59e0b'
      if (kind === 'outputFiles') return '#34d399'
      if (kind === 'userText') return '#06b6d4'
      if (kind === 'context') return '#94a3b8'
      if (kind === 'long') return '#a855f7'
      return '#2dd4bf'
    }

    function formatBytes(value) {
      const bytes = Number(value) || 0
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    }

    function relativeTime(t, timestamp) {
      const value = Number(timestamp)
      if (!Number.isFinite(value)) return ''
      const diff = Math.max(0, Date.now() - value)
      if (diff < 60_000) return t('time.justNow')
      if (diff < 3_600_000) return t('time.minutes', { n: Math.floor(diff / 60_000) })
      if (diff < 86_400_000) return t('time.hours', { n: Math.floor(diff / 3_600_000) })
      if (diff < 7 * 86_400_000) return t('time.days', { n: Math.floor(diff / 86_400_000) })
      const date = new Date(value)
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return date.getFullYear() + '-' + month + '-' + day
    }

    function basename(value) {
      const clean = String(value || '').replace(/[\\/]+$/, '')
      const parts = clean.split(/[\\/]/)
      return parts[parts.length - 1] || clean
    }

    function initialOf(title) {
      const text = String(title || '').trim()
      return text ? text.slice(0, 1).toUpperCase() : '?'
    }

    function SearchIcon(props) {
      const size = props && props.size ? props.size : 16
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 20 20',
          fill: 'none',
          'aria-hidden': 'true',
          focusable: 'false',
          className: props && props.className,
        },
        h('circle', { cx: 8.8, cy: 8.8, r: 5.7, stroke: 'currentColor', strokeWidth: 1.7 }),
        h('path', { d: 'M13.2 13.2 17 17', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' }),
      )
    }

    function SparkIcon(props) {
      const size = props && props.size ? props.size : 16
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 20 20',
          fill: 'none',
          'aria-hidden': 'true',
          focusable: 'false',
          className: props && props.className,
        },
        h('path', { d: 'M10 2.5 11.8 7l4.7 1.8-4.7 1.8L10 15l-1.8-4.4L3.5 8.8 8.2 7 10 2.5Z', stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round' }),
        h('path', { d: 'M16 13.2v3M14.5 14.7h3', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
      )
    }

    function CloseIcon(props) {
      const size = props && props.size ? props.size : 16
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        h('path', { d: 'm4 4 8 8M12 4l-8 8', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
      )
    }

    function BackIcon(props) {
      const size = props && props.size ? props.size : 14
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        h('path', { d: 'M9.5 3.5 5 8l4.5 4.5', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      )
    }

    function RefreshIcon(props) {
      const size = props && props.size ? props.size : 15
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false', className: props && props.className },
        h('path', { d: 'M13.2 7A5.3 5.3 0 1 0 13 10', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
        h('path', { d: 'M13.4 3.6v3.6H9.8', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      )
    }

    function FileIcon(props) {
      const size = props && props.size ? props.size : 12
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        h('path', { d: 'M4 1.8h5.2L12.2 5v9.2H4V1.8Z', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round' }),
        h('path', { d: 'M9.2 1.8V5h3', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round' }),
      )
    }

    function ArrowIcon(props) {
      const size = props && props.size ? props.size : 16
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false', className: props && props.className },
        h('path', { d: 'M3.5 8h9M8.5 4l4 4-4 4', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      )
    }

    function Segmented(props) {
      return h(
        'div',
        { className: 'ds-seg', role: 'group', 'aria-label': props.label },
        props.options.map((option) =>
          h(
            'button',
            {
              key: option.value,
              type: 'button',
              className: 'ds-seg-btn' + (props.value === option.value ? ' is-active' : ''),
              'aria-pressed': props.value === option.value,
              onClick: () => props.onChange(option.value),
            },
            option.label,
          ),
        ),
      )
    }

    function Switch(props) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': props.checked ? 'true' : 'false',
          'aria-label': props.label,
          className: 'ds-switch' + (props.checked ? ' is-on' : ''),
          onClick: () => props.onChange(!props.checked),
        },
        h('span', { className: 'ds-switch-knob' }),
      )
    }

    function SwitchRow(props) {
      return h(
        'div',
        { className: 'ds-switch-row' },
        h(
          'div',
          { className: 'ds-switch-copy' },
          h('div', { className: 'ds-switch-title' }, props.title),
          props.hint ? h('div', { className: 'ds-switch-hint' }, props.hint) : null,
        ),
        h(Switch, { checked: props.checked, label: props.title, onChange: props.onChange }),
      )
    }

    function TypeChip(props) {
      return h(
        'button',
        {
          type: 'button',
          className: 'ds-chip' + (props.active ? ' is-active' : ''),
          'aria-pressed': props.active,
          onClick: props.onToggle,
        },
        h('span', { className: 'ds-chip-check', 'aria-hidden': 'true' }, props.active ? '✓' : ''),
        h('span', null, props.label),
      )
    }

    function Highlight(props) {
      const text = String(props.text || '')
      const query = String(props.query || '')
      if (!query) return text
      const lower = text.toLowerCase()
      const needle = query.toLowerCase()
      const parts = []
      let cursor = 0
      let count = 0
      while (count < 24) {
        const index = lower.indexOf(needle, cursor)
        if (index === -1) break
        if (index > cursor) parts.push(text.slice(cursor, index))
        parts.push(h('mark', { key: 'm' + index }, text.slice(index, index + needle.length)))
        cursor = index + needle.length
        count += 1
      }
      if (cursor < text.length) parts.push(text.slice(cursor))
      return parts.length ? parts : text
    }

    function Entry(props) {
      const wide = props.wide === true
      return h(
        'button',
        {
          type: 'button',
          className: 'ds-entry' + (wide ? '' : ' ds-entry-rail'),
          title: props.t('entry.title'),
          'aria-label': props.t('entry.label'),
          onClick: () => openStore.set(true),
        },
        h(SearchIcon, { size: wide ? 16 : 18, className: 'ds-entry-icon' }),
        wide ? h('span', { className: 'ds-entry-label' }, props.t('entry.label')) : null,
      )
    }

    function FlashAnchorRoot(props) {
      const open = useStore(openStore)
      const jump = useStore(jumpStore)
      return h(
        React.Fragment,
        null,
        open ? h(FlashAnchorModal, { ctx: props.ctx, t: props.t, onClose: () => openStore.set(false) }) : null,
        jump.state === 'idle'
          ? null
          : h(
              'div',
              { className: 'ds-jump-toast is-' + jump.state, role: 'status' },
              jump.state === 'jumping'
                ? h(RefreshIcon, { size: 13, className: 'ds-spin' })
                : h('span', { className: 'ds-jump-dot' }),
              h('span', null, jump.message),
            ),
      )
    }

    function FlashAnchorModal(props) {
      const { t, ctx, onClose } = props
      const initial = React.useMemo(loadPrefs, [])
      const [query, setQuery] = React.useState(initial.query)
      const [scopeMode, setScopeMode] = React.useState(initial.scopeMode)
      const [selectedSession, setSelectedSession] = React.useState(initial.selectedSession)
      const [sessionFilter, setSessionFilter] = React.useState('')
      const [objectMode, setObjectMode] = React.useState(initial.objectMode)
      const [types, setTypes] = React.useState(initial.types)
      const [ext, setExt] = React.useState('')
      const [sort, setSort] = React.useState(initial.sort)
      const [timeOrder, setTimeOrder] = React.useState(initial.timeOrder || 'desc')
      const [workspace, setWorkspace] = React.useState(initial.workspace || '')
      const [long, setLong] = React.useState(initial.long === true)
      const [blur, setBlur] = React.useState(initial.blur)
      const [alpha, setAlpha] = React.useState(initial.alpha)
      const [scatter, setScatter] = React.useState(initial.scatter !== false)
      const [threads, setThreads] = React.useState(initial.threads || 2)
      const [sessionsState, setSessionsState] = React.useState({ loading: false, loaded: false, items: [] })
      const [workspaces, setWorkspaces] = React.useState([])
      const [log, setLog] = React.useState({ enabled: true, path: '', bytes: 0 })
      const [data, setData] = React.useState(null)
      // A result page can only be restored when there is a saved page to restore;
      // "results open" without an id would open a skeleton that never fills.
      const restoreOnOpen = Boolean(initial.resultsOpen && initial.savedId)
      const [searching, setSearching] = React.useState(restoreOnOpen)
      const [resultsOpen, setResultsOpen] = React.useState(restoreOnOpen)
      const [progress, setProgress] = React.useState({ pending: 0 })
      const [error, setError] = React.useState(null)
      const [notice, setNotice] = React.useState(null)
      const [history, setHistory] = React.useState([])
      const [savedId, setSavedId] = React.useState(initial.savedId || null)
      const [stateReady, setStateReady] = React.useState(false)
      // A history entry is a snapshot of *its* filters. Opening it must not
      // overwrite the filters the reader had before, and leaving it must put
      // them back.
      const [viewSaved, setViewSaved] = React.useState(null)
      const [indexStatus, setIndexStatus] = React.useState({
        ready: false,
        running: false,
        done: 0,
        total: 0,
        pending: 0,
        sessions: 0,
        docs: 0,
        longDocs: 0,
        longSessions: 0,
        autoIndex: true,
        autoLong: true,
        revision: 0,
      })
      const inputRef = React.useRef(null)
      const modalRef = React.useRef(null)
      const abortRef = React.useRef(null)
      const noticeTimer = React.useRef(null)
      const saveTimer = React.useRef(null)
      const prefsRef = React.useRef(null)
      const snapshotBaseRef = React.useRef('')
      const lastSearchRef = React.useRef('')
      const pendingRef = React.useRef(0)

      const filters = React.useMemo(
        () => ({ query, scopeMode, selectedSession, types, ext, sort, timeOrder, workspace, long }),
        [query, scopeMode, selectedSession, types, ext, sort, timeOrder, workspace, long],
      )
      // A snapshot is gated by its own signature; a live page by the sidebar's.
      const currentSignature = viewSaved ? viewSaved.signature : searchSignature(filters)

      const showNotice = React.useCallback((message) => {
        setNotice(message)
        if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
        noticeTimer.current = window.setTimeout(() => setNotice(null), 2600)
      }, [])

      const applyFilters = React.useCallback((next) => {
        if (!next) return
        setQuery(String(next.query || ''))
        setScopeMode(next.scopeMode === 'session' ? 'session' : 'all')
        setSelectedSession(next.scopeMode === 'session' ? String(next.selectedSession || '') : '')
        setTypes(Array.isArray(next.types) && next.types.length > 0 ? next.types : defaultTypes('all'))
        setExt(String(next.ext || ''))
        setSort(next.sort === 'time' ? 'time' : 'relevance')
        setTimeOrder(next.timeOrder === 'asc' ? 'asc' : 'desc')
        setWorkspace(String(next.workspace || ''))
        setLong(next.long === true)
      }, [])

      React.useEffect(() => {
        const timer = window.setTimeout(() => inputRef.current && inputRef.current.focus(), 40)
        return () => window.clearTimeout(timer)
      }, [])

      React.useEffect(() => {
        return () => {
          if (abortRef.current) abortRef.current.abort()
          if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
          // Lazy indexing must stop the moment the panel is gone.
          apiPost({ action: 'close' }, {}).catch(() => {})
        }
      }, [])

      // Opening the panel is one cheap request: the index loads in the Host
      // while the window is already usable, and the session list is only fetched
      // when the session picker is actually opened.
      React.useEffect(() => {
        let alive = true
        api({ action: 'boot' })
          .then((payload) => {
            if (!alive) return
            const server = payload.state || {}
            setHistory(Array.isArray(server.history) ? server.history : [])
            setWorkspaces(Array.isArray(payload.workspaces) ? payload.workspaces : [])
            if (payload.log) setLog(payload.log)
            // The workspace list only needs the session headers; ask for it
            // immediately instead of waiting for the index to finish loading.
            window.setTimeout(() => {
              api({ action: 'workspaces' })
                .then((next) => {
                  if (alive && Array.isArray(next.workspaces)) setWorkspaces(next.workspaces)
                })
                .catch(() => {})
            }, 0)
            setIndexStatus({
              ...(payload.index || {}),
              autoIndex: payload.index ? payload.index.autoIndex !== false : server.autoIndex !== false,
              autoLong: payload.index ? payload.index.autoLong !== false : server.autoLong !== false,
            })
            setStateReady(true)
            const prefs = server.prefs && typeof server.prefs === 'object' ? server.prefs : null
            let localPrefs = null
            try {
              localPrefs = window.localStorage.getItem(PREFS_KEY)
            } catch {
              localPrefs = null
            }
            if (!localPrefs && prefs) {
              // First run in this browser: adopt the Host copy once.
              const mode = ['model', 'user', 'all'].includes(prefs.objectMode) ? prefs.objectMode : 'all'
              const savedTypes = Array.isArray(prefs.types) ? prefs.types.filter((kind) => ALL_TYPES.includes(kind)) : []
              applyFilters({
                query: typeof prefs.query === 'string' ? prefs.query : '',
                scopeMode: prefs.scopeMode === 'session' ? 'session' : 'all',
                selectedSession: typeof prefs.selectedSession === 'string' ? prefs.selectedSession : '',
                types: savedTypes.length > 0 ? savedTypes : defaultTypes(mode),
                ext: '',
                sort: prefs.sort === 'time' ? 'time' : 'relevance',
                timeOrder: prefs.timeOrder === 'asc' ? 'asc' : 'desc',
                workspace: typeof prefs.workspace === 'string' ? prefs.workspace : '',
                long: prefs.long === true,
              })
              setBlur(clampNumber(prefs.blur, 0, 48, APPEARANCE_DEFAULT.blur))
              setAlpha(clampNumber(prefs.alpha, 55, 100, APPEARANCE_DEFAULT.alpha))
              setScatter(prefs.scatter !== false)
              setThreads(clampNumber(prefs.threads, 1, 8, 2))
            }

          })
          .catch((reason) => {
            if (!alive) return
            setStateReady(true)
            setError(reason && reason.message === 'AUTH' ? t('auth.error') : t('error.network'))
          })
        return () => {
          alive = false
        }
      }, [t])

      // The index is still loading: poll until it reports ready, then pick up the
      // workspace list it could not answer yet.
      React.useEffect(() => {
        if (!stateReady || indexStatus.ready) return
        let alive = true
        const timer = window.setInterval(() => {
          api({ action: 'status' })
            .then((payload) => {
              if (!alive || !payload.index) return
              setIndexStatus((current) => ({ ...current, ...payload.index }))
              if (payload.index.ready) {
                window.clearInterval(timer)
                api({ action: 'workspaces' })
                  .then((next) => {
                    if (alive && Array.isArray(next.workspaces)) setWorkspaces(next.workspaces)
                  })
                  .catch(() => {})
              }
            })
            .catch(() => {})
        }, 450)
        return () => {
          alive = false
          window.clearInterval(timer)
        }
      }, [stateReady, indexStatus.ready])

      const loadSessions = React.useCallback(() => {
        let already = false
        setSessionsState((current) => {
          if (current.loading) {
            already = true
            return current
          }
          return { ...current, loading: true }
        })
        if (already) return
        api({ action: 'sessions' })
          .then((payload) => {
            sessionsCache = { at: Date.now(), payload }
            setSessionsState({
              loading: false,
              loaded: true,
              at: Date.now(),
              items: Array.isArray(payload.sessions) ? payload.sessions : [],
            })
          })
          .catch(() => setSessionsState((current) => ({ ...current, loading: false })))
      }, [])

      // Only the picker needs the session list; opening the panel must not.
      React.useEffect(() => {
        if (scopeMode !== 'session') return
        if (sessionsState.loaded || sessionsState.loading) return
        loadSessions()
      }, [scopeMode, sessionsState.loaded, sessionsState.loading, loadSessions])

      React.useEffect(() => {
        prefsRef.current = {
          scopeMode,
          selectedSession,
          objectMode,
          types,
          ext,
          sort,
          timeOrder,
          query,
          workspace,
          long,
          blur,
          alpha,
          scatter,
          threads,
          resultsOpen,
          savedId,
        }
        savePrefs(prefsRef.current)
        if (!stateReady) return
        if (saveTimer.current) window.clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(() => {
          saveTimer.current = null
          apiPost({ action: 'savePrefs' }, { prefs: prefsRef.current }).catch(() => {})
        }, 320)
        return () => {
          if (saveTimer.current) {
            window.clearTimeout(saveTimer.current)
            saveTimer.current = null
          }
        }
      }, [stateReady, scopeMode, selectedSession, objectMode, types, ext, sort, timeOrder, query, workspace, long, blur, alpha, scatter, threads, resultsOpen, savedId])

      React.useEffect(() => {
        return () => {
          if (!prefsRef.current) return
          savePrefs(prefsRef.current)
          apiPost({ action: 'savePrefs' }, { prefs: prefsRef.current }).catch(() => {})
        }
      }, [])

      React.useEffect(() => {
        function onKeyDown(event) {
          if (event.key !== 'Escape') return
          event.preventDefault()
          if (resultsOpen) goBack()
          else onClose()
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
      })

      React.useEffect(() => {
        function onKeyDown(event) {
          if (event.key !== 'Tab' || !modalRef.current) return
          const nodes = modalRef.current.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
          )
          if (nodes.length === 0) return
          const first = nodes[0]
          const last = nodes[nodes.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
      }, [])

      const chooseObject = (mode) => {
        setObjectMode(mode)
        setTypes(defaultTypes(mode))
      }

      const toggleType = (kind) => {
        setTypes((previous) => {
          if (previous.includes(kind)) {
            if (previous.length === 1) return previous
            return previous.filter((item) => item !== kind)
          }
          return [...previous, kind]
        })
      }

      const selectedTitle = React.useMemo(() => {
        if (!selectedSession) return ''
        const found = sessionsState.items.find((item) => item.id === selectedSession)
        return found && found.title ? found.title : selectedSession
      }, [selectedSession, sessionsState.items])

      const remember = (payload, signature) => {
        if (!payload) return
        resultCache.payload = payload
        resultCache.savedId = payload.savedId || null
        resultCache.signature = signature || null
        resultCache.at = Date.now()
      }

      const entryTypesOf = (entry) => {
        const saved = Array.isArray(entry && entry.types) ? entry.types.filter((kind) => ALL_TYPES.includes(kind)) : []
        return saved.length > 0 ? saved : defaultTypes('all')
      }
      const entryExtsOf = (entry) =>
        (Array.isArray(entry && entry.exts) ? entry.exts : [])
          .map((value) => String(value || '').trim().replace(/^\.+/, '').toLowerCase())
          .filter(Boolean)
      const entryScopeOf = (entry) => (entry && entry.scope && entry.scope !== 'all' ? String(entry.scope) : 'all')
      const entrySortOf = (entry) => (entry && (entry.sort === 'time' || entry.sort === 'time-asc') ? entry.sort : 'relevance')
      const filtersOfEntry = (entry) => ({
        query: typeof entry.query === 'string' ? entry.query : '',
        scopeMode: entryScopeOf(entry) === 'all' ? 'all' : 'session',
        selectedSession: entryScopeOf(entry) === 'all' ? '' : entryScopeOf(entry),
        types: entryTypesOf(entry),
        ext: entryExtsOf(entry).join(', '),
        sort: entrySortOf(entry) === 'relevance' ? 'relevance' : 'time',
        timeOrder: entrySortOf(entry) === 'time-asc' ? 'asc' : 'desc',
        workspace: String((entry && entry.workspace) || ''),
        long: entry && entry.long === true,
      })
      const signatureOfEntry = (entry) => searchSignature(filtersOfEntry(entry))

      const runSearch = React.useCallback(
        async (override, force, filterSet, options = {}) => {
          const active = filterSet || filters
          const text = String(typeof override === 'string' ? override : active.query).trim()
          const suffix = String(active.ext || '').trim()
          const probe = { ...active, query: text }
          if (!filterOnlySearch(probe)) {
            showNotice(t('need.filters'))
            if (inputRef.current) inputRef.current.focus()
            return null
          }
          if (active.scopeMode === 'session' && !active.selectedSession) {
            showNotice(t('need.session'))
            return null
          }
          if (!Array.isArray(active.types) || active.types.length === 0) {
            showNotice(t('need.types'))
            return null
          }
          const signature = searchSignature(probe)
          lastSearchRef.current = signature
          // A live search always leaves snapshot mode: the deck is gated by the
          // snapshot signature, so keeping it would show a skeleton forever.
          setViewSaved(null)
          if (typeof override === 'string') setQuery(override)
          setError(null)
          const near = force ? null : searchCache.get(signature)
          if (near && Date.now() - near.at < SEARCH_CACHE_MS) {
            if (abortRef.current) abortRef.current.abort()
            searchCache.delete(signature)
            searchCache.set(signature, near)
            setResultsOpen(true)
            setSearching(false)
            setData(near.payload)
            setSavedId(near.payload.savedId || null)
            pendingRef.current = Number(near.payload.pending) || 0
            setProgress({ pending: pendingRef.current })
            remember(near.payload, signature)
            if (Array.isArray(near.payload.history)) setHistory(near.payload.history)
            if (near.payload.index) setIndexStatus((current) => ({ ...current, ...near.payload.index }))
            return near.payload
          }
          setResultsOpen(true)
          setSearching(true)
          if (!(options && options.silent)) setData(null)
          if (abortRef.current) abortRef.current.abort()
          const controller = new AbortController()
          abortRef.current = controller
          const request = {
            action: 'search',
            q: text,
            scope: active.scopeMode === 'session' ? active.selectedSession : 'all',
            workspace: String(active.workspace || ''),
            long: active.long === true ? '1' : '0',
            types: active.types.join(','),
            ext: suffix,
            sort: active.sort === 'time' ? (active.timeOrder === 'asc' ? 'time-asc' : 'time') : 'relevance',
            limit: 400,
            threads: scatter ? threads : 1,
            // The Host echoes this back, so a late response for an older filter
            // set can never be displayed under the current chips.
            sig: signature,
          }
          // A filter tweak is not a new history row; only an explicit search is.
          if (options && options.auto) request.auto = '1'
          try {
            const payload = await api(request, controller.signal)
            if (controller.signal.aborted) return null
            if (payload.signature && payload.signature !== signature) return null
            setData(payload)
            setSavedId(payload.savedId || null)
            remember(payload, signature)
            searchCache.set(signature, { at: Date.now(), payload })
            while (searchCache.size > 8) searchCache.delete(searchCache.keys().next().value)
            if (Array.isArray(payload.history)) setHistory(payload.history)
            if (payload.index) setIndexStatus((current) => ({ ...current, ...payload.index }))
            if (payload.scopeMissing) showNotice(t('results.scopeMissing'))
            pendingRef.current = Number(payload.pending) || 0
            setProgress({ pending: pendingRef.current })
            return payload
          } catch (reason) {
            if (controller.signal.aborted || (reason && reason.name === 'AbortError')) return null
            const message =
              reason && reason.message === 'AUTH'
                ? t('auth.error')
                : reason && reason.name === 'TypeError'
                  ? t('error.network')
                  : reason && reason.message
                    ? reason.message
                    : t('results.error')
            setError(message)
            return null
          } finally {
            setSearching(false)
          }
        },
        [filters, scatter, threads, showNotice, t],
      )

      // While the background pass is still reading sessions, refresh the page as
      // its hits arrive instead of leaving the reader with a partial answer.
      React.useEffect(() => {
        if (!resultsOpen || !progress.pending || searching || viewSaved) return
        let alive = true
        let rounds = 0
        const timer = window.setInterval(() => {
          rounds += 1
          if (rounds > 90) {
            window.clearInterval(timer)
            setProgress({ pending: 0 })
            return
          }
          api({ action: 'status' })
            .then((payload) => {
              if (!alive || !payload.index) return
              const next = Number(payload.index.pending) || 0
              setIndexStatus((current) => ({ ...current, ...payload.index }))
              if (next < pendingRef.current) {
                pendingRef.current = next
                setProgress({ pending: next })
                void runSearch(undefined, true, undefined, { auto: true, silent: true })
              } else if (next === 0) {
                setProgress({ pending: 0 })
              }
            })
            .catch(() => {})
        }, PROGRESS_MS)
        return () => {
          alive = false
          window.clearInterval(timer)
        }
      }, [resultsOpen, progress.pending, searching, viewSaved, runSearch])

      // An explicit rebuild must report progress; without this the button looked
      // dead because nothing ever refetched the status.
      React.useEffect(() => {
        if (!indexStatus.running) return
        const timer = window.setInterval(() => {
          api({ action: 'status' })
            .then((payload) => {
              if (payload.index) setIndexStatus((current) => ({ ...current, ...payload.index }))
            })
            .catch(() => {})
        }, 1000)
        return () => window.clearInterval(timer)
      }, [indexStatus.running])

      // Filter tweaks re-run the query in place; they never write a history row.
      React.useEffect(() => {
        if (!stateReady || !resultsOpen || !data) return
        const current = searchSignature(filters)
        if (viewSaved) {
          // Still the filter set the snapshot was opened over: leave it alone.
          if (current === snapshotBaseRef.current) return
        } else if (current === lastSearchRef.current) {
          return
        }
        if (!filterOnlySearch(filters)) return
        const timer = window.setTimeout(() => {
          setViewSaved(null)
          void runSearch(undefined, true, filters, { auto: true, silent: true })
        }, 260)
        return () => window.clearTimeout(timer)
      }, [stateReady, resultsOpen, data, viewSaved, filters, runSearch])

      const updateResults = async () => {
        const payload = await runSearch(undefined, true)
        if (payload) showNotice(t('results.updated', { count: Number(payload.total) || 0 }))
      }

      const loadSaved = async (entry) => {
        if (!entry || typeof entry.id !== 'string') return
        // Opening a snapshot must never rewrite the reader's own filters: the
        // page is shown as the snapshot it is and the sidebar keeps its state.
        const entryFilters = filtersOfEntry(entry)
        const entrySignature = searchSignature(entryFilters)
        // Remember which sidebar filter set this snapshot was opened over, so a
        // real interaction (not the opening itself) is what leaves the snapshot.
        snapshotBaseRef.current = searchSignature(filters)
        lastSearchRef.current = entrySignature
        setViewSaved({ id: entry.id, signature: entrySignature })
        setResultsOpen(true)
        setError(null)
        if (resultCache.payload && resultCache.savedId === entry.id && resultCache.signature === entrySignature) {
          setData(resultCache.payload)
          setSavedId(entry.id)
          setSearching(false)
          return
        }
        setSearching(true)
        setData(null)
        if (abortRef.current) abortRef.current.abort()
        const controller = new AbortController()
        abortRef.current = controller
        try {
          const payload = await api(
            {
              action: 'saved',
              id: entry.id,
              types: entryFilters.types.join(','),
              scope: entryFilters.scopeMode === 'session' ? entryFilters.selectedSession : 'all',
              sort: entrySortOf(entry),
              ext: entryExtsOf(entry).join(','),
              sig: entrySignature,
            },
            controller.signal,
          )
          if (controller.signal.aborted) return
          const returnedTypes = Array.isArray(payload.types) ? [...payload.types].sort() : []
          const expectedTypes = [...entryFilters.types].sort()
          const wrongFilters =
            JSON.stringify(returnedTypes) !== JSON.stringify(expectedTypes) ||
            (payload.signature && payload.signature !== entrySignature)
          if (wrongFilters) {
            await runSearch(entryFilters.query, true, entryFilters, { auto: true })
            return
          }
          setData(payload)
          setSavedId(payload.savedId || entry.id)
          remember(payload, entrySignature)
          if (Array.isArray(payload.history)) setHistory(payload.history)
          if (payload.index) setIndexStatus((current) => ({ ...current, ...payload.index }))
        } catch (reason) {
          if (controller.signal.aborted) return
          if (entryFilters.query.trim() || filterOnlySearch(entryFilters)) {
            if (reason && reason.message === 'saved result not found') showNotice(t('results.staleRebuild'))
            await runSearch(entryFilters.query, true, entryFilters, { auto: true })
            return
          }
          setResultsOpen(false)
          setData(null)
          showNotice(t('results.error'))
        } finally {
          // Always clear: a superseded request must never leave a skeleton up.
          setSearching(false)
        }
      }

      // A request that never settles must not leave a skeleton up forever.
      React.useEffect(() => {
        if (!searching) return
        const timer = window.setTimeout(() => {
          if (abortRef.current) abortRef.current.abort()
          setSearching(false)
          setProgress({ pending: 0 })
          setResultsOpen(false)
          setError(t('results.timeout'))
        }, 20_000)
        return () => window.clearTimeout(timer)
      }, [searching, t])

      // Restoring the last result page needs the history rows, which arrive with
      // the boot reply; wait for them instead of racing them.
      const restoreRef = React.useRef(restoreOnOpen ? String(initial.savedId) : null)
      React.useEffect(() => {
        if (!restoreRef.current) return
        const entry = history.find((item) => item && item.id === restoreRef.current)
        if (!entry) {
          // The row is gone (deleted or rotated out): never leave a skeleton up.
          if (history.length > 0) {
            restoreRef.current = null
            setSearching(false)
            setResultsOpen(false)
          }
          return
        }
        restoreRef.current = null
        void loadSaved(entry)
      }, [history])

      const loadSavedById = (id) => {
        const entry = history.find((item) => item && item.id === id)
        if (entry) return loadSaved(entry)
        return null
      }

      const goBack = () => {
        if (viewSaved) {
          // The sidebar filters were never touched, so going back is just
          // closing the page.
          setViewSaved(null)
          setResultsOpen(false)
          setData(null)
          setSavedId(null)
          lastSearchRef.current = ''
          return
        }
        setResultsOpen(false)
      }

      const deleteHistory = async (id) => {
        try {
          const payload = await apiPost({ action: 'deleteSaved' }, { id })
          if (payload.state && Array.isArray(payload.state.history)) setHistory(payload.state.history)
          if (resultCache.savedId === id) {
            resultCache.payload = null
            resultCache.savedId = null
          }
          if (savedId === id) setSavedId(null)
          if (viewSaved && viewSaved.id === id) setViewSaved(null)
          for (const [key, entry] of searchCache) {
            if (entry && entry.payload && entry.payload.savedId === id) searchCache.delete(key)
          }
        } catch {
          showNotice(t('results.error'))
        }
      }

      const clearAllHistory = async () => {
        if (!window.confirm(t('history.clearConfirm'))) return
        try {
          const payload = await apiPost({ action: 'clearHistory' }, {})
          setHistory(Array.isArray(payload.state?.history) ? payload.state.history : [])
          setSavedId(null)
          setViewSaved(null)
          resultCache.payload = null
          resultCache.savedId = null
          searchCache.clear()
        } catch {
          showNotice(t('results.error'))
        }
      }

      const openItem = (item) => {
        try {
          if (!ctx.uiWorkspace || typeof ctx.uiWorkspace.openSession !== 'function') throw new Error('navigation unavailable')
          const queryText = data && typeof data.query === 'string' ? data.query : ''
          ctx.uiWorkspace.openSession(item.sessionId)
          onClose()
          void jumpToHit(
            ctx,
            {
              sessionId: item.sessionId,
              turn: item.turn,
              step: item.step,
              seq: item.seq,
              kind: item.kind,
              subtype: item.subtype,
              messageId: item.messageId,
              toolName: item.toolName,
              blockIndex: item.blockIndex,
              seatIndex: item.seatIndex,
              blockKind: item.blockKind,
              fileIndex: item.fileIndex,
              anchor: item.anchor,
              files: item.files,
              snippet: item.snippet,
              fragment: snippetFragment(queryText, item.snippet),
              query: queryText,
            },
            t,
          )
        } catch {
          setError(t('error.openSession'))
        }
      }

      const applyStatus = (payload) => {
        if (payload && payload.index) setIndexStatus((current) => ({ ...current, ...payload.index }))
        if (payload && payload.state && Array.isArray(payload.state.history)) setHistory(payload.state.history)
      }

      const startIndex = async () => {
        try {
          applyStatus(await apiPost({ action: 'index' }, {}))
        } catch {
          showNotice(t('index.failed'))
        }
      }

      const clearIndex = async () => {
        if (!window.confirm(t('index.clearConfirm'))) return
        try {
          applyStatus(await apiPost({ action: 'clearIndex' }, {}))
          setData(null)
          setResultsOpen(false)
          setSavedId(null)
          setViewSaved(null)
        } catch {
          showNotice(t('index.failed'))
        }
      }

      const toggleAutoIndex = async () => {
        try {
          applyStatus(await apiPost({ action: 'setAutoIndex' }, { autoIndex: !indexStatus.autoIndex }))
        } catch {
          showNotice(t('index.failed'))
        }
      }

      const longOp = async (op, extra) => {
        try {
          applyStatus(await apiPost({ action: 'long' }, { op, ...(extra || {}) }))
        } catch {
          showNotice(t('index.failed'))
        }
      }

      const clearLong = async () => {
        if (!window.confirm(t('long.clearConfirm'))) return
        await longOp('clear')
      }

      const searchLong = () => {
        setLong(true)
        void runSearch(undefined, true, { ...filters, long: true }, { auto: true })
        showNotice(t('long.running'))
      }

      const typeSummary = types.map((kind) => kindLabel(t, kind)).join(' · ')
      const scopeSummary =
        scopeMode === 'session' ? t('deck.within') + ' · ' + (selectedTitle || t('scope.noSession')) : t('deck.allSessions')
      const titleOfSession = (id) => {
        const found = sessionsState.items.find((item) => item.id === id)
        return found && found.title ? found.title : String(id || '')
      }

      return h(
        'div',
        {
          className: 'ds-root',
          // Fully opaque: a translucent panel let the transcript bleed
          // through and made the small type unreadable.
          style: { '--ds-blur': '0px', '--ds-alpha': '100%', '--ds-alpha-soft': '98%' },
        },
        h('div', { className: 'ds-backdrop', 'aria-hidden': 'true', onMouseDown: onClose }),
        h(
          'div',
          {
            className: 'ds-modal',
            ref: modalRef,
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': t('title'),
            onMouseDown: (event) => event.stopPropagation(),
          },
          h(
            'header',
            { className: 'ds-top' },
            h(
              'div',
              { className: 'ds-brand' },
              h('div', { className: 'ds-logo' }, h(BrandMark, { size: 30 })),
              h('div', null, h('div', { className: 'ds-name' }, t('title')), h('div', { className: 'ds-sub' }, t('subtitle'))),
            ),
            h(
              'form',
              {
                className: 'ds-search',
                onSubmit: (event) => {
                  event.preventDefault()
                  runSearch()
                },
              },
              h(SearchIcon, { size: 17, className: 'ds-search-icon' }),
              h('input', {
                ref: inputRef,
                value: query,
                placeholder: t('search.placeholder'),
                'aria-label': t('search.placeholder'),
                spellCheck: false,
                autoComplete: 'off',
                onChange: (event) => setQuery(event.target.value),
              }),
              query
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'ds-clear',
                      title: t('search.clear'),
                      'aria-label': t('search.clear'),
                      onClick: () => {
                        setQuery('')
                        if (inputRef.current) inputRef.current.focus()
                      },
                    },
                    h(CloseIcon, { size: 12 }),
                  )
                : h('span', { className: 'ds-kbd' }, t('search.hint')),
              h(
                'button',
                { type: 'submit', className: 'ds-go', disabled: searching, title: t('search.button'), 'aria-label': t('search.button') },
                searching ? h(RefreshIcon, { size: 15, className: 'ds-spin' }) : h(ArrowIcon, { size: 16 }),
              ),
            ),
            h(
              'div',
              { className: 'ds-top-right' },
              h(
                'button',
                { type: 'button', className: 'ds-icon-btn', title: t('close'), 'aria-label': t('close'), onClick: onClose },
                h(CloseIcon, { size: 17 }),
              ),
            ),
          ),
          h(
            'div',
            { className: 'ds-body' },
            h(SettingsPane, {
              t,
              scopeMode,
              onScope: setScopeMode,
              selectedSession,
              onSelectSession: (id) => {
                if (!id || id === selectedSession) {
                  setSelectedSession('')
                  setScopeMode('all')
                  return
                }
                setSelectedSession(id)
                setScopeMode('session')
              },
              sessionsState,
              sessionFilter,
              setSessionFilter,
              workspaces,
              workspace,
              onWorkspace: setWorkspace,
              objectMode,
              onObject: chooseObject,
              types,
              onToggleType: toggleType,
              ext,
              setExt,
              sort,
              onSort: setSort,
              timeOrder,
              onTimeOrder: setTimeOrder,
              blur,
              setBlur,
              alpha,
              setAlpha,
              onResetAppearance: () => {
                setBlur(APPEARANCE_DEFAULT.blur)
                setAlpha(APPEARANCE_DEFAULT.alpha)
              },
              indexStatus,
              long,
              onToggleLong: () => setLong((value) => !value),
              scatter,
              threads,
              onToggleScatter: () => setScatter((value) => !value),
              setThreads,
              onStartIndex: startIndex,
              onClearIndex: clearIndex,
              onToggleAutoIndex: toggleAutoIndex,
              onLongRebuild: () => longOp('rebuild'),
              onLongClear: clearLong,
              onToggleAutoLong: () => longOp('auto', { autoLong: indexStatus.autoLong !== true }),
              log,
              onToggleLog: async () => {
                try {
                  const payload = await apiPost({ action: 'log' }, { enabled: log.enabled === false })
                  if (payload.log) setLog(payload.log)
                } catch {
                  showNotice(t('index.failed'))
                }
              },
              onClearLog: async () => {
                if (!window.confirm(t('log.clearConfirm'))) return
                try {
                  const payload = await apiPost({ action: 'log' }, { clear: true })
                  if (payload.log) setLog(payload.log)
                } catch {
                  showNotice(t('index.failed'))
                }
              },
              onCopyLogPath: async () => {
                try {
                  if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(log.path)
                  showNotice(t('log.copied'))
                } catch {
                  showNotice(log.path)
                }
              },
            }),
            h(WelcomePane, {
              t,
              history,
              onHistory: loadSaved,
              onDeleteHistory: deleteHistory,
              onClearHistory: clearAllHistory,
              indexStatus,
            }),
            resultsOpen
              ? h(ResultsDeck, {
                  t,
                  data,
                  searching,
                  error,
                  progress,
                  onBack: goBack,
                  onRetry: () => runSearch(undefined, true),
                  onUpdate: updateResults,
                  onOpen: openItem,
                  onLongSearch: searchLong,
                  longOn: long === true,
                  canSearchLong: Number(indexStatus.longDocs) > 0 && long !== true,
                  scopeSummary,
                  typeSummary,
                  objectLabel: t('object.' + objectMode),
                  signature: currentSignature,
                  titleOf: titleOfSession,
                  viewSaved: viewSaved !== null,
                })
              : null,
          ),
          notice ? h('div', { className: 'ds-notice', role: 'status' }, notice) : null,
        ),
      )
    }

    function SettingsPane(props) {
      const { t, sessionsState } = props
      const filteredSessions = React.useMemo(() => {
        const needle = props.sessionFilter.trim().toLowerCase()
        return sessionsState.items
          .filter((item) => {
            if (!needle) return true
            const title = String(item.title || '').toLowerCase()
            const cwd = String(item.cwd || '').toLowerCase()
            return title.includes(needle) || cwd.includes(needle) || String(item.id).toLowerCase().includes(needle)
          })
          .slice(0, 60)
      }, [sessionsState.items, props.sessionFilter])

      const selected = sessionsState.items.find((item) => item.id === props.selectedSession)
      const groups = props.objectMode === 'all' ? ['model', 'user', 'context'] : [props.objectMode]
      const workspaces = Array.isArray(props.workspaces) ? props.workspaces : []

      return h(
        'aside',
        { className: 'ds-side' },
        h(
          'div',
          { className: 'ds-section' },
          h(
            'div',
            { className: 'ds-label' },
            h('span', null, t('scope')),
            h('span', { className: 'ds-label-hint' }, props.scopeMode === 'all' ? t('scope.allHint') : t('scope.sessionHint')),
          ),
          h(Segmented, {
            label: t('scope'),
            value: props.scopeMode,
            onChange: props.onScope,
            options: [
              { value: 'all', label: t('scope.all') },
              { value: 'session', label: t('scope.session') },
            ],
          }),
          props.scopeMode === 'session'
            ? h(
                'div',
                null,
                selected
                  ? h(
                      'div',
                      { className: 'ds-selected-card' },
                      h(SparkIcon, { size: 13 }),
                      h('span', { title: selected.title || selected.id }, selected.title || selected.id),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'ds-selected-clear',
                          title: t('scope.clear'),
                          'aria-label': t('scope.clear'),
                          onClick: () => props.onSelectSession(''),
                        },
                        h(CloseIcon, { size: 10 }),
                      ),
                    )
                  : h('div', { className: 'ds-hint' }, t('scope.noSession')),
                h(
                  'div',
                  { className: 'ds-picker' },
                  h(
                    'div',
                    { className: 'ds-picker-head' },
                    h('input', {
                      className: 'ds-input',
                      value: props.sessionFilter,
                      placeholder: t('scope.filter'),
                      'aria-label': t('scope.filter'),
                      spellCheck: false,
                      onChange: (event) => props.setSessionFilter(event.target.value),
                    }),
                  ),
                  sessionsState.loading
                    ? h('div', { className: 'ds-picker-empty' }, t('scope.loading'))
                    : filteredSessions.length === 0
                      ? h('div', { className: 'ds-picker-empty' }, t('scope.empty'))
                      : h(
                          'div',
                          { className: 'ds-picker-list', role: 'listbox', 'aria-label': t('scope.session') },
                          filteredSessions.map((item) =>
                            h(
                              'button',
                              {
                                key: item.id,
                                type: 'button',
                                role: 'option',
                                'aria-selected': item.id === props.selectedSession,
                                className: 'ds-picker-item' + (item.id === props.selectedSession ? ' is-active' : ''),
                                onClick: () => props.onSelectSession(item.id === props.selectedSession ? '' : item.id),
                              },
                              h('span', { className: 'ds-picker-title' }, item.title || t('result.untitled')),
                              h(
                                'span',
                                { className: 'ds-picker-meta' },
                                (item.cwd ? basename(item.cwd) + ' · ' : '') + relativeTime(t, item.createdAt),
                              ),
                            ),
                          ),
                        ),
                ),
              )
            : null,
        ),
        h(
          'div',
          { className: 'ds-section' },
          h(
            'div',
            { className: 'ds-label' },
            h('span', null, t('ws')),
            h('span', { className: 'ds-label-hint' }, t('ws.hint')),
          ),
          h(
            'select',
            {
              className: 'ds-select',
              value: props.workspace,
              'aria-label': t('ws'),
              onChange: (event) => props.onWorkspace(event.target.value),
            },
            h('option', { value: '' }, t('ws.all')),
            workspaces.map((entry) =>
              h(
                'option',
                { key: entry.cwd, value: entry.cwd },
                basename(entry.cwd) + ' · ' + entry.sessions + ' ' + t('ws.sessions'),
              ),
            ),
          ),
        ),
        h(
          'div',
          { className: 'ds-section' },
          h('div', { className: 'ds-label' }, h('span', null, t('object'))),
          h(Segmented, {
            label: t('object'),
            value: props.objectMode,
            onChange: props.onObject,
            options: [
              { value: 'model', label: t('object.model') },
              { value: 'user', label: t('object.user') },
              { value: 'all', label: t('object.all') },
            ],
          }),
        ),
        h(
          'div',
          { className: 'ds-section' },
          h('div', { className: 'ds-label' }, h('span', null, t('target'))),
          groups.map((group) =>
            h(
              'div',
              { key: group, style: group === 'user' ? { marginTop: '8px' } : null },
              props.objectMode === 'all'
                ? h('div', { className: 'ds-hint', style: { margin: '0 0 6px' } }, t('object.' + group))
                : null,
              h(
                'div',
                { className: 'ds-chips' },
                objectTypes(group).map((kind) =>
                  h(TypeChip, {
                    key: kind,
                    kind,
                    label: kindLabel(t, kind),
                    active: props.types.includes(kind),
                    onToggle: () => props.onToggleType(kind),
                  }),
                ),
              ),
            ),
          ),
          h(
            'div',
            { className: 'ds-chips', style: { marginTop: '8px' } },
            h(TypeChip, {
              kind: 'long',
              label: t('long'),
              active: props.long === true,
              onToggle: props.onToggleLong,
            }),
          ),
        ),
        h(
          'div',
          { className: 'ds-section' },
          h('div', { className: 'ds-label' }, h('span', null, t('sort'))),
          h(Segmented, {
            label: t('sort'),
            value: props.sort,
            onChange: props.onSort,
            options: [
              { value: 'relevance', label: t('sort.relevance') },
              { value: 'time', label: t('sort.time') },
            ],
          }),
          props.sort === 'time'
            ? h(
                'div',
                { style: { marginTop: '7px' } },
                h(Segmented, {
                  label: t('sort.order'),
                  value: props.timeOrder,
                  onChange: props.onTimeOrder,
                  options: [
                    { value: 'desc', label: t('sort.newest') },
                    { value: 'asc', label: t('sort.oldest') },
                  ],
                }),
              )
            : null,
        ),
        h(
          'div',
          { className: 'ds-section' },
          h('div', { className: 'ds-label' }, h('span', null, t('settings.advanced'))),
          h(SwitchRow, {
            title: t('settings.scatter'),
            hint: t('settings.scatterHint'),
            checked: props.scatter !== false,
            onChange: props.onToggleScatter,
          }),
          props.scatter !== false
            ? h(
                'label',
                { className: 'ds-range-row ds-thread-row' },
                h('span', null, t('settings.threads')),
                h('input', {
                  type: 'range',
                  className: 'ds-range',
                  min: 1,
                  max: 8,
                  step: 1,
                  value: props.threads,
                  'aria-label': t('settings.threads'),
                  onChange: (event) => props.setThreads(Number(event.target.value)),
                }),
                h('span', { className: 'ds-range-value' }, String(props.threads)),
              )
            : null,
          h(SwitchRow, {
            title: t('settings.autoIndex'),
            hint: t('settings.autoIndexHint'),
            checked: props.indexStatus.autoIndex === true,
            onChange: props.onToggleAutoIndex,
          }),
        ),
        h(
          'div',
          { className: 'ds-side-foot' },
          h('div', { className: 'ds-label' }, h('span', null, t('index.title'))),
          h(
            'div',
            { className: 'ds-index-status' },
            props.indexStatus.running
              ? t('index.running', { done: props.indexStatus.done, total: props.indexStatus.total })
              : props.indexStatus.docs > 0
                ? t('index.ready', { sessions: props.indexStatus.sessions, docs: props.indexStatus.docs })
                : t('index.empty'),
          ),
          h(
            'div',
            { className: 'ds-index-actions' },
            h(
              'button',
              { type: 'button', className: 'ds-mini-btn', onClick: props.onStartIndex, disabled: props.indexStatus.running },
              props.indexStatus.docs > 0 ? t('index.rebuild') : t('index.start'),
            ),
            h('button', { type: 'button', className: 'ds-mini-btn', onClick: props.onClearIndex }, t('index.clear')),
          ),
          h('div', { className: 'ds-label', style: { marginTop: '10px' } }, h('span', null, t('long.title'))),
          h(
            'div',
            { className: 'ds-index-status' },
            Number(props.indexStatus.longDocs) > 0
              ? t('long.ready', { docs: props.indexStatus.longDocs, sessions: props.indexStatus.longSessions })
              : t('long.empty'),
          ),
          h(
            'div',
            { className: 'ds-index-actions' },
            h('button', { type: 'button', className: 'ds-mini-btn', onClick: props.onLongRebuild }, t('long.rebuild')),
            h('button', { type: 'button', className: 'ds-mini-btn', onClick: props.onLongClear }, t('long.clear')),
          ),
          h(SwitchRow, {
            title: t('long.auto'),
            checked: props.indexStatus.autoLong === true,
            onChange: props.onToggleAutoLong,
          }),
          h(
            'div',
            { className: 'ds-section', style: { marginTop: '10px' } },
            h(
              'div',
              { className: 'ds-label' },
              h('span', null, t('log.title')),
              h('span', { className: 'ds-label-hint' }, t('log.size', { size: formatBytes(props.log && props.log.bytes) })),
            ),
            h(SwitchRow, {
              title: t('log.title'),
              hint: t('log.hint'),
              checked: !props.log || props.log.enabled !== false,
              onChange: props.onToggleLog,
            }),
            h('div', { className: 'ds-log-path', title: (props.log && props.log.path) || '' }, (props.log && props.log.path) || '—'),
            h(
              'div',
              { className: 'ds-index-actions' },
              h('button', { type: 'button', className: 'ds-mini-btn', onClick: props.onCopyLogPath }, t('log.copy')),
              h('button', { type: 'button', className: 'ds-mini-btn', onClick: props.onClearLog }, t('log.clear')),
            ),
          ),
          h('div', { className: 'ds-privacy' }, h(SparkIcon, { size: 11 }), h('span', null, t('welcome.privacy'))),
        ),
      )
    }

    function WelcomePane(props) {
      const { t } = props
      const status = props.indexStatus || {}
      const rows = Array.isArray(props.history) ? props.history : []
      return h(
        'main',
        { className: 'ds-main' },
        h(
          'div',
          { className: 'ds-welcome' },
          h('div', { className: 'ds-hero' }, t('welcome.title')),
          h('div', { className: 'ds-hero-sub' }, t('welcome.subtitle')),
          h(
            'div',
            { className: 'ds-hero-chips' },
            h(
              'span',
              { className: 'ds-hero-chip' },
              t('index.ready', { sessions: Number(status.sessions) || 0, docs: Number(status.docs) || 0 }),
            ),
            Number(status.longDocs) > 0
              ? h('span', { className: 'ds-hero-chip' }, t('long.ready', { docs: status.longDocs, sessions: status.longSessions }))
              : null,
            Number(status.pending) > 0
              ? h('span', { className: 'ds-hero-chip' }, t('deck.pending', { done: Number(status.total) - Number(status.pending), total: Number(status.total) }))
              : null,
            Number(status.workspaces) > 0
              ? h('span', { className: 'ds-hero-chip' }, t('ws') + ' × ' + status.workspaces)
              : null,
          ),
          h(
            'div',
            { className: 'ds-history' },
            h(
              'div',
              { className: 'ds-label', style: { marginBottom: '2px' } },
              h('span', null, t('history')),
              rows.length > 0
                ? h('button', { type: 'button', className: 'ds-label-action', onClick: props.onClearHistory }, t('history.clear'))
                : null,
            ),
            rows.length === 0
              ? h('div', { className: 'ds-empty-history' }, t('history.empty'))
              : h(
                  'div',
                  { className: 'ds-history-list' },
                  rows.map((entry) =>
                    h(
                      'div',
                      { key: entry.id, className: 'ds-history-item' },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'ds-history-chip',
                          title: entry.query || t('empty.query'),
                          onClick: () => props.onHistory(entry),
                        },
                        entry.query || t('empty.query'),
                      ),
                      h(
                        'span',
                        { className: 'ds-history-meta' },
                        entry.scope && entry.scope !== 'all' ? h('span', { className: 'ds-badge' }, t('scope.session')) : null,
                        entry.workspace ? h('span', { className: 'ds-badge is-ws' }, basename(entry.workspace)) : null,
                        entry.long === true ? h('span', { className: 'ds-badge is-long' }, t('long')) : null,
                        Array.isArray(entry.types) && entry.types.length > 0 && entry.types.length < ALL_TYPES.length
                          ? h('span', { className: 'ds-badge' }, entry.types.map((kind) => kindLabel(t, kind)).join('·'))
                          : null,
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'ds-history-remove',
                          title: t('history.remove'),
                          'aria-label': t('history.remove'),
                          onClick: () => props.onDeleteHistory(entry.id),
                        },
                        h(CloseIcon, { size: 10 }),
                      ),
                    ),
                  ),
                ),
          ),
          h('div', { className: 'ds-hint' }, t('welcome.tip')),
        ),
      )
    }

    function ResultsDeck(props) {
      const { t, data, searching, error } = props
      // A payload is only this filter set's page when its signature says so.
      const view = data && (!data.signature || !props.signature || data.signature === props.signature) ? data : null
      const pending = searching || (data != null && view === null)
      const viewTypes = view && Array.isArray(view.types) && view.types.length > 0 ? view.types : null
      const chipScope = view
        ? view.scope && view.scope !== 'all'
          ? t('deck.within') + ' · ' + props.titleOf(view.scope)
          : t('deck.allSessions')
        : props.scopeSummary
      const chipTypes = viewTypes ? viewTypes.map((kind) => kindLabel(t, kind)).join(' · ') : props.typeSummary
      const original = view && view.cached && view.original ? view.original : view
      const [visible, setVisible] = React.useState(PAGE_SIZE)
      const items = view && Array.isArray(view.items) ? view.items : []
      React.useEffect(() => {
        setVisible(PAGE_SIZE)
      }, [view])
      const shown = React.useMemo(() => items.slice(0, visible), [items, visible])
      const groups = React.useMemo(() => {
        const bySession = new Map()
        for (const item of shown) {
          let bucket = bySession.get(item.sessionId)
          if (!bucket) {
            bucket = []
            bySession.set(item.sessionId, bucket)
          }
          bucket.push(item)
        }
        const seen = new Set()
        const result = []
        for (const session of (view && view.sessions) || []) {
          const rows = bySession.get(session.id) || []
          if (rows.length === 0) continue
          seen.add(session.id)
          result.push({ ...session, items: rows })
        }
        for (const [id, rows] of bySession) {
          if (seen.has(id)) continue
          result.push({ id, title: rows[0].sessionTitle, cwd: rows[0].cwd, count: rows.length, items: rows })
        }
        return result
      }, [view, shown])
      const remaining = items.length - shown.length
      const goMore = () => setVisible((value) => value + PAGE_SIZE)
      const longCta =
        props.canSearchLong === true
          ? h(
              'button',
              { type: 'button', className: 'ds-long-cta', onClick: props.onLongSearch },
              h('span', { className: 'ds-long-icon' }, h(SearchIcon, { size: 14 })),
              h('span', null, h('strong', null, t('long.cta')), h('span', null, t('long.ctaHint'))),
            )
          : null
      return h(
        'section',
        { className: 'ds-deck', 'aria-label': t('results') },
        h(
          'div',
          { className: 'ds-deck-head' },
          h('button', { type: 'button', className: 'ds-back', onClick: props.onBack }, h(BackIcon, { size: 13 }), t('back')),
          h(
            'div',
            { className: 'ds-deck-titles' },
            h('h2', null, t('results')),
            h(
              'p',
              null,
              view
                ? t('results.summary', {
                    count: view.total,
                    sessions: Array.isArray(view.sessions) ? view.sessions.length : 0,
                    ms: view.cached ? Number(view.restoredMs) || 0 : Number(view.tookMs) || 0,
                  })
                : pending
                  ? t('results.loading')
                  : t('empty.query'),
            ),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'ds-icon-btn',
              title: t('results.refresh'),
              'aria-label': t('results.refresh'),
              onClick: props.onRetry,
              disabled: searching,
            },
            h(RefreshIcon, { size: 15, className: searching ? 'ds-spin' : null }),
          ),
        ),
        pending ? h('div', { className: 'ds-progress' }) : null,
        h(
          'div',
          { className: 'ds-deck-filters' },
          h('span', { className: 'ds-deck-filter-label' }, t('deck.filters')),
          h('span', { className: 'ds-deck-chip' }, chipScope),
          view && view.workspace ? h('span', { className: 'ds-deck-chip' }, basename(view.workspace)) : null,
          h('span', { className: 'ds-deck-chip' }, chipTypes),
          view && view.query ? h('span', { className: 'ds-deck-chip' }, '“' + view.query + '”') : null,
          view && view.long ? h('span', { className: 'ds-deck-chip' }, t('deck.longOn')) : null,
          view && view.cached
            ? h(
                'span',
                { className: 'ds-deck-chip' },
                view.narrowed ? t('deck.narrowed') : t('deck.restored', { ms: Number(view.restoredMs ?? view.tookMs) || 0 }),
              )
            : null,
          view && view.cached && Number(view.originalTookMs) >= 0
            ? h('span', { className: 'ds-deck-chip' }, t('deck.originalOnly', { ms: Number(view.originalTookMs) }))
            : null,
          view && !view.cached ? h('span', { className: 'ds-deck-chip' }, t('deck.took', { ms: Number(view.tookMs) || 0 })) : null,
          view && view.degraded ? h('span', { className: 'ds-deck-chip' }, t('deck.degraded')) : null,
          view && view.threads
            ? h('span', { className: 'ds-deck-chip' }, view.threads > 1 ? t('deck.threads', { n: view.threads }) : t('deck.inline'))
            : null,
          Number(props.progress && props.progress.pending) > 0
            ? h('span', { className: 'ds-deck-chip ds-pending' }, h('span', { className: 'ds-dot' }), t('deck.pending', {
                done: Math.max(0, (Number(props.progress.total) || 0) - Number(props.progress.pending)),
                total: Number(props.progress.total) || 0,
              }))
            : null,
          original && Number.isFinite(original.surfaceMs)
            ? h('span', { className: 'ds-deck-chip' }, t('deck.timing', { surface: original.surfaceMs, match: Number(original.matchMs) || 0 }))
            : null,
        ),
        error
          ? h(
              'div',
              { className: 'ds-error', role: 'alert' },
              h('span', null, error),
              h('button', { type: 'button', onClick: props.onRetry }, t('results.retry')),
            )
          : null,
        view && view.stale
          ? h(
              'div',
              { className: 'ds-stale', role: 'status' },
              h('span', null, t('results.stale')),
              h('button', { type: 'button', onClick: props.onUpdate }, t('results.update')),
            )
          : null,
        pending
          ? h(
              'div',
              { className: 'ds-skeleton', 'aria-hidden': 'true' },
              h('div', { className: 'ds-skel' }),
              h('div', { className: 'ds-skel' }),
              h('div', { className: 'ds-skel short' }),
              h('div', { className: 'ds-skel' }),
            )
          : !view
            ? null
            : items.length === 0
              ? h(
                  'div',
                  { className: 'ds-deck-empty' },
                  h('div', { className: 'ds-empty-icon' }, h(SearchIcon, { size: 24 })),
                  h('h3', null, t('results.empty')),
                  h('p', null, t('results.emptyHint')),
                  longCta ? h('p', null, t('long.emptyHint')) : null,
                  longCta,
                )
              : h(
                  'div',
                  {
                    className: 'ds-deck-scroll',
                    onScroll: (event) => {
                      const node = event.currentTarget
                      if (remaining <= 0) return
                      if (node.scrollTop + node.clientHeight < node.scrollHeight - 240) return
                      goMore()
                    },
                  },
                  groups.map((group) =>
                    h(
                      'div',
                      { key: group.id, className: 'ds-group' },
                      h(
                        'div',
                        { className: 'ds-group-head' },
                        h('div', { className: 'ds-avatar' }, initialOf(group.title || group.id)),
                        h(
                          'div',
                          { style: { minWidth: 0 } },
                          h('div', { className: 'ds-group-title', title: group.title || group.id }, group.title || t('result.untitled')),
                          h(
                            'div',
                            { className: 'ds-group-meta' },
                            (group.cwd ? basename(group.cwd) + ' · ' : '') + group.count + ' ' + t('results'),
                          ),
                        ),
                      ),
                      group.items.map((item) =>
                        h(
                          'button',
                          {
                            key: item.id,
                            type: 'button',
                            className: 'ds-result',
                            'aria-label': t('result.open'),
                            onClick: () => props.onOpen(item),
                          },
                          h(
                            'div',
                            { className: 'ds-result-top' },
                            h('span', { className: 'ds-kind', style: { '--k': kindColor(item.kind) } }, kindLabel(t, item.kind)),
                            item.long ? h('span', { className: 'ds-badge is-long' }, t('long')) : null,
                            item.toolName ? h('span', { className: 'ds-toolname' }, item.toolName) : null,
                            item.turn ? h('span', { className: 'ds-turn' }, t('result.turn', { turn: item.turn })) : null,
                            h('span', { className: 'ds-time', title: new Date(item.time).toLocaleString() }, relativeTime(t, item.time)),
                          ),
                          h('div', { className: 'ds-snippet' }, h(Highlight, { text: item.snippet, query: view.query })),
                          item.files && item.files.length
                            ? h(
                                'div',
                                { className: 'ds-files' },
                                item.files.slice(0, 3).map((file, index) =>
                                  h(
                                    'span',
                                    { key: index, className: 'ds-file-chip' },
                                    h(FileIcon, { size: 10 }),
                                    file.name || basename(file.path),
                                  ),
                                ),
                              )
                            : null,
                        ),
                      ),
                    ),
                  ),
                  h(
                    'div',
                    { className: 'ds-deck-foot' },
                    remaining > 0
                      ? h('button', { type: 'button', className: 'ds-more', onClick: goMore }, t('deck.more', { count: remaining }))
                      : null,
                    view.truncated && remaining <= 0
                      ? h('div', { className: 'ds-truncated', style: { flex: '1 1 auto' } }, t('results.truncated', { limit: view.limit }))
                      : null,
                  ),
                  longCta,
                ),
      )
    }

    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'flash-anchor: dictionaries')
      ctx.effect(() => installStyles(), 'flash-anchor: styles')
      ctx.slots.inject('sidebar.footer.action', () =>
        ctx.slots.register(
          {
            name: 'sidebar.footer.action',
            id: 'flash-anchor',
            order: 4,
            locale: NS,
            label: () => t('entry.label'),
          },
          (props) => h(Entry, { wide: props.wide === true, t }),
        ),
      )
      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          {
            name: 'shell.overlay',
            id: 'flash-anchor',
            order: 30,
            locale: NS,
          },
          () => h(FlashAnchorRoot, { ctx, t }),
        ),
      )
    }

    return {
      inject: ['slots', 'locale', 'uiWorkspace', 'sessions'],
      apply,
    }
  },
})
