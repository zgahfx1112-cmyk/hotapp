# 今日热榜 · 迭代任务指挥书（交付 mimocode 执行）

> 本轮迭代方向：**内容深度增强 + 趋势历史回溯**（用户已确认）。技术债本轮不清理。
> 本文档基于对实际代码的调研，所有文件路径与行号均已核对。按「执行顺序」自上而下逐模块实施，每模块完成立即补测试并跑 `node --test`。

---

## 0. 项目背景与工程约定（务必遵守）

- **项目**：`E:\git\toutiao\hotapp`，自托管 PWA 热搜聚合应用。
- **架构**：Node+Express 前端服务（`server.js`，端口 3000）代理到 Python sidecar（`hotapp/server.py`，端口 8000）抓取热搜；原生 JS 前端（`public/app.js` ~2960 行，无框架）。
- **技术栈**：Node.js≥20 / Express4 / sql.js / 原生 JS / Python stdlib。
- **工程规范**（照抄现有风格）：
  - **TDD**：每个功能配套 `test/*.test.js`，用 `node --test` 运行（参考 `test/recommend.test.js`）。
  - **文档**：重大功能在 `docs/superpowers/specs/` 写设计文档，文件名 `YYYY-MM-DD-<feature>-design.md`（今天 **2026-06-16**）。
  - **代码风格**：函数式、中文注释、与 `app.js` 既有命名一致（`renderXxxTab` / `showXxxModal` / `state.xxx`）。
  - **复用优先**：已存在的函数必须复用，不要重写。
- **本轮不做**：不清理技术债（不动旧 `trend_history.json`、不删 `parse_36kr_hot` 等死代码）。

## 1. 关键代码定位（实施时必读）

| 用途 | 位置 |
|---|---|
| 抓取所有平台（需在此落盘历史快照） | `hotapp/server.py:333` `fetch_all_platforms()` |
| 单条抓取注入 timestamp | `hotapp/server.py:321-323` `fetch_one()` |
| 后台定时刷新（也要落盘快照） | `hotapp/server.py:406` `background_refresh()` |
| 缓存文件常量 | `hotapp/server.py:23` `CACHE_FILE`（`cache.json`） |
| API 路由分发（do_GET） | `hotapp/server.py:423`，已有 `/api/trending`、`/api/reader` |
| 三级缓存返回 | `hotapp/server.py:443` `_api_trending()`，实时抓取成功分支在 `:462-472` |
| Reader API | `hotapp/server.py:496` `_api_reader()` |
| **Node 端代理写法（照抄）** | `server.js:63-100`：`/api/hot` 代理在 `:65`，`/api/reader` 在 `:85`，转发到 `HOTAPP_PORT=8000`（`:11`） |
| 事件同源判定 | `public/app.js:1159` `isSameEvent(a,b)` |
| 事件聚类 | `public/app.js:1414` `clusterTopics(items)` |
| 聚类卡片渲染 | `public/app.js:1449` `renderClusterCard(cluster)` |
| 推荐流构建 | `public/app.js:1481` `buildHybridFeed()` |
| 阅读器打开 | `public/app.js:392` `openReader()` |
| Canvas 绘图范例（无第三方库） | `public/app.js:819-947` `fallbackDownload()` |
| Tab 系统 | `public/app.js:2718` `setupTabs()` |
| **工具 Tab 结构（注意类名）** | `public/index.html:55-61`，类名为 `utility-tab`，容器 `id="utilityTabs"` |
| 每日报数据（目前 `slice(0,5)`） | `public/digest.js:14` `selectRecommendDigestItems()`，`:39` 与 `:34` 两处 `slice(0,5)` |
| 每日报标签 | `public/digest.js:42` `getDigestLabel()` |
| 每日报渲染 | `public/app.js:1784` `renderDailyDigest()` |
| 主题系统（auto/manual） | `public/app.js:1053` `initTheme()` |

---

## 2. 模块 A：重启趋势历史快照机制（后端，先做）

### A1. 历史快照落盘
在 `hotapp/server.py`：
1. 新增常量：`HISTORY_FILE = os.path.join(HERE, "trend_history.json")`（**新文件，从空数组 `[]` 开始累积**）。
   - 注意：现有孤儿 `hotapp/trend_history.json`（旧格式，含 bilibili/douyin）与新格式不兼容。**不要读取/复用它**。新代码首次运行时若发现该文件是旧格式（非追加式数组，或含 `bilibili`/`douyin` platform），将其**重命名为 `trend_history.legacy.json`** 后新建空的 `[]`。判定旧格式的简单规则：数组首个元素 `timestamp` 早于 7 天前，或任意 item.platform ∈ {bilibili, bilibili_pop, douyin}。
2. 新增 `shouldSnapshot(prevSnap, newTopItems, now)`（**纯函数，需可测**）：
   - 若无 prevSnap → `True`。
   - 若 `now - prevSnap.timestamp < 10*60*1000`（10分钟）且「本次 Top 标题集合与上次标题集合 Jaccard 重合度 > 0.8」→ `False`。
   - 否则 → `True`。
3. 新增 `snapshot_trend(items)`：
   - 每个 platform 取 Top 20（按 `rank` 升序），只保留 `{id,title,url,platform,rank,heatScore}` 精简字段。
   - 读 `trend_history.json`（数组），取最后一条作为 prevSnap。
   - 调 `shouldSnapshot` 判断；若 False 直接 return。
   - 追加 `{"timestamp": now, "items": [精简后的各平台 Top20]}`。
   - **滚动裁剪**：保留最近 14 天，且总条数 ≤ 2000；超出则删最旧的。
   - 原子写：写到 `HISTORY_FILE + ".tmp"` 再 `os.replace`。
4. 在 `_api_trending()` 实时抓取成功分支（`server.py:462-472`，`fetch_all_platforms()` 之后、`save_cache(data)` 附近）调用 `snapshot_trend(data["items"])`。
5. 在 `background_refresh()`（`server.py:412-415`，`save_cache(data)` 之后）也调用 `snapshot_trend(data["items"])`。

### A2. 历史查询 API（Python 端，在 `do_GET` `server.py:423` 注册新分支）
- `GET /api/trend/history?hours=24` → 返回窗内**去重事件列表**。每个事件：
  `{title, platforms:[], firstSeen, lastSeen, heatSamples:[{t,score}], maxHeat, trend}`
  - 聚合方式：窗内所有快照的 items 按 title 归并（标题做归一化，可复用 `title_key()` `server.py:329`）。
  - trend 判定：对比窗内首尾热度，上升>20% → `up`；下降>20% → `down`；窗内最大值出现在末段且较起点涨幅>50% → `spike`；否则 `stable`。
- `GET /api/trend/recap?date=YYYY-MM-DD` → 返回指定日（本地日期）最接近当日 12:00 的快照，输出 Top 20（跨平台按 `rank` 或热度统一排序，并附 `globalRank`）。

### A3. Node 代理（`server.js`）
照抄 `server.js:65-81` 的 `/api/hot` 代理写法，新增：
- `app.use('/api/trend', ...)` 转发到 `HOTAPP_PORT`（8000），path 设为 `/api/trend` + `(req.url||'')`。
- 错误处理与 `proxy.on('error', ...)` 保持一致。

### A4. 测试 `test/trend-snapshot.test.js`
- `shouldSnapshot`：① 无 prev→true；② 10分钟内高重合→false；③ 超10分钟→true；④ 全新内容（低重合）→true。
- 滚动裁剪：构造 2500 条历史数组喂给裁剪函数，断言结果 ≤2000 且保留的是最新。
- 时间窗聚合：给定 mock 历史数组，断言 history 接口输出的 trend 标签（up/down/spike/stable）正确。
  - 注：纯逻辑在 JS 端等价实现后测（与现有 test 把 `digest.js` 在 Node 跑的方式一致）。

---

## 3. 模块 B：热搜风云榜（前端）

### B1. 新工具 Tab
- `public/index.html`：在 `utility-tabs`（`:55-61`）内追加 `<button class="utility-tab" data-tab="trend">📈 风云榜</button>`。
- `public/index.html`：在 `<script>` 引入区追加 `<script src="trend.js"></script>`（放在 `digest.js` 之后、`app.js` 之前/之后的现有顺序里）。
- `public/app.js` `setupTabs()`（`:2718`）注册新 tab → 调用 `Trend.renderTrendTab()`（或 `renderTrendTab()`，与现有 `renderRecommendTab` 风格一致）。

### B2. 新文件 `public/trend.js`
暴露到 `window.Trend`（供 app.js 调用）：
- `renderTrendTab()`：三块布局——①「上升最快」Top10；②「历史回顾」日期切换（今日/昨日/上周同日）+ Top20 列表；③说明文案。内容挂到 `#contentArea`。
- `loadRising()`：调 `/api/trend/history?hours=6`，对比最近两个快照按 rank 上升幅度排序取 Top10，渲染带 🔥/↑ 标签的卡片（复用热搜卡片样式与 `escapeHtml`）。
- `loadRecap(date)`：调 `/api/trend/recap?date=` 渲染 Top20。
- `normalizeSeries(samples, width, height)`（**纯函数，需可测**）：把 `[{t,score}]` 归一化为曲线路径点。处理：空数组→返回 `[]`；单点→返回单点不报错；全相同 score→y 取中点不除零；多点→x 等距、y 限制在 `[0,height]`。
- `drawTrendChart(canvas, heatSamples)`：纯 Canvas 折线图（参考 `fallbackDownload` 的 Canvas 用法，**不引第三方库**）。调 `normalizeSeries`，画坐标轴+曲线+当前值标注。
- `showTrendModal(title)`：模态（复用 `#readerModal` 模态骨架样式），内嵌 `<canvas>` 画该话题热度曲线。

### B3. 热搜条目接入「📈趋势」入口
- 在热搜榜卡片渲染处（搜 `renderHotList`，约 `app.js:2092` 附近）标题右侧加「📈」按钮，点击调 `Trend.showTrendModal(item.title)`。
- 风云榜卡片同样加。

### B4. 测试 `test/trend-chart.test.js`
- `normalizeSeries`：① 空→[]；② 单点不报错；③ 全相同 score 不除零；④ 多点 x 等距、y∈[0,height]。
- 「上升最快」排序：mock 两个快照，断言 rank 上升最多的排前。
- 注：把 `trend.js` 中纯函数用 `module.exports` 导出（参考 `digest.js:49-51` 的 `typeof module` 守卫），便于 Node 测试。

---

## 4. 模块 C：事件聚合时间线视图

### C1. 时间线模态
`public/app.js` 新增 `showEventTimelineModal(seedItem)`：
- 数据：取 `state.hotItems`（必要时重拉 `/api/trending` 全量），用现有 `clusterTopics(items)`（`:1414`）聚类，找到含 `seedItem` 的 cluster（用 `isSameEvent` 比对）。
- UI（复用 `#readerModal` 模态骨架 + 在 `public/style.css` 加 `.event-timeline` 等样式）：
  - 顶部：事件主标题 + 来源徽章（复用 `renderClusterCard` 内的 `SOURCE_ICONS`，`:1456`）+ 跨平台来源数 + 首末时间跨度。
  - 中部：cluster 全部 items 按 `timestamp` 升序，每行「来源徽章 + 标题 + 热度 + 时间」，点击行 → `openReader()` 或新开 url。
  - 底部：若 `window.Trend` 可用，嵌入该事件标题的迷你热度曲线（小 canvas + 「查看完整趋势」按钮 → `Trend.showTrendModal(title)`）。

### C2. 入口
- `renderClusterCard`（`app.js:1449`）cluster 徽章区加「🔍 事件全景」按钮 → `showEventTimelineModal(cluster.mainItem)`。
- `openReader`（`app.js:392`）阅读器底部新增「相关报道」区：用同一聚类逻辑列出同事件其它来源条目。

### C3. 测试 `test/event-timeline.test.js`
- mock 全量 items（含跨平台同事件），断言 `clusterTopics` 聚到同一 cluster；断言时间线数据按 timestamp 升序、来源集合正确。
- 可复用 `app.js` 导出的聚类函数（`app.js` 末尾已有 `module.exports` 导出推荐函数供测试，参照其模式把 `clusterTopics`/`isSameEvent` 一并导出）。

---

## 5. 模块 D：阅读器与每日报增强（收尾）

### D1. 每日报展开 Top 10（关闭 `openspec/changes/daily-digest/spec.md` 遗留项）
- `public/digest.js:14` `selectRecommendDigestItems` 增加形参 `limit=5`，把 `:34`、`:39` 两处 `slice(0,5)` 改为 `slice(0, limit)`。
- 新增 `selectRecommendDigestTop10(hotItems, interests, history)` = `selectRecommendDigestItems(..., 10)`。**约束**：Top10 的前 5 项必须与 `limit=5` 结果逐项相等（测试覆盖）。
- `renderDailyDigest`（`app.js:1784`）卡片底部加「展开更多 ↓ / 收起 ↑」按钮，状态读/写 `localStorage['toutiao_digest_expand']`。展开渲染 10 条，收起 5 条。
- 更新 `digest.js:49-51` 的 `module.exports` 加入新函数。

### D2. 阅读器字号/主题完善（关闭 `openspec/changes/in-app-reader/spec.md` 遗留项）
- `openReader`（`app.js:392`）：确认字号三档（小/中/大）UI 存在且读/写 `localStorage`；缺失则补全。
- 阅读器模态跟随全局主题：读 `toutiao_theme`（`initTheme` `:1053`），dark 时（含 auto 解析为 dark）应用 `.reader-dark` 样式（加到 `style.css`）。
- 阅读器底部加「上一篇 / 下一篇」：基于当前来源列表（热搜/RSS/推荐流）顺序导航，注意边界（首条无「上一篇」、末条无「下一篇」）。

### D3. 测试
- `test/digest-expand.test.js`：断言 Top10 前 5 项与 Top5 逐项相等（顺序不变）。
- `test/reader-nav.test.js`：mock 列表，断言上/下一篇索引边界正确（首/末边界）。

---

## 6. 执行顺序与验收

**顺序**：模块 A → B → C → D。每模块做完立即补测试并 `node --test` 全绿后再进下一模块。

**人工冒烟（`npm start`，会自动拉起 Python sidecar）**：
1. 热搜榜点「📈」→ 弹出热度曲线模态。
2. 风云榜 Tab → 显示「上升最快」Top10 + 「昨日回顾」Top20，可切换日期。
3. cluster 卡片「🔍 事件全景」→ 弹出多平台时间线，按时间排序，可点进阅读器。
4. 每日报能展开 10 条 / 收起 5 条，刷新后状态保持。
5. 阅读器字号小/中/大可切换并持久化；深色模式下阅读器暗色；上/下一篇导航正常。
6. 等 10+ 分钟后再次刷新，确认 `trend_history.json` 有新快照追加（文件体积增长、条数增加）。

**收尾文档**：写 `docs/superpowers/specs/2026-06-16-trend-history-and-content-depth-design.md`，记录本次迭代的设计决策（快照去重策略、裁剪上限、trend 标签算法、Canvas 图方案、事件时间线数据流）。

**Git**：按模块分次提交，commit message 沿用现有 `feat:` / `fix:` 前缀风格（如 `feat: 趋势历史快照与风云榜`）。仅当用户明确要求时才 push。
