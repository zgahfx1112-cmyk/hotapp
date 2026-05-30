const test = require('node:test');
const assert = require('node:assert/strict');
const { generateShareCard, generateQRCode } = require('../public/app');

// ── generateShareCard ──

test('generateShareCard returns HTML with title and source', () => {
  const item = {
    title: 'AI 芯片突破',
    source: 'IT之家',
    url: 'https://example.com/article'
  };

  const html = generateShareCard(item);

  assert.ok(html.includes('AI 芯片突破'), 'Should include title');
  assert.ok(html.includes('IT之家'), 'Should include source');
  assert.ok(html.includes('share-card'), 'Should have share-card class');
});

test('generateShareCard includes image when provided', () => {
  const item = {
    title: 'AI 芯片突破',
    source: 'IT之家',
    image: 'https://example.com/image.jpg',
    url: 'https://example.com/article'
  };

  const html = generateShareCard(item);

  assert.ok(html.includes('image.jpg'), 'Should include image');
  assert.ok(html.includes('<img'), 'Should have img tag');
});

test('generateShareCard handles missing image', () => {
  const item = {
    title: 'AI 芯片突破',
    source: 'IT之家',
    url: 'https://example.com/article'
  };

  const html = generateShareCard(item);

  assert.ok(!html.includes('<img'), 'Should not have img tag when no image');
});

test('generateShareCard includes QR code placeholder', () => {
  const item = {
    title: 'AI 芯片突破',
    source: 'IT之家',
    url: 'https://example.com/article'
  };

  const html = generateShareCard(item);

  assert.ok(html.includes('qr-code'), 'Should have qr-code placeholder');
});

test('generateShareCard includes summary when provided', () => {
  const item = {
    title: 'AI 芯片突破',
    source: 'IT之家',
    summary: '最新研究显示 AI 芯片性能提升 50%',
    url: 'https://example.com/article'
  };

  const html = generateShareCard(item);

  assert.ok(html.includes('最新研究'), 'Should include summary');
  assert.ok(html.includes('share-summary'), 'Should have share-summary class');
});

test('generateShareCard truncates long summary', () => {
  const longSummary = '这是一段很长的摘要'.repeat(20);
  const item = {
    title: 'AI 芯片突破',
    source: 'IT之家',
    summary: longSummary,
    url: 'https://example.com/article'
  };

  const html = generateShareCard(item);

  // Should not include the full long summary
  assert.ok(html.length < longSummary.length + 1000, 'Should truncate long summary');
});

test('generateShareCard handles special characters in title', () => {
  const item = {
    title: 'AI 芯片 <script>alert("xss")</script>',
    source: 'IT之家',
    url: 'https://example.com/article'
  };

  const html = generateShareCard(item);

  assert.ok(!html.includes('<script>'), 'Should escape HTML tags');
  assert.ok(html.includes('&lt;script&gt;'), 'Should have escaped HTML');
});

// ── generateQRCode ──

test('generateQRCode returns SVG string', () => {
  const qr = generateQRCode('https://example.com');

  assert.ok(qr.includes('<svg'), 'Should return SVG');
  assert.ok(qr.includes('</svg>'), 'Should close SVG tag');
});

test('generateQRCode handles empty input', () => {
  const qr = generateQRCode('');

  assert.ok(qr.includes('<svg'), 'Should still return SVG');
});

test('generateQRCode includes data in SVG', () => {
  const url = 'https://example.com/test123';
  const qr = generateQRCode(url);

  // QR code should encode the URL (simplified check)
  assert.ok(qr.length > 100, 'Should have meaningful content');
});
