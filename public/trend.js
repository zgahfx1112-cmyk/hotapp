(function() {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatNumber(n) {
    if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
    if (n >= 10000) return (n / 10000).toFixed(1) + '万';
    return String(n);
  }

  function timeAgo(ts) {
    var diff = (Date.now() - ts) / 60000;
    if (diff < 1) return '刚刚';
    if (diff < 60) return Math.floor(diff) + '分钟前';
    var hrs = Math.floor(diff / 60);
    if (hrs < 24) return hrs + '小时前';
    return Math.floor(hrs / 24) + '天前';
  }

  function normalizeSeries(samples, width, height) {
    if (!samples || !samples.length) return [];
    if (samples.length === 1) {
      return [{ x: 0, y: Math.floor(height / 2) }];
    }
    var scores = samples.map(function(s) { return s.score; });
    var min = Math.min.apply(null, scores);
    var max = Math.max.apply(null, scores);
    var range = max - min;
    return samples.map(function(s, i) {
      var x = (i / (samples.length - 1)) * width;
      var y;
      if (range === 0) {
        y = Math.floor(height / 2);
      } else {
        y = height - ((s.score - min) / range) * (height - 4) - 2;
      }
      return { x: x, y: y };
    });
  }

  function drawTrendChart(canvas, heatSamples) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || 400;
    var h = canvas.clientHeight || 200;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, w, h);

    var pad = { top: 20, right: 20, bottom: 30, left: 50 };
    var chartW = w - pad.left - pad.right;
    var chartH = h - pad.top - pad.bottom;

    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g++) {
      var gy = pad.top + (chartH / 4) * g;
      ctx.beginPath();
      ctx.moveTo(pad.left, gy);
      ctx.lineTo(w - pad.right, gy);
      ctx.stroke();
    }

    if (!heatSamples || !heatSamples.length) {
      ctx.fillStyle = '#999';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无历史热度数据', w / 2, h / 2);
      return;
    }

    var pts = normalizeSeries(heatSamples, chartW, chartH);
    if (!pts.length) return;

    var scores = heatSamples.map(function(s) { return s.score; });
    var min = Math.min.apply(null, scores);
    var max = Math.max.apply(null, scores);

    ctx.fillStyle = '#999';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatNumber(max), pad.left - 4, pad.top + 10);
    ctx.fillText(formatNumber(min), pad.left - 4, pad.top + chartH);

    var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
    grad.addColorStop(0, 'rgba(79,110,246,0.3)');
    grad.addColorStop(1, 'rgba(79,110,246,0.02)');
    ctx.beginPath();
    ctx.moveTo(pts[0].x + pad.left, pad.top + chartH);
    for (var i = 0; i < pts.length; i++) {
      ctx.lineTo(pts[i].x + pad.left, pts[i].y + pad.top);
    }
    ctx.lineTo(pts[pts.length - 1].x + pad.left, pad.top + chartH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(pts[0].x + pad.left, pts[0].y + pad.top);
    for (var j = 1; j < pts.length; j++) {
      ctx.lineTo(pts[j].x + pad.left, pts[j].y + pad.top);
    }
    ctx.strokeStyle = '#4f6ef6';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    var last = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(last.x + pad.left, last.y + pad.top, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#4f6ef6';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#4f6ef6';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(formatNumber(heatSamples[heatSamples.length - 1].score), last.x + pad.left + 8, last.y + pad.top + 4);

    ctx.fillStyle = '#bbb';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    var step = Math.max(1, Math.floor(pts.length / 5));
    for (var k = 0; k < pts.length; k += step) {
      var t = heatSamples[k].t;
      var label = '';
      if (t) {
        var d = new Date(t);
        label = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + ':00';
      }
      if (label) ctx.fillText(label, pts[k].x + pad.left, h - 8);
    }
  }

  function loadRising() {
    return fetch('/api/trend/history?hours=6')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var events = data && data.events ? data.events : (Array.isArray(data) ? data : []);
        if (!events.length) return [];
        var items = events.map(function(ev) {
          var samples = ev.heatSamples || [];
          var recent = samples.length >= 2 ? samples[samples.length - 1].score : (ev.maxHeat || 0);
          var prev = samples.length >= 2 ? samples[samples.length - 2].score : recent;
          var delta = prev > 0 ? ((recent - prev) / prev) : 0;
          return { title: ev.title, trend: ev.trend, platforms: ev.platforms, maxHeat: ev.maxHeat, delta: delta, heatSamples: samples };
        });
        items.sort(function(a, b) {
          if (b.delta !== a.delta) return b.delta - a.delta;
          return (b.maxHeat || 0) - (a.maxHeat || 0);
        });
        return items.slice(0, 10);
      })
      .catch(function() { return []; });
  }

  function loadRecap(date) {
    return fetch('/api/trend/recap?date=' + encodeURIComponent(date))
      .then(function(r) { return r.json(); })
      .then(function(data) { return data && data.items ? data.items : []; })
      .catch(function() { return []; });
  }

  function showTrendModal(title) {
    var modal = document.getElementById('readerModal');
    if (!modal) return;
    modal.classList.add('active');
    modal.style.zIndex = '1100';

    var body = modal.querySelector('.reader-body') || modal.querySelector('[class*="reader"]');
    if (!body) return;
    body.innerHTML = '<div style="padding:16px"><h2 style="margin:0 0 12px;font-size:16px;color:var(--text-primary)">' +
      escapeHtml(title) + ' <span style="font-size:13px;color:var(--text-muted)">热度趋势</span></h2>' +
      '<canvas id="trendModalCanvas" style="width:100%;height:200px"></canvas>' +
      '<div id="trendModalInfo" style="margin-top:12px;font-size:13px;color:var(--text-muted)">加载中...</div></div>';

    var closeBtn = modal.querySelector('.reader-close');
    if (closeBtn) closeBtn.onclick = function() { modal.classList.remove('active'); };

    fetch('/api/trend/history?hours=24')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var events = data && data.events ? data.events : (Array.isArray(data) ? data : []);
        var ev = null;
        if (events.length) {
          for (var i = 0; i < events.length; i++) {
            if (events[i].title === title) { ev = events[i]; break; }
          }
        }
        var canvas = document.getElementById('trendModalCanvas');
        if (canvas && ev && ev.heatSamples && ev.heatSamples.length) {
          drawTrendChart(canvas, ev.heatSamples);
          var info = document.getElementById('trendModalInfo');
          if (info) {
            var trendLabel = ev.trend === 'up' ? '📈 上升' : ev.trend === 'down' ? '📉 下降' : ev.trend === 'spike' ? '🔥 飙升' : '➡️ 稳定';
            info.innerHTML = '趋势: ' + trendLabel + ' | 平台: ' + (ev.platforms || []).join(', ') + ' | 最高热度: ' + formatNumber(ev.maxHeat || 0);
          }
        } else if (canvas) {
          var ctx = canvas.getContext('2d');
          var dpr = window.devicePixelRatio || 1;
          canvas.width = canvas.clientWidth * dpr;
          canvas.height = canvas.clientHeight * dpr;
          ctx.scale(dpr, dpr);
          ctx.fillStyle = '#f8f9fa';
          ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
          ctx.fillStyle = '#999';
          ctx.font = '14px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('暂无历史热度数据', canvas.clientWidth / 2, canvas.clientHeight / 2);
          var info2 = document.getElementById('trendModalInfo');
          if (info2) info2.innerHTML = '该话题暂无足够的历史热度采样数据';
        }
      })
      .catch(function() {
        var info = document.getElementById('trendModalInfo');
        if (info) info.innerHTML = '加载失败，请稍后重试';
      });
  }

  var _risingCache = null;
  var _recapCache = {};
  var _currentRecapDate = null;

  function renderTrendTab() {
    var area = document.getElementById('contentArea');
    if (!area) return;

    var today = new Date();
    var yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    var lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    function fmt(d) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    _currentRecapDate = _currentRecapDate || fmt(yesterday);

    area.innerHTML =
      '<div style="padding:16px">' +
      '<h2 style="margin:0 0 16px;font-size:18px;color:var(--text-primary)">📈 热搜风云榜</h2>' +

      '<section id="trendRising" style="margin-bottom:24px">' +
        '<h3 style="font-size:15px;margin:0 0 8px;color:var(--text-primary)">🔥 上升最快（近6小时）</h3>' +
        '<div id="trendRisingContent" style="color:var(--text-muted);font-size:13px">加载中...</div>' +
      '</section>' +

      '<section id="trendRecap" style="margin-bottom:24px">' +
        '<h3 style="font-size:15px;margin:0 0 8px;color:var(--text-primary)">📅 历史回顾</h3>' +
        '<div class="sub-tabs" id="trendRecapTabs" style="margin-bottom:8px"></div>' +
        '<div id="trendRecapContent" style="color:var(--text-muted);font-size:13px">加载中...</div>' +
      '</section>' +

      '<section style="margin-bottom:16px;padding:12px;background:var(--bg-secondary,#f5f5f5);border-radius:8px;font-size:13px;color:var(--text-muted)">' +
        '<p style="margin:0 0 4px"><strong>📊 关于风云榜</strong></p>' +
        '<p style="margin:0">上升最快：基于近6小时内热度变化最剧烈的话题。</p>' +
        '<p style="margin:0">历史回顾：查看往日热搜 Top20 排行，支持切换日期。</p>' +
      '</section>' +
      '</div>';

    var tabsEl = document.getElementById('trendRecapTabs');
    if (tabsEl) {
      var dates = [
        { label: '昨日', value: fmt(yesterday) },
        { label: '前天', value: fmt(new Date(today.getTime() - 2 * 86400000)) },
        { label: '上周', value: fmt(lastWeek) }
      ];
      tabsEl.innerHTML = dates.map(function(d) {
        return '<button class="sub-tab' + (d.value === _currentRecapDate ? ' active' : '') + '" data-date="' + d.value + '">' + d.label + '</button>';
      }).join('');
      tabsEl.querySelectorAll('.sub-tab').forEach(function(btn) {
        btn.addEventListener('click', function() {
          tabsEl.querySelectorAll('.sub-tab').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          _currentRecapDate = btn.dataset.date;
          renderRecapSection(_currentRecapDate);
        });
      });
    }

    loadRising().then(function(items) {
      _risingCache = items;
      var el = document.getElementById('trendRisingContent');
      if (!el) return;
      if (!items.length) {
        el.innerHTML = '<div class="empty-state" style="padding:20px;text-align:center">暂无数据，请稍后刷新</div>';
        return;
      }
      el.innerHTML = items.map(function(item, idx) {
        var trendIcon = item.trend === 'up' ? '↑' : item.trend === 'down' ? '↓' : item.trend === 'spike' ? '🔥' : '→';
        var trendColor = item.trend === 'up' || item.trend === 'spike' ? 'color:#e74c3c' : item.trend === 'down' ? 'color:#27ae60' : 'color:var(--text-muted)';
        var deltaText = item.delta > 0 ? '+' + (item.delta * 100).toFixed(0) + '%' : (item.delta * 100).toFixed(0) + '%';
        return '<div class="trending-item" style="display:flex;align-items:center;padding:10px 12px;border-bottom:1px solid var(--border-color,#eee)">' +
          '<span class="rank-num" style="min-width:24px;font-weight:bold;color:var(--text-muted)">' + (idx + 1) + '</span>' +
          '<div style="flex:1;min-width:0">' +
            '<div class="trending-title" style="font-size:14px;color:var(--text-primary);cursor:pointer" onclick="Trend.showTrendModal(\'' + escapeHtml(item.title).replace(/'/g, "\\'") + '\')">' + escapeHtml(item.title) + '</div>' +
            '<div class="trending-meta" style="font-size:12px;margin-top:2px">' +
              '<span style="' + trendColor + '">' + trendIcon + ' ' + deltaText + '</span>' +
              '<span style="margin-left:8px">' + (item.platforms || []).map(function(p) { var pk = PLATFORM_KEY_MAP[p] || p; return '<span class="platform-badge ' + pk + '">' + escapeHtml(p) + '</span>'; }).join('') + '</span>' +
              '<span style="margin-left:8px">最高 ' + formatNumber(item.maxHeat || 0) + '</span>' +
            '</div>' +
          '</div>' +
          '<canvas class="trend-mini-chart" data-idx="' + idx + '" style="width:80px;height:32px;flex-shrink:0"></canvas>' +
          '</div>';
      }).join('');

      items.forEach(function(item, idx) {
        var canvas = el.querySelector('.trend-mini-chart[data-idx="' + idx + '"]');
        if (canvas && item.heatSamples && item.heatSamples.length >= 2) {
          drawTrendChart(canvas, item.heatSamples);
        }
      });
    });

    renderRecapSection(_currentRecapDate);
  }

  function renderRecapSection(date) {
    var el = document.getElementById('trendRecapContent');
    if (!el) return;
    el.innerHTML = '加载中...';

    if (_recapCache[date]) {
      renderRecapItems(el, _recapCache[date]);
      return;
    }

    loadRecap(date).then(function(items) {
      _recapCache[date] = items;
      renderRecapItems(el, items);
    }).catch(function() {
      el.innerHTML = '<div class="empty-state" style="padding:20px;text-align:center">加载失败</div>';
    });
  }

  var PLATFORM_KEY_MAP = {
    '微博': 'weibo', '百度': 'baidu', '贴吧': 'tieba', '头条': 'toutiao',
    '少数派': 'sspai', 'IT之家': 'ithome', '知乎热榜': 'zhihu', '虎扑': 'hupu'
  };

  function renderRecapItems(el, items) {
    if (!items.length) {
      el.innerHTML = '<div class="empty-state" style="padding:20px;text-align:center">该日期暂无数据</div>';
      return;
    }
    el.innerHTML = items.map(function(item, idx) {
      var platformKey = PLATFORM_KEY_MAP[item.platform] || (item.platform || '');
      return '<div class="trending-item" style="display:flex;align-items:center;padding:10px 12px;border-bottom:1px solid var(--border-color,#eee)">' +
        '<span class="rank-num" style="min-width:24px;font-weight:bold;color:var(--text-muted)">' + (item.globalRank || idx + 1) + '</span>' +
        '<div style="flex:1;min-width:0">' +
          '<div class="trending-title" style="font-size:14px;color:var(--text-primary);cursor:pointer" onclick="Trend.showTrendModal(\'' + escapeHtml(item.title).replace(/'/g, "\\'") + '\')">' + escapeHtml(item.title) + '</div>' +
          '<div class="trending-meta" style="font-size:12px;margin-top:2px">' +
            '<span class="platform-badge ' + platformKey + '">' + escapeHtml(item.platform || '') + '</span>' +
            '<span style="margin-left:8px">🔥 ' + formatNumber(item.heatScore || item.maxHeat || 0) + '</span>' +
            '<span style="margin-left:8px">排名 ' + (item.rank || idx + 1) + '</span>' +
          '</div>' +
        '</div>' +
        '<button class="card-action-btn" style="font-size:12px;padding:4px 8px;cursor:pointer" onclick="Trend.showTrendModal(\'' + escapeHtml(item.title).replace(/'/g, "\\'") + '\')">📈</button>' +
        '</div>';
    }).join('');
  }

  var Trend = {
    renderTrendTab: renderTrendTab,
    loadRising: loadRising,
    loadRecap: loadRecap,
    normalizeSeries: normalizeSeries,
    drawTrendChart: drawTrendChart,
    showTrendModal: showTrendModal
  };

  if (typeof window !== 'undefined') {
    window.Trend = Trend;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { normalizeSeries: normalizeSeries };
  }
})();
