const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { normalizeSeries } = require('../public/trend.js');

describe('normalizeSeries', () => {
  it('空数组返回空', () => {
    assert.deepEqual(normalizeSeries([], 400, 200), []);
  });

  it('null/undefined 返回空', () => {
    assert.deepEqual(normalizeSeries(null, 400, 200), []);
    assert.deepEqual(normalizeSeries(undefined, 400, 200), []);
  });

  it('单点不报错，返回单点', () => {
    const result = normalizeSeries([{ t: 1, score: 100 }], 400, 200);
    assert.equal(result.length, 1);
    assert.equal(result[0].x, 0);
    assert.equal(result[0].y, 100);
  });

  it('全相同 score 不除零，y 取中点', () => {
    const pts = [
      { t: 1, score: 50 },
      { t: 2, score: 50 },
      { t: 3, score: 50 },
    ];
    const result = normalizeSeries(pts, 400, 200);
    assert.equal(result.length, 3);
    result.forEach(p => {
      assert.equal(p.y, 100, 'y should be height/2 when all scores equal');
    });
  });

  it('多点 x 等距', () => {
    const pts = [
      { t: 1, score: 10 },
      { t: 2, score: 20 },
      { t: 3, score: 30 },
      { t: 4, score: 40 },
    ];
    const result = normalizeSeries(pts, 400, 200);
    assert.equal(result.length, 4);
    assert.ok(Math.abs(result[0].x - 0) < 1e-9);
    assert.ok(Math.abs(result[1].x - 400 / 3) < 1e-9);
    assert.ok(Math.abs(result[2].x - 800 / 3) < 1e-9);
    assert.ok(Math.abs(result[3].x - 400) < 1e-9);
  });

  it('多点 y 在 [0, height] 范围内', () => {
    const pts = [
      { t: 1, score: 5 },
      { t: 2, score: 99999 },
      { t: 3, score: 0 },
      { t: 4, score: 500 },
    ];
    const result = normalizeSeries(pts, 400, 200);
    result.forEach(p => {
      assert.ok(p.y >= 0, `y=${p.y} should be >= 0`);
      assert.ok(p.y <= 200, `y=${p.y} should be <= height`);
    });
  });

  it('最低分对应底部，最高分对应顶部', () => {
    const pts = [
      { t: 1, score: 0 },
      { t: 2, score: 100 },
    ];
    const result = normalizeSeries(pts, 400, 200);
    assert.ok(result[1].y < result[0].y, 'higher score should have lower y');
  });
});

describe('上升最快排序逻辑', () => {
  it('rank 上升最多的排前', () => {
    const items = [
      { title: 'A', delta: 0.5, maxHeat: 100 },
      { title: 'B', delta: 2.0, maxHeat: 200 },
      { title: 'C', delta: 1.0, maxHeat: 300 },
    ];
    items.sort((a, b) => {
      if (b.delta !== a.delta) return b.delta - a.delta;
      return (b.maxHeat || 0) - (a.maxHeat || 0);
    });
    assert.equal(items[0].title, 'B', 'B has highest delta');
    assert.equal(items[1].title, 'C');
    assert.equal(items[2].title, 'A');
  });

  it('delta 相同时按 maxHeat 排', () => {
    const items = [
      { title: 'X', delta: 1.0, maxHeat: 100 },
      { title: 'Y', delta: 1.0, maxHeat: 500 },
    ];
    items.sort((a, b) => {
      if (b.delta !== a.delta) return b.delta - a.delta;
      return (b.maxHeat || 0) - (a.maxHeat || 0);
    });
    assert.equal(items[0].title, 'Y');
  });

  it('负 delta 排后面', () => {
    const items = [
      { title: 'down', delta: -0.5, maxHeat: 100 },
      { title: 'up', delta: 0.1, maxHeat: 50 },
    ];
    items.sort((a, b) => {
      if (b.delta !== a.delta) return b.delta - a.delta;
      return (b.maxHeat || 0) - (a.maxHeat || 0);
    });
    assert.equal(items[0].title, 'up');
  });
});
