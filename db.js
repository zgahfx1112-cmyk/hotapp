const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let db = null;

async function initDb(dbPath) {
  const SQL = await initSqlJs();
  try {
    const buf = fs.readFileSync(dbPath);
    db = new SQL.Database(buf);
  } catch {
    db = new SQL.Database();
  }

  db.run('PRAGMA journal_mode = OFF');
  db.run('PRAGMA foreign_keys = ON');

  db.run(`CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    feed_url TEXT NOT NULL UNIQUE,
    enabled INTEGER DEFAULT 1
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guid TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    link TEXT,
    image_url TEXT,
    summary TEXT,
    source_id INTEGER NOT NULL,
    pub_date TEXT,
    fetched_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (source_id) REFERENCES sources(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS fetch_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    items_new INTEGER DEFAULT 0,
    error_msg TEXT,
    fetched_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run('CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(pub_date DESC)');

  // Seed sources
  const sources = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'sources.json'), 'utf-8'
  ));
  for (const s of sources) {
    const r = db.run(
      'INSERT OR IGNORE INTO sources (name, feed_url) VALUES (?, ?)',
      [s.name, s.feed_url]
    );
  }

  save(dbPath);
  return db;
}

function save(dbPath) {
  const data = db.export();
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  fs.writeFileSync(dbPath, buf);
}

function getArticles({ sourceId, limit = 50, offset = 0 }) {
  let sql = `SELECT a.*, s.name AS source_name FROM articles a
    JOIN sources s ON a.source_id = s.id`;
  const params = [];

  if (sourceId) {
    sql += ' WHERE a.source_id = ?';
    params.push(sourceId);
  }

  sql += ' ORDER BY a.pub_date DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const stmt = db.prepare(sql);
  stmt.bind(params);
  const articles = [];
  while (stmt.step()) articles.push(stmt.getAsObject());
  stmt.free();

  const countSql = sourceId
    ? 'SELECT COUNT(*) as total FROM articles WHERE source_id = ?'
    : 'SELECT COUNT(*) as total FROM articles';
  const countParams = sourceId ? [sourceId] : [];
  const cstmt = db.prepare(countSql);
  cstmt.bind(countParams);
  cstmt.step();
  const total = cstmt.getAsObject().total;
  cstmt.free();

  return { articles, total };
}

function getSources() {
  const stmt = db.prepare('SELECT id, name, feed_url FROM sources WHERE enabled = 1 ORDER BY id');
  const sources = [];
  while (stmt.step()) sources.push(stmt.getAsObject());
  stmt.free();
  return sources;
}

function getStats() {
  const a = db.exec('SELECT COUNT(*) as count FROM articles');
  const s = db.exec('SELECT COUNT(*) as count FROM sources WHERE enabled = 1');
  const l = db.exec("SELECT MAX(fetched_at) as last FROM fetch_log WHERE status = 'ok'");
  return {
    articleCount: a.length ? a[0].values[0][0] : 0,
    sourceCount: s.length ? s[0].values[0][0] : 0,
    lastFetch: (l.length && l[0].values[0][0]) ? l[0].values[0][0] : null
  };
}

function logFetch(sourceId, status, itemsNew, errorMsg) {
  db.run(
    'INSERT INTO fetch_log (source_id, status, items_new, error_msg) VALUES (?, ?, ?, ?)',
    [sourceId, status, itemsNew, errorMsg || null]
  );
}

function insertArticle(guid, title, link, summary, sourceId, pubDate) {
  try {
    db.run(
      `INSERT INTO articles (guid, title, link, summary, source_id, pub_date) VALUES (?, ?, ?, ?, ?, ?)`,
      [guid, title, link, summary, sourceId, pubDate]
    );
    return true;
  } catch {
    return false; // duplicate GUID
  }
}

module.exports = { initDb, save, getArticles, getSources, getStats, logFetch, insertArticle };