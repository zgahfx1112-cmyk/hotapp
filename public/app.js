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
  recommender: new Recommender(),
  feedItems: [],
  feedPage: 0,
  feedLoading: false,
  feedExhausted: false,
  feedObserver: null
};

const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

// ── Init ──

async function init() {
  // Restore filters
  try { state.rssFilter = localStorage.getItem('toutiao_rssFilter') || null; } catch {}
  try { state.hotFilter = localStorage.getItem('toutiao_hotFilter') || null; } catch {}

  // Restore theme
  initTheme();

  await Promise.all([loadSources(), loadArticles(200), loadHotData(), loadStats()]);
  renderTab();
  renderInterestTags();
  setupTabs();
  registerSW();
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
    await Promise.all([
      fetch('/api/fetch', { method: 'POST' }),
      loadHotData()
    ]);
    await loadArticles(200);
    await loadStats();
    state.feedItems = [];
    state.feedPage = 0;
    state.feedExhausted = false;
    renderTab();
  } catch (e) {
    state.error = '刷新失败';
    renderTab();
  }
  btn.classList.remove('spinning');
}

// ── Recommender (ported from HotApp) ──

const TOPIC_KEYWORDS = {
  科技: ['AI','人工智能','芯片','苹果','华为','特斯拉','SpaceX','大模型','GPT','ChatGPT','机器人','自动驾驶','手机','5G','6G','量子','航天','卫星','新能源','电池','小米','OPPO','vivo','荣耀','显卡','CPU','GPU','英特尔','AMD','英伟达','NVIDIA','微软','Google','Meta','字节','腾讯','阿里','百度','京东','拼多多','美团','无人机','星链','火箭','登陆','探测器','基因','生物','科技','技术','软件','硬件','系统','开源','编程','代码','算法'],
  游戏: ['游戏','原神','王者荣耀','英雄联盟','LOL','黑神话','崩坏','崩铁','星穹铁道','米哈游','网易','腾讯游戏','3A','Steam','Switch','PS5','Xbox','电竞','LPL','KPL','S赛','TI','DOTA','CS','瓦罗','绝地求生','吃鸡','永劫','魔兽','炉石','二次元','漫威','DC','赛博','主机','手游','端游','独立游戏','版号','氪金','抽卡'],
  娱乐: ['电影','综艺','明星','演唱会','票房','上映','电视剧','网剧','综艺节目','八卦','恋情','结婚','离婚','出轨','塌房','肖战','王一博','迪丽热巴','杨紫','赵丽颖','杨幂','耽改','选秀','偶像','女团','男团','C位','出道','流量','粉丝','热搜','绯闻','综艺','春晚','跨年','颁奖','红毯','杂志','封面','MV','新歌','专辑'],
  体育: ['NBA','足球','世界杯','奥运会','乒乓球','羽毛球','排球','游泳','田径','马拉松','滑雪','滑板','篮球','CBA','中超','英超','西甲','欧冠','德甲','意甲','法甲','梅西','C罗','詹姆斯','库里','杜兰特','字母哥','约基奇','孙颖莎','马龙','樊振东','全红婵','谷爱凌','郑钦文','苏炳添'],
  财经: ['股市','A股','房价','GDP','人民币','基金','比特币','加密货币','区块链','经济','通胀','加息','降息','央行','理财','投资','保险','银行','贷款','利率','汇率','美股','港股','纳斯达克','道琼斯','恒生','上证','深证','创业板','科创板','牛市','熊市','分红','财报','利润','营收','市值','IPO','上市'],
  教育: ['考研','高考','大学','就业','学历','专业','留学','雅思','托福','GRE','公务员','国考','省考','教师','编制','博士','硕士','本科','专科','职校','培训','双减','学区','录取','分数','志愿','招生','毕业','实习','秋招','春招','社招'],
  社会: ['政策','民生','交通','补贴','医保','社保','养老','医疗','住房','公租房','公积金','环境','污染','天气','地震','台风','洪水','疫情','疫苗','安全','事故','火灾','犯罪','法律','法院','公安','消防','退伍','社保','退休','延迟退休','生育','二胎','三胎','人口','老龄化'],
  国际: ['美国','日本','韩国','俄罗斯','乌克兰','欧洲','中东','非洲','东南亚','印度','朝鲜','台湾','南海','贸易','制裁','关税','战争','冲突','谈判','协议','峰会','联合国','WTO','北约','G7','G20','金砖','一带一路','外交','大使','签证','移民','难民','人权']
};

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
  this.history.push({ title: item.title, keywords, type: item.type, timestamp: Date.now() });
  if (this.history.length > 200) this.history = this.history.slice(-200);
  localStorage.setItem('toutiao_history', JSON.stringify(this.history));
};
Recommender.prototype.getBehaviorWeights = function() {
  const w = {};
  for (const h of this.history) { for (const kw of h.keywords) { w[kw] = (w[kw] || 0) + 1; } }
  return w;
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
  updateStarButtons();
}
function isBookmarked(id) {
  return getBookmarks().some(b => b.id === id);
}
function updateStarButtons() {
  document.querySelectorAll('.btn-star').forEach(el => {
    el.classList.toggle('active', isBookmarked(el.dataset.id));
  });
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
  let theme = 'light';
  try { theme = localStorage.getItem('toutiao_theme') || 'light'; } catch {}
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  const btn = $('#btnTheme');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  if (isDark) { html.removeAttribute('data-theme'); localStorage.setItem('toutiao_theme', 'light'); $('#btnTheme').textContent = '🌙'; }
  else { html.setAttribute('data-theme', 'dark'); localStorage.setItem('toutiao_theme', 'dark'); $('#btnTheme').textContent = '☀️'; }
}

// ── Hybrid scoring ──

function buildHybridFeed() {
  const unified = [];
  const now = Date.now();

  // RSS → unified
  for (const a of state.articles) {
    unified.push({
      id: 'rss_' + a.id,
      title: a.title,
      url: a.link || '',
      image: a.image_url || null,
      source: a.source_name,
      type: 'rss',
      heatScore: 0,
      timestamp: a.pub_date ? new Date(a.pub_date).getTime() : now
    });
  }

  // Hot → unified
  for (const h of state.hotItems) {
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

  if (!unified.length) return [];

  const maxHeat = Math.max(...unified.map(i => i.heatScore || 0), 1);
  const bw = state.recommender.getBehaviorWeights();

  const scored = unified.map(item => {
    let score = 0;
    const ageHours = (now - item.timestamp) / 3600000;
    const ageMin = (now - item.timestamp) / 60000;

    // Heat/timeliness
    if (item.type === 'hot') {
      score += (item.heatScore / maxHeat) * 40;
    } else {
      score += Math.max(0, 40 - ageHours * 1.5);
    }

    // Interest tags
    for (const tag of state.recommender.interests) {
      const kws = TOPIC_KEYWORDS[tag] || [];
      if (kws.some(kw => item.title.includes(kw))) { score += 30; break; }
    }

    // Behavior history
    for (const [kw, w] of Object.entries(bw)) {
      if (item.title.includes(kw)) { score += Math.min(w * 5, 20); break; }
    }

    // Freshness
    score += Math.max(0, 10 - ageMin * 0.5);

    // Random jitter: ±15 — fresh order every refresh
    score += (Math.random() - 0.5) * 30;

    // Dislike penalty
    const disliked = getDisliked();
    if (disliked.some(kw => item.title.includes(kw))) score -= 50;

    // Reason
    let reason = '热门推荐';
    for (const tag of state.recommender.interests) {
      const kws = TOPIC_KEYWORDS[tag] || [];
      if (kws.some(kw => item.title.includes(kw))) { reason = `你关注「${tag}」`; break; }
    }

    return { ...item, score, reason };
  });

  scored.sort((a, b) => b.score - a.score);

  // Diversity: ensure both types in top 8
  const top8 = scored.slice(0, 8);
  const rssCount = top8.filter(i => i.type === 'rss').length;
  const hotCount = top8.filter(i => i.type === 'hot').length;
  if (rssCount < 2 && hotCount > 0) {
    // Boost highest-scoring RSS that isn't in top 8
    const bestRss = scored.filter(i => i.type === 'rss').find(i => !top8.includes(i));
    if (bestRss) bestRss.score += 5;
  } else if (hotCount < 2 && rssCount > 0) {
    const bestHot = scored.filter(i => i.type === 'hot').find(i => !top8.includes(i));
    if (bestHot) bestHot.score += 5;
  }
  scored.sort((a, b) => b.score - a.score);

  return scored;
}

// ── Tab rendering ──

function renderTab() {
  state.error = null;
  if (state.currentTab === 'recommend') renderRecommendTab();
  else if (state.currentTab === 'hot') renderHotTab();
  else if (state.currentTab === 'rss') renderRssTab();
  else if (state.currentTab === 'bookmark') renderBookmarkTab();
  else if (state.currentTab === 'history') renderHistoryTab();
}

function renderSubTabs(items, activeKey, onClick) {
  const bar = $('#subTabBar');
  bar.innerHTML = `<div class="sub-tabs">
    <button class="sub-tab ${!activeKey ? 'active' : ''}" data-key="">全部</button>
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

  // Interest tags
  renderInterestTags();

  if (!state.feedItems.length) {
    state.feedItems = buildHybridFeed();
    state.feedPage = 0;
    state.feedExhausted = false;
  }

  area.innerHTML = `
    <div class="feed-grid" id="feedGrid"></div>
    <div class="feed-sentinel" id="feedSentinel"></div>
    <div class="feed-loading" id="feedLoading">⏳ 加载中...</div>
  `;

  // Dislike management bar
  const disliked = getDisliked();
  if (disliked.length) {
    area.insertAdjacentHTML('beforeend', `<div class="dislike-bar" id="dislikeBar">已屏蔽 ${disliked.length} 个关键词 · 点击管理</div>`);
  }

  feedInit();
}

function feedInit() {
  state.feedPage = 0;
  state.feedLoading = false;
  state.feedExhausted = false;
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

  const start = state.feedPage * 10;
  const end = start + 10;
  const batch = state.feedItems.slice(start, end);

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
      const g = gradients[(start + i) % gradients.length];
      const imgHtml = item.image
        ? `<div class="feed-img-wrap"><img src="${escapeHtml(item.image)}" alt="" loading="lazy" onerror="this.style.opacity='0';this.parentElement.style.background='${g}'"><div class="fallback" style="background:${g};display:none"></div></div>`
        : `<div class="feed-img-wrap"><div class="fallback" style="background:${g};display:block"></div></div>`;
      const card = document.createElement('div');
      card.className = 'feed-card';
      const starCls = isBookmarked(item.id) ? 'btn-star active' : 'btn-star';
      card.innerHTML = `<button class="btn-close" data-id="${escapeHtml(item.id)}">✕</button><button class="${starCls}" data-id="${escapeHtml(item.id)}">⭐</button>${imgHtml}<div class="feed-title">${escapeHtml(item.title)}</div><div class="feed-meta"><span class="platform-badge ${item.type === 'rss' ? 'ithome' : item.platform}">${escapeHtml(item.source)}</span><span class="feed-type-badge">${item.type === 'rss' ? '资讯' : '热搜'}</span></div><div class="feed-reason">${item.reason}</div>`;
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-star') || e.target.closest('.btn-close')) return;
        state.recommender.recordView(item);
        if (item.url) window.open(item.url, '_blank');
      });
      card.querySelector('.btn-star').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleBookmark(item);
      });
      card.querySelector('.btn-close').addEventListener('click', (e) => {
        e.stopPropagation();
        addDislike(item.title);
        card.classList.add('fade-out');
        setTimeout(() => { card.remove(); }, 300);
        state.feedItems = buildHybridFeed();
      });
      grid.appendChild(card);
    });
    state.feedPage++;
    state.feedLoading = false;
    $('#feedLoading').style.display = 'none';
  }, 200);
}

function renderHotTab() {
  const area = $('#contentArea');

  // Build platform sub-tabs
  const platforms = {};
  for (const item of state.hotItems) {
    if (!platforms[item.platform]) platforms[item.platform] = getPlatformName(item.platform);
  }
  const platList = Object.entries(platforms).map(([k, v]) => ({ key: k, label: v }));

  renderSubTabs(platList, state.hotFilter, (key) => {
    state.hotFilter = key;
    localStorage.setItem('toutiao_hotFilter', key || '');
    renderHotList();
  });

  // Error banner
  renderErrorBanner();

  // List
  area.insertAdjacentHTML('beforeend', '<div class="trending-list" id="trendingList"></div>');
  renderHotList();
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

  const maxHeat = Math.max(...items.map(i => i.heatScore || 1), 1);
  list.innerHTML = items.map((item, i) => {
    const rc = i === 0 ? 'top1' : (i < 3 ? 'top3' : '');
    const pct = Math.round((item.heatScore / maxHeat) * 100);
    const bmId = 'h_' + item.id;
    const starred = isBookmarked(bmId);
    return `<div class="trending-item" data-id="${item.id}">
      <span class="rank-num ${rc}">${i + 1}</span>
      <div class="trending-info">
        <div class="trending-title">${escapeHtml(item.title)}</div>
        <div class="trending-meta">
          <span class="platform-badge ${item.platform}">${getPlatformName(item.platform)}</span>
          <span>🔥 ${formatNumber(item.heatScore)}</span>
          <span>${timeAgo(item.timestamp)}</span>
        </div>
        <div class="heat-bar"><div class="heat-bar-fill" style="width:${pct}%"></div></div>
      </div>
      <span class="bm-star ${starred ? 'active' : ''}" data-bmid="${bmId}" data-hid="${item.id}" style="flex-shrink:0;font-size:16px;cursor:pointer;color:${starred ? '#f0a030' : '#ccc'};transition:var(--transition)">${starred ? '⭐' : '☆'}</span>
    </div>`;
  }).join('');

  list.querySelectorAll('.trending-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.bm-star')) return;
      const item = state.hotItems.find(i => i.id === el.dataset.id);
      if (item) { state.recommender.recordView(item); if (item.url) window.open(item.url, '_blank'); }
    });
  });
  list.querySelectorAll('.bm-star').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const bmId = el.dataset.bmid;
      const item = state.hotItems.find(i => String(i.id) === el.dataset.hid);
      if (item) {
        const bm = { id: bmId, title: item.title, url: item.url || '', source: getPlatformName(item.platform), type: 'hot', platform: item.platform, image: item.image || null };
        toggleBookmark(bm);
        const starred = isBookmarked(bmId);
        el.textContent = starred ? '⭐' : '☆';
        el.style.color = starred ? '#f0a030' : '#ccc';
        el.classList.toggle('active', starred);
      }
    });
  });
}

function renderRssTab() {
  const area = $('#contentArea');

  const sourceList = state.sources.map(s => ({ key: String(s.id), label: s.name }));
  renderSubTabs(sourceList, state.rssFilter, (key) => {
    state.rssFilter = key;
    localStorage.setItem('toutiao_rssFilter', key || '');
    loadArticles(100, state.rssFilter).then(() => renderRssList());
  });

  area.insertAdjacentHTML('beforeend', '<div class="trending-list" id="rssList"></div>');
  loadArticles(100, state.rssFilter).then(() => renderRssList());
}

function renderRssList() {
  const list = $('#rssList');
  if (!list) return;

  let items = state.articles;
  if (state.rssFilter) items = items.filter(a => a.source_id === Number(state.rssFilter));

  if (!items.length) {
    list.innerHTML = `<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>暂无文章</p></div>`;
    return;
  }

  list.innerHTML = items.map(a => {
    const img = a.image_url ? `<div class="card-img-wrap"><img src="${escapeHtml(a.image_url)}" alt="" loading="lazy" onerror="this.closest('.card-img-wrap').remove()"></div>` : '';
    const bmId = 'rss_' + a.id;
    const starred = isBookmarked(bmId);
    return `<article class="rss-article-card" style="position:relative" data-bmid="${bmId}">
      ${img}
      <span class="bm-star ${starred ? 'active' : ''}" data-bmid="${bmId}" style="position:absolute;top:8px;right:8px;z-index:2;font-size:14px;cursor:pointer;color:${starred ? '#f0a030' : '#ccc'};transition:var(--transition);background:rgba(255,255,255,0.85);border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center">${starred ? '⭐' : '☆'}</span>
      <div class="card-header">
        <span class="source-badge">${escapeHtml(a.source_name)}</span>
        <span class="card-time">${formatTime(a.pub_date)}</span>
      </div>
      <h3 class="card-title"><a href="${escapeHtml(a.link || '#')}" target="_blank" rel="noopener">${escapeHtml(a.title)}</a></h3>
      ${a.summary ? `<p class="card-summary">${escapeHtml(a.summary)}</p>` : ''}
    </article>`;
  }).join('');

  list.querySelectorAll('.rss-article-card .bm-star').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const bmId = el.dataset.bmid;
      const aid = bmId.replace('rss_', '');
      const a = state.articles.find(x => String(x.id) === aid);
      if (a) {
        const bm = { id: bmId, title: a.title, url: a.link || '', source: a.source_name, type: 'rss', platform: '', image: a.image_url || null };
        toggleBookmark(bm);
        const starred = isBookmarked(bmId);
        el.textContent = starred ? '⭐' : '☆';
        el.style.color = starred ? '#f0a030' : '#ccc';
        el.classList.toggle('active', starred);
      }
    });
  });
}

// ── Bookmark tab ──

function renderBookmarkTab() {
  const area = $('#contentArea');
  const items = getBookmarks();
  if (!items.length) {
    area.innerHTML = `<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg><p>暂无收藏</p><p style="font-size:12px;margin-top:4px">在文章中点击 ⭐ 收藏</p></div>`;
    return;
  }
  area.innerHTML = `<div class="trending-list">${items.map(item => `
    <div class="trending-item" data-bmid="${escapeHtml(item.id)}">
      <div class="trending-info">
        <div class="trending-title">${escapeHtml(item.title)}</div>
        <div class="trending-meta">
          <span class="platform-badge ${item.platform || 'ithome'}">${escapeHtml(item.source)}</span>
          <span style="cursor:pointer;color:var(--red)" class="unbookmark-btn" data-bmid="${escapeHtml(item.id)}">取消收藏</span>
        </div>
      </div>
    </div>`).join('')}</div>`;
  area.querySelectorAll('.trending-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.unbookmark-btn')) return;
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
    <div class="history-item">
      <span class="hi-type">${h.type === 'rss' ? '资讯' : '热搜'}</span>
      <span class="hi-title">${escapeHtml(h.title)}</span>
      <span class="hi-time">${timeAgo(h.timestamp)}</span>
    </div>`).join('')}</div>
    <div class="history-clear"><button id="clearHistoryBtn">清空浏览历史</button></div>`;
  document.getElementById('clearHistoryBtn').addEventListener('click', () => {
    state.recommender.history = [];
    localStorage.setItem('toutiao_history', '[]');
    showToast('已清空');
    renderHistoryTab();
  });
}

// ── Interest tags ──

function renderInterestTags() {
  const area = $('#contentArea');
  // Only render if we're in recommend tab
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
    el.innerHTML = `<div class="error-banner">⚠️ 部分平台加载失败: ${errors.slice(0, 3).join('、')}<span class="retry-link" onclick="loadHotData().then(() => renderTab())">重试</span></div>`;
  } else {
    el.innerHTML = '';
  }
}

// ── Tab switching setup ──

function setupTabs() {
  $('#mainTabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    $('#mainTabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.currentTab = tab.dataset.tab;

    // Reset content area
    $('#contentArea').innerHTML = '';
    $('#subTabBar').innerHTML = '';
    $('#errorBanner').innerHTML = '';

    renderTab();
  });
}

// ── Helpers ──

function getPlatformName(key) {
  const map = { weibo: '微博', bilibili: 'B站热搜', bilibili_pop: 'B站热门', douyin: '抖音', baidu: '百度', toutiao: '头条', tieba: '贴吧', sspai: '少数派', ithome: 'IT之家', '36kr': '36氪' };
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
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

function updateStatusDot(stats) {
  const dot = $('#statusDot');
  dot.className = 'status-dot';
  if (!stats.lastFetch) dot.classList.add('stale');
  else if (stats.articleCount > 0) dot.classList.add('ok');
  else dot.classList.add('stale');
  dot.title = `${stats.articleCount} 篇文章 · ${stats.sourceCount} 个来源 · ${state.hotItems.length} 条热搜`;
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

// ── Events ──

$('#btnRefresh').addEventListener('click', doRefresh);
$('#topBtn').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
window.addEventListener('scroll', () => {
  $('#topBtn').classList.toggle('hidden', window.scrollY < 300);
}, { passive: true });

// Theme toggle
$('#btnTheme').addEventListener('click', toggleTheme);

// Dislike management (delegated)
document.addEventListener('click', (e) => {
  const bar = e.target.closest('#dislikeBar');
  if (!bar) {
    // Click outside overlay to close
    const overlay = e.target.closest('.manage-overlay');
    if (!overlay && document.querySelector('.manage-overlay')) {
      document.querySelector('.manage-overlay').remove();
    }
    return;
  }
  // Show manage overlay
  const disliked = getDisliked();
  const existing = document.querySelector('.manage-overlay');
  if (existing) existing.remove();
  const ov = document.createElement('div');
  ov.className = 'manage-overlay';
  ov.innerHTML = `<div class="manage-box">
    <h3>已屏蔽的关键词</h3>
    ${disliked.length ? disliked.map(kw => `<span class="manage-tag">${escapeHtml(kw)}<span class="del" data-kw="${escapeHtml(kw)}">×</span></span>`).join('') : '<p style="font-size:13px;color:var(--text-muted)">暂无屏蔽词</p>'}
    ${disliked.length ? '<button class="manage-clear" id="manageClearAll">清除全部</button>' : ''}
  </div>`;
  document.body.appendChild(ov);
  ov.querySelectorAll('.del').forEach(el => {
    el.addEventListener('click', () => {
      removeDislike(el.dataset.kw);
      showToast('已移除');
      el.closest('.manage-overlay').remove();
    });
  });
  const clearBtn = ov.querySelector('#manageClearAll');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    clearDisliked();
    showToast('已清除全部');
    ov.remove();
  });
});

// ── Boot ──

document.addEventListener('DOMContentLoaded', init);