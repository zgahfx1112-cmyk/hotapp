# 移除 B站 内容 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从热搜与智能推荐链路中彻底移除 B站相关内容，并同步清理产品文案与回归测试。

**Architecture:** 通过删除 `hotapp/server.py` 中的 B站热搜源配置与解析函数，从数据源头阻断 B站内容进入 `/api/hot`。前端不新增额外分支，只移除平台展示映射与文案；推荐链路继续复用现有热搜池，因此上游移除后推荐页自然不再出现 B站项。

**Tech Stack:** Node.js test runner, Python hotapp service, browser-side JavaScript, Web App Manifest

---

## File Structure

- `hotapp/server.py` — 热搜聚合后端；负责平台抓取配置与解析函数，本次删除 B站相关解析与配置。
- `public/app.js` — 前端平台名映射与热搜 tab 展示，本次删除 B站展示名称映射。
- `public/manifest.json` — PWA 描述文案，本次删除 B站文案。
- `test/hotapp-start.test.js` — 当前已验证 Python 热搜服务可导入；本次增加“后端不再注册 B站平台”的回归测试。
- `test/manifest.test.js` — 新增轻量测试，约束 manifest 描述不再包含“B站”。
- `test/platform-map.test.js` — 新增文本级测试，约束前端平台映射不再包含 B站展示项。
- `test/digest.test.js` — 保持推荐摘要对白名单平台的约束，继续用 `bilibili` 作为非白名单样例。

### Task 1: 锁住回归测试

**Files:**
- Modify: `test/hotapp-start.test.js:1-12`
- Create: `test/manifest.test.js`
- Create: `test/platform-map.test.js`
- Test: `test/hotapp-start.test.js`
- Test: `test/manifest.test.js`
- Test: `test/platform-map.test.js`

- [ ] **Step 1: Write the failing hotapp source test**

Replace `test/hotapp-start.test.js` with:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function runPython(code) {
  return spawnSync('python', ['-c', code], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
}

test('hotapp server imports without missing Python modules', () => {
  const result = runPython('import runpy; runpy.run_path("hotapp/server.py", run_name="__test__")');
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('hotapp server platform config excludes bilibili sources', () => {
  const result = runPython([
    'import json, runpy',
    'ns = runpy.run_path("hotapp/server.py", run_name="__test__")',
    'print(json.dumps(sorted(ns["PLATFORMS"].keys())))'
  ].join('; '));

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const keys = JSON.parse(result.stdout.trim());
  assert.equal(keys.includes('bilibili'), false);
  assert.equal(keys.includes('bilibili_pop'), false);
});
```

- [ ] **Step 2: Write the failing manifest test**

Create `test/manifest.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../public/manifest.json');

test('manifest description does not mention bilibili', () => {
  assert.equal(manifest.description.includes('B站'), false);
});
```

- [ ] **Step 3: Write the failing platform map test**

Create `test/platform-map.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

test('platform name map does not contain bilibili labels', () => {
  assert.equal(appJs.includes("bilibili: 'B站热搜'"), false);
  assert.equal(appJs.includes("bilibili_pop: 'B站热门'"), false);
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run:

```bash
node --test test/hotapp-start.test.js test/manifest.test.js test/platform-map.test.js
```

Expected: FAIL because current code still contains `bilibili`/`bilibili_pop` platform config, manifest still mentions `B站`, and `public/app.js` still contains B站 labels.

- [ ] **Step 5: Commit failing tests checkpoint**

```bash
git add test/hotapp-start.test.js test/manifest.test.js test/platform-map.test.js
git commit -m "test: cover bilibili removal"
```

### Task 2: 删除 B站 数据源与展示文案

**Files:**
- Modify: `hotapp/server.py:34-41`
- Modify: `hotapp/server.py:120-126`
- Modify: `hotapp/server.py:284-338`
- Modify: `public/app.js:1104-1106`
- Modify: `public/manifest.json:1-24`
- Test: `test/hotapp-start.test.js`
- Test: `test/manifest.test.js`
- Test: `test/platform-map.test.js`

- [ ] **Step 1: Delete bilibili parser functions from hotapp service**

In `hotapp/server.py`, remove these functions entirely:

```python
def parse_bilibili(data):
    items = (data.get("data", {}) or {}).get("trending", {}) or {}
    items = items.get("list") or []
    return [{"id": f"bilibili_{i}", "title": x.get("show_name") or x.get("keyword",""),
             "url": f"https://search.bilibili.com/all?keyword={urllib.parse.quote(x.get('keyword') or x.get('show_name',''))}",
             "platform": "bilibili", "rank": i+1,
             "heatScore": x.get("heat_score") or (8000-i*300),
             "image": x.get("icon") or None} for i,x in enumerate(items[:100])]
```

and:

```python
def parse_bilibili_popular(data):
    items = data.get("data", {}).get("list") or []
    return [{"id": f"bili_pop_{i}", "title": x.get("title", ""),
             "url": f"https://www.bilibili.com/video/{x.get('bvid','')}",
             "platform": "bilibili_pop", "rank": i+1,
             "heatScore": x.get("stat", {}).get("view") or (6000-i*50),
             "image": x.get("pic") or None} for i,x in enumerate(items[:100])]
```

- [ ] **Step 2: Delete bilibili platform configs from hotapp service**

In `hotapp/server.py`, remove these entries from `PLATFORMS`:

```python
    "bilibili": {"name": "B站热搜",
        "url": "https://api.bilibili.com/x/web-interface/search/square?limit=50",
        "hdrs": {"User-Agent": UA, "Referer": "https://www.bilibili.com/",
                 "Accept": "application/json, text/plain, */*",
                 "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                 "Accept-Encoding": "gzip, deflate, br",
                 "Origin": "https://www.bilibili.com"},
        "parse": parse_bilibili},
    "bilibili_pop": {"name": "B站热门",
        "url": "https://api.bilibili.com/x/web-interface/popular?ps=50",
        "hdrs": {"User-Agent": UA, "Referer": "https://www.bilibili.com/",
                 "Accept": "application/json, text/plain, */*",
                 "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                 "Accept-Encoding": "gzip, deflate, br",
                 "Origin": "https://www.bilibili.com"},
        "parse": parse_bilibili_popular},
```

- [ ] **Step 3: Delete bilibili platform labels from frontend map**

In `public/app.js`, change `getPlatformName` to:

```js
function getPlatformName(key) {
  const map = { weibo: '微博', douyin: '抖音', baidu: '百度', toutiao: '头条', tieba: '贴吧', sspai: '少数派', ithome: 'IT之家', '36kr': '36氪', zhihu: '知乎', hupu: '虎扑' };
  return map[key] || key;
}
```

- [ ] **Step 4: Delete bilibili mention from manifest description**

In `public/manifest.json`, change description field to:

```json
"description": "聚合微博、抖音、百度、头条热搜，RSS新闻订阅，智能推荐"
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
node --test test/hotapp-start.test.js test/manifest.test.js test/platform-map.test.js
```

Expected: PASS. `PLATFORMS` no longer contains bilibili keys, manifest description no longer contains `B站`, and `public/app.js` no longer contains bilibili label strings.

- [ ] **Step 6: Commit implementation**

```bash
git add hotapp/server.py public/app.js public/manifest.json test/hotapp-start.test.js test/manifest.test.js test/platform-map.test.js
git commit -m "fix: remove bilibili hot content"
```

### Task 3: 回归推荐摘要与全量相关测试

**Files:**
- Modify: `test/digest.test.js:1-37`
- Test: `test/digest.test.js`
- Test: `test/hotapp-start.test.js`
- Test: `test/manifest.test.js`
- Test: `test/platform-map.test.js`

- [ ] **Step 1: Keep digest regression focused on approved platforms**

Ensure `test/digest.test.js` contains exactly:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { selectRecommendDigestItems } = require('../public/digest');

test('selectRecommendDigestItems only keeps toutiao baidu weibo and limits to five', () => {
  const items = [
    { id: '1', platform: 'weibo' },
    { id: '2', platform: 'douyin' },
    { id: '3', platform: 'baidu' },
    { id: '4', platform: 'toutiao' },
    { id: '5', platform: 'bilibili' },
    { id: '6', platform: 'weibo' },
    { id: '7', platform: 'baidu' },
    { id: '8', platform: 'toutiao' }
  ];

  assert.deepEqual(selectRecommendDigestItems(items).map(item => item.id), ['1', '3', '4', '6', '7']);
});

test('selectRecommendDigestItems returns available approved-source items when fewer than five', () => {
  const items = [
    { id: '1', platform: 'douyin' },
    { id: '2', platform: 'toutiao' },
    { id: '3', platform: 'baidu' }
  ];

  assert.deepEqual(selectRecommendDigestItems(items).map(item => item.id), ['2', '3']);
});

test('selectRecommendDigestItems returns empty array when no approved-source items exist', () => {
  const items = [
    { id: '1', platform: 'douyin' },
    { id: '2', platform: 'bilibili' }
  ];

  assert.deepEqual(selectRecommendDigestItems(items), []);
});
```

- [ ] **Step 2: Run digest regression test**

Run:

```bash
node --test test/digest.test.js
```

Expected: PASS. `bilibili` samples remain excluded from recommend digest selection.

- [ ] **Step 3: Run full targeted regression suite**

Run:

```bash
node --test test/digest.test.js test/hotapp-start.test.js test/manifest.test.js test/platform-map.test.js
```

Expected: PASS with 4 test files green and no failures.

- [ ] **Step 4: Commit regression confirmation**

```bash
git add test/digest.test.js
git commit -m "test: keep recommendation digest sources constrained"
```

## Self-Review

- **Spec coverage:**
  - 后端不抓 `bilibili` / `bilibili_pop` → Task 2 Step 1-2
  - 热搜页不再出现 B站 tab → Task 2 Step 2-3 通过上游移除与映射清理完成
  - 智能推荐不再消费 B站热搜项 → Task 2 Step 2 + Task 3 digest regression
  - manifest 不再提及 B站 → Task 2 Step 4
  - 测试覆盖与防回归 → Task 1 + Task 3
- **Placeholder scan:** 无 `TBD` / `TODO` / “implement later” 等占位词。
- **Type consistency:** 测试统一使用 `bilibili` / `bilibili_pop` 平台键，与 spec 和现有代码一致。
