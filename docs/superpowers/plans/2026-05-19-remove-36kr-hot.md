# 36氪热榜下线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从热搜 tab 下线 36 氪热榜，但保留 RSS tab 里的 36 氪订阅源。

**Architecture:** 只改 HotApp 平台注册和前端平台名称映射，不碰 RSS 抓取链路。后端停止抓取并返回 `36kr_hot`，前端同时删除该平台显示文案，保证热搜子 tab 不再出现 36 氪热榜，而 RSS 的 `36氪` 继续保留。

**Tech Stack:** Python 3, Node.js, Vanilla JS, Git

---

## File Structure

- Modify: `hotapp/server.py`
  - 责任：定义热搜平台 `PLATFORMS` 注册表。这里删除 `36kr_hot` 平台，停止后端抓取与返回该平台数据。
- Modify: `public/app.js`
  - 责任：前端平台 key 到中文名映射。这里删除 `36kr_hot` 映射，清理残留展示逻辑。
- Verify only: `sources.json`
  - 责任：RSS 源配置。此任务不修改，保留 `36氪` RSS 源。

### Task 1: Remove 36kr_hot backend platform

**Files:**
- Modify: `hotapp/server.py:335-344`
- Verify: `sources.json:1-17`

- [ ] **Step 1: Write failing verification target**

当前行为应先确认失败条件：`hotapp/server.py` 里仍存在 `"36kr_hot"` 平台注册，说明热搜后端还会抓取它。

```python
"36kr_hot": {"name": "36氪热榜",
    "url": "https://36kr.com/pp/api/newsflash?page=1&size=30",
    "hdrs": {"User-Agent": UA, "Referer": "https://36kr.com/"},
    "parse": parse_36kr_hot},
```

- [ ] **Step 2: Run grep to verify current state fails requirement**

Run:
```bash
grep -n '36kr_hot' hotapp/server.py
```

Expected:
- PASS condition for this step: command prints at least one match, proving `36kr_hot` still exists before removal.

- [ ] **Step 3: Delete minimal backend registration**

Change `hotapp/server.py` so `PLATFORMS` no longer contains `36kr_hot` entry.

```python
    "hupu": {"name": "虎扑",
        "url": "https://bbs.hupu.com/all",
        "hdrs": {"User-Agent": UA, "Referer": "https://bbs.hupu.com/"},
        "raw_response": True,
        "parse": parse_hupu},
}  # end PLATFORMS
```

Do not delete `parse_36kr_hot()` in this task. Scope stays minimal: stop exposure first, avoid unrelated cleanup.

- [ ] **Step 4: Run grep to verify backend removal passes**

Run:
```bash
grep -n '36kr_hot' hotapp/server.py
```

Expected:
- No output
- Exit code `1`

- [ ] **Step 5: Verify RSS 36kr source still exists**

Run:
```bash
grep -n '36氪' sources.json
```

Expected:
- One match for RSS source line such as `{"name": "36氪", "feed_url": "https://36kr.com/feed"}`

- [ ] **Step 6: Commit backend change**

```bash
git add hotapp/server.py
git commit -m "fix: 下掉36氪热榜后端入口"
```

### Task 2: Remove 36kr_hot frontend label residue

**Files:**
- Modify: `public/app.js:900-902`
- Verify: `hotapp/server.py:335-344`

- [ ] **Step 1: Write failing verification target**

当前行为应先确认失败条件：`public/app.js` 仍保留 `36kr_hot` 显示名映射。

```javascript
const map = { weibo: '微博', bilibili: 'B站热搜', bilibili_pop: 'B站热门', douyin: '抖音', baidu: '百度', toutiao: '头条', tieba: '贴吧', sspai: '少数派', ithome: 'IT之家', '36kr': '36氪', zhihu: '知乎', hupu: '虎扑', '36kr_hot': '36氪热榜' };
```

- [ ] **Step 2: Run grep to verify current state fails requirement**

Run:
```bash
grep -n '36kr_hot' public/app.js
```

Expected:
- PASS condition for this step: command prints one match, proving front-end still knows this hot platform before cleanup.

- [ ] **Step 3: Delete minimal front-end mapping**

Change `public/app.js` so `getPlatformName()` keeps RSS `36kr` but removes hot platform `36kr_hot`.

```javascript
const map = { weibo: '微博', bilibili: 'B站热搜', bilibili_pop: 'B站热门', douyin: '抖音', baidu: '百度', toutiao: '头条', tieba: '贴吧', sspai: '少数派', ithome: 'IT之家', '36kr': '36氪', zhihu: '知乎', hupu: '虎扑' };
```

- [ ] **Step 4: Run grep to verify front-end cleanup passes**

Run:
```bash
grep -n '36kr_hot' public/app.js
```

Expected:
- No output
- Exit code `1`

- [ ] **Step 5: Sanity-check RSS display mapping remains**

Run:
```bash
grep -n "'36kr': '36氪'" public/app.js
```

Expected:
- One match remains, proving RSS platform name still displays correctly.

- [ ] **Step 6: Commit front-end change**

```bash
git add public/app.js
git commit -m "fix: 清理36氪热榜前端映射"
```

### Task 3: Verify end-to-end behavior

**Files:**
- Verify: `hotapp/server.py`
- Verify: `public/app.js`
- Verify: `sources.json`

- [ ] **Step 1: Run combined grep verification**

Run:
```bash
grep -R -n '36kr_hot' hotapp public/app.js
```

Expected:
- No output
- Exit code `1`

- [ ] **Step 2: Start app locally**

Run:
```bash
npm start
```

Expected:
- Node server starts on port `3000`
- Python HotApp starts on port `8000`
- No startup error related to removed `36kr_hot`

- [ ] **Step 3: Verify hot tab behavior manually**

Open app in browser and check:
- 热搜 tab 子 tab 列表里没有 `36氪热榜`
- 其他热搜平台仍正常显示
- 切到 RSS tab 后，`36氪` RSS 源仍可见并可加载文章

- [ ] **Step 4: Check runtime API payload**

Run:
```bash
curl -s http://localhost:8000/api/all | grep '36kr_hot'
```

Expected:
- No output
- Exit code `1`

- [ ] **Step 5: Inspect final git diff**

Run:
```bash
git diff -- hotapp/server.py public/app.js sources.json
```

Expected:
- Only `hotapp/server.py` and `public/app.js` changed
- `sources.json` unchanged

- [ ] **Step 6: Commit final verification state**

If Tasks 1 and 2 were committed separately and no new file changes remain, skip new commit. Verify clean state instead:

```bash
git status
```

Expected:
- `nothing to commit, working tree clean`

## Self-Review

- Spec coverage: only hot tab `36kr_hot` removed; RSS `36氪` explicitly preserved in both plan tasks and verification.
- Placeholder scan: no `TODO`/`TBD`/vague “write tests later” text remains.
- Type consistency: platform key stays `36kr` for RSS and `36kr_hot` for hot tab across all tasks.
