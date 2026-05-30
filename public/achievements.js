/**
 * 阅读成就系统
 * - 连续打卡天数追踪
 * - 阅读量里程碑徽章（100/500/1000篇）
 * - 每周阅读报告
 */

const MILESTONES = {
  bronze: 100,
  silver: 500,
  gold: 1000
};

function updateReadingStats(stats, today) {
  const updated = { ...stats };
  const lastRead = updated.lastRead;

  if (lastRead === today) {
    // Same day as last read, increment count
    updated.count = (updated.count || 0) + 1;
  } else {
    // New day
    const lastDate = lastRead ? new Date(lastRead) : null;
    const todayDate = new Date(today);

    if (lastDate) {
      const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        // Consecutive day
        updated.streak = (updated.streak || 0) + 1;
      } else {
        // Streak broken
        updated.streak = 1;
      }
    } else {
      // First read
      updated.streak = 1;
    }

    updated.today = today;
    updated.count = 1;
  }

  updated.lastRead = today;
  return updated;
}

function checkMilestones(totalArticles) {
  const badges = [];

  if (totalArticles >= MILESTONES.bronze) badges.push('bronze');
  if (totalArticles >= MILESTONES.silver) badges.push('silver');
  if (totalArticles >= MILESTONES.gold) badges.push('gold');

  return badges;
}

function getWeeklyReport(history, currentDate) {
  const current = new Date(currentDate);
  const weekStart = new Date(current);
  weekStart.setDate(current.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(current);
  weekEnd.setHours(23, 59, 59, 999);

  const weeklyArticles = history.filter(item => {
    const itemDate = new Date(item.timestamp);
    return itemDate >= weekStart && itemDate <= weekEnd;
  });

  const dailyBreakdown = {};
  const activeDaysSet = new Set();

  weeklyArticles.forEach(item => {
    const date = new Date(item.timestamp);
    const dateStr = date.toISOString().split('T')[0];
    dailyBreakdown[dateStr] = (dailyBreakdown[dateStr] || 0) + 1;
    activeDaysSet.add(dateStr);
  });

  return {
    totalArticles: weeklyArticles.length,
    activeDays: activeDaysSet.size,
    dailyBreakdown,
    weekStart: weekStart.toISOString().split('T')[0],
    weekEnd: weekEnd.toISOString().split('T')[0]
  };
}

function formatStreakDisplay(days) {
  return `${days}天`;
}

// UI组件：成就卡片
function renderAchievementCard(stats, milestones) {
  const badges = checkMilestones(milestones.totalArticles);
  const badgeIcons = {
    bronze: '🥉',
    silver: '🥈',
    gold: '🥇'
  };

  return `
    <div class="achievement-card">
      <div class="achievement-header">
        <span class="achievement-icon">🏆</span>
        <span class="achievement-title">阅读成就</span>
      </div>
      <div class="achievement-stats">
        <div class="stat-item">
          <div class="stat-value">${stats.streak || 0}</div>
          <div class="stat-label">连续打卡</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${milestones.totalArticles || 0}</div>
          <div class="stat-label">总阅读量</div>
        </div>
      </div>
      ${badges.length > 0 ? `
        <div class="achievement-badges">
          ${badges.map(badge => `
            <span class="badge ${badge}" title="${badge}阅读达人">
              ${badgeIcons[badge]}
            </span>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

// UI组件：周报卡片
function renderWeeklyReport(report) {
  const avgPerDay = report.activeDays > 0
    ? (report.totalArticles / report.activeDays).toFixed(1)
    : 0;

  return `
    <div class="weekly-report-card">
      <div class="report-header">
        <span class="report-icon">📊</span>
        <span class="report-title">本周阅读报告</span>
      </div>
      <div class="report-summary">
        <p>阅读 <strong>${report.totalArticles}</strong> 篇文章</p>
        <p>活跃 <strong>${report.activeDays}</strong> 天</p>
        <p>日均 <strong>${avgPerDay}</strong> 篇</p>
      </div>
      <div class="report-daily">
        ${Object.entries(report.dailyBreakdown).map(([date, count]) => `
          <div class="daily-item">
            <span class="daily-date">${date.slice(5)}</span>
            <span class="daily-count">${count}篇</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    updateReadingStats,
    checkMilestones,
    getWeeklyReport,
    formatStreakDisplay,
    renderAchievementCard,
    renderWeeklyReport
  };
}
