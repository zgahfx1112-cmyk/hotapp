"""HotApp 服务端 - 三重数据获取：缓存优先 + 实时抓取 + 本地兜底"""
import http.server
import urllib.request
import urllib.parse
import json
import gzip
import ssl
import re
import time
import os
import threading
import signal
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict
import sys
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
from reader import extract_article

ssl._create_default_https_context = ssl._create_unverified_context
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_FILE = os.path.join(HERE, "cache.json")
CACHE_TTL = 300  # 缓存有效期 5 分钟

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

# 全局缓存
cache_data = {"items": [], "errors": [], "updated": 0}

def parse_weibo(data):
    items = (data.get("data", {}) or {}).get("realtime") or []
    return [{"id": f"weibo_{i}", "title": x.get("note") or x.get("word", ""),
             "url": f"https://s.weibo.com/weibo?q={urllib.parse.quote(x.get('note') or x.get('word',''))}",
             "platform": "weibo", "rank": i+1,
             "heatScore": x.get("num") or x.get("raw_hot") or (9000-i*200),
             "image": x.get("icon") or None} for i,x in enumerate(items[:100])]  # 增加到100条


def parse_baidu(raw):
    m = re.search(r"<!--s-data:(.*?)-->", raw, re.DOTALL)
    if not m:
        return []
    try:
        inner = m.group(1).replace("&quot;", '"').replace("&amp;", "&")
        cards = json.loads(inner).get("data", {}).get("cards", [{}])
        content = cards[0].get("content", []) if cards else []
        return [{"id": f"baidu_{i}", "title": x.get("word") or x.get("query",""),
                 "url": x.get("url") or f"https://www.baidu.com/s?wd={urllib.parse.quote(x.get('word',''))}",
                 "platform": "baidu", "rank": i+1,
                 "heatScore": int(x.get("hotScore", 0) or (8500-i*180)),
                 "image": x.get("img") or None} for i,x in enumerate(content[:100])]  # 增加到100条
    except Exception:
        return []

def parse_toutiao(data):
    items = data.get("data") or []
    result = []
    for i, x in enumerate(items[:100]):  # 增加到100条
        img = (x.get("Image") or {}).get("url") or None
        result.append({"id": f"toutiao_{x.get('ClusterId', i)}", "title": x.get("Title") or x.get("QueryWord", ""),
                 "url": x.get("Url") or f"https://so.toutiao.com/search?keyword={urllib.parse.quote(x.get('QueryWord',''))}",
                 "platform": "toutiao", "rank": i+1,
                 "heatScore": int(x.get("HotValue", 0) or (9000-i*200)),
                 "image": img})
    return result

def parse_toutiao_feed(data):
    """解析头条推荐流"""
    if isinstance(data, str):
        return []  # 非 JSON 响应，跳过
    items = data.get("data") or []
    result = []
    for i, x in enumerate(items[:50]):
        if isinstance(x, str):
            continue
        title = x.get("title") or x.get("abstract", "")
        if not title:
            continue
        # 清理标题
        title = title.replace("\n", "").replace("\r", "").strip()
        result.append({
            "id": f"toutiao_feed_{x.get('group_id', i)}",
            "title": title,
            "url": f"https://www.toutiao.com/item/{x.get('group_id', '')}",
            "platform": "toutiao",
            "rank": i+1,
            "heatScore": x.get("comments_count", 0) or (8000-i*100),
            "image": x.get("middle_image", {}).get("url") or None
        })
    return result

def parse_tieba(data):
    items = (data.get("data", {}) or {}).get("bang_topic", {}) or {}
    items = items.get("topic_list") or []
    return [{"id": f"tieba_{x.get('topic_id', i)}", "title": x.get("topic_name", ""),
             "url": x.get("topic_url") or f"https://tieba.baidu.com/hottopic/browse/hottopic?topic_id={x.get('topic_id','')}",
             "platform": "tieba", "rank": i+1,
             "heatScore": x.get("discuss_num") or (7500-i*80),
             "image": x.get("topic_pic") or None} for i,x in enumerate(items[:100])]  # 增加到100条

def parse_36kr_hot(data):
    """36氪快讯（独立平台，与 RSS 36氪区分）"""
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except:
            return []
    items = (data.get("data", {}) or {}).get("items") or []
    return [{"id": f"36kr_hot_{i}", "title": x.get("title", ""),
             "url": f"https://36kr.com/newsflashes/{x.get('id','')}",
             "platform": "36kr_hot", "rank": i+1,
             "heatScore": 6000-i*50} for i,x in enumerate(items[:30])]

def parse_sspai(data):
    items = data.get("list") or []
    result = []
    for i, x in enumerate(items[:100]):  # 增加到100条
        views = x.get("views_count", 0)
        if views is None or views == "" or views == 0:
            views = 5000 - i * 80
        else:
            try:
                views = int(views)
            except:
                views = 5000 - i * 80
        # 清理 title 中的所有特殊字符
        title = (x.get("title") or "")
        title = title.replace("\n", " ").replace("\r", " ").replace("\t", " ")
        title = title.replace('"', '').replace("'", "").replace("\\", "")
        title = title.strip()
        if not title:
            continue
        result.append({
            "id": f"sspai_{i}",
            "title": title,
            "url": f"https://sspai.com/post/{x.get('id','')}",
            "platform": "sspai",
            "rank": i+1,
            "heatScore": views
        })
    return result

def parse_ithome(data):
    items = data.get("newslist") or []
    result = []
    for i, x in enumerate(items[:100]):  # 增加到100条
        # 清理 title 中的特殊字符
        title = (x.get("title") or "").replace("\n", "").replace("\r", "").replace('"', '').replace("'", "").strip()
        hits = x.get("hitcount", 0) or 0
        # 使用返回的 url 字段或构造 URL
        url = x.get("url", "")
        if url.startswith("/"):
            url = f"https://www.ithome.com{url}"
        elif not url.startswith("http"):
            url = f"https://www.ithome.com/0/{x.get('newsid','')}.htm"
        result.append({
            "id": f"ithome_{x.get('newsid', i)}",
            "title": title,
            "url": url,
            "platform": "ithome",
            "rank": i+1,
            "heatScore": int(hits) if hits > 0 else (4500 - i * 50),
            "image": x.get("image") or None
        })
    return result

def parse_zhihu(data):
    items = data.get("data") or []
    result = []
    for i, x in enumerate(items[:50]):
        target = x.get("target") or {}
        title = target.get("title", "")
        if not title:
            continue
        url = target.get("url", "")
        if url and not url.startswith("http"):
            url = f"https://www.zhihu.com{url}"
        detail = x.get("detail_text", "")
        heat = 5000
        if detail:
            m = re.search(r"(\d+(?:\.\d+)?)\s*万", str(detail))
            if m:
                heat = int(float(m.group(1)) * 10000)
            else:
                m2 = re.search(r"(\d+)", str(detail))
                if m2:
                    heat = int(m2.group(1))
        result.append({
            "id": f"zhihu_{i}", "title": title,
            "url": url or f"https://www.zhihu.com/hot",
            "platform": "zhihu", "rank": i+1,
            "heatScore": heat, "image": None
        })
    return result

def parse_zhihu_billboard(html):
    """从知乎热榜 HTML 提取数据（无需 API cookie）"""
    result = []
    m = re.search(r'window\.__INITIAL_STATE__\s*=\s*({.*?});', html, re.DOTALL)
    if not m:
        return result
    try:
        data = json.loads(m.group(1))
        hot_items = (data.get("topstory", {}) or {}).get("hotList", []) or []
        for i, x in enumerate(hot_items[:50]):
            target = (x.get("target", {}) or {})
            title = target.get("titleArea", {}).get("text", "") or target.get("title", "")
            if not title:
                continue
            url = target.get("link", {}).get("url", "")
            if url and not url.startswith("http"):
                url = f"https://www.zhihu.com{url}"
            heat = target.get("metricsArea", {}).get("text", "") or ""
            heat_val = 5000
            if heat:
                hm = re.search(r"(\d+(?:\.\d+)?)\s*万", heat)
                if hm:
                    heat_val = int(float(hm.group(1)) * 10000)
                else:
                    hm2 = re.search(r"(\d+)", heat)
                    if hm2:
                        heat_val = int(hm2.group(1))
            result.append({
                "id": f"zhihu_{i}", "title": title,
                "url": url or f"https://www.zhihu.com/hot",
                "platform": "zhihu", "rank": i+1,
                "heatScore": heat_val, "image": None
            })
    except:
        pass
    return result

def parse_hupu(raw):
    """从虎扑 HTML 提取热搜"""
    result = []
    if isinstance(raw, bytes):
        text = raw.decode("utf-8", errors="replace")
    else:
        text = raw
    # 热搜列表
    pattern = re.compile(r'hot-search-item.*?hot-index[^>]*>([^<]+)<.*?hot-title[^>]*>([^<]+)<', re.DOTALL)
    matches = pattern.findall(text)
    for i, (idx_str, title) in enumerate(matches[:50]):
        title = title.strip()
        if not title:
            continue
        kw = urllib.parse.quote(title)
        result.append({
            "id": f"hupu_{i}", "title": title,
            "url": f"https://bbs.hupu.com/search?q={kw}",
            "platform": "hupu",
            "rank": i+1, "heatScore": int(5000 - i * 80),
            "image": None
        })
    return result

PLATFORMS = {
    "weibo": {"name": "微博",
        "url": "https://weibo.com/ajax/side/hotSearch",
        "hdrs": {"User-Agent": UA, "Referer": "https://weibo.com/", "X-Requested-With": "XMLHttpRequest"},
        "parse": parse_weibo},
    "baidu": {"name": "百度",
        "url": "https://top.baidu.com/board?tab=realtime",
        "hdrs": {"User-Agent": UA},
        "parse": parse_baidu},
    "tieba": {"name": "贴吧",
        "url": "https://tieba.baidu.com/hottopic/browse/topicList",
        "hdrs": {"User-Agent": UA, "Referer": "https://tieba.baidu.com/"},
        "parse": parse_tieba},
    "toutiao": {"name": "头条",
        "url": "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc",
        "hdrs": {"User-Agent": UA, "Referer": "https://www.toutiao.com/"},
        "parse": parse_toutiao},
    "sspai": {"name": "少数派",
        "url": "https://sspai.com/api/v1/articles?page=1&limit=30",
        "hdrs": {"User-Agent": UA, "Referer": "https://sspai.com/"},
        "parse": parse_sspai},
    "ithome": {"name": "IT之家",
        "url": "https://api.ithome.com/json/newslist/news",
        "hdrs": {"User-Agent": UA, "Referer": "https://www.ithome.com/"},
        "parse": parse_ithome},
    "zhihu": {"name": "知乎热榜",
        "url": "https://www.zhihu.com/billboard",
        "hdrs": {"User-Agent": UA, "Referer": "https://www.zhihu.com/"},
        "parse": parse_zhihu_billboard},
    "hupu": {"name": "虎扑",
        "url": "https://bbs.hupu.com/all",
        "hdrs": {"User-Agent": UA, "Referer": "https://bbs.hupu.com/"},
        "raw_response": True,
        "parse": parse_hupu},
}  # end PLATFORMS
# 知乎热榜 API 需登录验证，暂用 RSS 替代

def fetch_one(key, cfg):
    try:
        req = urllib.request.Request(cfg["url"], headers=cfg["hdrs"])
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip":
            try: body = gzip.decompress(body)
            except: pass

        if cfg.get("raw_response"):
            # 原始二进制响应，直接传给解析器（用于 gb18030 编码页面）
            items = cfg["parse"](body)
        else:
            enc = cfg.get("encoding", "utf-8")
            text = body.decode(enc, errors="replace")

            try:
                data = json.loads(text)
            except:
                if len(text) < 500 or ("captcha" in text.lower() and "<form" in text.lower()):
                    print(f"  [{cfg['name']}] 返回验证页面")
                    return []
                data = text

            items = cfg["parse"](data)

        now = int(time.time() * 1000)
        for item in items:
            item["timestamp"] = now
        return items
    except Exception as e:
        print(f"  [{cfg['name']}] 失败: {e}")
        return []

def title_key(title):
    return re.sub(r"\s+", "", str(title or "")).lower()


def fetch_all_platforms():
    """抓取所有平台数据"""
    all_items, errors = [], []
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(fetch_one, k, c): c["name"] for k, c in PLATFORMS.items()}
        for f in as_completed(futures):
            name = futures[f]
            try:
                items = f.result()
                if items is not None:
                    all_items.extend(items)
                    print(f"  [{name}] 成功: {len(items)} 条")
                else:
                    errors.append(name)
            except Exception as e:
                errors.append(name)
                print(f"  [{name}] 异常: {e}")

    # 轮询交错排序
    groups = defaultdict(list)
    seen_titles = set()
    for item in all_items:
        key = title_key(item.get("title"))
        if key and key in seen_titles:
            continue
        if key:
            seen_titles.add(key)
        groups[item["platform"]].append(item)
    for items in groups.values():
        items.sort(key=lambda x: x["rank"])

    platforms = sorted(groups.keys())
    max_len = max((len(v) for v in groups.values()), default=0)
    result = []
    for i in range(max_len):
        for plat in platforms:
            if i < len(groups[plat]):
                result.append(groups[plat][i])

    for i, item in enumerate(result):
        item["globalRank"] = i + 1

    return {"items": result, "errors": errors, "updated": int(time.time()*1000)}

def load_cache():
    """从文件加载缓存"""
    global cache_data
    try:
        if os.path.exists(CACHE_FILE):
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                loaded = json.load(f)
            cache_data = loaded  # 直接赋值，确保更新
            items_count = len(cache_data.get('items', []))
            print(f"  缓存已加载: {items_count} 条")
            # 打印各平台数量
            plat_counts = {}
            for i in cache_data.get('items', []):
                p = i.get('platform', 'unknown')
                plat_counts[p] = plat_counts.get(p, 0) + 1
            print(f"  平台分布: {plat_counts}")
    except Exception as e:
        print(f"  缓存加载失败: {e}")

def save_cache(data):
    """保存缓存到文件"""
    global cache_data
    cache_data = data
    try:
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache_data, f, ensure_ascii=False)
    except Exception as e:
        print(f"  缓存保存失败: {e}")

def background_refresh():
    """后台定时刷新"""
    while True:
        time.sleep(CACHE_TTL)  # 每 5 分钟刷新
        print("[后台] 开始刷新数据...")
        try:
            data = fetch_all_platforms()
            if data["items"]:
                save_cache(data)
                print(f"[后台] 刷新完成: {len(data['items'])} 条")
        except Exception as e:
            print(f"[后台] 刷新失败: {e}")

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    def do_GET(self):
        if self.path.startswith("/api/trending"):
            self._api_trending()
        elif self.path.startswith("/api/reader"):
            self._api_reader()
        elif self.path == "/":
            self.path = "/index.html"
            super().do_GET()
        else:
            super().do_GET()

    def do_HEAD(self):
        # 响应 HEAD 请求，用于 keep-alive ping
        if self.path.startswith("/api/trending"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
        else:
            super().do_HEAD()

    def _api_trending(self):
        """三重优先级返回数据"""
        now = int(time.time() * 1000)
        cache_age = now - cache_data.get("updated", 0)

        # 优先级1: 缓存有效（5分钟内），直接返回
        if cache_data.get("items") and cache_age < CACHE_TTL * 1000:
            body = json.dumps(cache_data, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("X-Cache", "hit")
            self.end_headers()
            self.wfile.write(body)
            return

        # 优先级2: 缓存过期，实时抓取
        print("[API] 缓存过期，实时抓取...")
        try:
            data = fetch_all_platforms()
            if data["items"]:
                save_cache(data)
                body = json.dumps(data, ensure_ascii=False).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("X-Cache", "fresh")
                self.end_headers()
                self.wfile.write(body)
                return
        except Exception as e:
            print(f"[API] 实时抓取失败: {e}")

        # 优先级3: 所有方式失败，返回旧缓存兜底
        if cache_data.get("items"):
            print("[API] 使用旧缓存兜底")
            body = json.dumps(cache_data, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("X-Cache", "fallback")
            self.end_headers()
            self.wfile.write(body)
            return

        # 完全失败
        body = json.dumps({"items": [], "errors": ["数据获取失败"], "updated": now},
                          ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(body)

    def _api_reader(self):
        """正文提取API: /api/reader?url=xxx"""
        query = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(query)
        url = params.get('url', [None])[0]

        if not url:
            body = json.dumps({'error': 'Missing url parameter'}, ensure_ascii=False).encode('utf-8')
            self.send_response(400)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(body)
            return

        try:
            result = extract_article(url)
            body = json.dumps(result, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "max-age=3600")
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            body = json.dumps({'error': str(e)}, ensure_ascii=False).encode('utf-8')
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(body)

    def log_message(self, fmt, *args):
        if "/api/" in str(args):
            print(f"  API 请求已响应")

if __name__ == "__main__":
    import sys, io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

    # 启动时加载缓存
    load_cache()
    print(f"[启动] 缓存状态: {len(cache_data.get('items', []))} 条")

    # 如果缓存为空或数据量太少，先抓取一次
    if len(cache_data.get("items", [])) < 200:
        print("[启动] 数据不足，首次抓取...")
        data = fetch_all_platforms()
        if data["items"]:
            save_cache(data)
            print(f"[启动] 抓取完成: {len(data['items'])} 条")

    # 启动后台刷新线程
    refresh_thread = threading.Thread(target=background_refresh, daemon=True)
    refresh_thread.start()
    print("[后台] 定时刷新线程已启动 (每5分钟)")

    port = int(os.environ.get("PORT", 8000))
    print(f"HotApp 服务启动于端口 {port}")
    http.server.HTTPServer(("0.0.0.0", port), Handler).serve_forever()