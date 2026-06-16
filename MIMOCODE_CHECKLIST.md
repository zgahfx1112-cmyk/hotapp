# 迭代验收清单（mimocode 自检用）

> 配套 `MIMOCODE_TASKS.md`。每完成一格打勾，全绿才算该模块完成。所有测试用 `node --test` 运行。

## 模块 A：趋势历史快照（后端）
- [x] `hotapp/server.py` 新增 `HISTORY_FILE` 常量、`shouldSnapshot()`、`snapshot_trend()`
- [x] 旧格式 `trend_history.json` 自动归档为 `trend_history.legacy.json`，新文件从 `[]` 起
- [x] `_api_trending()` 与 `background_refresh()` 两处都调用了 `snapshot_trend()`
- [x] `do_GET` 注册 `/api/trend/history?hours=` 与 `/api/trend/recap?date=`
- [x] `server.js` 新增 `/api/trend` 代理（照抄 `:65` 写法）
- [x] 快照去重（10分钟+80%重合）、滚动裁剪（14天/≤2000条）、原子写（tmp+os.replace）
- [x] `test/trend-snapshot.test.js` 全绿（shouldSnapshot 4 场景 + 裁剪 + trend 标签）

## 模块 B：热搜风云榜（前端）
- [x] `index.html` 新增 `utility-tab[data-tab=trend]` + 引入 `trend.js`
- [x] `app.js` `setupTabs()` 注册新 tab
- [x] `public/trend.js` 暴露 `window.Trend`：renderTrendTab/loadRising/loadRecap/normalizeSeries/drawTrendChart/showTrendModal
- [x] 折线图为纯 Canvas（无第三方库）
- [x] 热搜榜卡片接入「📈」按钮 → showTrendModal
- [x] `test/trend-chart.test.js` 全绿（normalizeSeries 4 场景 + 上升最快排序）

## 模块 C：事件时间线
- [x] `app.js` 新增 `showEventTimelineModal(seedItem)`
- [x] 复用 `clusterTopics`/`isSameEvent` 聚类；items 按 timestamp 升序
- [x] `renderClusterCard` 加「🔍 事件全景」入口
- [x] `openReader` 底部「相关报道」区接入
- [x] `style.css` 新增 `.event-timeline` 样式
- [x] 纯函数已通过 `module.exports` 导出可测
- [x] `test/event-timeline.test.js` 全绿

## 模块 D：阅读器 / 每日报增强
- [x] `digest.js` `selectRecommendDigestItems` 加 `limit` 形参；新增 `selectRecommendDigestTop10`
- [x] `renderDailyDigest` 展开/收起按钮，状态持久化 `toutiao_digest_expand`
- [x] `openReader` 字号三档 UI + 持久化；深色模式 `.reader-dark`
- [x] 阅读器上/下一篇导航（含首末边界）
- [x] `test/digest-expand.test.js` 全绿（Top10 前5 == Top5）
- [x] `test/reader-nav.test.js` 全绿（边界正确）

## 收尾
- [x] `node --test` 全部测试通过（132 pass / 0 fail）
- [x] 设计文档 `docs/superpowers/specs/2026-06-16-trend-history-and-content-depth-design.md` 已写
- [ ] 按 `MIMOCODE_TASKS.md` §6 人工冒烟 6 项全部通过
- [ ] 按模块分次提交（`feat:` 前缀），未 push（除非用户要求）
