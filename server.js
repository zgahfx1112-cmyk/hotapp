const express = require('express');
const cron = require('node-cron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { initDb, save, getArticles, getSources, getStats, createShortLink, resolveShortLink } = require('./db');
const { fetchAll } = require('./fetch');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'toutiao.db');
const PORT = process.env.PORT || 3000;
const HOTAPP_PORT = 8000;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let db;

// ── API routes ──

app.get('/api/articles', (req, res) => {
  const { source_id, limit = 50, offset = 0 } = req.query;
  const result = getArticles({
    sourceId: source_id ? Number(source_id) : null,
    limit: Math.min(Number(limit), 100),
    offset: Number(offset)
  });
  res.json(result);
});

app.get('/api/sources', (req, res) => {
  res.json(getSources());
});

app.post('/api/fetch', async (req, res) => {
  const sourceId = req.body?.source_id || null;
  const results = await fetchAll(db, () => save(DB_PATH), sourceId);
  res.json({ ok: true, results });
});

app.get('/api/stats', (req, res) => {
  res.json(getStats());
});

// ── Short link API ──

app.post('/api/shorten', (req, res) => {
  const { url, title, source, image, platform } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  const code = createShortLink(url, title || '', source || '', image || '', platform || '');
  const short = `${req.protocol}://${req.get('host')}/s/${code}`;
  res.json({ short, code });
});

app.get('/s/:code', (req, res) => {
  const row = resolveShortLink(req.params.code);
  if (!row) return res.status(404).send('Link not found');

  const escaped = (s) => s ? s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') : '';
  const safeUrl = escaped(row.url);
  const safeTitle = escaped(row.title);
  const safeSource = escaped(row.source);
  const safeImage = escaped(row.image);

  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${safeTitle} - 今日热榜</title>
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="来自${safeSource}的热门资讯">
<meta property="og:image" content="${safeImage}">
<meta property="og:url" content="${safeUrl}">
<meta name="twitter:card" content="summary_large_image">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:#f5f6f8;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.card{max-width:420px;width:100%;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.12);overflow:hidden}
.card-img{width:100%;height:200px;object-fit:cover;display:block}
.card-body{padding:20px}
.card-source{display:inline-block;padding:3px 10px;border-radius:4px;font-size:12px;font-weight:600;color:#fff;background:#4f6ef6;margin-bottom:8px}
.card-title{font-size:18px;font-weight:700;line-height:1.5;margin-bottom:12px;color:#1a1a2e}
.card-link{display:inline-flex;align-items:center;gap:6px;padding:10px 24px;background:#4f6ef6;color:#fff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;transition:background 0.15s}
.card-link:hover{background:#3b5de7}
.card-footer{padding:12px 20px;border-top:1px solid #e1e4e8;font-size:12px;color:#9498a8;text-align:center}
.card-footer a{color:#4f6ef6;text-decoration:none}
</style>
</head>
<body>
<div class="card">
${safeImage ? `<img class="card-img" src="${safeImage}" alt="" onerror="this.style.display='none'">` : ''}
<div class="card-body">
<span class="card-source">${safeSource}</span>
<div class="card-title">${safeTitle}</div>
${safeUrl ? `<a class="card-link" href="${safeUrl}" target="_blank" rel="noopener">阅读原文 →</a>` : ''}
</div>
<div class="card-footer"><a href="/">今日热榜</a> · 全网热点聚合</div>
</div>
</body>
</html>`);
});

// ── HotApp proxy (/api/hot/* → Python :8000) ──

app.use('/api/hot', (req, res) => {
  const opts = {
    hostname: 'localhost',
    port: HOTAPP_PORT,
    path: '/api' + req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${HOTAPP_PORT}` }
  };
  const proxy = http.request(opts, proxyRes => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxy.on('error', () => {
    res.status(502).json({ items: [], errors: ['热搜服务暂不可用'] });
  });
  req.pipe(proxy);
});

// ── Python sidecar ──

let hotAppProcess = null;

function startHotApp() {
  const hotappDir = path.join(__dirname, 'hotapp');
  hotAppProcess = spawn('python', ['server.py'], {
    cwd: hotappDir,
    env: { ...process.env, PORT: String(HOTAPP_PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  hotAppProcess.stdout.on('data', d => {
    d.toString().trim().split('\n').filter(Boolean).forEach(l => console.log('[HotApp]', l.trim()));
  });
  hotAppProcess.stderr.on('data', d => {
    d.toString().trim().split('\n').filter(Boolean).forEach(l => console.error('[HotApp]', l.trim()));
  });
  hotAppProcess.on('exit', (code) => {
    console.error(`[HotApp] Exited with code ${code}`);
    hotAppProcess = null;
  });
}

function cleanup() {
  if (hotAppProcess) { hotAppProcess.kill(); hotAppProcess = null; }
}
process.on('SIGINT', () => { cleanup(); process.exit(); });
process.on('SIGTERM', () => { cleanup(); process.exit(); });
process.on('exit', cleanup);

// ── Start ──

async function start() {
  db = await initDb(DB_PATH);

  // Initial fetch
  console.log('[init] Starting initial RSS fetch...');
  fetchAll(db, () => save(DB_PATH)).catch(err => console.error('[init] Fetch error:', err));

  // Start Python sidecar
  startHotApp();

  // Cron: every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    console.log('[cron] Fetching RSS feeds...');
    fetchAll(db, () => save(DB_PATH)).catch(err => console.error('[cron] Fetch error:', err));
  });

  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

start().catch(err => { console.error('Failed to start:', err); process.exit(1); });