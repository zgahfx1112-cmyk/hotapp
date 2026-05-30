"""In-App Reader - 网页正文提取模块"""
import urllib.request
import re
import ssl
import gzip
import json

ssl._create_default_https_context = ssl._create_unverified_context

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

# 正文容器选择器（按优先级排序）
CONTENT_SELECTORS = [
    r'<article[^>]*>(.*?)</article>',
    r'<main[^>]*>(.*?)</main>',
    r'<div[^>]*class="[^"]*(?:post-content|article-content|entry-content|content-body|rich_media_content)[^"]*"[^>]*>(.*?)</div>',
    r'<div[^>]*id="[^"]*(?:article|content|post)[^"]*"[^>]*>(.*?)</div>',
]

# 需要移除的标签
REMOVE_TAGS = [
    r'<script[^>]*>.*?</script>',
    r'<style[^>]*>.*?</style>',
    r'<iframe[^>]*>.*?</iframe>',
    r'<nav[^>]*>.*?</nav>',
    r'<footer[^>]*>.*?</footer>',
    r'<header[^>]*>.*?</header>',
    r'<!--.*?-->',
    r'<div[^>]*class="[^"]*(?:sidebar|comment|share|related|recommend|ads?)[^"]*"[^>]*>.*?</div>',
]

# 保留的标签
KEEP_TAGS = {'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'img', 'a', 'strong', 'em', 'b', 'i', 'br', 'figure', 'figcaption', 'table', 'tr', 'td', 'th'}


def fetch_page(url, timeout=10):
    """获取网页HTML"""
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip":
            try:
                body = gzip.decompress(body)
            except:
                pass

        # 检测编码
        content_type = resp.headers.get('Content-Type', '')
        charset = 'utf-8'
        if 'charset=' in content_type:
            charset = content_type.split('charset=')[-1].split(';')[0].strip()

        return body.decode(charset, errors='replace')
    except Exception as e:
        return None


def extract_title(html):
    """提取标题"""
    # 尝试 og:title
    m = re.search(r'<meta[^>]*property="og:title"[^>]*content="([^"]*)"', html)
    if m:
        return m.group(1).strip()

    # 尝试 <title>
    m = re.search(r'<title[^>]*>(.*?)</title>', html, re.DOTALL)
    if m:
        title = m.group(1).strip()
        # 移除网站名称后缀
        title = re.sub(r'\s*[-_|]\s*[^-_|]+$', '', title)
        return title

    # 尝试 <h1>
    m = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.DOTALL)
    if m:
        return re.sub(r'<[^>]+>', '', m.group(1)).strip()

    return ''


def clean_html(html):
    """清洗HTML，移除无关标签"""
    cleaned = html

    # 移除不需要的标签
    for pattern in REMOVE_TAGS:
        cleaned = re.sub(pattern, '', cleaned, flags=re.DOTALL | re.IGNORECASE)

    # 移除多余空白
    cleaned = re.sub(r'\n\s*\n\s*\n+', '\n\n', cleaned)
    cleaned = re.sub(r' +', ' ', cleaned)

    return cleaned.strip()


def extract_content(html):
    """提取正文内容"""
    # 尝试各种选择器
    for pattern in CONTENT_SELECTORS:
        m = re.search(pattern, html, re.DOTALL | re.IGNORECASE)
        if m:
            content = m.group(1)
            return clean_html(content)

    # 降级：提取所有 <p> 标签
    paragraphs = re.findall(r'<p[^>]*>(.*?)</p>', html, re.DOTALL | re.IGNORECASE)
    if paragraphs:
        return '\n'.join(clean_html(p) for p in paragraphs if len(re.sub(r'<[^>]+>', '', p).strip()) > 20)

    # 最终降级：提取 body
    m = re.search(r'<body[^>]*>(.*?)</body>', html, re.DOTALL | re.IGNORECASE)
    if m:
        return clean_html(m.group(1))[:5000]  # 限制长度

    return ''


def extract_images(html, base_url=''):
    """提取图片列表"""
    images = []
    # 尝试 og:image
    m = re.search(r'<meta[^>]*property="og:image"[^>]*content="([^"]*)"', html)
    if m:
        images.append(m.group(1).strip())

    # 提取正文中的图片
    for m in re.finditer(r'<img[^>]*src=["\']([^"\']+)["\']', html, re.IGNORECASE):
        src = m.group(1).strip()
        if src.startswith('//'):
            src = 'https:' + src
        elif src.startswith('/') and base_url:
            # 相对路径转绝对路径
            from urllib.parse import urlparse
            parsed = urlparse(base_url)
            src = f"{parsed.scheme}://{parsed.netloc}{src}"
        if src not in images and not src.endswith(('.gif', '.svg')):
            images.append(src)
        if len(images) >= 10:
            break

    return images


def extract_article(url):
    """提取文章完整信息"""
    html = fetch_page(url)
    if not html:
        return {'error': '无法获取页面内容'}

    title = extract_title(html)
    content = extract_content(html)
    images = extract_images(html, url)

    if not content:
        return {'error': '无法提取正文内容'}

    return {
        'title': title,
        'content': content,
        'images': images,
        'url': url
    }


def handler(environ, start_response):
    """WSGI handler for /api/reader"""
    from urllib.parse import parse_qs

    query = parse_qs(environ.get('QUERY_STRING', ''))
    url = query.get('url', [None])[0]

    if not url:
        start_response('400 Bad Request', [('Content-Type', 'application/json')])
        return [json.dumps({'error': 'Missing url parameter'}).encode('utf-8')]

    result = extract_article(url)

    start_response('200 OK', [
        ('Content-Type', 'application/json; charset=utf-8'),
        ('Access-Control-Allow-Origin', '*')
    ])
    return [json.dumps(result, ensure_ascii=False).encode('utf-8')]


if __name__ == '__main__':
    # 测试
    import sys
    if len(sys.argv) > 1:
        url = sys.argv[1]
        print(f"提取: {url}")
        result = extract_article(url)
        print(f"标题: {result.get('title', 'N/A')}")
        print(f"正文长度: {len(result.get('content', ''))} 字符")
        print(f"图片数: {len(result.get('images', []))}")
        if 'error' in result:
            print(f"错误: {result['error']}")
        else:
            print("\n--- 正文预览 ---")
            print(result['content'][:500])
