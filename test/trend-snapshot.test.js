const test = require('node:test');
const assert = require('node:assert/strict');

function titleKey(title) {
  return String(title || '').replace(/\s+/g, '').toLowerCase();
}

function shouldSnapshot(prevSnap, newTopItems, now) {
  if (!prevSnap) return true;
  if (now - (prevSnap.timestamp || 0) < 10 * 60 * 1000) {
    const prevKeys = new Set((prevSnap.items || []).map(it => titleKey(it.title)).filter(Boolean));
    const newKeys = new Set(newTopItems.map(it => titleKey(it.title)).filter(Boolean));
    if (prevKeys.size === 0 && newKeys.size === 0) return false;
    if (prevKeys.size === 0 || newKeys.size === 0) return true;
    let inter = 0;
    for (const k of newKeys) { if (prevKeys.has(k)) inter++; }
    const union = prevKeys.size + newKeys.size - inter;
    if (union > 0 && inter / union > 0.8) return false;
  }
  return true;
}

function trimHistory(arr, now, maxDays, maxCount) {
  const cutoff = now - maxDays * 86400 * 1000;
  arr = arr.filter(s => (s.timestamp || 0) >= cutoff);
  if (arr.length > maxCount) arr = arr.slice(arr.length - maxCount);
  return arr;
}

function aggregateTrend(events) {
  for (const ev of events) {
    const samples = ev.heatSamples || [];
    if (samples.length >= 2) {
      const firstScore = samples[0].score;
      const lastScore = samples[samples.length - 1].score;
      let maxScore = 0, maxIdx = 0;
      for (let i = 0; i < samples.length; i++) {
        if (samples[i].score > maxScore) { maxScore = samples[i].score; maxIdx = i; }
      }
      if (firstScore > 0 && (lastScore - firstScore) / firstScore > 0.2) {
        ev.trend = 'up';
      } else if (firstScore > 0 && (firstScore - lastScore) / firstScore > 0.2) {
        ev.trend = 'down';
      } else if (maxIdx >= Math.floor(samples.length / 2) && firstScore > 0 && (maxScore - firstScore) / firstScore > 0.5) {
        ev.trend = 'spike';
      } else {
        ev.trend = 'stable';
      }
    } else {
      ev.trend = 'stable';
    }
  }
}

// ── shouldSnapshot tests ──

test('shouldSnapshot: no prevSnap returns true', () => {
  assert.equal(shouldSnapshot(null, [{title: 'a'}], 1000), true);
  assert.equal(shouldSnapshot(undefined, [], 1000), true);
});

test('shouldSnapshot: within 10min with high overlap returns false', () => {
  const now = 1000000;
  const prev = { timestamp: now - 5 * 60 * 1000, items: [{title:'A'},{title:'B'},{title:'C'},{title:'D'},{title:'E'},{title:'F'},{title:'G'},{title:'H'},{title:'I'},{title:'J'}] };
  const newItems = [{title:'A'},{title:'B'},{title:'C'},{title:'D'},{title:'E'},{title:'F'},{title:'G'},{title:'H'},{title:'I'},{title:'X'}];
  assert.equal(shouldSnapshot(prev, newItems, now), false);
});

test('shouldSnapshot: beyond 10min returns true', () => {
  const now = 20000000;
  const prev = { timestamp: now - 15 * 60 * 1000, items: [{title: 'A'}, {title: 'B'}] };
  const newItems = [{title: 'A'}, {title: 'B'}];
  assert.equal(shouldSnapshot(prev, newItems, now), true);
});

test('shouldSnapshot: within 10min but low overlap returns true', () => {
  const now = 1000000;
  const prev = { timestamp: now - 5 * 60 * 1000, items: [{title: 'A'}, {title: 'B'}] };
  const newItems = [{title: 'X'}, {title: 'Y'}, {title: 'Z'}];
  assert.equal(shouldSnapshot(prev, newItems, now), true);
});

// ── Rolling trim tests ──

test('trimHistory: trims 2500 to 2000 and keeps newest', () => {
  const now = Date.now();
  const arr = [];
  for (let i = 0; i < 2500; i++) {
    arr.push({ timestamp: now - (2500 - i) * 60000, items: [] });
  }
  const result = trimHistory(arr, now, 14, 2000);
  assert.equal(result.length, 2000);
  assert.equal(result[0].timestamp, arr[500].timestamp);
  assert.equal(result[result.length - 1].timestamp, arr[2499].timestamp);
});

test('trimHistory: keeps all if under limits', () => {
  const now = Date.now();
  const arr = [
    { timestamp: now - 3600000, items: [] },
    { timestamp: now - 1800000, items: [] },
  ];
  const result = trimHistory(arr, now, 14, 2000);
  assert.equal(result.length, 2);
});

test('trimHistory: removes entries older than maxDays', () => {
  const now = Date.now();
  const arr = [
    { timestamp: now - 20 * 86400000, items: [] },
    { timestamp: now - 10 * 86400000, items: [] },
    { timestamp: now - 100000, items: [] },
  ];
  const result = trimHistory(arr, now, 14, 2000);
  assert.equal(result.length, 2);
});

// ── Trend aggregation tests ──

test('aggregateTrend: rising scores → up', () => {
  const events = [{
    heatSamples: [{t:1,score:100},{t:2,score:200},{t:3,score:300}],
  }];
  aggregateTrend(events);
  assert.equal(events[0].trend, 'up');
});

test('aggregateTrend: falling scores → down', () => {
  const events = [{
    heatSamples: [{t:1,score:300},{t:2,score:200},{t:3,score:100}],
  }];
  aggregateTrend(events);
  assert.equal(events[0].trend, 'down');
});

test('aggregateTrend: spike in second half → spike', () => {
  const events = [{
    heatSamples: [{t:1,score:100},{t:2,score:100},{t:3,score:200},{t:4,score:100}],
  }];
  aggregateTrend(events);
  assert.equal(events[0].trend, 'spike');
});

test('aggregateTrend: stable → stable', () => {
  const events = [{
    heatSamples: [{t:1,score:100},{t:2,score:110},{t:3,score:105}],
  }];
  aggregateTrend(events);
  assert.equal(events[0].trend, 'stable');
});

test('aggregateTrend: single sample → stable', () => {
  const events = [{
    heatSamples: [{t:1,score:100}],
  }];
  aggregateTrend(events);
  assert.equal(events[0].trend, 'stable');
});

test('aggregateTrend: empty samples → stable', () => {
  const events = [{ heatSamples: [] }];
  aggregateTrend(events);
  assert.equal(events[0].trend, 'stable');
});

// ── Window aggregation end-to-end test ──

test('full window aggregation: groups by title and assigns correct trend', () => {
  const now = Date.now();
  const snapshots = [
    { timestamp: now - 3500000, items: [
      {title: '新闻A', platform: 'weibo', rank: 1, heatScore: 1000},
      {title: '新闻B', platform: 'baidu', rank: 1, heatScore: 500},
    ]},
    { timestamp: now - 1800000, items: [
      {title: '新闻A', platform: 'weibo', rank: 1, heatScore: 1500},
      {title: '新闻B', platform: 'baidu', rank: 1, heatScore: 300},
    ]},
  ];
  const events = {};
  for (const snap of snapshots) {
    for (const it of snap.items) {
      const tk = titleKey(it.title);
      if (!events[tk]) {
        events[tk] = {title: it.title, platforms: new Set(), firstSeen: snap.timestamp, lastSeen: snap.timestamp, heatSamples: [], maxHeat: 0};
      }
      const ev = events[tk];
      ev.platforms.add(it.platform);
      ev.firstSeen = Math.min(ev.firstSeen, snap.timestamp);
      ev.lastSeen = Math.max(ev.lastSeen, snap.timestamp);
      ev.heatSamples.push({t: snap.timestamp, score: it.heatScore});
      ev.maxHeat = Math.max(ev.maxHeat, it.heatScore);
    }
  }
  const eventList = Object.values(events).map(ev => ({...ev, platforms: [...ev.platforms]}));
  aggregateTrend(eventList);
  const evA = eventList.find(e => e.title === '新闻A');
  const evB = eventList.find(e => e.title === '新闻B');
  assert.equal(evA.trend, 'up');
  assert.equal(evB.trend, 'down');
});
