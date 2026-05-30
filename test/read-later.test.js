const test = require('node:test');
const assert = require('node:assert/strict');
const { getReadLaterList, toggleReadLater, isReadLater } = require('../public/app');

// Mock localStorage
const mockStorage = {};
global.localStorage = {
  getItem: (key) => mockStorage[key] || '[]',
  setItem: (key, value) => { mockStorage[key] = value; },
  removeItem: (key) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

// ── getReadLaterList ──

test('getReadLaterList returns empty array when no items saved', () => {
  localStorage.clear();
  const list = getReadLaterList();
  assert.deepEqual(list, []);
});

test('getReadLaterList returns saved items', () => {
  localStorage.clear();
  const items = [
    { id: 'rss_1', title: 'Article 1', url: 'https://a.com/1', source: 'IT之家', timestamp: Date.now() },
    { id: 'rss_2', title: 'Article 2', url: 'https://a.com/2', source: '36氪', timestamp: Date.now() },
  ];
  localStorage.setItem('toutiao_readLater', JSON.stringify(items));

  const list = getReadLaterList();
  assert.equal(list.length, 2);
  assert.equal(list[0].title, 'Article 1');
  assert.equal(list[1].title, 'Article 2');
});

// ── isReadLater ──

test('isReadLater returns true for saved items', () => {
  localStorage.clear();
  const items = [
    { id: 'rss_1', title: 'Article 1', url: 'https://a.com/1', source: 'IT之家', timestamp: Date.now() },
  ];
  localStorage.setItem('toutiao_readLater', JSON.stringify(items));

  assert.equal(isReadLater('rss_1'), true);
  assert.equal(isReadLater('rss_2'), false);
});

test('isReadLater returns false when list is empty', () => {
  localStorage.clear();
  assert.equal(isReadLater('rss_1'), false);
});

// ── toggleReadLater ──

test('toggleReadLater adds item to list', () => {
  localStorage.clear();
  const article = {
    id: 'rss_1',
    title: 'Article 1',
    url: 'https://a.com/1',
    source: 'IT之家',
    type: 'rss',
    image: null
  };

  toggleReadLater(article);
  const list = getReadLaterList();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'rss_1');
  assert.equal(list[0].title, 'Article 1');
});

test('toggleReadLater removes item from list', () => {
  localStorage.clear();
  const article = {
    id: 'rss_1',
    title: 'Article 1',
    url: 'https://a.com/1',
    source: 'IT之家',
    type: 'rss',
    image: null
  };

  toggleReadLater(article);
  toggleReadLater(article);
  const list = getReadLaterList();
  assert.equal(list.length, 0);
});

test('toggleReadLater preserves existing items when adding new', () => {
  localStorage.clear();
  const article1 = {
    id: 'rss_1',
    title: 'Article 1',
    url: 'https://a.com/1',
    source: 'IT之家',
    type: 'rss',
    image: null
  };
  const article2 = {
    id: 'rss_2',
    title: 'Article 2',
    url: 'https://a.com/2',
    source: '36氪',
    type: 'rss',
    image: null
  };

  toggleReadLater(article1);
  toggleReadLater(article2);
  const list = getReadLaterList();
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 'rss_2'); // Newer first
  assert.equal(list[1].id, 'rss_1');
});
