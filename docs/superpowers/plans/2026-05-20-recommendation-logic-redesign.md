# 智能推荐算法重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把推荐页改成“两阶段推荐 + 多样性重排”，减少同来源刷屏，同时保留相关性、热点感知和新鲜度。

**Architecture:** 推荐链路继续留在 `public/app.js`，但把当前 `buildHybridFeed()` 拆成候选池构建、单条打分、候选集合并、最终重排四段纯函数。测试放在 `test/recommendation.test.js`，优先验证来源配额、相邻去重、热点不过载、已读/不喜欢惩罚、候选池回流这几个关键行为。

**Tech Stack:** Vanilla JavaScript, browser localStorage, Node.js built-in test runner

---

## File Structure

- Modify: `public/app.js`
  - 保留现有状态、渲染、点击行为
  - 重构推荐构建逻辑，新增纯函数：
    - `getReadPenalty()`
    - `buildRecommendationContext()`
    - `buildCandidatePools()`
    - `scoreCandidate()`
    - `mergeCandidatePools()`
    - `rerankCandidates()`
    - `buildHybridFeed()`
- Create: `test/recommendation.test.js`
  - 覆盖推荐纯函数行为，不依赖 DOM

### Task 1: 为来源配额与相邻去重建立失败测试

**Files:**
- Create: `test/recommendation.test.js`
- Modify: `public/app.js`
- Test: `test/recommendation.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { rerankCandidates } = require('../public/app');

test('rerankCandidates limits same-source items in top 10 and avoids adjacent duplicates when alternatives exist', () => {
  const items = [
    { id: '1', source: '微博', title: '微博-A', type: 'hot', score: 100, topicKeys: ['娱乐'] },
    { id: '2', source: '微博', title: '微博-B', type: 'hot', score: 99, topicKeys: ['娱乐'] },
    { id: '3', source: '微博', title: '微博-C', type: 'hot', score: 98, topicKeys: ['娱乐'] },
    { id: '4', source: '微博', title: '微博-D', type: 'hot', score: 97, topicKeys: ['娱乐'] },
    { id: '5', source: '头条', title: '头条-A', type: 'hot', score: 96, topicKeys: ['社会'] },
    { id: '6', source: '百度', title: '百度-A', type: 'hot', score: 95, topicKeys: ['科技'] },
    { id: '7', source: 'IT之家', title: 'RSS-A', type: 'rss', score: 94, topicKeys: ['科技'] },
    { id: '8', source: '36氪', title: 'RSS-B', type: 'rss', score: 93, topicKeys: ['财经'] },
    { id: '9', source: '虎嗅', title: 'RSS-C', type: 'rss', score: 92, topicKeys: ['科技'] },
    { id: '10', source: '少数派', title: 'RSS-D', type: 'rss', score: 91, topicKeys: ['效率'] },
    { id: '11', source: '知乎', title: '知乎-A', type: 'hot', score: 90, topicKeys: ['教育'] },
    { id: '12', source: '虎扑', title: '虎扑-A', type: 'hot', score: 89, topicKeys: ['体育'] }
  ];

  const result = rerankCandidates(items);
  const top10 = result.slice(0, 10);
  const weiboCount = top10.filter(item => item.source === '微博').length;

  assert.ok(weiboCount <= 3);

  for (let i = 1; i < top10.length; i++) {
    assert.notEqual(top10[i].source, top10[i - 1].source);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "D:/Git/heikesong/toutiao/test/recommendation.test.js"`
Expected: FAIL with `rerankCandidates is not a function` or same-source assertions failing

- [ ] **Step 3: Write minimal implementation**

在 `public/app.js` 的推荐逻辑区域新增可导出的 `rerankCandidates()`，先只做来源配额和相邻去重。

```js
function rerankCandidates(items) {
  const sourceQuota = new Map();
  const remaining = items.slice();
  const ranked = [];

  while (remaining.length) {
    let pickIndex = -1;

    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i];
      const count = sourceQuota.get(item.source) || 0;
      const prev = ranked[ranked.length - 1];
      const violatesQuota = ranked.length < 10 && count >= 3;
      const violatesAdjacent = prev && prev.source === item.source;
      if (!violatesQuota && !violatesAdjacent) {
        pickIndex = i;
        break;
      }
    }

    if (pickIndex === -1) pickIndex = 0;

    const [picked] = remaining.splice(pickIndex, 1);
    ranked.push(picked);
    sourceQuota.set(picked.source, (sourceQuota.get(picked.source) || 0) + 1);
  }

  return ranked;
}
```

并在文件底部导出：

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    rerankCandidates
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "D:/Git/heikesong/toutiao/test/recommendation.test.js"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/app.js test/recommendation.test.js
git commit -m "test: cover recommendation source diversity"
```

### Task 2: 为热点不过载与已读/不喜欢惩罚建立失败测试并补打分函数

**Files:**
- Modify: `test/recommendation.test.js`
- Modify: `public/app.js`
- Test: `test/recommendation.test.js`

- [ ] **Step 1: Write the failing test**

在 `test/recommendation.test.js` 追加两个测试：

```js
const { scoreCandidate } = require('../public/app');

test('scoreCandidate keeps strong-interest rss above generic hot item', () => {
  const context = {
    now: new Date('2026-05-20T12:00:00Z').getTime(),
    interests: ['科技'],
    behaviorWeights: { AI: 3 },
    disliked: [],
    history: []
  };

  const rssItem = {
    id: 'rss_1',
    title: 'AI 芯片新突破',
    source: 'IT之家',
    type: 'rss',
    heatScore: 0,
    timestamp: new Date('2026-05-20T10:00:00Z').getTime(),
    topicKeys: ['科技']
  };

  const hotItem = {
    id: 'hot_1',
    title: '某明星新动态',
    source: '微博',
    type: 'hot',
    heatScore: 100,
    timestamp: new Date('2026-05-20T11:30:00Z').getTime(),
    topicKeys: ['娱乐']
  };

  const rssScore = scoreCandidate(rssItem, context).score;
  const hotScore = scoreCandidate(hotItem, { ...context, maxHeat: 100 }).score;

  assert.ok(rssScore > hotScore);
});

test('scoreCandidate heavily penalizes disliked and previously read items', () => {
  const now = new Date('2026-05-20T12:00:00Z').getTime();
  const context = {
    now,
    interests: ['科技'],
    behaviorWeights: { AI: 2 },
    disliked: ['AI'],
    history: [{ title: 'AI 芯片新突破', url: 'https://example.com/a', timestamp: now - 1000 }],
    maxHeat: 100
  };

  const item = {
    id: 'rss_2',
    title: 'AI 芯片新突破',
    url: 'https://example.com/a',
    source: 'IT之家',
    type: 'rss',
    heatScore: 0,
    timestamp: now - 3600000,
    topicKeys: ['科技']
  };

  const result = scoreCandidate(item, context);
  assert.ok(result.score < 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "D:/Git/heikesong/toutiao/test/recommendation.test.js"`
Expected: FAIL with `scoreCandidate is not a function` or score assertions failing

- [ ] **Step 3: Write minimal implementation**

在 `public/app.js` 新增 `scoreCandidate()` 与 `getReadPenalty()`，先把打分拆出来，移除大随机抖动。

```js
function getReadPenalty(item, history) {
  return history.some(h => h.url && item.url && h.url === item.url)
    || history.some(h => h.title === item.title)
    ? 45
    : 0;
}

function scoreCandidate(item, context) {
  const now = context.now;
  const ageHours = (now - item.timestamp) / 3600000;
  const ageMinutes = (now - item.timestamp) / 60000;
  let score = 0;

  if (item.type === 'hot') {
    score += ((item.heatScore || 0) / (context.maxHeat || 1)) * 18;
  }

  if (ageHours <= 24) score += 18;
  else if (ageHours <= 72) score += Math.max(4, 18 - (ageHours - 24) * 0.25);

  for (const tag of context.interests) {
    const kws = TOPIC_KEYWORDS[tag] || [];
    if (kws.some(kw => item.title.includes(kw))) {
      score += 28;
      break;
    }
  }

  for (const [kw, weight] of Object.entries(context.behaviorWeights)) {
    if (item.title.includes(kw)) {
      score += Math.min(weight * 3, 12);
      break;
    }
  }

  if ((context.disliked || []).some(kw => item.title.includes(kw))) score -= 50;
  score -= getReadPenalty(item, context.history || []);

  return { ...item, score };
}
```

并把 `scoreCandidate` 导出：

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    rerankCandidates,
    scoreCandidate
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "D:/Git/heikesong/toutiao/test/recommendation.test.js"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/app.js test/recommendation.test.js
git commit -m "feat: split recommendation scoring rules"
```

### Task 3: 为候选池与配额回流建立失败测试并接入两阶段推荐

**Files:**
- Modify: `test/recommendation.test.js`
- Modify: `public/app.js:247-347`
- Test: `test/recommendation.test.js`

- [ ] **Step 1: Write the failing test**

在 `test/recommendation.test.js` 追加两个测试：

```js
const { buildCandidatePools, mergeCandidatePools } = require('../public/app');

test('buildCandidatePools splits items into interest fresh hot and explore pools', () => {
  const now = new Date('2026-05-20T12:00:00Z').getTime();
  const items = [
    { id: '1', title: 'AI 芯片新闻', source: 'IT之家', type: 'rss', timestamp: now - 3600000, heatScore: 0, topicKeys: ['科技'] },
    { id: '2', title: '普通新文章', source: '少数派', type: 'rss', timestamp: now - 7200000, heatScore: 0, topicKeys: [] },
    { id: '3', title: '热搜事件', source: '微博', type: 'hot', timestamp: now - 1800000, heatScore: 100, topicKeys: ['社会'] },
    { id: '4', title: '冷门文章', source: '虎嗅', type: 'rss', timestamp: now - 86400000 * 2, heatScore: 0, topicKeys: [] }
  ];

  const pools = buildCandidatePools(items, {
    now,
    interests: ['科技'],
    behaviorWeights: { AI: 2 }
  });

  assert.deepEqual(pools.interest.map(item => item.id), ['1']);
  assert.deepEqual(pools.hot.map(item => item.id), ['3']);
  assert.deepEqual(pools.fresh.map(item => item.id), ['2']);
  assert.deepEqual(pools.explore.map(item => item.id), ['4']);
});

test('mergeCandidatePools backfills from remaining pools when one pool lacks enough items', () => {
  const pools = {
    interest: [{ id: 'i1' }],
    fresh: [{ id: 'f1' }],
    hot: [],
    explore: [{ id: 'e1' }, { id: 'e2' }]
  };

  const merged = mergeCandidatePools(pools, 6);
  assert.equal(merged.length, 4);
  assert.deepEqual(merged.map(item => item.id), ['i1', 'f1', 'e1', 'e2']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "D:/Git/heikesong/toutiao/test/recommendation.test.js"`
Expected: FAIL with `buildCandidatePools is not a function` or `mergeCandidatePools is not a function`

- [ ] **Step 3: Write minimal implementation**

在 `public/app.js` 中新增候选池函数，并把 `buildHybridFeed()` 改成两阶段入口。

```js
function buildCandidatePools(items, context) {
  const pools = { interest: [], fresh: [], hot: [], explore: [] };

  for (const item of items) {
    const interestHit = context.interests.some(tag => {
      const kws = TOPIC_KEYWORDS[tag] || [];
      return kws.some(kw => item.title.includes(kw));
    }) || Object.keys(context.behaviorWeights).some(kw => item.title.includes(kw));

    const ageHours = (context.now - item.timestamp) / 3600000;

    if (interestHit) pools.interest.push(item);
    else if (item.type === 'hot') pools.hot.push(item);
    else if (ageHours <= 24) pools.fresh.push(item);
    else pools.explore.push(item);
  }

  return pools;
}

function mergeCandidatePools(pools, limit) {
  const plan = [
    ['interest', Math.ceil(limit * 0.5)],
    ['fresh', Math.ceil(limit * 0.2)],
    ['hot', Math.ceil(limit * 0.2)],
    ['explore', Math.ceil(limit * 0.1)]
  ];
  const merged = [];
  const leftovers = [];

  for (const [name, quota] of plan) {
    const list = pools[name] || [];
    merged.push(...list.slice(0, quota));
    leftovers.push(...list.slice(quota));
  }

  if (merged.length < limit) {
    merged.push(...leftovers.slice(0, limit - merged.length));
  }

  return merged;
}

function buildHybridFeed() {
  const now = Date.now();
  const unified = [];

  for (const a of state.articles) {
    unified.push({
      id: 'rss_' + a.id,
      title: a.title,
      url: a.link || '',
      image: a.image_url || null,
      source: a.source_name,
      type: 'rss',
      heatScore: 0,
      timestamp: a.pub_date ? new Date(a.pub_date).getTime() : now
    });
  }

  for (const h of state.hotItems) {
    unified.push({
      id: h.id,
      title: h.title,
      url: h.url || '',
      image: h.image || null,
      source: getPlatformName(h.platform),
      platform: h.platform,
      type: 'hot',
      heatScore: h.heatScore || 0,
      timestamp: h.timestamp || now
    });
  }

  const context = {
    now,
    interests: state.recommender.interests,
    behaviorWeights: state.recommender.getBehaviorWeights(),
    disliked: getDisliked(),
    history: state.recommender.history,
    maxHeat: Math.max(...unified.map(item => item.heatScore || 0), 1)
  };

  const pools = buildCandidatePools(unified, context);
  const candidateLimit = Math.max(unified.length, 20);
  const merged = mergeCandidatePools(pools, candidateLimit);
  const scored = merged.map(item => scoreCandidate(item, context));
  scored.sort((a, b) => b.score - a.score);
  return rerankCandidates(scored);
}
```

并导出：

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildCandidatePools,
    mergeCandidatePools,
    rerankCandidates,
    scoreCandidate
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "D:/Git/heikesong/toutiao/test/recommendation.test.js"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/app.js test/recommendation.test.js
git commit -m "feat: add two-stage recommendation pipeline"
```

### Task 4: 为主题衰减补回归测试并完成最终重排

**Files:**
- Modify: `test/recommendation.test.js`
- Modify: `public/app.js`
- Test: `test/recommendation.test.js`

- [ ] **Step 1: Write the failing test**

在 `test/recommendation.test.js` 追加测试：

```js
test('rerankCandidates reduces repeated topics when alternatives exist', () => {
  const items = [
    { id: '1', source: 'IT之家', title: 'AI 芯片 A', type: 'rss', score: 100, topicKeys: ['科技'] },
    { id: '2', source: '36氪', title: 'AI 芯片 B', type: 'rss', score: 99, topicKeys: ['科技'] },
    { id: '3', source: '虎嗅', title: 'AI 芯片 C', type: 'rss', score: 98, topicKeys: ['科技'] },
    { id: '4', source: '微博', title: '体育热点', type: 'hot', score: 97, topicKeys: ['体育'] },
    { id: '5', source: '百度', title: '财经热点', type: 'hot', score: 96, topicKeys: ['财经'] }
  ];

  const result = rerankCandidates(items);
  assert.notDeepEqual(result.slice(0, 3).map(item => item.topicKeys[0]), ['科技', '科技', '科技']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "D:/Git/heikesong/toutiao/test/recommendation.test.js"`
Expected: FAIL because first 3 items remain same topic

- [ ] **Step 3: Write minimal implementation**

在 `public/app.js` 里让 `buildHybridFeed()` 为每条内容补 `topicKeys`，并在 `rerankCandidates()` 中加入主题衰减优先选择逻辑。

```js
function getTopicKeys(title) {
  return Object.entries(TOPIC_KEYWORDS)
    .filter(([, kws]) => kws.some(kw => title.includes(kw)))
    .map(([topic]) => topic);
}
```

把统一内容构造改成：

```js
topicKeys: getTopicKeys(a.title)
```

和：

```js
topicKeys: getTopicKeys(h.title)
```

把 `rerankCandidates()` 中选择候选逻辑改成：

```js
const recentTopics = ranked.slice(-2).flatMap(item => item.topicKeys || []);
const repeatsTopic = (item.topicKeys || []).some(topic => recentTopics.includes(topic));
if (!violatesQuota && !violatesAdjacent && !repeatsTopic) {
  pickIndex = i;
  break;
}
```

如果找不到完全满足条件的候选，再按原来的回退逻辑取第一个。

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test "D:/Git/heikesong/toutiao/test/recommendation.test.js" "D:/Git/heikesong/toutiao/test/init-load.test.js" "D:/Git/heikesong/toutiao/test/digest.test.js"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/app.js test/recommendation.test.js
git commit -m "feat: diversify recommendation topics"
```

### Task 5: 全量回归验证推荐链路

**Files:**
- Test: `test/recommendation.test.js`
- Test: `test/init-load.test.js`
- Test: `test/digest.test.js`
- Modify: `public/app.js` (only if regression fix needed)

- [ ] **Step 1: Extend the failing regression test if any missed behavior is found**

如果在回归中发现推荐链路行为漂移，先在 `test/recommendation.test.js` 补最小失败用例，例如：

```js
test('mergeCandidatePools keeps all available candidates when total count is below target limit', () => {
  const pools = {
    interest: [{ id: 'i1' }],
    fresh: [],
    hot: [{ id: 'h1' }],
    explore: []
  };

  assert.deepEqual(mergeCandidatePools(pools, 10).map(item => item.id), ['i1', 'h1']);
});
```

- [ ] **Step 2: Run targeted tests**

Run: `node --test "D:/Git/heikesong/toutiao/test/recommendation.test.js" "D:/Git/heikesong/toutiao/test/init-load.test.js" "D:/Git/heikesong/toutiao/test/digest.test.js"`
Expected: PASS with 0 failures

- [ ] **Step 3: Apply minimal regression fix if needed**

如果测试失败，只修 `public/app.js` 推荐构建逻辑，不改无关渲染与接口代码。

- [ ] **Step 4: Run full tests**

Run: `npm test`
Expected: PASS with 0 failures

- [ ] **Step 5: Commit**

```bash
git add public/app.js test/recommendation.test.js test/init-load.test.js test/digest.test.js
git commit -m "test: verify recommendation pipeline regressions"
```
