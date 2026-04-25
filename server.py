"""HotApp 服务端 - 前端 + API 代理一体化，同端口无 CORS"""
import http.server
import urllib.request
import urllib.parse
import json
import gzip
import ssl
import re
import time
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

ssl._create_default_https_context = ssl._create_unverified_context
HERE = os.path.dirname(os.path.abspath(__file__))

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

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
        try: data = json.loads(text)
        except: data = text
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
        all_items, errors = [], []
        with ThreadPoolExecutor(max_workers=5) as pool:
            futures = {pool.submit(fetch_one, k, c): c["name"] for k, c in PLATFORMS.items()}
            for f in as_completed(futures):
                name = futures[f]
                try:
                    items = f.result()
                    if items: all_items.extend(items)
                    else: errors.append(name)
                except: errors.append(name)

        # 轮询交错排序：每个平台按排名顺序出一个人选，保证各平台均匀分布在榜单中
        from collections import defaultdict
        groups = defaultdict(list)
        for item in all_items:
            groups[item["platform"]].append(item)
        for items in groups.values():
            items.sort(key=lambda x: x["rank"])

        # 先取各平台第一名组成第一轮，再取各平台第二名组成第二轮，以此类推
        platforms = sorted(groups.keys())
        max_len = max((len(v) for v in groups.values()), default=0)
        result = []
        for i in range(max_len):
            for plat in platforms:
                if i < len(groups[plat]):
                    result.append(groups[plat][i])

        for i, item in enumerate(result):
            item["globalRank"] = i + 1

        body = json.dumps({"items": result, "errors": errors,
                           "updated": int(time.time()*1000)}, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        if "/api/" in str(args):
            print(f"  API 请求已响应")

if __name__ == "__main__":
    import sys, io, os
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    port = int(os.environ.get("PORT", 8000))
    print(f"HotApp 服务启动于端口 {port}")
    http.server.HTTPServer(("0.0.0.0", port), Handler).serve_forever()
