const test = require('node:test');
const assert = require('node:assert/strict');
// TOPIC_KEYWORDS 已移至独立文件，测试时先加载它
require('../public/topic-keywords');
const { selectRecommendDigestItems, getDigestLabel } = require('../public/digest');

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

test('selectRecommendDigestItems prioritizes items matching user interests', () => {
  const items = [
    { id: '1', platform: 'weibo', title: '某明星结婚' },
    { id: '2', platform: 'baidu', title: 'AI芯片重大突破' },
    { id: '3', platform: 'toutiao', title: '股市今日大涨' },
    { id: '4', platform: 'weibo', title: '新能源汽车销量创新高' },
    { id: '5', platform: 'baidu', title: '综艺节目收视率' }
  ];
  const interests = ['科技'];

  const result = selectRecommendDigestItems(items, interests);
  // 科技相关的 id:2, id:4 应该排在前面
  assert.equal(result[0].id, '2'); // AI芯片
  assert.equal(result[1].id, '4'); // 新能源
});

test('selectRecommendDigestItems returns top 5 when interests provided but no matches', () => {
  const items = [
    { id: '1', platform: 'weibo', title: '明星A' },
    { id: '2', platform: 'baidu', title: '明星B' },
    { id: '3', platform: 'toutiao', title: '明星C' },
    { id: '4', platform: 'weibo', title: '明星D' },
    { id: '5', platform: 'baidu', title: '明星E' },
    { id: '6', platform: 'toutiao', title: '明星F' }
  ];
  const interests = ['科技'];

  const result = selectRecommendDigestItems(items, interests);
  assert.equal(result.length, 5);
});

test('getDigestLabel returns correct time-based label', () => {
  const { getDigestLabel } = require('../public/digest');

  // 早上 8点
  assert.equal(getDigestLabel(8), '☀️ 早间热榜');
  // 早上 10点
  assert.equal(getDigestLabel(10), '☀️ 早间热榜');

  // 中午 12点
  assert.equal(getDigestLabel(12), '🌞 午间热榜');
  // 下午 16点
  assert.equal(getDigestLabel(16), '🌞 午间热榜');

  // 晚上 20点
  assert.equal(getDigestLabel(20), '🌙 晚间热榜');
  // 凌晨 2点
  assert.equal(getDigestLabel(2), '🌙 晚间热榜');
});
