# 首屏加载优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让页面首屏更快出现，减少白屏等待，同时保持现有接口与主要交互行为不变。

**Architecture:** 前端初始化流程从“等待所有请求完成后统一渲染”改为“先渲染基础 UI，再异步补齐数据”。推荐页首次文章请求量从 200 降到 30，热榜、文章、统计分别回填当前状态，并在当前 tab 需要时触发最小重渲。

**Tech Stack:** Vanilla JavaScript, Express static frontend, Node.js built-in test runner

---

### Task 1: 为异步首屏初始化建立可验证场景

**Files:**
- Create: `test/init-load.test.js`
- Modify: `public/app.js`
- Test: `test/init-load.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createInitController } = require('../public/init-controller');

test('createInitController renders immediately before async loaders finish', async () => {
  const calls = [];
  let releaseArticles;
  const articlesDone = new Promise(resolve => { releaseArticles = resolve; });

  const controller = createInitController({
    renderTab: () => calls.push('renderTab'),
    renderInterestTags: () => calls.push('renderInterestTags'),
    setupTabs: () => calls.push('setupTabs'),
    registerSW: () => calls.push('registerSW'),
    getUserStats: () => calls.push('getUserStats'),
    loadSources: async () => { calls.push('loadSources'); },
    loadArticles: async () => { calls.push('loadArticles'); await articlesDone; },
    loadHotData: async () => { calls.push('loadHotData'); },
    loadStats: async () => { calls.push('loadStats'); },
    restorePrefs: () => calls.push('restorePrefs'),
    initTheme: () => calls.push('initTheme')
  });

  const pending = controller.init();

  assert.deepEqual(calls.slice(0, 5), ['restorePrefs', 'initTheme', 'renderTab', 'renderInterestTags', 'setupTabs']);
  releaseArticles();
  await pending;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "D:/Git/heikesong/toutiao/test/init-load.test.js"`
Expected: FAIL with `Cannot find module '../public/init-controller'`

- [ ] **Step 3: Write minimal implementation**

```js
function createInitController(deps) {
  return {
    async init() {
      deps.restorePrefs();
      deps.initTheme();
      deps.renderTab();
      deps.renderInterestTags();
      deps.setupTabs();
      deps.registerSW();
      const jobs = [deps.loadSources(), deps.loadArticles(), deps.loadHotData(), deps.loadStats()];
      deps.getUserStats();
      await Promise.all(jobs);
    }
  };
}

module.exports = { createInitController };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "D:/Git/heikesong/toutiao/test/init-load.test.js"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/init-controller.js test/init-load.test.js
git commit -m "test: cover non-blocking first-screen init"
```

### Task 2: 降低首屏文章请求量并接入新初始化控制器

**Files:**
- Modify: `public/app.js:32-110`
- Modify: `public/init-controller.js`
- Test: `test/init-load.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('createInitController requests 30 articles for first screen', async () => {
  let requestedLimit = null;
  const controller = createInitController({
    renderTab() {},
    renderInterestTags() {},
    setupTabs() {},
    registerSW() {},
    getUserStats() {},
    loadSources: async () => {},
    loadArticles: async (limit) => { requestedLimit = limit; },
    loadHotData: async () => {},
    loadStats: async () => {},
    restorePrefs() {},
    initTheme() {}
  });

  await controller.init();
  assert.equal(requestedLimit, 30);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "D:/Git/heikesong/toutiao/test/init-load.test.js"`
Expected: FAIL with `null !== 30`

- [ ] **Step 3: Write minimal implementation**

```js
const jobs = [
  deps.loadSources(),
  deps.loadArticles(30),
  deps.loadHotData(),
  deps.loadStats()
];
```

并在 `public/app.js` 中把原 `init()` 逻辑改为调用 `createInitController({...}).init()`，保留现有函数实现与状态结构。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "D:/Git/heikesong/toutiao/test/init-load.test.js"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/app.js public/init-controller.js test/init-load.test.js
git commit -m "feat: reduce first-screen article payload"
```

### Task 3: 数据回填后局部刷新当前页

**Files:**
- Modify: `public/init-controller.js`
- Modify: `public/app.js:32-110`
- Test: `test/init-load.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('createInitController rerenders after async section data arrives', async () => {
  const calls = [];
  const controller = createInitController({
    renderTab: () => calls.push('renderTab'),
    renderInterestTags: () => calls.push('renderInterestTags'),
    setupTabs: () => calls.push('setupTabs'),
    registerSW: () => calls.push('registerSW'),
    getUserStats: () => calls.push('getUserStats'),
    loadSources: async () => {},
    loadArticles: async () => {},
    loadHotData: async () => {},
    loadStats: async () => {},
    restorePrefs: () => calls.push('restorePrefs'),
    initTheme: () => calls.push('initTheme'),
    afterSourcesLoaded: () => calls.push('afterSourcesLoaded'),
    afterArticlesLoaded: () => calls.push('afterArticlesLoaded'),
    afterHotLoaded: () => calls.push('afterHotLoaded'),
    afterStatsLoaded: () => calls.push('afterStatsLoaded')
  });

  await controller.init();
  assert.equal(calls.includes('afterArticlesLoaded'), true);
  assert.equal(calls.includes('afterHotLoaded'), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "D:/Git/heikesong/toutiao/test/init-load.test.js"`
Expected: FAIL because `afterArticlesLoaded` / `afterHotLoaded` were never called

- [ ] **Step 3: Write minimal implementation**

```js
const jobs = [
  deps.loadSources().then(() => deps.afterSourcesLoaded?.()),
  deps.loadArticles(30).then(() => deps.afterArticlesLoaded?.()),
  deps.loadHotData().then(() => deps.afterHotLoaded?.()),
  deps.loadStats().then(() => deps.afterStatsLoaded?.())
];
```

并在 `public/app.js` 里将这些回调接到 `renderTab()` 或最小刷新函数，确保当前 tab 需要的数据回到 state 后能更新界面。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "D:/Git/heikesong/toutiao/test/init-load.test.js"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/app.js public/init-controller.js test/init-load.test.js
git commit -m "feat: rerender first screen as data arrives"
```

### Task 4: 回归验证首屏优化不破坏现有行为

**Files:**
- Test: `test/init-load.test.js`
- Test: `test/digest.test.js`
- Modify: `public/app.js` (only if regression fix needed)

- [ ] **Step 1: Extend the failing regression test**

```js
test('createInitController keeps refresh-related loaders independent from init optimization', async () => {
  let articleCalls = 0;
  const controller = createInitController({
    renderTab() {},
    renderInterestTags() {},
    setupTabs() {},
    registerSW() {},
    getUserStats() {},
    loadSources: async () => {},
    loadArticles: async () => { articleCalls++; },
    loadHotData: async () => {},
    loadStats: async () => {},
    restorePrefs() {},
    initTheme() {}
  });

  await controller.init();
  assert.equal(articleCalls, 1);
});
```

- [ ] **Step 2: Run tests to verify the new regression fails if behavior drifted**

Run: `node --test "D:/Git/heikesong/toutiao/test/init-load.test.js" "D:/Git/heikesong/toutiao/test/digest.test.js"`
Expected: PASS for existing behavior checks, and if new regression is wired wrong, FAIL until fixed

- [ ] **Step 3: Apply minimal regression fix if needed**

如果测试失败，仅修复 `public/app.js` 中被首屏优化影响的初始化/刷新路径，不改动无关逻辑。

- [ ] **Step 4: Run full tests**

Run: `npm test`
Expected: PASS with 0 failures

- [ ] **Step 5: Commit**

```bash
git add public/app.js public/init-controller.js test/init-load.test.js test/digest.test.js
git commit -m "test: verify first-screen optimization regressions"
```
