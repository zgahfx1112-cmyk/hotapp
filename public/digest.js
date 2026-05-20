function selectRecommendDigestItems(hotItems) {
  const allowedPlatforms = new Set(['toutiao', 'baidu', 'weibo']);
  return (hotItems || []).filter(item => allowedPlatforms.has(item.platform)).slice(0, 5);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { selectRecommendDigestItems };
}
