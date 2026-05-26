const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appPath = path.join(__dirname, '..', 'public', 'app.js');

test('platform labels do not contain bilibili entries', () => {
  const source = fs.readFileSync(appPath, 'utf8');

  assert.equal(source.includes("bilibili: 'B站热搜'"), false);
  assert.equal(source.includes("bilibili_pop: 'B站热门'"), false);
});
