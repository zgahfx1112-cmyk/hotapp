const test = require('node:test');
const assert = require('node:assert/strict');
// 先加载 TOPIC_KEYWORDS 到全局
global.TOPIC_KEYWORDS = require('../public/topic-keywords');
const { calculateMMR, reduceRandomness } = require('../public/app');

// ── reduceRandomness ──

test('reduceRandomness returns lower randomness for high-scoring items', () => {
  const highScore = reduceRandomness(80); // High score item
  const lowScore = reduceRandomness(30);  // Low score item

  // High score items should have less randomness (smaller range)
  assert.ok(Math.abs(highScore) <= 15, 'High score randomness should be within ±15');
  assert.ok(Math.abs(lowScore) <= 15, 'Low score randomness should be within ±15');
});

test('reduceRandomness uses deterministic seed when provided', () => {
  const result1 = reduceRandomness(50, 'seed123');
  const result2 = reduceRandomness(50, 'seed123');
  const result3 = reduceRandomness(50, 'seed456');

  assert.equal(result1, result2, 'Same seed should produce same result');
  assert.notEqual(result1, result3, 'Different seeds should produce different results');
});

test('reduceRandomness returns value within expected range', () => {
  for (let i = 0; i < 100; i++) {
    const result = reduceRandomness(Math.random() * 100);
    assert.ok(result >= -15 && result <= 15, `Randomness ${result} should be within ±15`);
  }
});

// ── calculateMMR ──

test('calculateMMR selects first item with highest relevance score', () => {
  const items = [
    { id: '1', score: 100, keywords: ['AI', '芯片'] },
    { id: '2', score: 90, keywords: ['游戏', '电竞'] },
    { id: '3', score: 80, keywords: ['财经', '股市'] }
  ];

  const result = calculateMMR(items, 1, { lambda: 0.7 });
  assert.equal(result[0].id, '1', 'First item should be highest scoring');
});

test('calculateMMR penalizes similar items to promote diversity', () => {
  const items = [
    { id: '1', score: 100, keywords: ['AI', '芯片', '科技'] },
    { id: '2', score: 95, keywords: ['AI', '芯片', '技术'] }, // Similar to item 1
    { id: '3', score: 90, keywords: ['游戏', '电竞', '娱乐'] } // Different
  ];

  const result = calculateMMR(items, 2, { lambda: 0.5 });

  // After selecting item 1, item 3 should be preferred over item 2 due to diversity
  assert.equal(result[0].id, '1');
  assert.equal(result[1].id, '3', 'Second item should be diverse (item 3, not similar item 2)');
});

test('calculateMMR respects lambda parameter (relevance vs diversity)', () => {
  const items = [
    { id: '1', score: 100, keywords: ['AI', '芯片'] },
    { id: '2', score: 95, keywords: ['AI', '芯片'] }, // Very similar
    { id: '3', score: 85, keywords: ['游戏', '电竞'] } // Different
  ];

  // Very high lambda (0.99) = heavily prioritize relevance, ignore diversity
  const resultHighLambda = calculateMMR(items, 2, { lambda: 0.99 });
  assert.equal(resultHighLambda[1].id, '2', 'High lambda should pick similar high-scoring item');

  // Low lambda = prioritize diversity
  const resultLowLambda = calculateMMR(items, 2, { lambda: 0.1 });
  assert.equal(resultLowLambda[1].id, '3', 'Low lambda should pick diverse item');
});

test('calculateMMR returns correct number of items', () => {
  const items = [
    { id: '1', score: 100, keywords: ['AI'] },
    { id: '2', score: 90, keywords: ['游戏'] },
    { id: '3', score: 80, keywords: ['财经'] },
    { id: '4', score: 70, keywords: ['体育'] },
    { id: '5', score: 60, keywords: ['教育'] }
  ];

  const result = calculateMMR(items, 3);
  assert.equal(result.length, 3);
});

test('calculateMMR handles empty input', () => {
  const result = calculateMMR([], 5);
  assert.deepEqual(result, []);
});

test('calculateMMR handles requesting more items than available', () => {
  const items = [
    { id: '1', score: 100, keywords: ['AI'] },
    { id: '2', score: 90, keywords: ['游戏'] }
  ];

  const result = calculateMMR(items, 10);
  assert.equal(result.length, 2);
});

test('calculateMMR calculates similarity based on keyword overlap', () => {
  const items = [
    { id: '1', score: 100, keywords: ['AI', '芯片', '科技', '技术'] },
    { id: '2', score: 95, keywords: ['AI', '芯片', '科技'] }, // 75% overlap
    { id: '3', score: 90, keywords: ['游戏', '电竞'] } // 0% overlap
  ];

  const result = calculateMMR(items, 2, { lambda: 0.3 }); // Prioritize diversity

  // With low lambda, item 3 (0% overlap) should be preferred over item 2 (75% overlap)
  assert.equal(result[0].id, '1');
  assert.equal(result[1].id, '3', 'Should select diverse item with no keyword overlap');
});
