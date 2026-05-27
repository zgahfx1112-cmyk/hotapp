# Recommendation Duplicate Event Downranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add conservative duplicate-event downranking to the recommendation feed so repeated cross-platform coverage is spread out within a 5-item window without deleting items.

**Architecture:** Keep the change inside existing recommendation logic in `public/app.js`. Add pure helper functions for title normalization, event-key extraction, duplicate detection, and short-window reranking; call the duplicate reranker after existing source-diversity reranking. Tests exercise pure functions through Node's built-in test runner.

**Tech Stack:** JavaScript, Node 20 `node:test`, existing `public/app.js` CommonJS test exports, `npm test`.

---

## File Structure

- Modify `public/app.js`
  - Add `normalizeEventTitle(title)` near recommendation helpers.
  - Add `extractEventKeywords(title)` near recommendation helpers.
  - Add `getEventWindow(item)` near recommendation helpers.
  - Add `isSameEvent(a, b)` near recommendation helpers.
  - Add `rerankDuplicateEvents(items, windowSize = 5)` after `rerankCandidates(items)`.
  - Call `rerankDuplicateEvents(rerankCandidates(scored))` in `buildHybridFeed()`.
  - Export new pure helpers for tests.
- Modify `test/recommendation.test.js`
  - Add duplicate-event regression tests.
  - Keep existing tests untouched except import list.

## Task 1: Add duplicate-event tests

**Files:**
- Modify: `test/recommendation.test.js:1-3`
- Modify: `test/recommendation.test.js` after existing `rerankCandidates` test

- [ ] **Step 1: Extend test imports**

Change top import from:

```javascript
const { rerankCandidates, scoreCandidate } = require('../public/app');
```

to:

```javascript
const { rerankCandidates, rerankDuplicateEvents, isSameEvent, scoreCandidate } = require('../public/app');
```

- [ ] **Step 2: Add failing tests**

Insert these tests after the existing `rerankCandidates limits same-source items in top 10 and avoids adjacent duplicates when alternatives exist` test:

```javascript
test('isSameEvent matches similar cross-platform titles in same 24-hour window', () => {
  const a = {
    id: 'weibo_1',
    title: '苹果发布新款 AI 芯片，性能大幅提升',
    timestamp: new Date('2026-05-20T09:00:00Z').getTime()
  };
  const b = {
    id: 'toutiao_1',
    title: '苹果新 AI 芯片发布 性能提升明显',
    timestamp: new Date('2026-05-20T18:00:00Z').getTime()
  };

  assert.equal(isSameEvent(a, b), true);
});

test('isSameEvent does not match shared generic words across different time windows', () => {
  const a = {
    id: 'rss_1',
    title: '苹果发布 AI 芯片计划',
    timestamp: new Date('2026-05-20T09:00:00Z').getTime()
  };
  const b = {
    id: 'rss_2',
    title: '苹果发布 AI 开发者工具',
    timestamp: new Date('2026-05-22T09:00:00Z').getTime()
  };

  assert.equal(isSameEvent(a, b), false);
});

test('rerankDuplicateEvents spreads duplicate event items outside a 5-item window', () => {
  const baseTime = new Date('2026-05-20T09:00:00Z').getTime();
  const items = [
    { id: 'd1', title: '苹果发布新款 AI 芯片 性能大幅提升', source: '微博', score: 100, timestamp: baseTime },
    { id: 'd2', title: '苹果新 AI 芯片发布 性能提升明显', source: '头条', score: 99, timestamp: baseTime + 1000 },
    { id: 'd3', title: '苹果 AI 芯片正式发布 性能升级', source: '知乎', score: 98, timestamp: baseTime + 2000 },
    { id: 'n1', title: 'OpenAI 发布新模型', source: 'IT之家', score: 97, timestamp: baseTime + 3000 },
    { id: 'n2', title: '新能源汽车销量增长', source: '36氪', score: 96, timestamp: baseTime + 4000 },
    { id: 'n3', title: '央行发布利率政策', source: '财新', score: 95, timestamp: baseTime + 5000 },
    { id: 'n4', title: '火星探测任务完成', source: '央视', score: 94, timestamp: baseTime + 6000 },
    { id: 'n5', title: '本地文旅消费升温', source: '澎湃', score: 93, timestamp: baseTime + 7000 },
    { id: 'd4', title: '苹果新款 AI 芯片性能提升', source: '百度', score: 92, timestamp: baseTime + 8000 }
  ];

  const result = rerankDuplicateEvents(items);

  assert.deepEqual(result.map(item => item.id).slice(0, 6), ['d1', 'n1', 'n2', 'n3', 'n4', 'n5']);
  assert.equal(result.length, items.length);
  assert.equal(new Set(result.map(item => item.id)).size, items.length);

  for (let i = 0; i < result.length; i++) {
    const windowItems = result.slice(Math.max(0, i - 4), i);
    assert.equal(windowItems.some(item => isSameEvent(item, result[i])), false);
  }
});

test('rerankDuplicateEvents keeps duplicate items when alternatives are exhausted', () => {
  const baseTime = new Date('2026-05-20T09:00:00Z').getTime();
  const items = [
    { id: 'd1', title: '苹果发布新款 AI 芯片 性能大幅提升', source: '微博', score: 100, timestamp: baseTime },
    { id: 'd2', title: '苹果新 AI 芯片发布 性能提升明显', source: '头条', score: 99, timestamp: baseTime + 1000 },
    { id: 'd3', title: '苹果 AI 芯片正式发布 性能升级', source: '知乎', score: 98, timestamp: baseTime + 2000 }
  ];

  const result = rerankDuplicateEvents(items);

  assert.deepEqual(result.map(item => item.id), ['d1', 'd2', 'd3']);
  assert.equal(result.length, items.length);
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
npm test -- test/recommendation.test.js
```

Expected: FAIL with error similar to `rerankDuplicateEvents is not a function` or `isSameEvent is not a function`.

## Task 2: Add event matching helpers

**Files:**
- Modify: `public/app.js:310-355`

- [ ] **Step 1: Add helper functions before `getReadPenalty`**

Insert this code before `function getReadPenalty(item, history) {`:

```javascript
const EVENT_STOP_WORDS = new Set([
  '一个', '一位', '相关', '最新', '正式', '宣布', '回应', '网友', '话题', '冲上', '热搜',
  '什么', '为何', '如何', '已经', '再次', '进行', '发布会', '消息', '视频', '全文'
]);

function normalizeEventTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[｜|].*$/g, '')
    .replace(/[-_—].*(微博|头条|知乎|百度|热搜|新闻).*$/g, '')
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function extractEventKeywords(title) {
  const normalized = normalizeEventTitle(title);
  const matches = normalized.match(/[\p{Script=Han}A-Za-z0-9]{2,}/gu) || [];
  const keywords = [];

  for (const word of matches) {
    if (/^\d+$/.test(word)) continue;
    if (word.length < 2) continue;
    if (EVENT_STOP_WORDS.has(word)) continue;
    if (!keywords.includes(word)) keywords.push(word);
    if (keywords.length >= 6) break;
  }

  for (const kws of Object.values(TOPIC_KEYWORDS)) {
    for (const kw of kws) {
      if (normalized.includes(kw.toLowerCase()) && !keywords.includes(kw)) {
        keywords.push(kw);
        if (keywords.length >= 6) return keywords;
      }
    }
  }

  return keywords;
}

function getEventWindow(item) {
  if (!item || !Number.isFinite(item.timestamp)) return null;
  return Math.floor(item.timestamp / 86400000);
}

function getOverlapCount(a, b) {
  const bSet = new Set(b);
  return a.filter(word => bSet.has(word)).length;
}

function isSameEvent(a, b) {
  const titleA = normalizeEventTitle(a && a.title);
  const titleB = normalizeEventTitle(b && b.title);
  if (!titleA || !titleB) return false;

  const windowA = getEventWindow(a);
  const windowB = getEventWindow(b);
  if (windowA !== null && windowB !== null && windowA !== windowB) return false;

  if (titleA.includes(titleB) || titleB.includes(titleA)) {
    return Math.min(titleA.length, titleB.length) >= 8;
  }

  const keywordsA = extractEventKeywords(titleA);
  const keywordsB = extractEventKeywords(titleB);
  const overlap = getOverlapCount(keywordsA, keywordsB);
  const minSize = Math.min(keywordsA.length, keywordsB.length);

  return overlap >= 2 && minSize >= 2;
}
```

- [ ] **Step 2: Export helpers**

Change module exports at bottom from:

```javascript
  module.exports = {
    rerankCandidates,
    scoreCandidate
  };
```

to:

```javascript
  module.exports = {
    normalizeEventTitle,
    extractEventKeywords,
    isSameEvent,
    rerankCandidates,
    scoreCandidate
  };
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
npm test -- test/recommendation.test.js
```

Expected: duplicate-event tests still FAIL because `rerankDuplicateEvents` is not exported/implemented; `isSameEvent` tests should now pass.

## Task 3: Add duplicate-event reranker

**Files:**
- Modify: `public/app.js:355-389`

- [ ] **Step 1: Add reranker after `rerankCandidates`**

Insert this code after the closing brace of `function rerankCandidates(items) { ... }`:

```javascript
function rerankDuplicateEvents(items, windowSize = 5) {
  const remaining = items.slice();
  const ranked = [];

  while (remaining.length) {
    let pickIndex = -1;

    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i];
      const recent = ranked.slice(Math.max(0, ranked.length - windowSize + 1));
      const duplicatesRecent = recent.some(selected => isSameEvent(selected, item));

      if (!duplicatesRecent) {
        pickIndex = i;
        break;
      }
    }

    if (pickIndex === -1) pickIndex = 0;

    const [picked] = remaining.splice(pickIndex, 1);
    ranked.push(picked);
  }

  return ranked;
}
```

- [ ] **Step 2: Export reranker**

Change module exports at bottom from:

```javascript
  module.exports = {
    normalizeEventTitle,
    extractEventKeywords,
    isSameEvent,
    rerankCandidates,
    scoreCandidate
  };
```

to:

```javascript
  module.exports = {
    normalizeEventTitle,
    extractEventKeywords,
    isSameEvent,
    rerankCandidates,
    rerankDuplicateEvents,
    scoreCandidate
  };
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
npm test -- test/recommendation.test.js
```

Expected: new duplicate-event tests PASS. Existing tests should keep same results.

## Task 4: Wire reranker into recommendation feed

**Files:**
- Modify: `public/app.js:484-489`

- [ ] **Step 1: Call duplicate-event reranker after source reranker**

Change:

```javascript
  const ranked = rerankCandidates(scored);
```

to:

```javascript
  const ranked = rerankDuplicateEvents(rerankCandidates(scored));
```

- [ ] **Step 2: Run focused recommendation tests**

Run:

```bash
npm test -- test/recommendation.test.js
```

Expected: PASS for recommendation tests.

- [ ] **Step 3: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS for all Node tests.

## Task 5: Manual browser verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Start app**

Run:

```bash
npm start
```

Expected: server starts without syntax errors and prints listening URL/port.

- [ ] **Step 2: Open recommendation page in browser**

Use local app URL printed by server. Verify recommendation tab renders.

Expected: feed loads normally; no console error from `rerankDuplicateEvents`, `isSameEvent`, or Unicode regex.

- [ ] **Step 3: Check behavior manually**

Scroll first 20 recommendation cards.

Expected: obvious repeated coverage of same event is less clustered; content count remains normal; hot tab behavior unchanged.

- [ ] **Step 4: Stop app**

Stop `npm start` process with Ctrl+C.

## Task 6: Review and commit

**Files:**
- Modified: `public/app.js`
- Modified: `test/recommendation.test.js`
- Existing design: `docs/superpowers/specs/2026-05-27-recommendation-duplicate-event-downrank-design.md`
- New plan: `docs/superpowers/plans/2026-05-27-recommendation-duplicate-event-downrank.md`

- [ ] **Step 1: Review diff**

Run:

```bash
git diff -- public/app.js test/recommendation.test.js docs/superpowers/specs/2026-05-27-recommendation-duplicate-event-downrank-design.md docs/superpowers/plans/2026-05-27-recommendation-duplicate-event-downrank.md
```

Expected: diff only contains duplicate-event design, plan, helper functions, reranker call, and tests.

- [ ] **Step 2: Commit changes**

Only commit if user asks to commit. If committing, use:

```bash
git add public/app.js test/recommendation.test.js docs/superpowers/specs/2026-05-27-recommendation-duplicate-event-downrank-design.md docs/superpowers/plans/2026-05-27-recommendation-duplicate-event-downrank.md
git commit -m "feat: downrank duplicate recommendation events"
```

Expected: commit succeeds without bypassing hooks.

## Self-Review

- Spec coverage: covered recommendation-only scope, weak downranking, title/keyword/time-window matching, 5-item window, item retention, length preservation, no backend/hot-tab changes, and tests.
- Placeholder scan: no TBD/TODO/fill-in placeholders.
- Type consistency: helpers use item fields already present in recommendation items: `title`, `timestamp`, `source`, `id`, `score`.
