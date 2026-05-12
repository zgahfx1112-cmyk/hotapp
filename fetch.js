const Parser = require('rss-parser');

function extractImage(item) {
  // enclosure
  if (item.enclosure && item.enclosure.url) return item.enclosure.url;
  // media:thumbnail
  if (item['media:thumbnail'] && item['media:thumbnail'].$ && item['media:thumbnail'].$.url) return item['media:thumbnail'].$.url;
  // media:content
  if (item['media:content'] && item['media:content'].$ && item['media:content'].$.url) return item['media:content'].$.url;
  // from content HTML
  if (item.content) {
    const m = item.content.match(/<img[^>]+src=["']([^"']+)["']/);
    if (m) return m[1];
  }
  return null;
}async function fetchAll(db, saveFn, sourceId = null) {
  let rows;
  if (sourceId) {
    const stmt = db.prepare('SELECT id, name, feed_url FROM sources WHERE id = ? AND enabled = 1');
    stmt.bind([sourceId]);
    rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
  } else {
    const stmt = db.prepare('SELECT id, name, feed_url FROM sources WHERE enabled = 1 ORDER BY id');
    rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
  }

  if (!rows.length) return [];

  const results = [];
  for (const { id, name, feed_url } of rows) {
    const parser = new Parser({
      timeout: 15000,
      headers: { 'User-Agent': 'ToutiaoRSS/1.0' }
    });

    let feed;
    try {
      feed = await parser.parseURL(feed_url);
    } catch (err) {
      logFetch(db, id, 'error', 0, err.message);
      results.push({ name, status: 'error', newCount: 0, error: err.message });
      continue;
    }

    let newCount = 0;
    const checkStmt = db.prepare('SELECT id FROM articles WHERE guid = ?');
    for (const item of feed.items || []) {
      const guid = item.guid || item.link || item.title;
      if (!guid) continue;

      const title = item.title || '(无标题)';
      const link = item.link || '';
      const summary = (item.contentSnippet || item.content || '').substring(0, 500);
      const imageUrl = extractImage(item);
      const pubDate = item.pubDate ? new Date(item.pubDate).toISOString() : null;

      checkStmt.bind([guid]);
      const exists = checkStmt.step();
      checkStmt.reset();
      if (exists) continue;

      db.run(
        `INSERT INTO articles (guid, title, link, image_url, summary, source_id, pub_date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [guid, title, link, imageUrl, summary, id, pubDate]
      );
      newCount++;
    }
    checkStmt.free();

    logFetch(db, id, 'ok', newCount, null);
    results.push({ name, status: 'ok', newCount });
  }

  if (results.length > 0) saveFn();
  return results;
}

function logFetch(db, sourceId, status, itemsNew, errorMsg) {
  db.run(
    'INSERT INTO fetch_log (source_id, status, items_new, error_msg) VALUES (?, ?, ?, ?)',
    [sourceId, status, itemsNew, errorMsg || null]
  );
}

module.exports = { fetchAll };