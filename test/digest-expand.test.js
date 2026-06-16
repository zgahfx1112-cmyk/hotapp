const test = require('node:test');
const assert = require('node:assert/strict');
global.TOPIC_KEYWORDS = require('../public/topic-keywords');
const { selectRecommendDigestItems, selectRecommendDigestTop10 } = require('../public/digest');

test('Top10 first 5 items equal Top5 items in order', () => {
  const items = [
    { id: '1', platform: 'weibo', title: '热搜A' },
    { id: '2', platform: 'baidu', title: '热搜B' },
    { id: '3', platform: 'toutiao', title: '热搜C' },
    { id: '4', platform: 'weibo', title: '热搜D' },
    { id: '5', platform: 'baidu', title: '热搜E' },
    { id: '6', platform: 'toutiao', title: '热搜F' },
    { id: '7', platform: 'weibo', title: '热搜G' },
    { id: '8', platform: 'baidu', title: '热搜H' },
    { id: '9', platform: 'toutiao', title: '热搜I' },
    { id: '10', platform: 'weibo', title: '热搜J' },
    { id: '11', platform: 'baidu', title: '热搜K' },
    { id: '12', platform: 'toutiao', title: '热搜L' }
  ];

  const top5 = selectRecommendDigestItems(items);
  const top10 = selectRecommendDigestTop10(items);

  assert.equal(top5.length, 5);
  assert.equal(top10.length, 10);

  for (let i = 0; i < 5; i++) {
    assert.equal(top10[i].id, top5[i].id, `Top10[${i}] should equal Top5[${i}]`);
  }
});

test('Top10 returns up to 10 items from approved platforms', () => {
  const items = [
    { id: '1', platform: 'weibo' },
    { id: '2', platform: 'baidu' },
    { id: '3', platform: 'toutiao' },
    { id: '4', platform: 'weibo' },
    { id: '5', platform: 'baidu' },
    { id: '6', platform: 'toutiao' },
    { id: '7', platform: 'weibo' },
    { id: '8', platform: 'baidu' },
    { id: '9', platform: 'toutiao' },
    { id: '10', platform: 'weibo' },
    { id: '11', platform: 'douyin' },
    { id: '12', platform: 'bilibili' }
  ];

  const top10 = selectRecommendDigestTop10(items);
  assert.equal(top10.length, 10);
  const ids = top10.map(i => i.id);
  assert.ok(!ids.includes('11'), 'douyin item should not be included');
  assert.ok(!ids.includes('12'), 'bilibili item should not be included');
});

test('selectRecommendDigestItems respects custom limit parameter', () => {
  const items = [
    { id: '1', platform: 'weibo' },
    { id: '2', platform: 'baidu' },
    { id: '3', platform: 'toutiao' },
    { id: '4', platform: 'weibo' },
    { id: '5', platform: 'baidu' },
    { id: '6', platform: 'toutiao' },
    { id: '7', platform: 'weibo' }
  ];

  const top3 = selectRecommendDigestItems(items, [], null, 3);
  assert.equal(top3.length, 3);
  assert.equal(top3[0].id, '1');
  assert.equal(top3[1].id, '2');
  assert.equal(top3[2].id, '3');
});

test('Top10 with interests maintains priority order in first 5', () => {
  const items = [
    { id: '1', platform: 'weibo', title: '明星八卦' },
    { id: '2', platform: 'baidu', title: 'AI芯片突破' },
    { id: '3', platform: 'toutiao', title: '股市大涨' },
    { id: '4', platform: 'weibo', title: '新能源汽车' },
    { id: '5', platform: 'baidu', title: '综艺节目' },
    { id: '6', platform: 'toutiao', title: '量子计算' },
    { id: '7', platform: 'weibo', title: '电影上映' },
    { id: '8', platform: 'baidu', title: '华为新品' },
    { id: '9', platform: 'toutiao', title: '足球比赛' },
    { id: '10', platform: 'weibo', title: '5G商用' }
  ];
  const interests = ['科技'];

  const top5 = selectRecommendDigestItems(items, interests);
  const top10 = selectRecommendDigestTop10(items, interests);

  for (let i = 0; i < Math.min(5, top5.length); i++) {
    assert.equal(top10[i].id, top5[i].id, `with interests: Top10[${i}] should equal Top5[${i}]`);
  }
});

test('Top10 handles fewer than 10 approved items gracefully', () => {
  const items = [
    { id: '1', platform: 'weibo' },
    { id: '2', platform: 'baidu' },
    { id: '3', platform: 'toutiao' }
  ];

  const top10 = selectRecommendDigestTop10(items);
  assert.equal(top10.length, 3);
});
