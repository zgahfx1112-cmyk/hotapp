const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

global.TOPIC_KEYWORDS = require('../public/topic-keywords');
const { clusterTopics, isSameEvent } = require('../public/app.js');

describe('event-timeline clustering', () => {
  const baseItem = {
    id: 'weibo_001',
    title: '某明星官宣结婚引发热议',
    url: 'https://weibo.com/123',
    source: '微博',
    platform: 'weibo',
    type: 'hot',
    heatScore: 98000,
    timestamp: 1718496000000
  };

  const relatedItem = {
    id: 'toutiao_002',
    title: '某明星官宣结婚 网友纷纷祝福',
    url: 'https://toutiao.com/456',
    source: '头条',
    platform: 'toutiao',
    type: 'hot',
    heatScore: 85000,
    timestamp: 1718500000000
  };

  const unrelatedItem = {
    id: 'baidu_003',
    title: '今天天气预报 明日有雨',
    url: 'https://baidu.com/789',
    source: '百度',
    platform: 'baidu',
    type: 'hot',
    heatScore: 30000,
    timestamp: 1718510000000
  };

  const thirdSource = {
    id: 'zhihu_004',
    title: '某明星结婚 你怎么看',
    url: 'https://zhihu.com/012',
    source: '知乎',
    platform: 'zhihu',
    type: 'hot',
    heatScore: 72000,
    timestamp: 1718505000000
  };

  it('同事件跨平台条目聚到同一 cluster', () => {
    const items = [baseItem, relatedItem, thirdSource, unrelatedItem];
    const clusters = clusterTopics(items);

    const eventCluster = clusters.find(c => c.totalCount > 1);
    assert.ok(eventCluster, '应找到包含多来源的 cluster');
    assert.ok(eventCluster.totalCount >= 2, 'cluster 至少含 2 个来源');
    assert.ok(eventCluster.sources.includes('微博'), '应含微博来源');
    assert.ok(eventCluster.sources.includes('头条'), '应含头条来源');
  });

  it('不相关条目不被合并', () => {
    const items = [baseItem, unrelatedItem];
    const clusters = clusterTopics(items);

    assert.equal(clusters.length, 2, '不相关条目应产生两个 cluster');
  });

  it('isSameEvent 正确判断同事件', () => {
    assert.ok(isSameEvent(baseItem, relatedItem), '相似标题应判定为同事件');
    assert.ok(!isSameEvent(baseItem, unrelatedItem), '不同主题应判定为不同事件');
  });

  it('时间线数据按 timestamp 升序排列', () => {
    const items = [thirdSource, relatedItem, baseItem, unrelatedItem];
    const clusters = clusterTopics(items);
    const eventCluster = clusters.find(c => c.totalCount > 1);
    assert.ok(eventCluster, '应找到 cluster');

    const allItems = [eventCluster.mainItem, ...eventCluster.relatedItems]
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    for (let i = 1; i < allItems.length; i++) {
      assert.ok(
        allItems[i].timestamp >= allItems[i - 1].timestamp,
        `条目 ${i} 的时间戳应 >= 条目 ${i - 1}`
      );
    }
  });

  it('来源集合覆盖所有聚类条目', () => {
    const items = [baseItem, relatedItem, thirdSource];
    const clusters = clusterTopics(items);
    const eventCluster = clusters.find(c => c.totalCount > 1);
    assert.ok(eventCluster, '应找到 cluster');

    const allSources = [eventCluster.mainItem.source, ...eventCluster.relatedItems.map(i => i.source)];
    assert.deepEqual(eventCluster.sources.sort(), allSources.sort(), 'sources 应覆盖所有条目来源');
  });

  it('单条目 cluster 为 totalCount=1', () => {
    const items = [unrelatedItem];
    const clusters = clusterTopics(items);

    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].totalCount, 1);
  });

  it('空数组返回空 clusters', () => {
    const clusters = clusterTopics([]);
    assert.deepEqual(clusters, []);
  });
});
