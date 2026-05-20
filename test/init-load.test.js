const test = require('node:test');
const assert = require('node:assert/strict');
const { createInitController } = require('../public/init-controller');

test('createInitController renders immediately before async article loader finishes', async () => {
  const calls = [];
  let releaseArticles;
  const articlesDone = new Promise(resolve => { releaseArticles = resolve; });

  const controller = createInitController({
    restorePrefs: () => calls.push('restorePrefs'),
    initTheme: () => calls.push('initTheme'),
    renderTab: () => calls.push('renderTab'),
    renderInterestTags: () => calls.push('renderInterestTags'),
    setupTabs: () => calls.push('setupTabs'),
    registerSW: () => calls.push('registerSW'),
    getUserStats: () => calls.push('getUserStats'),
    loadSources: async () => { calls.push('loadSources'); },
    loadArticles: async (limit) => { calls.push(`loadArticles:${limit}`); await articlesDone; },
    loadHotData: async () => { calls.push('loadHotData'); },
    loadStats: async () => { calls.push('loadStats'); },
    afterSourcesLoaded: () => calls.push('afterSourcesLoaded'),
    afterArticlesLoaded: () => calls.push('afterArticlesLoaded'),
    afterHotLoaded: () => calls.push('afterHotLoaded'),
    afterStatsLoaded: () => calls.push('afterStatsLoaded')
  });

  const pending = controller.init();

  assert.deepEqual(calls.slice(0, 5), ['restorePrefs', 'initTheme', 'renderTab', 'renderInterestTags', 'setupTabs']);
  assert.equal(calls.includes('loadArticles:30'), true);
  assert.equal(calls.includes('afterArticlesLoaded'), false);

  releaseArticles();
  await pending;

  assert.equal(calls.includes('afterArticlesLoaded'), true);
  assert.equal(calls.includes('afterHotLoaded'), true);
});
