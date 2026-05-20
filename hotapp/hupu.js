const iconv = require('iconv-lite');

function decodeHupuResponse(raw) {
  if (!Buffer.isBuffer(raw)) return String(raw || '');
  const utf8Text = raw.toString('utf8');
  if (!utf8Text.includes('�')) return utf8Text;
  return iconv.decode(raw, 'gb18030');
}

module.exports = { decodeHupuResponse };
