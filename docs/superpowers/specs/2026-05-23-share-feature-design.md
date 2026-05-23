# 分享功能设计文档

## 背景

当前 toutiao 项目卡片上已有收藏（⭐）和不感兴趣（隐藏）按钮，缺少分享功能。用户浏览新闻后希望快速分享给他人。

## 设计决策

- **触发位置**：卡片上直接加分享按钮，与收藏/不感兴趣按钮并列
- **分享渠道**：优先 Web Share API（系统原生分享菜单），不支持时回退到复制链接 + Toast 提示
- **方案选择**：方案A — 卡片直接触发，无额外中间步骤

## 技术方案

### 1. 分享按钮 UI

每个卡片（feed-card、trending-item、rss-article-card）加一个分享按钮：

- feed-card：在卡片底部左侧，与 `btn-star`（右下角）对称。图标用 SVG 分享图标（箭头+连线风格），34x34px 圆形按钮，与现有 btn-star/btn-hide 样式一致
- trending-item：在右侧收藏星号旁，追加分享图标
- rss-article-card：右上角，与收藏星号并列

按钮颜色：默认 `var(--text-muted)`，hover 时 `var(--accent)`，与现有交互风格一致。

### 2. 分享逻辑

```javascript
async function shareItem(item) {
  const shareData = {
    title: item.title,
    text: item.title,
    url: item.url || window.location.href
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (e) {
      // 用户取消分享，不提示
      if (e.name !== 'AbortError') {
        copyLink(item.url);
      }
    }
  } else {
    copyLink(item.url);
  }
}

function copyLink(url) {
  const text = url || window.location.href;
  navigator.clipboard.writeText(text).then(() => {
    showToast('链接已复制');
  }).catch(() => {
    // Fallback for older browsers
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
    showToast('链接已复制');
  });
}
```

### 3. 需修改的文件

| 文件 | 改动 |
|------|------|
| `public/app.js` | 添加 `shareItem()` 和 `copyLink()` 函数；在 `loadFeedPage()`、`renderHotList()`、`renderRssList()` 中插入分享按钮 HTML + 绑定事件 |
| `public/style.css` | 添加 `.btn-share` 样式，与 `.btn-star` 保持一致 |

### 4. 事件绑定

分享按钮 click 事件：
- `e.stopPropagation()` — 防止触发卡片本身的链接跳转
- 调用 `shareItem(item)` — 传入当前卡片数据

### 5. 不做的事

- 不做自定义分享面板 UI
- 不做微信/微博 SDK 集成
- 不做分享统计
- 不做生成图片海报分享

## 验收标准

1. feed-card 卡片上有分享按钮，点击触发系统分享或复制链接
2. trending-item 有分享按钮，功能一致
3. rss-article-card 有分享按钮，功能一致
4. Web Share API 可用时弹出系统分享菜单
5. Web Share API 不可用时复制链接到剪贴板，Toast 提示"链接已复制"
6. 分享按钮 hover 变色，与现有交互风格一致
7. 点击分享按钮不会触发卡片跳转