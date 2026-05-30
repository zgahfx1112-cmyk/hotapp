const test = require('node:test');
const assert = require('node:assert/strict');
const { isArticleRead, getUnreadCount } = require('../public/app');

// ── isArticleRead ──

test('isArticleRead returns true for articles in history with matching URL', () => {
  const history = [
    { title: 'AI 芯片新突破', url: 'https://example.com/a', timestamp: Date.now() },
    { title: '新能源汽车销量', url: 'https://example.com/b', timestamp: Date.now() },
  ];

  const article = { title: 'AI 芯片新突破', url: 'https://example.com/a' };
  assert.equal(isArticleRead(article, history), true);
});

test('isArticleRead returns true for articles in history with matching title', () => {
  const history = [
    { title: 'AI 芯片新突破', url: 'https://old.com/a', timestamp: Date.now() },
  ];

  const article = { title: 'AI 芯片新突破', url: 'https://new.com/a' };
  assert.equal(isArticleRead(article, history), true);
});

test('isArticleRead returns false for articles not in history', () => {
  const history = [
    { title: 'AI 芯片新突破', url: 'https://example.com/a', timestamp: Date.now() },
  ];

  const article = { title: '新能源汽车销量', url: 'https://example.com/b' };
  assert.equal(isArticleRead(article, history), false);
});

test('isArticleRead handles empty history', () => {
  const article = { title: 'AI 芯片新突破', url: 'https://example.com/a' };
  assert.equal(isArticleRead(article, []), false);
});

test('isArticleRead handles article with missing URL', () => {
  const history = [
    { title: 'AI 芯片新突破', url: 'https://example.com/a', timestamp: Date.now() },
  ];

  const article = { title: 'AI 芯片新突破' };
  assert.equal(isArticleRead(article, history), true);
});

// ── getUnreadCount ──

test('getUnreadCount returns correct count for mixed read/unread articles', () => {
  const articles = [
    { title: 'Article 1', url: 'https://a.com/1' },
    { title: 'Article 2', url: 'https://a.com/2' },
    { title: 'Article 3', url: 'https://a.com/3' },
  ];
  const history = [
    { title: 'Article 1', url: 'https://a.com/1', timestamp: Date.now() },
  ];

  assert.equal(getUnreadCount(articles, history), 2);
});

test('getUnreadCount returns 0 when all articles are read', () => {
  const articles = [
    { title: 'Article 1', url: 'https://a.com/1' },
    { title: 'Article 2', url: 'https://a.com/2' },
  ];
  const history = [
    { title: 'Article 1', url: 'https://a.com/1', timestamp: Date.now() },
    { title: 'Article 2', url: 'https://a.com/2', timestamp: Date.now() },
  ];

  assert.equal(getUnreadCount(articles, history), 0);
});

test('getUnreadCount returns total count when no articles are read', () => {
  const articles = [
    { title: 'Article 1', url: 'https://a.com/1' },
    { title: 'Article 2', url: 'https://a.com/2' },
    { title: 'Article 3', url: 'https://a.com/3' },
  ];
  const history = [];

  assert.equal(getUnreadCount(articles, history), 3);
});

test('getUnreadCount handles empty article list', () => {
  const history = [
    { title: 'Article 1', url: 'https://a.com/1', timestamp: Date.now() },
  ];

  assert.equal(getUnreadCount([], history), 0);
});
