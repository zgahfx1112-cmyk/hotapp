const test = require('node:test');
const assert = require('node:assert/strict');

function getReaderNavState(list, currentIndex) {
  if (!list || list.length <= 1) return null;
  return {
    hasPrev: currentIndex > 0,
    hasNext: currentIndex < list.length - 1,
    display: `${currentIndex + 1} / ${list.length}`,
    prevIndex: currentIndex > 0 ? currentIndex - 1 : null,
    nextIndex: currentIndex < list.length - 1 ? currentIndex + 1 : null
  };
}

test('first item: no prev, has next', () => {
  const list = [{ id: '1' }, { id: '2' }, { id: '3' }];
  const nav = getReaderNavState(list, 0);
  assert.ok(nav);
  assert.equal(nav.hasPrev, false);
  assert.equal(nav.hasNext, true);
  assert.equal(nav.prevIndex, null);
  assert.equal(nav.nextIndex, 1);
  assert.equal(nav.display, '1 / 3');
});

test('last item: has prev, no next', () => {
  const list = [{ id: '1' }, { id: '2' }, { id: '3' }];
  const nav = getReaderNavState(list, 2);
  assert.ok(nav);
  assert.equal(nav.hasPrev, true);
  assert.equal(nav.hasNext, false);
  assert.equal(nav.prevIndex, 1);
  assert.equal(nav.nextIndex, null);
  assert.equal(nav.display, '3 / 3');
});

test('middle item: has both prev and next', () => {
  const list = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];
  const nav = getReaderNavState(list, 1);
  assert.ok(nav);
  assert.equal(nav.hasPrev, true);
  assert.equal(nav.hasNext, true);
  assert.equal(nav.prevIndex, 0);
  assert.equal(nav.nextIndex, 2);
  assert.equal(nav.display, '2 / 4');
});

test('single item list: no navigation', () => {
  const list = [{ id: '1' }];
  const nav = getReaderNavState(list, 0);
  assert.equal(nav, null);
});

test('empty list: no navigation', () => {
  const nav = getReaderNavState([], 0);
  assert.equal(nav, null);
});

test('null list: no navigation', () => {
  const nav = getReaderNavState(null, 0);
  assert.equal(nav, null);
});

test('second-to-last item: has both prev and next', () => {
  const list = [{ id: '1' }, { id: '2' }, { id: '3' }];
  const nav = getReaderNavState(list, 1);
  assert.ok(nav);
  assert.equal(nav.hasPrev, true);
  assert.equal(nav.hasNext, true);
  assert.equal(nav.prevIndex, 0);
  assert.equal(nav.nextIndex, 2);
  assert.equal(nav.display, '2 / 3');
});
