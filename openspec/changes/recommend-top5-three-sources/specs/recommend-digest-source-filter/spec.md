## ADDED Requirements

### Requirement: Recommend digest only shows three approved hot sources
智能推荐页中的“实时热榜 Top 5”摘要卡片 MUST 只从头条、百度、微博三个平台的热榜数据中选择展示内容。

#### Scenario: Filter digest items to approved sources
- **WHEN** 智能推荐页渲染实时热榜摘要卡片且热榜数据包含多个平台
- **THEN** 系统 MUST 仅使用 `toutiao`、`baidu`、`weibo` 三个平台的数据作为候选项

#### Scenario: Limit digest after source filter
- **WHEN** 三个平台候选项数量超过 5 条
- **THEN** 系统 MUST 在过滤后按现有顺序取前 5 条展示

#### Scenario: Show available items when fewer than five
- **WHEN** 三个平台候选项少于 5 条但大于 0 条
- **THEN** 系统 MUST 仅展示实际可用条数，且 MUST NOT 使用其他平台补位

#### Scenario: Hide digest when no approved-source items exist
- **WHEN** 头条、百度、微博三个平台都没有可展示的热榜项
- **THEN** 系统 MUST 不渲染该摘要卡片
