// ── State ──

const state = {
  articles: [],
  articlesTotal: 0,
  sources: [],
  hotItems: [],
  hotErrors: [],
  stats: {},
  currentTab: 'recommend',
  rssFilter: null,
  hotFilter: null,
  loading: false,
  error: null,
  initialLoad: true,
  recommender: new Recommender(),
  feedItems: [],
  feedPage: 0,
  feedLoading: false,
  feedExhausted: false,
  feedObserver: null,
  hotPage: 0,
  hotLoading: false,
  hotExhausted: false,
  hotObserver: null
};

const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const FIRST_SCREEN_ARTICLE_LIMIT = 30;

// ── SVG icons ──

const ICON_SHARE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
const ICON_STAR_FILLED = '<svg viewBox="0 0 24 24" width="16" height="16" fill="#f0a030" stroke="#f0a030" stroke-width="1.8"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>';
const ICON_STAR_EMPTY = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>';
const ICON_HIDE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
const ICON_CLOCK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
const ICON_CLOCK_FILLED = '<svg viewBox="0 0 24 24" width="16" height="16" fill="#4f6ef6" stroke="#4f6ef6" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14" stroke="#fff"/></svg>';

function starIcon(starred) { return starred ? ICON_STAR_FILLED : ICON_STAR_EMPTY; }
function starLabel(starred) { return starred ? '已收藏' : '收藏'; }
function clockIcon(saved) { return saved ? ICON_CLOCK_FILLED : ICON_CLOCK; }
function clockLabel(saved) { return saved ? '已添加' : '稍后读'; }

function buildCardActions(config) {
  const btns = [];
  if (config.share) btns.push(`<button class="card-action-btn" data-action="share" title="分享">${ICON_SHARE}<span>分享</span></button>`);
  if (config.bookmark) {
    const s = config.bookmark.starred;
    btns.push(`<button class="card-action-btn ${s ? 'active' : ''}" data-action="bookmark" title="收藏">${starIcon(s)}<span>${starLabel(s)}</span></button>`);
  }
  if (config.readLater) {
    const saved = isReadLater(config.readLater.id);
    btns.push(`<button class="card-action-btn ${saved ? 'active' : ''}" data-action="readlater" title="稍后读">${clockIcon(saved)}<span>${clockLabel(saved)}</span></button>`);
  }
  if (config.hide) btns.push(`<button class="card-action-btn card-action-muted" data-action="hide" title="不感兴趣">${ICON_HIDE}<span>不感兴趣</span></button>`);
  return `<div class="card-actions">${btns.join('')}</div>`;
}

// ── Init ──

async function init() {
  console.log('[App] init() called');
  const controller = createInitController({
    restorePrefs() {
      try { state.rssFilter = localStorage.getItem('toutiao_rssFilter') || null; } catch {}
      try { state.hotFilter = localStorage.getItem('toutiao_hotFilter') || null; } catch {}
    },
    initTheme,
    renderTab,
    renderInterestTags,
    setupTabs,
    registerSW,
    getUserStats,
    loadSources,
    loadArticles: (limit) => loadArticles(limit),
    loadHotData,
    loadStats,
    removeSkeleton() {
      console.log('[App] removeSkeleton called');
      const skeleton = document.getElementById('skeletonLoader');
      if (skeleton) {
        skeleton.classList.add('fade-out');
        setTimeout(() => skeleton.remove(), 300);
      }
    },
    afterSourcesLoaded() {
      console.log('[App] afterSourcesLoaded');
      if (state.currentTab === 'rss') renderTab();
    },
    afterArticlesLoaded() {
      console.log('[App] afterArticlesLoaded, articles:', state.articles.length);
      state.initialLoad = false;
      state.feedItems = [];
      state.feedPage = 0;
      state.feedExhausted = false;
      if (state.currentTab === 'recommend' || state.currentTab === 'rss') renderTab();
    },
    afterHotLoaded() {
      console.log('[App] afterHotLoaded, hotItems:', state.hotItems.length);
      state.initialLoad = false;
      state.feedItems = [];
      state.feedPage = 0;
      state.feedExhausted = false;
      if (state.currentTab === 'recommend' || state.currentTab === 'hot') renderTab();
    },
    afterStatsLoaded() {
      console.log('[App] afterStatsLoaded');
      if (state.currentTab === 'recommend') renderTab();
    }
  });
  console.log('[App] controller created, calling controller.init()');
  await controller.init();
  console.log('[App] controller.init() completed');
}

// ── API ──

async function loadSources() {
  try {
    const res = await fetch('/api/sources');
    state.sources = await res.json();
  } catch (e) { console.error('Sources fail:', e); }
}

async function loadArticles(limit, sourceId) {
  try {
    const url = sourceId ? `/api/articles?limit=${limit}&source_id=${sourceId}` : `/api/articles?limit=${limit}`;
    const res = await fetch(url);
    const data = await res.json();
    state.articles = data.articles;
    state.articlesTotal = data.total;
    return data;
  } catch (e) {
    console.error('Articles fail:', e);
  }
}

async function loadHotData() {
  try {
    const res = await fetch('/api/hot/trending', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.hotItems = data.items || [];
    state.hotErrors = data.errors || [];
  } catch (e) {
    console.error('Hot data fail:', e);
    state.hotErrors = ['热搜'];
  }
}

async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    state.stats = await res.json();
    updateStatusDot(state.stats);
  } catch (e) { console.error('Stats fail:', e); }
}

async function doRefresh() {
  const btn = $('#btnRefresh');
  btn.classList.add('spinning');
  try {
    await Promise.all([loadHotData(), loadArticles(60), loadStats()]);
    state.feedItems = [];
    state.feedPage = 0;
    state.feedExhausted = false;
    renderTab();
    fetch('/api/fetch', { method: 'POST' }).then(() => {
      return Promise.all([loadHotData(), loadArticles(60), loadStats()]);
    }).then(() => {
      state.feedItems = [];
      state.feedPage = 0;
      state.feedExhausted = false;
      renderTab();
      showToast('数据已更新');
    }).catch(() => {});
  } catch (e) {
    state.error = '刷新失败';
    renderTab();
  }
  btn.classList.remove('spinning');
}

// ── Recommender (ported from HotApp) ──

// TOPIC_KEYWORDS 由 topic-keywords.js 提供（浏览器中通过 <script> 标签加载）

function Recommender() {
  this.interests = [];
  this.history = [];
  try { this.interests = JSON.parse(localStorage.getItem('toutiao_interests') || '[]'); } catch {}
  try { this.history = JSON.parse(localStorage.getItem('toutiao_history') || '[]'); } catch {}
}

Recommender.prototype.saveInterests = function() {
  localStorage.setItem('toutiao_interests', JSON.stringify(this.interests));
};
Recommender.prototype.toggleInterest = function(tag) {
  const i = this.interests.indexOf(tag);
  i >= 0 ? this.interests.splice(i, 1) : this.interests.push(tag);
  this.saveInterests();
};
Recommender.prototype.recordView = function(item) {
  const keywords = extractKeywords(item.title);
  this.history.push({ title: item.title, url: item.url || '', keywords, type: item.type, timestamp: Date.now() });
  if (this.history.length > 200) this.history = this.history.slice(-200);
  localStorage.setItem('toutiao_history', JSON.stringify(this.history));
  // Update implicit interests after each view
  this.updateImplicitInterests();
  // Update reading stats for achievements
  this.updateReadingStats();
};

Recommender.prototype.updateReadingStats = function() {
  if (typeof updateReadingStats === 'undefined') return; // Guard for test environment

  const today = new Date().toISOString().split('T')[0];
  const storedStats = localStorage.getItem('toutiao_readingStats');
  const stats = storedStats ? JSON.parse(storedStats) : { streak: 0, count: 0, lastRead: null };

  const updated = updateReadingStats(stats, today);
  localStorage.setItem('toutiao_readingStats', JSON.stringify(updated));

  // Check for new milestones
  const totalArticles = this.history.length;
  const badges = checkMilestones(totalArticles);
  const prevBadges = JSON.parse(localStorage.getItem('toutiao_badges') || '[]');

  const newBadges = badges.filter(b => !prevBadges.includes(b));
  if (newBadges.length > 0) {
    localStorage.setItem('toutiao_badges', JSON.stringify(badges));
    // Show achievement notification
    const badgeNames = { bronze: '铜牌', silver: '银牌', gold: '金牌' };
    newBadges.forEach(badge => {
      if (typeof showToast === 'function') {
        showToast(`🏆 恭喜获得${badgeNames[badge]}阅读达人徽章！`);
      }
    });
  }
};

Recommender.prototype.getReadingStats = function() {
  if (typeof updateReadingStats === 'undefined') return { streak: 0, count: 0 };

  const storedStats = localStorage.getItem('toutiao_readingStats');
  const stats = storedStats ? JSON.parse(storedStats) : { streak: 0, count: 0, lastRead: null };
  const badges = JSON.parse(localStorage.getItem('toutiao_badges') || '[]');

  return {
    ...stats,
    totalArticles: this.history.length,
    badges
  };
};
Recommender.prototype.getBehaviorWeights = function() {
  return getDecayedBehaviorWeights(this.history, Date.now());
};

Recommender.prototype.updateImplicitInterests = function() {
  const implicit = computeImplicitInterests(this.history);
  // Merge implicit interests with manual interests (no duplicates)
  const manual = this.interests;
  const merged = [...new Set([...manual, ...implicit])];
  if (JSON.stringify(merged) !== JSON.stringify(this.interests)) {
    this.interests = merged;
    this.saveInterests();
  }
};

function extractKeywords(text) {
  const words = [];
  for (const kws of Object.values(TOPIC_KEYWORDS)) {
    for (const kw of kws) {
      if (text.includes(kw) && !words.includes(kw)) words.push(kw);
    }
  }
  return words;
}

function computeImplicitInterests(history) {
  const now = Date.now();
  const topicScores = {};

  // Count keyword matches per topic with time decay
  for (const h of history) {
    const ageDays = (now - h.timestamp) / 86400000;
    if (ageDays > 30) continue; // Ignore items older than 30 days

    const decay = Math.exp(-ageDays / 14); // 14-day half-life

    for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
      let matchCount = 0;
      for (const kw of keywords) {
        if (h.keywords.includes(kw)) matchCount++;
      }
      if (matchCount > 0) {
        topicScores[topic] = (topicScores[topic] || 0) + matchCount * decay;
      }
    }
  }

  // Return topics with score >= 3 (threshold for auto-discovery)
  return Object.entries(topicScores)
    .filter(([_, score]) => score >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([topic, _]) => topic);
}

function getDecayedBehaviorWeights(history, now) {
  const weights = {};
  const currentTime = now || Date.now();

  for (const h of history) {
    const ageDays = (currentTime - h.timestamp) / 86400000;
    if (ageDays > 30) continue; // Ignore items older than 30 days

    const decay = Math.exp(-ageDays / 7); // 7-day half-life for behavior weights

    for (const kw of h.keywords) {
      weights[kw] = (weights[kw] || 0) + decay;
    }
  }

  return weights;
}

// ── Unread Tracking ──

function isArticleRead(article, history) {
  if (!article || !history || history.length === 0) return false;

  return history.some(h => {
    // Match by URL if both have URLs
    if (article.url && h.url && article.url === h.url) return true;
    // Match by title
    if (article.title && h.title && article.title === h.title) return true;
    return false;
  });
}

function getUnreadCount(articles, history) {
  if (!articles || articles.length === 0) return 0;

  const unreadCount = articles.filter(article => !isArticleRead(article, history)).length;
  return unreadCount;
}

// ── Read Later ──

function getReadLaterList() {
  const raw = localStorage.getItem('toutiao_readLater');
  return raw ? JSON.parse(raw) : [];
}

function isReadLater(id) {
  const list = getReadLaterList();
  return list.some(item => item.id === id);
}

function toggleReadLater(article) {
  const list = getReadLaterList();
  const index = list.findIndex(item => item.id === article.id);

  if (index >= 0) {
    // Remove from list
    list.splice(index, 1);
  } else {
    // Add to list (newer first)
    list.unshift({
      id: article.id,
      title: article.title,
      url: article.url || article.link,
      source: article.source,
      type: article.type,
      image: article.image || article.image_url,
      timestamp: Date.now()
    });
  }

  localStorage.setItem('toutiao_readLater', JSON.stringify(list));
  return index < 0; // Return true if added, false if removed
}

// ── In-App Reader ──

let readerFontSize = 'md';
try { readerFontSize = localStorage.getItem('toutiao_readerFont') || 'md'; } catch {}

async function openReader(article) {
  const overlay = document.createElement('div');
  overlay.className = 'reader-overlay';
  overlay.innerHTML = `<div class="reader-modal">
    <div class="reader-header">
      <div class="reader-header-left">
        <span class="reader-source">${escapeHtml(article.source || '未知来源')}</span>
        <span class="reader-time">${article.pub_date ? formatTime(article.pub_date) : ''}</span>
      </div>
      <button class="reader-close" title="关闭">×</button>
    </div>
    <div class="reader-toolbar">
      <button class="reader-tool-btn ${readerFontSize === 'sm' ? 'active' : ''}" data-font="sm">小字</button>
      <button class="reader-tool-btn ${readerFontSize === 'md' ? 'active' : ''}" data-font="md">中字</button>
      <button class="reader-tool-btn ${readerFontSize === 'lg' ? 'active' : ''}" data-font="lg">大字</button>
      <span class="spacer"></span>
    </div>
    <div class="reader-body">
      <h1 class="reader-title">${escapeHtml(article.title || '')}</h1>
      <div class="reader-loading">
        <div class="spinner"></div>
        <p>正在加载全文...</p>
      </div>
    </div>
    <div class="reader-footer">
      <button class="reader-footer-btn" data-action="bookmark">${isBookmarked(article.id) ? '⭐ 已收藏' : '☆ 收藏'}</button>
      <button class="reader-footer-btn" data-action="share">📤 分享</button>
      <span class="spacer"></span>
      <button class="reader-footer-btn primary" data-action="original">🔗 原文打开</button>
    </div>
  </div>`;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  // Push history so mobile back button closes reader instead of leaving page
  let readerClosed = false;
  const close = () => {
    if (readerClosed) return;
    readerClosed = true;
    window.removeEventListener('popstate', onPopState);
    overlay.remove();
    document.body.style.overflow = '';
  };
  const onPopState = () => close();
  history.pushState({ reader: true }, '');
  window.addEventListener('popstate', onPopState);

  overlay.querySelector('.reader-close').addEventListener('click', () => {
    close();
    // Consume the history entry so browser doesn't think there's a page to go back to
    if (history.state && history.state.reader) history.back();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
      if (history.state && history.state.reader) history.back();
    }
  });

  // Font size controls
  overlay.querySelectorAll('.reader-tool-btn[data-font]').forEach(btn => {
    btn.addEventListener('click', () => {
      readerFontSize = btn.dataset.font;
      localStorage.setItem('toutiao_readerFont', readerFontSize);
      overlay.querySelectorAll('.reader-tool-btn[data-font]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const content = overlay.querySelector('.reader-content');
      if (content) {
        content.classList.remove('font-sm', 'font-md', 'font-lg');
        content.classList.add('font-' + readerFontSize);
      }
    });
  });

  // Footer actions
  overlay.querySelector('[data-action="bookmark"]').addEventListener('click', (e) => {
    toggleBookmark(article);
    const nowStarred = isBookmarked(article.id);
    e.currentTarget.textContent = nowStarred ? '⭐ 已收藏' : '☆ 收藏';
  });

  overlay.querySelector('[data-action="share"]').addEventListener('click', () => {
    shareItem({ title: article.title, url: article.url || article.link, source: article.source });
  });

  overlay.querySelector('[data-action="original"]').addEventListener('click', () => {
    if (article.url || article.link) window.open(article.url || article.link, '_blank');
  });

  // Fetch content
  const body = overlay.querySelector('.reader-body');
  const titleEl = body.querySelector('.reader-title');

  try {
    const url = article.url || article.link;
    const res = await fetch(`/api/reader?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(15000) });
    const data = await res.json();

    if (data.error) {
      body.innerHTML = `<h1 class="reader-title">${escapeHtml(article.title || '')}</h1>
        <div class="reader-error">
          <p>😔 全文加载失败</p>
          <p style="font-size:13px;margin-top:8px">${escapeHtml(article.summary || '暂无摘要')}</p>
          <button class="btn-open-original" onclick="window.open('${escapeHtml(url || '#')}','_blank')">🔗 打开原文阅读</button>
        </div>`;
      return;
    }

    if (data.title) titleEl.textContent = data.title;

    // Sanitize and render content
    const contentHtml = sanitizeReaderContent(data.content || '');
    body.innerHTML = `<h1 class="reader-title">${escapeHtml(data.title || article.title || '')}</h1>
      <div class="reader-content font-${readerFontSize}">${contentHtml}</div>`;

    // Image error handling
    body.querySelectorAll('.reader-content img').forEach(img => {
      img.addEventListener('error', () => {
        img.style.display = 'none';
      });
    });
  } catch (e) {
    body.innerHTML = `<h1 class="reader-title">${escapeHtml(article.title || '')}</h1>
      <div class="reader-error">
        <p>😔 网络请求失败</p>
        <p style="font-size:13px;margin-top:8px">${escapeHtml(article.summary || '暂无摘要')}</p>
        <button class="btn-open-original" onclick="window.open('${escapeHtml(article.url || article.link || '#')}','_blank')">🔗 打开原文阅读</button>
      </div>`;
  }
}

function sanitizeReaderContent(html) {
  // Basic sanitization - remove dangerous tags but keep formatting
  let clean = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
  return clean;
}

// ── Share ──

// ── Share Card Generation ──

function generateShareCard(item) {
  const { title, source, summary, image, url } = item;

  // Escape HTML to prevent XSS
  const escapeHtml = (str) => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Truncate summary to ~100 characters
  const truncatedSummary = summary
    ? (summary.length > 100 ? summary.substring(0, 97) + '...' : summary)
    : '';

  let html = '<div class="share-card">';
  html += '<div class="share-header">';
  html += `<div class="share-source">${escapeHtml(source || '今日热榜')}</div>`;
  html += '</div>';

  if (image) {
    html += `<div class="share-image"><img src="${escapeHtml(image)}" alt="" /></div>`;
  }

  html += '<div class="share-body">';
  html += `<h3 class="share-title">${escapeHtml(title)}</h3>`;

  if (truncatedSummary) {
    html += `<p class="share-summary">${escapeHtml(truncatedSummary)}</p>`;
  }

  html += '</div>';

  html += '<div class="share-footer">';
  html += '<div class="qr-code"></div>';
  html += '<div class="share-text">扫码查看详情</div>';
  html += '</div>';

  html += '</div>';

  return html;
}

function generateQRCode(url) {
  // Simple QR code generator using SVG
  // This is a simplified version - in production, you'd use a library like qrcode.js

  const size = 120;
  const modules = 25; // QR code size in modules
  const moduleSize = size / modules;

  // Generate a simple pattern based on the URL
  // In production, this would be a proper QR encoding algorithm
  let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`;

  // White background
  svg += `<rect width="${size}" height="${size}" fill="white"/>`;

  // Generate QR pattern (simplified - just creates a pattern based on URL hash)
  const hash = Array.from(url || '').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);

  // Draw finder patterns (the three squares in corners)
  const drawFinderPattern = (x, y) => {
    // Outer square
    svg += `<rect x="${x}" y="${y}" width="${moduleSize * 7}" height="${moduleSize * 7}" fill="black"/>`;
    // Inner white square
    svg += `<rect x="${x + moduleSize}" y="${y + moduleSize}" width="${moduleSize * 5}" height="${moduleSize * 5}" fill="white"/>`;
    // Inner black square
    svg += `<rect x="${x + moduleSize * 2}" y="${y + moduleSize * 2}" width="${moduleSize * 3}" height="${moduleSize * 3}" fill="black"/>`;
  };

  drawFinderPattern(0, 0);
  drawFinderPattern(size - moduleSize * 7, 0);
  drawFinderPattern(0, size - moduleSize * 7);

  // Generate data modules based on URL hash
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      // Skip finder patterns
      if ((row < 8 && col < 8) || (row < 8 && col > modules - 9) || (row > modules - 9 && col < 8)) {
        continue;
      }

      // Pseudo-random pattern based on hash
      const bit = ((hash + row * 31 + col * 17) >> ((row + col) % 8)) & 1;
      if (bit) {
        svg += `<rect x="${col * moduleSize}" y="${row * moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="black"/>`;
      }
    }
  }

  svg += '</svg>';
  return svg;
}

async function shareItem(item) {
  const url = item.url || window.location.href;
  const shortUrl = await getShortLink(item, url);

  // Show share card modal
  showShareCardModal({ ...item, url: shortUrl });
}

function showShareCardModal(item) {
  // Generate share card HTML
  const cardHtml = generateShareCard(item);

  // Generate QR code
  const qrCodeSvg = generateQRCode(item.url);

  // Create modal overlay
  const modal = document.createElement('div');
  modal.className = 'share-modal-overlay';
  modal.innerHTML = `
    <div class="share-modal">
      <div class="share-modal-header">
        <h3>分享文章</h3>
        <button class="share-modal-close">&times;</button>
      </div>
      <div class="share-modal-body">
        ${cardHtml}
      </div>
      <div class="share-modal-actions">
        <button class="share-btn share-btn-primary" data-action="copy-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
          复制链接
        </button>
        <button class="share-btn share-btn-secondary" data-action="download">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          下载图片
        </button>
        ${navigator.share ? `
          <button class="share-btn share-btn-secondary" data-action="native-share">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
            系统分享
          </button>
        ` : ''}
      </div>
    </div>
  `;

  // Insert QR code into the card
  const qrContainer = modal.querySelector('.qr-code');
  if (qrContainer) {
    qrContainer.innerHTML = qrCodeSvg;
  }

  document.body.appendChild(modal);

  // Event handlers
  const closeModal = () => modal.remove();

  modal.querySelector('.share-modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  modal.querySelector('[data-action="copy-link"]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(item.url);
      showToast('链接已复制');
    } catch (e) {
      copyLink(item.url);
    }
  });

  modal.querySelector('[data-action="download"]').addEventListener('click', () => {
    downloadShareCard(modal.querySelector('.share-card'), item.title);
  });

  const nativeShareBtn = modal.querySelector('[data-action="native-share"]');
  if (nativeShareBtn) {
    nativeShareBtn.addEventListener('click', async () => {
      try {
        await navigator.share({
          title: item.title,
          text: `${item.title} — 来自${item.source || '今日热榜'}`,
          url: item.url
        });
        closeModal();
      } catch (e) {
        if (e.name !== 'AbortError') {
          console.error('Share failed:', e);
        }
      }
    });
  }
}

function downloadShareCard(cardElement, title) {
  // Create a canvas to render the card
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Set canvas size (2x for retina)
  const scale = 2;
  canvas.width = 800 * scale;
  canvas.height = 1000 * scale;
  ctx.scale(scale, scale);

  // Draw background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 800, 1000);

  // Draw header
  ctx.fillStyle = '#4f6ef6';
  ctx.fillRect(0, 0, 800, 60);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('今日热榜', 30, 40);

  // Draw source
  ctx.fillStyle = '#666666';
  ctx.font = '16px sans-serif';
  ctx.fillText(item.source || '未知来源', 30, 100);

  // Draw title
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 32px sans-serif';
  const titleLines = wrapText(ctx, title || '无标题', 740);
  let y = 150;
  titleLines.forEach(line => {
    ctx.fillText(line, 30, y);
    y += 40;
  });

  // Draw summary if exists
  if (item.summary) {
    y += 20;
    ctx.fillStyle = '#666666';
    ctx.font = '18px sans-serif';
    const summaryLines = wrapText(ctx, item.summary.substring(0, 150), 740);
    summaryLines.forEach(line => {
      ctx.fillText(line, 30, y);
      y += 28;
    });
  }

  // Draw QR code area
  const qrY = 850;
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(30, qrY, 740, 120);
  ctx.fillStyle = '#666666';
  ctx.font = '14px sans-serif';
  ctx.fillText('扫码查看详情', 180, qrY + 65);

  // Convert to blob and download
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || '分享'}.png`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('图片已下载');
  });
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split('');
  const lines = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine + words[i];
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine);

  return lines.slice(0, 4); // Max 4 lines
}

async function getShortLink(item, originalUrl) {
  try {
    const res = await fetch('/api/shorten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: originalUrl, title: item.title, source: item.source || '', image: item.image || '', platform: item.platform || '' })
    });
    const data = await res.json();
    if (data.short) return data.short;
  } catch {}
  return originalUrl;
}

function copyLink(url) {
  const text = url || window.location.href;
  navigator.clipboard.writeText(text).then(() => {
    showToast('链接已复制');
  }).catch(() => {
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
    showToast('链接已复制');
  });
}

// ── Bookmarks ──

function getBookmarks() {
  try { return JSON.parse(localStorage.getItem('toutiao_bookmarks') || '[]'); } catch { return []; }
}
function toggleBookmark(item) {
  let list = getBookmarks();
  const idx = list.findIndex(b => b.id === item.id);
  if (idx >= 0) { list.splice(idx, 1); showToast('已取消收藏'); }
  else {
    list.unshift({ id: item.id, title: item.title, url: item.url, source: item.source, type: item.type, platform: item.platform || '', timestamp: Date.now(), image: item.image || null });
    showToast('已收藏');
  }
  localStorage.setItem('toutiao_bookmarks', JSON.stringify(list));
}
function isBookmarked(id) {
  return getBookmarks().some(b => b.id === id);
}

// ── Dislike ──

function getDisliked() {
  try { return JSON.parse(localStorage.getItem('toutiao_disliked') || '[]'); } catch { return []; }
}
function addDislike(title) {
  const kws = extractKeywords(title);
  let list = getDisliked();
  for (const kw of kws) { if (!list.includes(kw)) list.push(kw); }
  localStorage.setItem('toutiao_disliked', JSON.stringify(list));
}
function removeDislike(kw) {
  let list = getDisliked();
  list = list.filter(k => k !== kw);
  localStorage.setItem('toutiao_disliked', JSON.stringify(list));
}
function clearDisliked() {
  localStorage.setItem('toutiao_disliked', '[]');
}

// ── Theme ──

function initTheme() {
  let theme = 'auto';
  try { theme = localStorage.getItem('toutiao_theme') || 'auto'; } catch {}

  // 根据主题设置 data-theme 属性
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    // auto 模式：移除 data-theme，让 CSS 的 prefers-color-scheme 生效
    document.documentElement.removeAttribute('data-theme');
  }

  // 更新按钮图标
  const btn = $('#btnTheme');
  if (btn) {
    if (theme === 'dark') {
      btn.textContent = '☀️';
    } else if (theme === 'light') {
      btn.textContent = '🌙';
    } else {
      // auto 模式显示系统当前偏好的反向图标
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      btn.textContent = prefersDark ? '☀️' : '🌙';
    }
  }
}
function toggleTheme() {
  const html = document.documentElement;
  const currentTheme = localStorage.getItem('toutiao_theme') || 'auto';

  let newTheme;
  if (currentTheme === 'auto') {
    // 从 auto 切换到当前系统偏好的反向
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    newTheme = prefersDark ? 'light' : 'dark';
  } else if (currentTheme === 'dark') {
    newTheme = 'light';
  } else {
    newTheme = 'dark';
  }

  localStorage.setItem('toutiao_theme', newTheme);

  if (newTheme === 'dark') {
    html.setAttribute('data-theme', 'dark');
    const btn = $('#btnTheme');
    if (btn) btn.textContent = '☀️';
  } else if (newTheme === 'light') {
    html.setAttribute('data-theme', 'light');
    const btn = $('#btnTheme');
    if (btn) btn.textContent = '🌙';
  }
}

// ── Hybrid scoring ──

const EVENT_STOP_WORDS = new Set([
  '一个', '一位', '相关', '最新', '正式', '宣布', '回应', '网友', '话题', '冲上', '热搜',
  '什么', '为何', '如何', '已经', '再次', '进行', '发布会', '消息', '视频', '全文'
]);

function normalizeEventTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[｜|].*$/g, '')
    .replace(/[-_—].*(微博|头条|知乎|百度|热搜|新闻).*$/g, '')
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function extractEventKeywords(title) {
  const normalized = normalizeEventTitle(title);
  const matches = normalized.match(/[\p{Script=Han}A-Za-z0-9]{2,}/gu) || [];
  const keywords = [];

  for (const word of matches) {
    if (/^\d+$/.test(word)) continue;
    if (word.length < 2) continue;
    if (EVENT_STOP_WORDS.has(word)) continue;
    if (!keywords.includes(word)) keywords.push(word);
    if (keywords.length >= 6) break;
  }

  for (const kws of Object.values(TOPIC_KEYWORDS)) {
    for (const kw of kws) {
      if (normalized.includes(kw.toLowerCase()) && !keywords.includes(kw)) {
        keywords.push(kw);
        if (keywords.length >= 6) return keywords;
      }
    }
  }

  return keywords;
}

function getEventWindow(item) {
  if (!item || !Number.isFinite(item.timestamp)) return null;
  return Math.floor(item.timestamp / 86400000);
}

function getOverlapCount(a, b) {
  const bSet = new Set(b);
  return a.filter(word => bSet.has(word)).length;
}

function isSameEvent(a, b) {
  const titleA = normalizeEventTitle(a && a.title);
  const titleB = normalizeEventTitle(b && b.title);
  if (!titleA || !titleB) return false;

  const windowA = getEventWindow(a);
  const windowB = getEventWindow(b);
  if (windowA !== null && windowB !== null && windowA !== windowB) return false;

  if (titleA.includes(titleB) || titleB.includes(titleA)) {
    return Math.min(titleA.length, titleB.length) >= 8;
  }

  const keywordsA = extractEventKeywords(titleA);
  const keywordsB = extractEventKeywords(titleB);
  const overlap = getOverlapCount(keywordsA, keywordsB);
  const minSize = Math.min(keywordsA.length, keywordsB.length);

  return overlap >= 2 && minSize >= 2;
}

function getReadPenalty(item, history) {
  return history.some(h => h.url && item.url && h.url === item.url)
    || history.some(h => h.title === item.title)
    ? 45
    : 0;
}

function scoreCandidate(item, context) {
  const now = context.now;
  const ageHours = (now - item.timestamp) / 3600000;
  let score = 0;

  const SOURCE_BOOST = { '头条': 8, '微博': 8 };
  score += SOURCE_BOOST[item.source] || 0;

  if (item.type === 'hot') {
    score += ((item.heatScore || 0) / (context.maxHeat || 1)) * 18;
  }

  if (ageHours <= 24) score += 18;
  else if (ageHours <= 72) score += Math.max(4, 18 - (ageHours - 24) * 0.25);

  for (const tag of context.interests) {
    const kws = TOPIC_KEYWORDS[tag] || [];
    if (kws.some(kw => item.title.includes(kw))) {
      score += 28;
      break;
    }
  }

  for (const [kw, weight] of Object.entries(context.behaviorWeights)) {
    if (item.title.includes(kw)) {
      score += Math.min(weight * 3, 12);
      break;
    }
  }

  if ((context.disliked || []).some(kw => item.title.includes(kw))) score -= 50;
  score -= getReadPenalty(item, context.history || []);

  return { ...item, score };
}

function rerankCandidates(items) {
  const PRIORITY_SOURCES = new Set(['头条', '微博']);
  const sourceQuota = new Map();
  const remaining = items.slice();
  const ranked = [];

  while (remaining.length) {
    let pickIndex = -1;

    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i];
      const count = sourceQuota.get(item.source) || 0;
      const prev = ranked[ranked.length - 1];
      const isPriority = PRIORITY_SOURCES.has(item.source);
      const maxPerSource = isPriority ? 5 : 3;
      const violatesQuota = ranked.length < 10 && count >= maxPerSource;
      const violatesAdjacent = prev && prev.source === item.source;

      if (!violatesQuota && !violatesAdjacent) {
        pickIndex = i;
        break;
      }
    }

    if (pickIndex === -1) pickIndex = 0;

    const [picked] = remaining.splice(pickIndex, 1);
    ranked.push(picked);
    sourceQuota.set(picked.source, (sourceQuota.get(picked.source) || 0) + 1);
  }

  return ranked;
}

function rerankDuplicateEvents(items, windowSize = 5) {
  const remaining = items.slice();
  const ranked = [];

  while (remaining.length) {
    let pickIndex = -1;

    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i];
      const recent = ranked.slice(Math.max(0, ranked.length - windowSize));
      const duplicatesRecent = recent.some(selected => isSameEvent(selected, item));

      if (!duplicatesRecent) {
        pickIndex = i;
        break;
      }
    }

    if (pickIndex === -1) pickIndex = 0;

    const [picked] = remaining.splice(pickIndex, 1);
    ranked.push(picked);
  }

  return ranked;
}

// ── Recommendation Algorithm Enhancements ──

function reduceRandomness(baseScore, seed) {
  // Reduce random range from ±50 to ±15
  // Use deterministic seed if provided for testability
  let random;
  if (seed) {
    // Simple hash-based pseudo-random
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    random = (Math.abs(hash) % 1000) / 1000; // 0-1
  } else {
    random = Math.random();
  }

  return (random - 0.5) * 30; // ±15 range
}

function calculateMMR(items, count, options = {}) {
  const lambda = options.lambda !== undefined ? options.lambda : 0.5;
  const result = [];

  if (!items || items.length === 0) return result;

  const remaining = [...items];

  // Sort by score to ensure we start with highest relevance
  remaining.sort((a, b) => b.score - a.score);

  while (result.length < count && remaining.length > 0) {
    let bestMMRScore = -Infinity;
    let bestIndex = 0;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];

      // Relevance component (normalized score)
      const maxScore = remaining[0].score; // Already sorted
      const relevance = candidate.score / maxScore;

      // Diversity component (max similarity to already selected items)
      let maxSimilarity = 0;
      if (result.length > 0 && candidate.keywords) {
        for (const selected of result) {
          if (selected.keywords) {
            const similarity = calculateJaccardSimilarity(candidate.keywords, selected.keywords);
            maxSimilarity = Math.max(maxSimilarity, similarity);
          }
        }
      }

      // MMR formula: λ * Relevance - (1 - λ) * MaxSimilarity
      const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarity;

      if (mmrScore > bestMMRScore) {
        bestMMRScore = mmrScore;
        bestIndex = i;
      }
    }

    // Move best item from remaining to result
    const [bestItem] = remaining.splice(bestIndex, 1);
    result.push(bestItem);
  }

  return result;
}

function calculateJaccardSimilarity(setA, setB) {
  if (!setA || !setB || setA.length === 0 || setB.length === 0) return 0;

  const a = new Set(setA);
  const b = new Set(setB);

  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);

  return intersection.size / union.size;
}

function buildHybridFeed() {
  const unified = [];
  const now = Date.now();

  const shownIds = JSON.parse(sessionStorage.getItem('toutiao_shown') || '[]');

  for (const a of state.articles) {
    const id = 'rss_' + a.id;
    if (shownIds.includes(id)) continue;
    unified.push({
      id,
      title: a.title,
      url: a.link || '',
      image: a.image_url || null,
      source: a.source_name,
      type: 'rss',
      heatScore: 0,
      timestamp: a.pub_date ? new Date(a.pub_date).getTime() : now
    });
  }

  for (const h of state.hotItems) {
    if (shownIds.includes(h.id)) continue;
    unified.push({
      id: h.id,
      title: h.title,
      url: h.url || '',
      image: h.image || null,
      source: getPlatformName(h.platform),
      platform: h.platform,
      type: 'hot',
      heatScore: h.heatScore || 0,
      timestamp: h.timestamp || now
    });
  }

  if (!unified.length) {
    sessionStorage.removeItem('toutiao_shown');
    const replay = [];
    for (const a of state.articles) {
      replay.push({ id: 'rss_' + a.id, title: a.title, url: a.link || '', image: a.image_url || null, source: a.source_name, type: 'rss', heatScore: 0, timestamp: a.pub_date ? new Date(a.pub_date).getTime() : now, _replay: true });
    }
    for (const h of state.hotItems) {
      replay.push({ id: h.id, title: h.title, url: h.url || '', image: h.image || null, source: getPlatformName(h.platform), platform: h.platform, type: 'hot', heatScore: h.heatScore || 0, timestamp: h.timestamp || now, _replay: true });
    }
    if (!replay.length) return [];
    return replay;
  }

  const maxHeat = Math.max(...unified.map(i => i.heatScore || 0), 1);
  const bw = state.recommender.getBehaviorWeights();

  const scored = unified.map(item => {
    const scoredItem = scoreCandidate(item, {
      now,
      interests: state.recommender.interests,
      behaviorWeights: bw,
      disliked: getDisliked(),
      history: state.recommender.history,
      maxHeat
    });
    const ageMin = (now - item.timestamp) / 60000;
    let score = scoredItem.score;

    if (item.type === 'rss') {
      score += Math.max(0, 40 - ((now - item.timestamp) / 3600000) * 1.5);
    }

    score += Math.max(0, 10 - ageMin * 0.5);

    // 使用降低的随机性（±15 而非 ±50）
    score += reduceRandomness(score);

    let reason = '热门推荐';
    for (const tag of state.recommender.interests) {
      const kws = TOPIC_KEYWORDS[tag] || [];
      if (kws.some(kw => item.title.includes(kw))) { reason = `你关注「${tag}」`; break; }
    }

    // 提取关键词用于 MMR 多样性计算
    const keywords = extractEventKeywords(item.title);

    return { ...scoredItem, score, reason, keywords };
  });

  scored.sort((a, b) => b.score - a.score);

  const top8 = scored.slice(0, 8);
  const rssCount = top8.filter(i => i.type === 'rss').length;
  const hotCount = top8.filter(i => i.type === 'hot').length;
  if (rssCount < 2 && hotCount > 0) {
    const bestRss = scored.filter(i => i.type === 'rss').find(i => !top8.includes(i));
    if (bestRss) bestRss.score += 5;
  } else if (hotCount < 2 && rssCount > 0) {
    const bestHot = scored.filter(i => i.type === 'hot').find(i => !top8.includes(i));
    if (bestHot) bestHot.score += 5;
  }
  scored.sort((a, b) => b.score - a.score);

  // 使用 MMR 算法进行重排序，平衡相关性和多样性
  // lambda=0.7 表示 70% 权重给相关性，30% 权重给多样性
  const mmrRanked = calculateMMR(scored, 50, { lambda: 0.7 });

  const ranked = mmrRanked;
  const topIds = ranked.slice(0, 30).map(i => i.id);
  shownIds.push(...topIds);
  sessionStorage.setItem('toutiao_shown', JSON.stringify(shownIds));

  return ranked;
}

// ── Daily Digest ──

function renderDailyDigest() {
  const top5 = selectRecommendDigestItems(state.hotItems, state.recommender.interests);
  if (!top5.length) return '';

  const label = getDigestLabel();
  const items = top5.map((h, i) => {
    const plat = getPlatformName(h.platform);
    return `<div class="digest-item" onclick="window.open('${escapeHtml(h.url || '#')}','_blank')">
      <span class="rank-num ${i === 0 ? 'top1' : (i < 3 ? 'top3' : '')}" style="font-size:14px;min-width:20px">${i + 1}</span>
      <span class="digest-title">${escapeHtml(h.title)}</span>
      <span class="platform-badge ${h.platform}" style="flex-shrink:0">${plat}</span>
    </div>`;
  }).join('');

  return `<div class="digest-card">
    <div class="digest-header">${label}</div>
    ${items}
  </div>`;
}

// ── Tab rendering ──

function renderTab() {
  state.error = null;
  if (state.currentTab === 'recommend') renderRecommendTab();
  else if (state.currentTab === 'hot') renderHotTab();
  else if (state.currentTab === 'rss') renderRssTab();
  else if (state.currentTab === 'readlater') renderReadLaterTab();
  else if (state.currentTab === 'achievements') renderAchievementsTab();
  else if (state.currentTab === 'bookmark') renderBookmarkTab();
  else if (state.currentTab === 'history') renderHistoryTab();
  else if (state.currentTab === 'dislike') renderDislikeTab();
}

function renderSubTabs(items, activeKey, onClick, showAll = true) {
  const bar = $('#subTabBar');
  const allBtn = showAll ? `<button class="sub-tab ${!activeKey ? 'active' : ''}" data-key="">全部</button>` : '';
  bar.innerHTML = `<div class="sub-tabs">
    ${allBtn}
    ${items.map(k => `<button class="sub-tab ${activeKey === k.key ? 'active' : ''}" data-key="${k.key}">${k.label}</button>`).join('')}
  </div>`;
  bar.querySelectorAll('.sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      bar.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onClick(btn.dataset.key || null);
    });
  });
}

function renderRecommendTab() {
  const area = $('#contentArea');

  // 首次加载：保留骨架屏，在骨架屏后渲染兴趣标签
  if (state.initialLoad && $('#skeletonLoader')) {
    renderInterestTags();
    return;
  }

  const digestHtml = renderDailyDigest();
  renderInterestTags();

  if (!state.feedItems.length) {
    state.feedItems = buildHybridFeed();
    state.feedPage = 0;
    state.feedExhausted = false;
  }

  area.innerHTML = `
    ${digestHtml}
    <div class="feed-grid" id="feedGrid"></div>
    <div class="feed-sentinel" id="feedSentinel"></div>
    <div class="feed-loading" id="feedLoading">⏳ 加载中...</div>
  `;

  const interests = state.recommender.interests;
  if (interests.length) {
    area.insertAdjacentHTML('beforeend', `<div class="reason-summary">推荐依据：${interests.map(t => `<span class="reason-tag">${t}</span>`).join('')}</div>`);
  }

  feedInit();
}

function feedInit() {
  state.feedPage = 0;
  state.feedLoading = false;
  state.feedExhausted = false;
  state.feedShownIds = new Set();
  $('#feedGrid').innerHTML = '';

  if (state.feedObserver) state.feedObserver.disconnect();

  state.feedObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !state.feedLoading && !state.feedExhausted) {
      loadFeedPage();
    }
  }, { rootMargin: '200px' });

  state.feedObserver.observe($('#feedSentinel'));
  loadFeedPage();
}

function loadFeedPage() {
  if (state.feedLoading || state.feedExhausted) return;
  state.feedLoading = true;
  $('#feedLoading').style.display = 'block';

  if (!state.feedShownIds) state.feedShownIds = new Set();

  // 过滤已展示，从剩余列表头部取
  const remaining = state.feedItems.filter(item => !state.feedShownIds.has(item.id));
  const batch = remaining.slice(0, 10);

  if (!batch.length) {
    state.feedExhausted = true;
    $('#feedLoading').textContent = '✨ 已加载全部内容';
    state.feedLoading = false;
    return;
  }

  setTimeout(() => {
    const grid = $('#feedGrid');
    const gradients = [
      'linear-gradient(135deg,#667eea,#764ba2)','linear-gradient(135deg,#f093fb,#f5576c)',
      'linear-gradient(135deg,#4facfe,#00f2fe)','linear-gradient(135deg,#43e97b,#38f9d7)',
      'linear-gradient(135deg,#fa709a,#fee140)','linear-gradient(135deg,#a18cd1,#fbc2eb)',
      'linear-gradient(135deg,#fccb90,#d57eeb)','linear-gradient(135deg,#96fbc4,#f9f586)',
    ];
    batch.forEach((item, i) => {
      state.feedShownIds.add(item.id);
      const g = gradients[(state.feedPage * 10 + i) % gradients.length];
      const SOURCE_ICONS = { '头条':'📰','微博':'🔥','百度':'🔍','知乎':'💡','虎扑':'🏀','IT之家':'💻','36氪':'💰','虎嗅':'📊','少数派':'⚡','贴吧':'💬','GitHub':'🐙','V2EX':'💬' };
      const icon = SOURCE_ICONS[item.source] || (item.type === 'hot' ? '🔥' : '📝');
      const imgHtml = item.image
        ? `<div class="feed-img-wrap"><img src="${escapeHtml(item.image)}" alt="" loading="lazy" onerror="this.style.opacity='0';this.parentElement.querySelector('.fallback').style.display='flex'"><div class="fallback" style="background:${g};display:none">${icon}</div></div>`
        : `<div class="feed-img-wrap"><div class="fallback" style="background:${g};display:flex">${icon}</div></div>`;

      // Check if item has been read
      const isRead = isArticleRead({ title: item.title, url: item.url }, state.recommender.history);
      const readClass = isRead ? ' read' : '';
      const unreadBadge = isRead ? '' : '<span class="unread-badge">未读</span>';

      const card = document.createElement('div');
      card.className = 'feed-card' + readClass;
      card.classList.add('fade-in');
      const starred = isBookmarked(item.id);
      card.innerHTML = `${imgHtml}<div class="feed-title">${escapeHtml(item.title)}${unreadBadge}</div><div class="feed-meta"><span class="platform-badge ${item.type === 'rss' ? 'ithome' : item.platform}">${escapeHtml(item.source)}</span><span class="feed-type-badge">${item.type === 'rss' ? '资讯' : '热搜'}</span></div><div class="feed-reason">${item.reason}</div>${buildCardActions({ share: true, bookmark: { starred }, readLater: { id: item.id, title: item.title, url: item.url, source: item.source, type: item.type, image: item.image }, hide: true })}`;
      card.addEventListener('click', (e) => {
        if (e.target.closest('.card-action-btn')) return;
        state.recommender.recordView(item);
        if (item.type === 'rss') {
          // RSS文章打开阅读视图
          openReader({
            id: item.id,
            title: item.title,
            url: item.url,
            link: item.url,
            source: item.source,
            summary: '',
            pub_date: new Date(item.timestamp).toISOString()
          });
        } else {
          // 热搜直接跳外链
          if (item.url) window.open(item.url, '_blank');
        }
      });
      card.querySelector('[data-action="share"]').addEventListener('click', (e) => {
        e.stopPropagation();
        shareItem(item);
      });
      card.querySelector('[data-action="bookmark"]').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleBookmark(item);
        const nowStarred = isBookmarked(item.id);
        const btn = e.currentTarget;
        btn.classList.toggle('active', nowStarred);
        btn.innerHTML = `${starIcon(nowStarred)}<span>${starLabel(nowStarred)}</span>`;
      });
      card.querySelector('[data-action="readlater"]').addEventListener('click', (e) => {
        e.stopPropagation();
        const saved = toggleReadLater({ id: item.id, title: item.title, url: item.url, source: item.source, type: item.type, image: item.image });
        const btn = e.currentTarget;
        btn.classList.toggle('active', saved);
        btn.innerHTML = `${clockIcon(saved)}<span>${clockLabel(saved)}</span>`;
        showToast(saved ? '已添加到稍后阅读' : '已从稍后阅读移除');
      });
      card.querySelector('[data-action="hide"]').addEventListener('click', (e) => {
        e.stopPropagation();
        const titleKws = extractKeywords(item.title);
        addDislike(item.title);
        card.classList.add('fade-out');
        setTimeout(() => { card.remove(); }, 300);
        state.feedItems = buildHybridFeed();
        state.feedPage = 0;
        state.feedExhausted = false;
        const kw = titleKws.length ? titleKws[0] : item.title.slice(0, 10);
        showToast(`已减少"${kw}"相关内容`);
      });
      grid.appendChild(card);
    });
    state.feedPage++;
    state.feedLoading = false;
    $('#feedLoading').style.display = 'none';
  }, state.initialLoad ? 0 : 200);
}

function renderHotTab() {
  const area = $('#contentArea');

  const HIDDEN_PLATFORMS = ['hupu', 'ithome', 'sspai', 'tieba'];
  const platforms = {};
  for (const item of state.hotItems) {
    if (!platforms[item.platform] && !HIDDEN_PLATFORMS.includes(item.platform)) platforms[item.platform] = getPlatformName(item.platform);
  }
  const platList = Object.entries(platforms).map(([k, v]) => ({ key: k, label: v }));

  const defaultFilter = platList.length ? platList[0].key : null;
  if (!state.hotFilter && defaultFilter) {
    state.hotFilter = defaultFilter;
    localStorage.setItem('toutiao_hotFilter', defaultFilter);
  }

  renderSubTabs(platList, state.hotFilter, (key) => {
    state.hotFilter = key;
    localStorage.setItem('toutiao_hotFilter', key);
    const list = $('#trendingList');
    if (list) list.innerHTML = '';
    if (state.hotObserver) { state.hotObserver.disconnect(); state.hotObserver = null; }
    state.hotPage = 0;
    state.hotLoading = false;
    state.hotExhausted = false;
    renderHotList();
    state.hotObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !state.hotLoading && !state.hotExhausted) {
        renderHotList();
      }
    }, { rootMargin: '300px' });
    const sentinel = $('#hotSentinel');
    if (sentinel) state.hotObserver.observe(sentinel);
  }, false);

  renderErrorBanner();

  area.insertAdjacentHTML('beforeend', '<div class="trending-list" id="trendingList"></div><div class="feed-sentinel" id="hotSentinel"></div><div class="feed-loading" id="hotLoading" style="display:none">⏳ 加载中...</div>');

  hotResetPagination();
  renderHotList();
}

function hotResetPagination() {
  state.hotPage = 0;
  state.hotLoading = false;
  state.hotExhausted = false;
  if (state.hotObserver) state.hotObserver.disconnect();
  state.hotObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !state.hotLoading && !state.hotExhausted) {
      renderHotList();
    }
  }, { rootMargin: '300px' });
  const sentinel = $('#hotSentinel');
  if (sentinel) state.hotObserver.observe(sentinel);
}

function renderHotList() {
  const list = $('#trendingList');
  if (!list) return;

  let items = state.hotItems;
  if (state.hotFilter) items = items.filter(i => i.platform === state.hotFilter);

  if (!items.length) {
    list.innerHTML = `<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>暂无数据</p></div>`;
    return;
  }

  const pageSize = 20;
  const start = state.hotPage * pageSize;
  const end = start + pageSize;
  const batch = items.slice(start, end);

  if (!batch.length) {
    state.hotExhausted = true;
    const loading = $('#hotLoading');
    if (loading) { loading.textContent = '✨ 已加载全部'; }
    return;
  }

  const maxHeat = Math.max(...items.map(i => i.heatScore || 1), 1);
  const frag = document.createDocumentFragment();
  batch.forEach((item, i) => {
    const idx = start + i;
    const rc = idx === 0 ? 'top1' : (idx < 3 ? 'top3' : '');
    const pct = Math.round((item.heatScore / maxHeat) * 100);
    const bmId = 'h_' + item.id;
    const starred = isBookmarked(bmId);
    const div = document.createElement('div');
    div.className = 'trending-item';
    div.dataset.id = item.id;
    div.innerHTML = `<span class="rank-num ${rc}">${idx + 1}</span>
      <div class="trending-info">
        <div class="trending-title">${escapeHtml(item.title)}</div>
        <div class="trending-meta">
          <span class="platform-badge ${item.platform}">${getPlatformName(item.platform)}</span>
          <span>🔥 ${formatNumber(item.heatScore)}</span>
          <span>${timeAgo(item.timestamp)}</span>
        </div>
        <div class="heat-bar"><div class="heat-bar-fill" style="width:${pct}%"></div></div>
        ${buildCardActions({ share: true, bookmark: { starred, bmid: bmId, hid: item.id } })}
      </div>`;
    div.addEventListener('click', (e) => {
      if (e.target.closest('.card-action-btn')) return;
      const found = state.hotItems.find(x => String(x.id) === div.dataset.id);
      if (found) { state.recommender.recordView(found); if (found.url) window.open(found.url, '_blank'); }
    });
    div.querySelector('[data-action="share"]').addEventListener('click', (e) => {
      e.stopPropagation();
      const found = state.hotItems.find(x => String(x.id) === div.dataset.id);
      if (found) shareItem(found);
    });
    div.querySelector('[data-action="bookmark"]').addEventListener('click', (e) => {
      e.stopPropagation();
      const el = e.currentTarget;
      const found = state.hotItems.find(x => String(x.id) === el.dataset.hid);
      if (found) {
        const bm = { id: el.dataset.bmid, title: found.title, url: found.url || '', source: getPlatformName(found.platform), type: 'hot', platform: found.platform, image: found.image || null };
        toggleBookmark(bm);
        const nowStarred = isBookmarked(el.dataset.bmid);
        el.classList.toggle('active', nowStarred);
        el.innerHTML = `${starIcon(nowStarred)}<span>${starLabel(nowStarred)}</span>`;
      }
    });
    frag.appendChild(div);
  });
  list.appendChild(frag);
  state.hotPage++;

  const loading = $('#hotLoading');
  if (loading) {
    if (state.hotPage * pageSize < items.length) {
      loading.style.display = 'block';
      loading.textContent = '⏳ 加载中...';
    } else {
      loading.style.display = 'block';
      loading.textContent = '✨ 已加载全部';
    }
  }
}

function renderRssTab() {
  const area = $('#contentArea');

  const HIDDEN_RSS = ['钛媒体', 'InfoQ', 'SegmentFault', 'Solidot', 'OSCHINA'];
  const sourceList = state.sources.filter(s => !HIDDEN_RSS.includes(s.name)).map(s => ({ key: String(s.id), label: s.name }));
  renderSubTabs(sourceList, state.rssFilter, (key) => {
    state.rssFilter = key;
    localStorage.setItem('toutiao_rssFilter', key || '');
    loadArticles(100, state.rssFilter).then(() => renderRssList());
  });

  const srcCount = state.sources.length;
  const lastFetch = state.stats?.lastFetch ? formatTime(state.stats.lastFetch) : '尚未更新';
  area.insertAdjacentHTML('beforeend', `<div class="rss-freshness">📡 ${srcCount} 个数据源 · 最近更新: ${lastFetch}</div>`);

  area.insertAdjacentHTML('beforeend', '<div class="trending-list" id="rssList"></div>');
  loadArticles(100, state.rssFilter).then(() => renderRssList());
}

function renderRssList() {
  const list = $('#rssList');
  if (!list) return;

  let items = state.articles;
  if (state.rssFilter) items = items.filter(a => a.source_id === Number(state.rssFilter));

  if (!items.length) {
    list.innerHTML = `<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>暂无文章</p><p style="font-size:12px;margin-top:4px">点击右上角刷新按钮重新加载</p></div>`;
    return;
  }

  list.innerHTML = items.map(a => {
    const img = a.image_url ? `<div class="card-img-wrap"><img src="${escapeHtml(a.image_url)}" alt="" loading="lazy" onerror="this.closest('.card-img-wrap').remove()"></div>` : '';
    const bmId = 'rss_' + a.id;
    const starred = isBookmarked(bmId);
    const summary = a.summary ? a.summary.replace(/<[^>]*>/g, '').trim() : '';
    const isRead = isArticleRead({ title: a.title, url: a.link }, state.recommender.history);
    const readClass = isRead ? ' read' : '';
    const unreadBadge = isRead ? '' : '<span class="unread-badge">未读</span>';

    return `<article class="rss-article-card${readClass}" data-bmid="${bmId}" data-aid="${a.id}">
      ${img}
      <div class="card-header">
        <span class="source-badge">${escapeHtml(a.source_name)}</span>
        <span class="card-time">${formatTime(a.pub_date)}</span>
      </div>
      <h3 class="card-title">${escapeHtml(a.title)}${unreadBadge}</h3>
      ${summary ? `<p class="card-summary card-summary-clamp" data-expanded="false">${escapeHtml(summary)}</p><button class="summary-toggle">展开全文</button>` : ''}
      ${buildCardActions({ share: true, bookmark: { starred, bmid: bmId }, readLater: { id: bmId, title: a.title, url: a.link, source: a.source_name, type: 'rss', image: a.image_url } })}
    </article>`;
  }).join('');

  list.querySelectorAll('.rss-article-card [data-action="share"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const card = el.closest('.rss-article-card');
      const a = state.articles.find(x => String(x.id) === card.dataset.bmid.replace('rss_', ''));
      if (a) shareItem({ title: a.title, url: a.link || '' });
    });
  });

  list.querySelectorAll('.rss-article-card [data-action="bookmark"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const bmId = el.dataset.bmid;
      const aid = bmId.replace('rss_', '');
      const a = state.articles.find(x => String(x.id) === aid);
      if (a) {
        const bm = { id: bmId, title: a.title, url: a.link || '', source: a.source_name, type: 'rss', platform: '', image: a.image_url || null };
        toggleBookmark(bm);
        const nowStarred = isBookmarked(bmId);
        el.classList.toggle('active', nowStarred);
        el.innerHTML = `${starIcon(nowStarred)}<span>${starLabel(nowStarred)}</span>`;
      }
    });
  });

  list.querySelectorAll('.rss-article-card [data-action="readlater"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const bmId = el.closest('.rss-article-card').dataset.bmid;
      const aid = bmId.replace('rss_', '');
      const a = state.articles.find(x => String(x.id) === aid);
      if (a) {
        const saved = toggleReadLater({ id: bmId, title: a.title, url: a.link || '', source: a.source_name, type: 'rss', image: a.image_url || null });
        el.classList.toggle('active', saved);
        el.innerHTML = `${clockIcon(saved)}<span>${clockLabel(saved)}</span>`;
        showToast(saved ? '已添加到稍后阅读' : '已从稍后阅读移除');
      }
    });
  });

  // RSS卡片点击打开阅读视图
  list.querySelectorAll('.rss-article-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-action-btn') || e.target.closest('.summary-toggle')) return;
      const aid = card.dataset.aid;
      const a = state.articles.find(x => String(x.id) === aid);
      if (a) {
        openReader({
          id: 'rss_' + a.id,
          title: a.title,
          url: a.link || '',
          link: a.link || '',
          source: a.source_name,
          summary: a.summary || '',
          pub_date: a.pub_date
        });
      }
    });
  });

  list.querySelectorAll('.summary-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = btn.previousElementSibling;
      if (!p || !p.classList.contains('card-summary')) return;
      const expanded = p.dataset.expanded === 'true';
      p.dataset.expanded = expanded ? 'false' : 'true';
      p.classList.toggle('card-summary-clamp', expanded);
      btn.textContent = expanded ? '展开全文' : '收起';
    });
  });
}

// ── Bookmark tab ──

function renderBookmarkTab() {
  const area = $('#contentArea');
  const items = getBookmarks();
  if (!items.length) {
    area.innerHTML = `<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg><p>暂无收藏</p><p style="font-size:12px;margin-top:4px">在文章中点击收藏按钮收藏</p></div>`;
    return;
  }

  const isBatch = area.dataset.batchMode === 'true';

  area.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
    <span style="font-size:13px;color:var(--text-muted)">共 ${items.length} 篇</span>
    <div style="display:flex;gap:6px">
      <button class="sub-tab" id="exportBookmarksBtn" style="font-size:12px">📤 导出</button>
      <button class="sub-tab ${isBatch ? 'active' : ''}" id="batchBookmarkBtn" style="font-size:12px">${isBatch ? '退出管理' : '批量管理'}</button>
    </div>
  </div>
  <div class="trending-list" id="bookmarkList">${items.map(item => `
    <div class="trending-item" data-bmid="${escapeHtml(item.id)}">
      ${isBatch ? `<input type="checkbox" class="bm-checkbox" data-bmid="${escapeHtml(item.id)}" style="margin-right:4px;flex-shrink:0">` : ''}
      <div class="trending-info">
        <div class="trending-title">${escapeHtml(item.title)}</div>
        <div class="trending-meta">
          <span class="platform-badge ${item.platform || 'ithome'}">${escapeHtml(item.source)}</span>
          <span style="font-size:11px;color:var(--text-muted)">${item.timestamp ? timeAgo(item.timestamp) : ''}</span>
          <span style="cursor:pointer;color:var(--red)" class="unbookmark-btn" data-bmid="${escapeHtml(item.id)}">取消收藏</span>
        </div>
      </div>
    </div>`).join('')}</div>
    ${isBatch ? '<div style="text-align:center;margin-top:8px"><button class="manage-clear" id="batchDeleteBtn">删除选中</button></div>' : ''}`;

  const exportBtn = document.getElementById('exportBookmarksBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const text = items.map((b, i) => `${i + 1}. ${b.title}${b.url ? `\n   ${b.url}` : ''}`).join('\n');
      const blob = new Blob([`我的收藏 (${items.length} 篇)\n\n${text}`], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `toutiao-bookmarks-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('已导出');
    });
  }

  const batchBtn = document.getElementById('batchBookmarkBtn');
  if (batchBtn) {
    batchBtn.addEventListener('click', () => {
      area.dataset.batchMode = area.dataset.batchMode === 'true' ? 'false' : 'true';
      renderBookmarkTab();
    });
  }

  const batchDel = document.getElementById('batchDeleteBtn');
  if (batchDel) {
    batchDel.addEventListener('click', () => {
      const checked = document.querySelectorAll('.bm-checkbox:checked');
      if (!checked.length) { showToast('请先选择要删除的收藏'); return; }
      const ids = new Set(Array.from(checked).map(cb => cb.dataset.bmid));
      let list = getBookmarks().filter(b => !ids.has(b.id));
      localStorage.setItem('toutiao_bookmarks', JSON.stringify(list));
      showToast(`已删除 ${ids.size} 篇`);
      renderBookmarkTab();
    });
  }

  area.querySelectorAll('.trending-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.unbookmark-btn') || e.target.closest('.bm-checkbox')) return;
      const item = getBookmarks().find(b => b.id === el.dataset.bmid);
      if (item && item.url) window.open(item.url, '_blank');
    });
  });
  area.querySelectorAll('.unbookmark-btn').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      let list = getBookmarks().filter(b => b.id !== el.dataset.bmid);
      localStorage.setItem('toutiao_bookmarks', JSON.stringify(list));
      showToast('已取消收藏');
      renderBookmarkTab();
    });
  });
}

// ── Read Later tab ──

function renderReadLaterTab() {
  const area = $('#contentArea');
  const items = getReadLaterList();
  if (!items.length) {
    area.innerHTML = `<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><p>暂无稍后阅读</p><p style="font-size:12px;margin-top:4px">在文章中点击"稍后阅读"按钮添加</p></div>`;
    return;
  }

  area.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
    <span style="font-size:13px;color:var(--text-muted)">共 ${items.length} 篇</span>
    <button class="sub-tab" id="clearReadLaterBtn" style="font-size:12px">清空列表</button>
  </div>
  <div class="trending-list" id="readLaterList">${items.map(item => `
    <div class="trending-item" data-id="${escapeHtml(item.id)}">
      <div class="trending-info">
        <div class="trending-title">${escapeHtml(item.title)}</div>
        <div class="trending-meta">
          <span class="platform-badge ${item.platform || 'ithome'}">${escapeHtml(item.source)}</span>
          <span style="font-size:11px;color:var(--text-muted)">${item.timestamp ? timeAgo(item.timestamp) : ''}</span>
          <span style="cursor:pointer;color:var(--red)" class="remove-readlater-btn" data-id="${escapeHtml(item.id)}">移除</span>
        </div>
      </div>
    </div>`).join('')}</div>`;

  const clearBtn = document.getElementById('clearReadLaterBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm('确定清空稍后阅读列表吗？')) {
        localStorage.setItem('toutiao_readLater', '[]');
        showToast('已清空');
        renderReadLaterTab();
      }
    });
  }

  area.querySelectorAll('.trending-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.remove-readlater-btn')) return;
      const item = items.find(b => b.id === el.dataset.id);
      if (item && item.url) {
        window.open(item.url, '_blank');
        // Remove from list after opening
        toggleReadLater({ id: item.id });
        showToast('已从稍后阅读移除');
        setTimeout(() => renderReadLaterTab(), 300);
      }
    });
  });

  area.querySelectorAll('.remove-readlater-btn').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleReadLater({ id: el.dataset.id });
      showToast('已移除');
      renderReadLaterTab();
    });
  });
}

// ── Achievements tab ──

function renderAchievementsTab() {
  const area = $('#contentArea');
  const stats = state.recommender.getReadingStats();
  const today = new Date().toISOString().split('T')[0];

  // Get weekly report
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  const weeklyReport = getWeeklyReport(state.recommender.history, today);

  const badgeIcons = { bronze: '🥉', silver: '🥈', gold: '🥇' };
  const badgeNames = { bronze: '铜牌阅读达人', silver: '银牌阅读达人', gold: '金牌阅读达人' };

  area.innerHTML = `
    <div style="padding:16px 0">
      <h2 style="font-size:18px;margin-bottom:16px;color:var(--text-primary)">阅读成就</h2>

      <!-- Stats cards -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:24px">
        <div class="achievement-stat-card">
          <div class="stat-icon">🔥</div>
          <div class="stat-value">${stats.streak || 0}</div>
          <div class="stat-label">连续打卡</div>
        </div>
        <div class="achievement-stat-card">
          <div class="stat-icon">📚</div>
          <div class="stat-value">${stats.totalArticles || 0}</div>
          <div class="stat-label">总阅读量</div>
        </div>
        <div class="achievement-stat-card">
          <div class="stat-icon">📖</div>
          <div class="stat-value">${stats.count || 0}</div>
          <div class="stat-label">今日阅读</div>
        </div>
      </div>

      <!-- Badges -->
      <div style="margin-bottom:24px">
        <h3 style="font-size:15px;margin-bottom:12px;color:var(--text-primary)">我的徽章</h3>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          ${stats.badges && stats.badges.length > 0 ? stats.badges.map(badge => `
            <div class="badge-card earned">
              <div class="badge-icon">${badgeIcons[badge]}</div>
              <div class="badge-name">${badgeNames[badge]}</div>
            </div>
          `).join('') : `
            <div class="badge-card locked">
              <div class="badge-icon" style="opacity:0.3">🥉</div>
              <div class="badge-name" style="opacity:0.5">铜牌 (100篇)</div>
            </div>
            <div class="badge-card locked">
              <div class="badge-icon" style="opacity:0.3">🥈</div>
              <div class="badge-name" style="opacity:0.5">银牌 (500篇)</div>
            </div>
            <div class="badge-card locked">
              <div class="badge-icon" style="opacity:0.3">🥇</div>
              <div class="badge-name" style="opacity:0.5">金牌 (1000篇)</div>
            </div>
          `}
        </div>
      </div>

      <!-- Weekly report -->
      <div>
        <h3 style="font-size:15px;margin-bottom:12px;color:var(--text-primary)">本周阅读报告</h3>
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:16px">
          <div style="display:flex;justify-content:space-between;margin-bottom:12px">
            <span style="color:var(--text-secondary)">本周阅读</span>
            <strong>${weeklyReport.totalArticles} 篇</strong>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:12px">
            <span style="color:var(--text-secondary)">活跃天数</span>
            <strong>${weeklyReport.activeDays} / 7 天</strong>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:16px">
            <span style="color:var(--text-secondary)">日均阅读</span>
            <strong>${weeklyReport.activeDays > 0 ? (weeklyReport.totalArticles / weeklyReport.activeDays).toFixed(1) : 0} 篇</strong>
          </div>
          <div style="border-top:1px solid var(--border);padding-top:12px">
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">每日阅读量</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${Object.entries(weeklyReport.dailyBreakdown).map(([date, count]) => `
                <div style="flex:1;min-width:40px;text-align:center">
                  <div style="font-size:11px;color:var(--text-muted)">${date.slice(5)}</div>
                  <div style="font-size:14px;font-weight:600;color:var(--accent)">${count}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── History tab ──

function renderHistoryTab() {
  const area = $('#contentArea');
  const history = state.recommender.history;
  if (!history.length) {
    area.innerHTML = `<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><p>暂无浏览记录</p></div>`;
    return;
  }
  const items = history.slice().reverse().slice(0, 100);
  area.innerHTML = `<div class="trending-list">${items.map(h => `
    <div class="history-item" data-hurl="${escapeHtml(h.url || '')}" data-htitle="${escapeHtml(h.title)}">
      <span class="hi-type">${h.type === 'rss' ? '资讯' : '热搜'}</span>
      <span class="hi-title">${escapeHtml(h.title)}</span>
      <span class="hi-time">${timeAgo(h.timestamp)}</span>
    </div>`).join('')}</div>
    <div class="history-clear"><button id="clearHistoryBtn">清空浏览历史</button></div>`;
  document.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => {
      let url = el.dataset.hurl;
      if (!url) {
        const title = el.dataset.htitle;
        const found = state.articles.find(a => a.title === title) || state.hotItems.find(h => h.title === title);
        if (found) url = found.link || found.url || '';
      }
      if (url) window.open(url, '_blank');
    });
  });
  document.getElementById('clearHistoryBtn').addEventListener('click', () => {
    state.recommender.history = [];
    localStorage.setItem('toutiao_history', '[]');
    showToast('已清空');
    renderHistoryTab();
  });
}

function renderDislikeTab() {
  const area = $('#contentArea');
  const disliked = getDisliked();
  if (!disliked.length) {
    area.innerHTML = `<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><line x1="1" y1="1" x2="23" y2="23"/></svg><p>暂无屏蔽关键词</p></div>`;
    return;
  }
  area.innerHTML = `<div class="dislike-manage">
    <h3 style="font-size:15px;font-weight:600;margin-bottom:12px">已屏蔽的关键词</h3>
    <div class="dislike-tags">${disliked.map(kw => `<span class="manage-tag">${escapeHtml(kw)}<span class="del" data-kw="${escapeHtml(kw)}">×</span></span>`).join('')}</div>
    <button class="manage-clear" id="manageClearAll">清除全部</button>
  </div>`;
  area.querySelectorAll('.del').forEach(el => {
    el.addEventListener('click', () => {
      removeDislike(el.dataset.kw);
      showToast('已移除');
      renderDislikeTab();
    });
  });
  area.querySelector('#manageClearAll').addEventListener('click', () => {
    clearDisliked();
    showToast('已清除全部');
    renderDislikeTab();
  });
}

// ── Interest tags ──

function renderInterestTags() {
  const area = $('#contentArea');
  if (state.currentTab !== 'recommend') return;
  const existing = $('#interestTags');
  if (existing) return;

  const tags = Object.keys(TOPIC_KEYWORDS);
  const active = state.recommender.interests;
  const html = `<div class="interest-tags" id="interestTags">${tags.map(t =>
    `<span class="interest-tag ${active.includes(t) ? 'active' : ''}" data-tag="${t}">${t}</span>`
  ).join('')}</div>`;
  area.insertAdjacentHTML('afterbegin', html);

  document.querySelectorAll('.interest-tag').forEach(el => {
    el.addEventListener('click', () => {
      state.recommender.toggleInterest(el.dataset.tag);
      el.classList.toggle('active');
      state.feedItems = buildHybridFeed();
      state.feedPage = 0;
      state.feedExhausted = false;
      feedInit();
      showToast('兴趣已更新');
    });
  });
}

// ── Error banner ──

function renderErrorBanner() {
  const el = $('#errorBanner');
  const errors = state.hotErrors;
  if (errors && errors.length > 0) {
    const lastOk = state.stats?.lastFetch ? formatTime(state.stats.lastFetch) : '';
    el.innerHTML = `<div class="error-banner">⚠️ 部分平台加载失败: ${errors.slice(0, 3).join('、')}
      ${lastOk ? `<span style="margin:0 8px;color:var(--text-muted)">上次成功 ${lastOk}</span>` : ''}
      <span class="retry-link" onclick="loadHotData().then(() => renderTab())">重试</span></div>`;
  } else {
    el.innerHTML = '';
  }
}

// ── Tab switching setup ──

function setupTabs() {
  const activateTab = (tab) => {
    // Clear active from both tab bars
    $('#mainTabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    $('#utilityTabs').querySelectorAll('.utility-tab').forEach(t => t.classList.remove('active'));

    if (tab.classList.contains('tab')) {
      tab.classList.add('active');
    } else {
      tab.classList.add('active');
    }

    state.currentTab = tab.dataset.tab;
    $('#contentArea').innerHTML = '';
    $('#subTabBar').innerHTML = '';
    $('#errorBanner').innerHTML = '';
    renderTab();
  };

  $('#mainTabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    activateTab(tab);
  });

  $('#utilityTabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.utility-tab');
    if (!tab) return;
    activateTab(tab);
  });
}

// ── Helpers ──

function getPlatformName(key) {
  const map = { weibo: '微博', baidu: '百度', toutiao: '头条', tieba: '贴吧', sspai: '少数派', ithome: 'IT之家', '36kr': '36氪', zhihu: '知乎', hupu: '虎扑' };
  return map[key] || key;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}天前`;
  return d.toLocaleDateString('zh-CN');
}

function timeAgo(ts) {
  const diff = (Date.now() - ts) / 60000;
  if (diff < 1) return '刚刚';
  if (diff < 60) return Math.floor(diff) + '分钟前';
  const hrs = Math.floor(diff / 60);
  if (hrs < 24) return hrs + '小时前';
  return Math.floor(hrs / 24) + '天前';
}

function formatNumber(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(Math.round(n));
}

function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:999;background:var(--text-primary);color:var(--bg-primary);padding:8px 20px;border-radius:8px;font-size:13px;font-weight:500;box-shadow:0 2px 12px rgba(0,0,0,0.2);animation:toast-in 0.2s ease;';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1200);
}

// ── User stats ──

function getUserStats() {
  let stats = { readCount: 0, bookmarkCount: 0, daysUsed: 1, firstVisit: Date.now() };
  try {
    const raw = localStorage.getItem('toutiao_userStats');
    if (raw) stats = JSON.parse(raw);
  } catch {}
  const first = stats.firstVisit;
  const days = Math.max(1, Math.floor((Date.now() - first) / 86400000) + 1);
  stats.daysUsed = days;
  stats.bookmarkCount = getBookmarks().length;
  stats.readCount = state.recommender.history.length;
  const hs = $('#headerStats');
  if (hs) hs.textContent = `📖${stats.readCount} ⭐${stats.bookmarkCount} 📅${stats.daysUsed}天`;
  localStorage.setItem('toutiao_userStats', JSON.stringify({ ...stats, bookmarkCount: undefined, readCount: undefined }));
  return stats;
}

function updateStatusDot(stats) {
  const dot = $('#statusDot');
  dot.className = 'status-dot';
  if (!stats.lastFetch) dot.classList.add('stale');
  else if (stats.articleCount > 0) dot.classList.add('ok');
  else dot.classList.add('stale');
  const uiStats = getUserStats();
  dot.title = `${stats.articleCount} 篇文章 · ${stats.sourceCount} 个来源 · ${state.hotItems.length} 条热搜\n已读 ${uiStats.readCount} · 收藏 ${uiStats.bookmarkCount} · 使用 ${uiStats.daysUsed} 天`;
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

// ── Pull-to-refresh ──

let ptrState = { startY: 0, pulling: false, moved: false };
const PTR_THRESHOLD = 80;

function setupBrowserEvents() {
  document.addEventListener('touchstart', (e) => {
    if (window.scrollY > 10) return;
    ptrState.startY = e.touches[0].clientY;
    ptrState.pulling = true;
    ptrState.moved = false;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!ptrState.pulling) return;
    const dy = e.touches[0].clientY - ptrState.startY;
    if (dy > 10) ptrState.moved = true;
    if (ptrState.moved && dy > 0) {
      const pull = Math.min(dy * 0.4, 60);
      document.body.style.transform = `translateY(${pull}px)`;
      document.body.style.transition = 'none';
    }
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!ptrState.pulling) return;
    ptrState.pulling = false;
    document.body.style.transition = 'transform 0.3s ease';
    document.body.style.transform = '';
    if (ptrState.moved && (e.changedTouches[0].clientY - ptrState.startY) > PTR_THRESHOLD) {
      const btn = $('#btnRefresh');
      if (btn && !btn.classList.contains('spinning')) {
        showToast('↻ 刷新中...');
        doRefresh();
      }
    }
  }, { passive: true });

  // 初始化函数
  const startApp = () => {
    console.log('[App] Starting initialization...');

    // 确保必要的 DOM 元素存在
    const btnRefresh = $('#btnRefresh');
    const topBtn = $('#topBtn');
    const btnTheme = $('#btnTheme');

    if (btnRefresh) {
      btnRefresh.addEventListener('click', doRefresh);
    } else {
      console.warn('[App] btnRefresh not found');
    }

    if (topBtn) {
      topBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    if (btnTheme) {
      btnTheme.addEventListener('click', toggleTheme);
    }

    if (typeof createInitController === 'undefined') {
      console.error('[App] Init controller missing!');
      const skeleton = document.getElementById('skeletonLoader');
      if (skeleton) {
        skeleton.innerHTML = '<div style="padding:20px;text-align:center;color:#f00;">加载失败：初始化控制器缺失</div>';
      }
      return;
    }

    // 调用 init 并捕获错误
    init()
      .then(() => console.log('[App] Initialization completed'))
      .catch(err => {
        console.error('[App] Initialization failed:', err);
        // 移除骨架屏，显示错误
        const skeleton = document.getElementById('skeletonLoader');
        if (skeleton) {
          skeleton.innerHTML = `<div style="padding:20px;text-align:center;color:#f00;">
            加载失败：${err.message}<br>
            <button onclick="location.reload()" style="margin-top:10px;padding:8px 16px;">重试</button>
          </div>`;
        }
      });
  };

  // 如果 DOM 已加载完成，立即启动；否则等待 DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
  } else {
    startApp();
  }

  window.addEventListener('scroll', () => {
    const topBtn = $('#topBtn');
    if (topBtn) {
      topBtn.classList.toggle('hidden', window.scrollY < 300);
    }
  }, { passive: true });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  setupBrowserEvents();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeEventTitle,
    extractEventKeywords,
    isSameEvent,
    rerankCandidates,
    rerankDuplicateEvents,
    scoreCandidate,
    computeImplicitInterests,
    getDecayedBehaviorWeights,
    isArticleRead,
    getUnreadCount,
    getReadLaterList,
    isReadLater,
    toggleReadLater,
    reduceRandomness,
    calculateMMR,
    calculateJaccardSimilarity,
    generateShareCard,
    generateQRCode
  };
}