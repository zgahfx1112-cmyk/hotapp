// TOPIC_KEYWORDS 由 topic-keywords.js 提供（浏览器中通过 <script> 标签加载）

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

function selectRecommendDigestItems(hotItems, interests, history) {
  const allowedPlatforms = new Set(['toutiao', 'baidu', 'weibo']);
  const filtered = (hotItems || []).filter(item => allowedPlatforms.has(item.platform));

  // 判断是否已读（轻量版，避免依赖 app.js 的 isArticleRead）
  const isRead = (item) => {
    if (!history || !history.length) return false;
    return history.some(h =>
      (item.url && h.url && item.url === h.url) ||
      (item.title && h.title && item.title === h.title)
    );
  };

  // 如果提供了兴趣标签，优先展示匹配的内容
  if (interests && interests.length > 0) {
    const matched = filtered.filter(item => matchInterests(item.title, interests));
    const unmatched = filtered.filter(item => !matchInterests(item.title, interests));
    const combined = [...matched, ...unmatched];
    const unread = combined.filter(item => !isRead(item));
    const read = combined.filter(item => isRead(item));
    return [...unread, ...read].slice(0, 5);
  }

  const unread = filtered.filter(item => !isRead(item));
  const read = filtered.filter(item => isRead(item));
  return [...unread, ...read].slice(0, 5);
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
