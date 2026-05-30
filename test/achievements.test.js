const test = require('node:test');
const assert = require('node:assert/strict');
const { updateReadingStats, checkMilestones, getWeeklyReport, formatStreakDisplay } = require('../public/achievements');

test('updateReadingStats increments daily count', () => {
  const stats = { today: '2024-01-15', count: 5, streak: 3, lastRead: '2024-01-15' };
  const updated = updateReadingStats(stats, '2024-01-15');
  assert.equal(updated.count, 6);
  assert.equal(updated.streak, 3);
});

test('updateReadingStats increments streak for consecutive day', () => {
  const stats = { today: '2024-01-15', count: 5, streak: 3, lastRead: '2024-01-14' };
  const updated = updateReadingStats(stats, '2024-01-15');
  assert.equal(updated.count, 1);
  assert.equal(updated.streak, 4);
  assert.equal(updated.today, '2024-01-15');
});

test('updateReadingStats resets streak for non-consecutive day', () => {
  const stats = { today: '2024-01-13', count: 5, streak: 3, lastRead: '2024-01-13' };
  const updated = updateReadingStats(stats, '2024-01-15');
  assert.equal(updated.count, 1);
  assert.equal(updated.streak, 1);
  assert.equal(updated.today, '2024-01-15');
});

test('checkMilestones returns correct badge for 100 articles', () => {
  const badges = checkMilestones(100);
  assert.ok(badges.includes('bronze'));
  assert.ok(!badges.includes('silver'));
});

test('checkMilestones returns correct badges for 500 articles', () => {
  const badges = checkMilestones(500);
  assert.ok(badges.includes('bronze'));
  assert.ok(badges.includes('silver'));
  assert.ok(!badges.includes('gold'));
});

test('checkMilestones returns all badges for 1000+ articles', () => {
  const badges = checkMilestones(1000);
  assert.ok(badges.includes('bronze'));
  assert.ok(badges.includes('silver'));
  assert.ok(badges.includes('gold'));
});

test('getWeeklyReport calculates correct weekly stats', () => {
  const history = [
    { timestamp: new Date('2024-01-15T10:00:00').getTime(), title: 'Article 1' },
    { timestamp: new Date('2024-01-15T11:00:00').getTime(), title: 'Article 2' },
    { timestamp: new Date('2024-01-14T09:00:00').getTime(), title: 'Article 3' },
    { timestamp: new Date('2024-01-10T08:00:00').getTime(), title: 'Article 4' },
  ];
  const report = getWeeklyReport(history, '2024-01-15');
  assert.equal(report.totalArticles, 4);
  assert.equal(report.activeDays, 3);
  assert.ok(report.dailyBreakdown['2024-01-15'] === 2);
  assert.ok(report.dailyBreakdown['2024-01-14'] === 1);
});

test('formatStreakDisplay shows correct format', () => {
  assert.equal(formatStreakDisplay(1), '1天');
  assert.equal(formatStreakDisplay(7), '7天');
  assert.equal(formatStreakDisplay(30), '30天');
});
