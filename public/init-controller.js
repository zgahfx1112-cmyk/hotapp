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

      const jobs = [
        deps.loadSources().then(() => deps.afterSourcesLoaded && deps.afterSourcesLoaded()),
        deps.loadArticles(30).then(() => { tryRemoveSkeleton(); deps.afterArticlesLoaded && deps.afterArticlesLoaded(); }),
        deps.loadHotData().then(() => { tryRemoveSkeleton(); deps.afterHotLoaded && deps.afterHotLoaded(); }),
        deps.loadStats().then(() => deps.afterStatsLoaded && deps.afterStatsLoaded())
      ];

      deps.getUserStats();
      await Promise.all(jobs);
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createInitController };
}
