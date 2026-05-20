const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSourcesConfig, filterDisabledSources } = require('../sources-config');

test('loadSourcesConfig excludes disabled stale feeds', () => {
  const names = loadSourcesConfig().map(source => source.name);

  assert.equal(names.includes('人民网-时政'), false);
  assert.equal(names.includes('人民网-国际'), false);
  assert.equal(names.includes('人民网-观点'), false);
  assert.equal(names.includes('人民网-社会'), false);
  assert.equal(names.includes('极客公园'), false);
  assert.equal(names.includes('IT之家'), true);
});

test('filterDisabledSources removes disabled feeds from database results', () => {
  const rows = [
    { id: 1, name: '人民网-时政', feed_url: 'http://www.people.com.cn/rss/politics.xml' },
    { id: 2, name: 'IT之家', feed_url: 'https://www.ithome.com/rss' },
    { id: 3, name: '极客公园', feed_url: 'https://www.geekpark.net/rss' }
  ];

  assert.deepEqual(filterDisabledSources(rows).map(row => row.name), ['IT之家']);
});
