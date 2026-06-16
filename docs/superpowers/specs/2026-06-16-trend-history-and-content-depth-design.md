# 趋势历史快照与内容深度增强 - 设计文档

> 日期：2026-06-16
> 迭代方向：内容深度增强 + 趋势历史回溯

## 1. 整体架构

本次迭代新增四个模块，按依赖顺序实施：A → B → C → D。

```
Python sidecar (server.py)          Node proxy (server.js)           Frontend (app.js/trend.js)
┌──────────────────────┐            ┌──────────────────────┐         ┌──────────────────────────┐
│ fetch_all_platforms() │            │ /api/trend 代理       │         │ Trend.renderTrendTab()   │
│       ↓              │            │ /api/hot   代理       │←───────→│ Trend.showTrendModal()   │
│ snapshot_trend()     │──────写───→│ (透传)                │         │ showEventTimelineModal() │
│       ↓              │            └──────────────────────┘         │ renderDailyDigest()      │
│ trend_history.json   │                                             │ openReader(navContext)   │
│ (滚动14天/≤2000条)   │                                             └──────────────────────────┘
│       ↓              │
│ /api/trend/history   │
│ /api/trend/recap     │
└──────────────────────┘
```

## 2. 模块 A：趋势历史快照（后端）

### 2.1 数据模型

`HISTORY_FILE`（`trend_history.json`）存储为 JSON 数组，每条快照结构：

```json
{
  "timestamp": 1687000000000,
  "items": [
    {
      "id": "...",
      "title": "...",
      "url": "...",
      "platform": "toutiao",
      "rank": 1,
      "heatScore": 12345
    }
  ]
}
```

每个 platform 保留 Top 20（按 rank 升序），只保留精简字段。

### 2.2 去重策略

`shouldSnapshot(prevSnap, newTopItems, now)` 纯函数：

- 无前快照 → 必拍
- 距上次 < 10 分钟 **且** 标题集合 Jaccard 重合度 > 0.8 → 跳过
- 其它 → 必拍

Jaccard 计算使用 `title_key()` 做标题归一化。

### 2.3 滚动裁剪

- 保留最近 14 天的快照
- 总条数上限 2000 条
- 超出则删最旧的

### 2.4 原子写入

写到 `HISTORY_FILE.tmp`，再 `os.replace` 原子替换，避免写入中断导致数据损坏。

### 2.5 调用点

1. `_api_trending()` 实时抓取成功后调用 `snapshot_trend()`
2. `background_refresh()` 定时刷新后调用 `snapshot_trend()`

### 2.6 API

| 接口 | 参数 | 返回 |
|------|------|------|
| `GET /api/trend/history` | `hours=24` | 去重事件列表，含 trend 标签 |
| `GET /api/trend/recap` | `date=YYYY-MM-DD` | 指定日 Top20 快照 |

### 2.7 Trend 标签算法

对比窗内首尾热度采样：

| 条件 | 标签 |
|------|------|
| 末尾 > 起点 × 1.2 | `up` |
| 起点 > 末尾 × 1.2 | `down` |
| 最大值在后半段且 > 起点 × 1.5 | `spike` |
| 其它 | `stable` |

### 2.8 旧格式兼容

`_is_legacy_history()` 检测：数组首个元素 timestamp 早于 7 天前，或含 `bilibili`/`douyin` 平台 → 自动重命名为 `trend_history.legacy.json`，新建空 `[]`。

## 3. 模块 B：热搜风云榜（前端）

### 3.1 `trend.js` 模块

暴露 `window.Trend`，核心函数：

- `renderTrendTab()`：三块布局（上升最快 / 历史回顾 / 说明文案）
- `loadRising()`：调 `/api/trend/history?hours=6`，按热度变化率排序取 Top10
- `loadRecap(date)`：调 `/api/trend/recap?date=` 渲染 Top20
- `normalizeSeries(samples, width, height)`：归一化为 Canvas 路径点
- `drawTrendChart(canvas, heatSamples)`：纯 Canvas 折线图（无第三方库）
- `showTrendModal(title)`：弹出热度曲线模态

### 3.2 Canvas 绘图方案

参考 `fallbackDownload()` 的 Canvas 用法（`public/app.js:819-947`），纯原生 Canvas 2D API：

- 渐变填充区域（`createLinearGradient`）
- 折线描边（`lineTo`）
- 当前值圆点标注
- 时间轴标签（每隔 N 个采样点显示）
- 适配 `devicePixelRatio` 高清屏

### 3.3 上升最快排序

对比最近两个快照的热度变化率（delta），按 delta 降序排列，delta 相同时按 maxHeat 降序。

## 4. 模块 C：事件聚合时间线视图

### 4.1 数据流

```
showEventTimelineModal(seedItem)
  → state.hotItems（必要时重拉 /api/trending）
  → clusterTopics(items) 聚类
  → 找到含 seedItem 的 cluster
  → 按 timestamp 升序排列
  → 渲染时间线 UI
```

### 4.2 时间线 UI 结构

```
┌──────────────────────────────────┐
│ 🔍 事件全景                       │
│ 3个来源 · 14:00 ~ 16:30          │
├──────────────────────────────────┤
│ [头条] 📰 某某事件标题    12345  14:00 │
│ [微博] 🔥 某某事件标题     9876  14:30 │
│ [百度] 🔍 某某事件标题     8765  15:00 │
│ ...                              │
├──────────────────────────────────┤
│    [📈 查看完整趋势]              │
└──────────────────────────────────┘
```

### 4.3 入口

1. `renderClusterCard`：cluster 徽章区加「🔍 事件全景」按钮
2. `openReader`：底部「相关报道」区（同 cluster 的其它来源条目）

### 4.4 聚类复用

直接复用现有的 `clusterTopics(items)` 和 `isSameEvent(a, b)` 函数（`app.js:1414`、`:1159`），无需重写。

## 5. 模块 D：阅读器与每日报增强

### 5.1 每日报展开

- `selectRecommendDigestItems(hotItems, interests, history, limit=5)`：新增 `limit` 参数
- `selectRecommendDigestTop10()`：`limit=10` 的快捷函数
- **约束**：Top10 的前 5 项必须与 Top5 逐项相等（测试覆盖）
- 展开/收起状态持久化到 `localStorage['toutiao_digest_expand']`

### 5.2 阅读器增强

- **深色模式**：读 `toutiao_theme`，dark 时应用 `.reader-dark` 样式（完整暗色主题覆盖）
- **上/下一篇导航**：`openReader(article, navContext)` 接受列表和当前索引，首/末条目禁用对应按钮
- **字号三档**：已有 `readerFontSize`（sm/md/lg）读写 `localStorage['toutiao_readerFont']`

### 5.3 相关报道

`renderRelatedReports(article)` 在阅读器底部注入同 cluster 的其它来源条目（最多 5 条），点击跳转原文。

## 6. 测试覆盖

| 测试文件 | 覆盖模块 | 关键用例 |
|----------|----------|----------|
| `trend-snapshot.test.js` | A | shouldSnapshot 4 场景 + trimHistory + aggregateTrend 6 场景 |
| `trend-chart.test.js` | B | normalizeSeries 7 场景 + 上升最快排序 3 场景 |
| `event-timeline.test.js` | C | 聚类 7 场景 + 时间线升序 + 来源覆盖 |
| `digest-expand.test.js` | D | Top10 前5 == Top5 + limit 参数 |
| `reader-nav.test.js` | D | 7 种边界场景（首/末/中/单条/空/null） |

## 7. 人工冒烟清单

1. 热搜榜点「📈」→ 弹出热度曲线模态
2. 风云榜 Tab → 显示「上升最快」Top10 + 「昨日回顾」Top20，可切换日期
3. cluster 卡片「🔍 事件全景」→ 弹出多平台时间线，按时间排序
4. 每日报能展开 10 条 / 收起 5 条，刷新后状态保持
5. 阅读器字号小/中/大可切换并持久化；深色模式下阅读器暗色
6. 等 10+ 分钟后刷新，确认 `trend_history.json` 有新快照追加
