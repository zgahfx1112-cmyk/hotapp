const test = require('node:test');
const assert = require('node:assert/strict');
const iconv = require('iconv-lite');
const { decodeHupuResponse } = require('../hotapp/hupu');

test('decodeHupuResponse decodes utf-8 hupu html without mojibake', () => {
  const raw = Buffer.from('<title>虎扑社区-虎扑网</title><div class="hot-title">骑士</div>', 'utf8');

  const text = decodeHupuResponse(raw);

  assert.equal(text.includes('虎扑社区-虎扑网'), true);
  assert.equal(text.includes('骑士'), true);
});

test('decodeHupuResponse decodes gb18030 hupu html without mojibake', () => {
  const raw = iconv.encode('<title>虎扑社区-虎扑网</title><div class="hot-title">骑士</div>', 'gb18030');

  const text = decodeHupuResponse(raw);

  assert.equal(text.includes('虎扑社区-虎扑网'), true);
  assert.equal(text.includes('骑士'), true);
});
