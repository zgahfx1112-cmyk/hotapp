const test = require('node:test');
const assert = require('node:assert/strict');
const { rerankCandidates, scoreCandidate } = require('../public/app');

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
  // 微博 is a priority source, allowed up to 5 in top 10
  assert.ok(weiboCount <= 5);
  // 非优先 sources capped at 3
  const baiduCount = top10.filter(item => item.source === '百度').length;
  assert.ok(baiduCount <= 3);

  for (let i = 1; i < top10.length; i++) {
    assert.notEqual(top10[i].source, top10[i - 1].source);
  }
});

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

  test('scoreCandidate boosts 头条 and 微博 above other sources', () => {
  const now = new Date('2026-05-20T12:00:00Z').getTime();
  const context = {
    now,
    interests: [],
    behaviorWeights: {},
    disliked: [],
    history: [],
    maxHeat: 100
  };

  const toutiaoItem = {
    id: 'h1', title: '新闻-A', source: '头条', type: 'hot',
    heatScore: 80, timestamp: now - 3600000, topicKeys: ['社会']
  };
  const weiboItem = {
    id: 'h2', title: '新闻-B', source: '微博', type: 'hot',
    heatScore: 80, timestamp: now - 3600000, topicKeys: ['娱乐']
  };
  const baiduItem = {
    id: 'h3', title: '新闻-C', source: '百度', type: 'hot',
    heatScore: 80, timestamp: now - 3600000, topicKeys: ['科技']
  };

  const tScore = scoreCandidate(toutiaoItem, context).score;
  const wScore = scoreCandidate(weiboItem, context).score;
  const bScore = scoreCandidate(baiduItem, context).score;

  assert.ok(tScore > bScore);
  assert.ok(wScore > bScore);
  assert.ok(tScore - bScore >= 6);
  assert.ok(wScore - bScore >= 6);
});

test('rerankCandidates allows up to 5 头条/微博 items in top 10', () => {
  const items = [];
  for (let i = 0; i < 6; i++) items.push({ id: `t${i}`, source: '头条', title: `头条-${i}`, type: 'hot', score: 100 - i, topicKeys: ['社会'] });
  for (let i = 0; i < 6; i++) items.push({ id: `w${i}`, source: '微博', title: `微博-${i}`, type: 'hot', score: 94 - i, topicKeys: ['娱乐'] });
  items.push({ id: 'b1', source: '百度', title: '百度-A', type: 'hot', score: 88, topicKeys: ['科技'] });
  items.push({ id: 'z1', source: '知乎', title: '知乎-A', type: 'hot', score: 87, topicKeys: ['教育'] });

  const result = rerankCandidates(items);
  const top10 = result.slice(0, 10);
  const toutiaoCount = top10.filter(i => i.source === '头条').length;
  const weiboCount = top10.filter(i => i.source === '微博').length;

  assert.ok(toutiaoCount <= 5);
  assert.ok(weiboCount <= 5);
});

const result = scoreCandidate(item, context);
  assert.ok(result.score < 0);
});
