// TOPIC_KEYWORDS 定义在 topic-keywords.js 中
// Node.js 测试环境需显式 require
if (typeof TOPIC_KEYWORDS === 'undefined') {
  if (typeof require !== 'undefined') {
    var TOPIC_KEYWORDS = require('./topic-keywords');
  }
}

function matchInterests(title, interests) {
  if (!interests || !interests.length) return false;
  for (const tag of interests) {
    const keywords = TOPIC_KEYWORDS[tag] || [];
    for (const kw of keywords) {
      if (title && title.includes(kw)) return true;
    }
  }
  return false;
}

function selectRecommendDigestItems(hotItems, interests) {
  const allowedPlatforms = new Set(['toutiao', 'baidu', 'weibo']);
  const filtered = (hotItems || []).filter(item => allowedPlatforms.has(item.platform));

  // 如果提供了兴趣标签，优先展示匹配的内容
  if (interests && interests.length > 0) {
    const matched = filtered.filter(item => matchInterests(item.title, interests));
    const unmatched = filtered.filter(item => !matchInterests(item.title, interests));
    return [...matched, ...unmatched].slice(0, 5);
  }

  return filtered.slice(0, 5);
}

function getDigestLabel(hour) {
  const h = hour !== undefined ? hour : new Date().getHours();
  if (h >= 6 && h < 11) return '☀️ 早间热榜';
  if (h >= 11 && h < 17) return '🌞 午间热榜';
  return '🌙 晚间热榜';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { selectRecommendDigestItems, getDigestLabel };
}
