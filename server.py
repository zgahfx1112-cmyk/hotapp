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
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict

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
             "heatScore": x.get("num") or x.get("raw_hot") or (9000-i*200)} for i,x in enumerate(items[:50])]

def parse_bilibili(data):
    items = (data.get("data", {}) or {}).get("trending", {}) or {}
    items = items.get("list") or []
    return [{"id": f"bilibili_{i}", "title": x.get("show_name") or x.get("keyword",""),
             "url": f"https://search.bilibili.com/all?keyword={urllib.parse.quote(x.get('keyword') or x.get('show_name',''))}",
             "platform": "bilibili", "rank": i+1,
             "heatScore": x.get("heat_score") or (8000-i*300)} for i,x in enumerate(items[:50])]

def parse_douyin(data):
    items = (data.get("data", {}) or {}).get("trending_list") or []
    result = []
    for i, x in enumerate(items[:50]):
        cover = x.get("word_cover") or {}
        urls = cover.get("url_list") or []
        img = urls[0] if urls else None
        result.append({"id": f"douyin_{x.get('group_id',i)}", "title": x.get("word",""),
                 "url": f"https://www.douyin.com/search/{urllib.parse.quote(x.get('word',''))}",
                 "platform": "douyin", "rank": i+1,
                 "heatScore": x.get("hot_value") or (9500-i*150),
                 "event_time": x.get("event_time", 0),
                 "image": img})
    return result

def parse_baidu(raw):
    if isinstance(raw, dict):
        return []
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
                 "heatScore": int(x.get("hotScore", 0) or (8500-i*180))} for i,x in enumerate(content[:50])]
    except Exception:
        return []

def parse_toutiao(data):
    items = data.get("data") or []
    result = []
    for i, x in enumerate(items[:50]):
        img = (x.get("Image") or {}).get("url") or None
        result.append({"id": f"toutiao_{x.get('ClusterId', i)}", "title": x.get("Title") or x.get("QueryWord", ""),
                 "url": x.get("Url") or f"https://so.toutiao.com/search?keyword={urllib.parse.quote(x.get('QueryWord',''))}",
                 "platform": "toutiao", "rank": i+1,
                 "heatScore": int(x.get("HotValue", 0) or (9000-i*200)),
                 "image": img})
    return result

def parse_douban_movie(data):
    items = data.get("subjects") or []
    if not items:
        return []  # 豆瓣可能返回空数据
    return [{"id": f"douban_movie_{i}", "title": x.get("title", ""),
             "url": x.get("url") or f"https://movie.douban.com/subject/{x.get('id','')}",
             "platform": "douban", "rank": i+1,
             "heatScore": int(float(x.get("rate", 0) or 0) * 1000) or (7000-i*100)} for i,x in enumerate(items[:30])]

def parse_douban_tv(data):
    items = data.get("subjects") or []
    if not items:
        return []
    return [{"id": f"douban_tv_{i}", "title": x.get("title", ""),
             "url": x.get("url") or f"https://movie.douban.com/subject/{x.get('id','')}",
             "platform": "douban", "rank": i+1,
             "heatScore": int(float(x.get("rate", 0) or 0) * 1000) or (6500-i*100)} for i,x in enumerate(items[:30])]

def parse_36kr(data):
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except:
            return []
    items = (data.get("data", {}) or {}).get("items") or []
    return [{"id": f"36kr_{i}", "title": x.get("title", ""),
             "url": f"https://36kr.com/newsflashes/{x.get('id','')}",
             "platform": "36kr", "rank": i+1,
             "heatScore": 6000-i*50} for i,x in enumerate(items[:30])]

PLATFORMS = {
    "weibo": {"name": "微博",
        "url": "https://weibo.com/ajax/side/hotSearch",
        "hdrs": {"User-Agent": UA, "Referer": "https://weibo.com/", "X-Requested-With": "XMLHttpRequest"},
        "parse": parse_weibo},
    "bilibili": {"name": "B站",
        "url": "https://api.bilibili.com/x/web-interface/wbi/search/square?limit=50",
        "hdrs": {"User-Agent": UA, "Referer": "https://www.bilibili.com/"},
        "parse": parse_bilibili},
    "douyin": {"name": "抖音",
        "url": "https://www.douyin.com/aweme/v1/web/hot/search/list/?detail_list=1&count=50",
        "hdrs": {"User-Agent": UA, "Referer": "https://www.douyin.com/"},
        "parse": parse_douyin},
    "baidu": {"name": "百度",
        "url": "https://top.baidu.com/board?tab=realtime",
        "hdrs": {"User-Agent": UA},
        "parse": parse_baidu},
    "toutiao": {"name": "头条",
        "url": "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc",
        "hdrs": {"User-Agent": UA, "Referer": "https://www.toutiao.com/"},
        "parse": parse_toutiao},
    "douban_movie": {"name": "豆瓣电影",
        "url": "https://movie.douban.com/j/search_subjects?type=movie&tag=%E7%83%AD%E9%97%A8&page_limit=30&page_start=0",
        "hdrs": {"User-Agent": UA, "Referer": "https://movie.douban.com/"},
        "parse": parse_douban_movie},
    "douban_tv": {"name": "豆瓣剧集",
        "url": "https://movie.douban.com/j/search_subjects?type=tv&tag=%E7%83%AD%E9%97%A8&page_limit=30&page_start=0",
        "hdrs": {"User-Agent": UA, "Referer": "https://movie.douban.com/"},
        "parse": parse_douban_tv},
}

def fetch_one(key, cfg):
    try:
        req = urllib.request.Request(cfg["url"], headers=cfg["hdrs"])
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip":
            try: body = gzip.decompress(body)
            except: pass
        text = body.decode("utf-8", errors="replace")

        # 尝试解析 JSON，如果失败则返回原始文本（供 HTML 解析器使用）
        try:
            data = json.loads(text)
        except:
            # 检测是否是验证码或反爬 HTML 页面（没有我们需要的数据）
            if "captcha" in text.lower() or "验证" in text.lower() or len(text) < 500:
                print(f"  [{cfg['name']}] 返回验证页面")
                return []
            data = text  # 返回原始 HTML，由 parse 函数处理

        items = cfg["parse"](data)
        now = int(time.time() * 1000)
        for item in items:
            if item.get("event_time"):
                item["timestamp"] = item.pop("event_time") * 1000
            else:
                item["timestamp"] = now
        return items
    except Exception as e:
        print(f"  [{cfg['name']}] 失败: {e}")
        return []

def fetch_all_platforms():
    """抓取所有平台数据"""
    all_items, errors = [], []
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(fetch_one, k, c): c["name"] for k, c in PLATFORMS.items()}
        for f in as_completed(futures):
            name = futures[f]
            try:
                items = f.result()
                if items:
                    all_items.extend(items)
                    print(f"  [{name}] 成功: {len(items)} 条")
                else:
                    errors.append(name)
            except Exception as e:
                errors.append(name)
                print(f"  [{name}] 异常: {e}")

    # 轮询交错排序
    groups = defaultdict(list)
    for item in all_items:
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
    # 调试打印
    plat_counts = {}
    for i in data.get('items', []):
        p = i.get('platform', 'unknown')
        plat_counts[p] = plat_counts.get(p, 0) + 1
    print(f"  缓存已保存: {len(data.get('items', []))} 条, 平台: {plat_counts}")
    try:
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
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
        elif self.path == "/":
            self.path = "/index.html"
            super().do_GET()
        else:
            super().do_GET()

    def _api_trending(self):
        """三重优先级返回数据"""
        now = int(time.time() * 1000)
        cache_age = now - cache_data.get("updated", 0)

        # 调试：打印当前缓存状态
        plat_counts = {}
        for i in cache_data.get('items', []):
            p = i.get('platform', 'unknown')
            plat_counts[p] = plat_counts.get(p, 0) + 1
        print(f"[API] cache_data状态: {len(cache_data.get('items', []))}条, 平台: {plat_counts}, age: {cache_age}ms")

        # 优先级1: 缓存有效（5分钟内），直接返回
        if cache_data.get("items") and cache_age < CACHE_TTL * 1000:
            print("[API] 使用缓存命中")
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