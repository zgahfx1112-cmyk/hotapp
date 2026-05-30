const test = require('node:test');
const assert = require('node:assert/strict');
const { computeImplicitInterests, getDecayedBehaviorWeights } = require('../public/app');

// ── computeImplicitInterests ──

test('computeImplicitInterests discovers topic tags from reading history', () => {
  const history = [
    { keywords: ['AI', '芯片', '科技'], timestamp: Date.now() },
    { keywords: ['AI', '大模型', 'GPT'], timestamp: Date.now() },
    { keywords: ['AI', '机器人'], timestamp: Date.now() },
    { keywords: ['电影', '票房'], timestamp: Date.now() },
  ];

  const implicit = computeImplicitInterests(history);
  // 科技 should be auto-discovered (3+ matches)
  assert.ok(implicit.includes('科技'), '科技 should be auto-discovered');
});

test('computeImplicitInterests does not return topics with too few matches', () => {
  const history = [
    { keywords: ['电影'], timestamp: Date.now() },
    { keywords: ['NBA'], timestamp: Date.now() },
  ];

  const implicit = computeImplicitInterests(history);
  // 娱乐 only has 1 keyword match, 体育 only has 1 — both below threshold
  assert.ok(!implicit.includes('娱乐'));
  assert.ok(!implicit.includes('体育'));
});

test('computeImplicitInterests returns empty array for empty history', () => {
  assert.deepEqual(computeImplicitInterests([]), []);
});

test('computeImplicitInterests weights recent history more heavily', () => {
  const now = Date.now();
  const history = [
    // Recent: lots of 科技
    { keywords: ['AI', '芯片', '科技'], timestamp: now - 3600000 },
    { keywords: ['AI', '大模型'], timestamp: now - 7200000 },
    { keywords: ['AI', '机器人'], timestamp: now - 10800000 },
    // Old: lots of 娱乐 (30+ days ago)
    { keywords: ['电影', '票房', '综艺'], timestamp: now - 30 * 86400000 },
    { keywords: ['明星', '演唱会'], timestamp: now - 31 * 86400000 },
    { keywords: ['电视剧', '综艺'], timestamp: now - 32 * 86400000 },
  ];

  const implicit = computeImplicitInterests(history);
  // 科技 should be discovered, 娱乐 should NOT (too old, decayed)
  assert.ok(implicit.includes('科技'));
  assert.ok(!implicit.includes('娱乐'), 'Old 娱乐 keywords should be decayed');
});

// ── getDecayedBehaviorWeights ──

test('getDecayedBehaviorWeights returns higher weight for recent keywords', () => {
  const now = Date.now();
  const history = [
    { keywords: ['AI'], timestamp: now - 3600000 },       // 1 hour ago
    { keywords: ['AI'], timestamp: now - 7200000 },       // 2 hours ago
    { keywords: ['NBA'], timestamp: now - 30 * 86400000 }, // 30 days ago
  ];

  const weights = getDecayedBehaviorWeights(history, now);
  assert.ok(weights['AI'] > (weights['NBA'] || 0), 'Recent AI should outweigh old NBA');
});

test('getDecayedBehaviorWeights returns empty object for empty history', () => {
  assert.deepEqual(getDecayedBehaviorWeights([], Date.now()), {});
});

test('getDecayedBehaviorWeights applies exponential decay', () => {
  const now = Date.now();
  const history = [
    { keywords: ['AI'], timestamp: now },          // now: full weight
    { keywords: ['AI'], timestamp: now - 7 * 86400000 }, // 7 days ago: decayed
  ];

  const weights = getDecayedBehaviorWeights(history, now);
  // Two AI hits but one is old, so total < 2.0
  assert.ok(weights['AI'] < 2.0, 'Decay should reduce old keyword weight');
  assert.ok(weights['AI'] > 1.0, 'Recent keyword should still have full weight');
});

test('getDecayedBehaviorWeights ignores items older than 30 days', () => {
  const now = Date.now();
  const history = [
    { keywords: ['AI'], timestamp: now - 31 * 86400000 }, // 31 days ago
  ];

  const weights = getDecayedBehaviorWeights(history, now);
  assert.equal(weights['AI'], undefined, 'Items older than 30 days should be ignored');
});
