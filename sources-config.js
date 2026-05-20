const fs = require('fs');
const path = require('path');

const DISABLED_SOURCE_NAMES = new Set([
  '人民网-时政',
  '人民网-国际',
  '人民网-观点',
  '人民网-社会',
  '极客公园'
]);

function filterDisabledSources(rows) {
  return rows.filter(row => !DISABLED_SOURCE_NAMES.has(row.name));
}

function loadSourcesConfig() {
  const filePath = path.join(__dirname, 'sources.json');
  const rows = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return filterDisabledSources(rows);
}

module.exports = { DISABLED_SOURCE_NAMES, filterDisabledSources, loadSourcesConfig };
