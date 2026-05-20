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
