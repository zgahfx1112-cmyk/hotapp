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
  save(DB_PATH);
  const short = `https://${req.get('host')}/s/${code}`;
  res.json({ short, code });
});

app.get('/s/:code', (req, res) => {
  const row = resolveShortLink(req.params.code);
  if (!row) return res.status(404).send('Link not found');
  res.redirect(302, row.url);
});

// ── HotApp proxy (/api/hot/* and /api/reader → Python :8000) ──

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

// ── Reader proxy (/api/reader → Python :8000) ──

app.use('/api/reader', (req, res) => {
  const opts = {
    hostname: 'localhost',
    port: HOTAPP_PORT,
    path: '/api/reader' + (req.url || ''),
    method: req.method,
    headers: { ...req.headers, host: `localhost:${HOTAPP_PORT}` }
  };
  const proxy = http.request(opts, proxyRes => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxy.on('error', () => {
    res.status(502).json({ error: '阅读服务暂不可用' });
  });
  req.pipe(proxy);
});

// ── Trend proxy (/api/trend → Python :8000) ──

app.use('/api/trend', (req, res) => {
  const opts = {
    hostname: 'localhost',
    port: HOTAPP_PORT,
    path: '/api/trend' + (req.url || ''),
    method: req.method,
    headers: { ...req.headers, host: `localhost:${HOTAPP_PORT}` }
  };
  const proxy = http.request(opts, proxyRes => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxy.on('error', () => {
    res.status(502).json({ error: '趋势服务暂不可用' });
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