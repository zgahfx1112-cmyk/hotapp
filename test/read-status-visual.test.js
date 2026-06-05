const test = require('node:test');
const assert = require('node:assert/strict');
const { isArticleRead } = require('../public/app');

// ── 热搜项已读状态检测 ──

test('isArticleRead detects hot items as read when title matches history', () => {
  const history = [
    { title: '某明星官宣结婚', url: 'https://weibo.com/123', type: 'hot', timestamp: Date.now() },
    { title: 'AI大模型新突破', url: 'https://weibo.com/456', type: 'hot', timestamp: Date.now() },
  ];

  assert.equal(isArticleRead({ title: '某明星官宣结婚', url: 'https://weibo.com/123' }, history), true);
  assert.equal(isArticleRead({ title: 'AI大模型新突破', url: 'https://weibo.com/456' }, history), true);
});

test('isArticleRead returns false for unread hot items', () => {
  const history = [
    { title: '某明星官宣结婚', url: 'https://weibo.com/123', type: 'hot', timestamp: Date.now() },
  ];

  assert.equal(isArticleRead({ title: '今日股市大涨', url: 'https://weibo.com/789' }, history), false);
});

test('isArticleRead matches hot item by URL when title differs slightly', () => {
  const history = [
    { title: '某明星官宣结婚', url: 'https://weibo.com/123', type: 'hot', timestamp: Date.now() },
  ];

  assert.equal(isArticleRead({ title: '某明星官宣结婚！', url: 'https://weibo.com/123' }, history), true);
});

test('isArticleRead works with empty URL for hot items (title-only match)', () => {
  const history = [
    { title: '某明星官宣结婚', url: '', type: 'hot', timestamp: Date.now() },
  ];

  assert.equal(isArticleRead({ title: '某明星官宣结婚', url: '' }, history), true);
  assert.equal(isArticleRead({ title: '完全不同的热搜', url: '' }, history), false);
});

// ── 每日摘要项已读状态检测 ──

test('isArticleRead detects digest items as read when title matches', () => {
  const history = [
    { title: '苹果发布新iPhone', url: 'https://toutiao.com/1', type: 'hot', timestamp: Date.now() },
    { title: '新能源汽车降价潮', url: 'https://weibo.com/2', type: 'hot', timestamp: Date.now() },
  ];

  assert.equal(isArticleRead({ title: '苹果发布新iPhone', url: 'https://toutiao.com/1' }, history), true);
  assert.equal(isArticleRead({ title: '新能源汽车降价潮', url: 'https://weibo.com/2' }, history), true);
  assert.equal(isArticleRead({ title: '未读的新闻', url: 'https://baidu.com/3' }, history), false);
});

// ── 边界情况 ──

test('isArticleRead handles history with items missing url', () => {
  const history = [
    { title: '某热搜话题', keywords: [], type: 'hot', timestamp: Date.now() },
  ];

  assert.equal(isArticleRead({ title: '某热搜话题', url: 'https://weibo.com/1' }, history), true);
});

test('isArticleRead handles article with null/undefined fields', () => {
  const history = [
    { title: '某热搜', url: 'https://weibo.com/1', timestamp: Date.now() },
  ];

  assert.equal(isArticleRead({ title: null, url: null }, history), false);
  assert.equal(isArticleRead({}, history), false);
});

test('isArticleRead with large history (performance)', () => {
  const history = Array.from({ length: 200 }, (_, i) => ({
    title: `话题${i}`,
    url: `https://example.com/${i}`,
    timestamp: Date.now(),
  }));

  assert.equal(isArticleRead({ title: '话题199', url: 'https://example.com/199' }, history), true);
  assert.equal(isArticleRead({ title: '不存在的话题', url: 'https://example.com/999' }, history), false);
});
