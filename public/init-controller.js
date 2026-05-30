function createInitController(deps) {
  return {
    async init() {
      deps.restorePrefs();
      deps.initTheme();
      deps.renderTab();
      deps.renderInterestTags();
      deps.setupTabs();
      deps.registerSW();

      let skeletonRemoved = false;
      function tryRemoveSkeleton() {
        if (!skeletonRemoved && deps.removeSkeleton) {
          skeletonRemoved = true;
          deps.removeSkeleton();
        }
      }

      // 使用 Promise.allSettled 而非 Promise.all，避免单个请求失败导致整个页面卡住
      const jobs = [
        deps.loadSources()
          .then(() => deps.afterSourcesLoaded && deps.afterSourcesLoaded())
          .catch(err => console.error('[init] Sources fail:', err)),
        deps.loadArticles(30)
          .then(() => { tryRemoveSkeleton(); deps.afterArticlesLoaded && deps.afterArticlesLoaded(); })
          .catch(err => { console.error('[init] Articles fail:', err); tryRemoveSkeleton(); }),
        deps.loadHotData()
          .then(() => { tryRemoveSkeleton(); deps.afterHotLoaded && deps.afterHotLoaded(); })
          .catch(err => { console.error('[init] HotData fail:', err); tryRemoveSkeleton(); }),
        deps.loadStats()
          .then(() => deps.afterStatsLoaded && deps.afterStatsLoaded())
          .catch(err => console.error('[init] Stats fail:', err))
      ];

      deps.getUserStats();
      await Promise.allSettled(jobs);
      // 兜底：确保骨架屏一定会被移除
      tryRemoveSkeleton();
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createInitController };
}
