const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

function readPythonPlatformList() {
  const result = spawnSync('python', ['-c', 'import json, runpy; ns = runpy.run_path("hotapp/server.py", run_name="__test__"); print(json.dumps(sorted(ns["PLATFORMS"].keys()), ensure_ascii=False))'], {
    cwd: path.join(__dirname, ".."),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

test('hotapp server imports without missing Python modules', () => {
  const result = spawnSync('python', ['-c', 'import runpy; runpy.run_path("hotapp/server.py", run_name="__test__")'], {
    cwd: path.join(__dirname, ".."),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('fetch_all_platforms removes duplicate news across platforms by title', () => {
  const script = String.raw`
import json, runpy
ns = runpy.run_path("hotapp/server.py", run_name="__test__")
ns["fetch_all_platforms"].__globals__["PLATFORMS"] = {
    "weibo": {"name": "weibo"},
    "baidu": {"name": "baidu"},
    "toutiao": {"name": "toutiao"},
}

def fake_fetch_one(key, cfg):
    data = {
        "weibo": [{"id": "weibo_1", "title": "same news", "url": "https://weibo.example/1", "platform": "weibo", "rank": 1, "heatScore": 100}],
        "baidu": [{"id": "baidu_1", "title": "same news", "url": "https://baidu.example/1", "platform": "baidu", "rank": 1, "heatScore": 90}],
        "toutiao": [{"id": "toutiao_1", "title": "other news", "url": "https://toutiao.example/1", "platform": "toutiao", "rank": 1, "heatScore": 80}],
    }
    return data[key]

ns["fetch_all_platforms"].__globals__["fetch_one"] = fake_fetch_one
items = ns["fetch_all_platforms"]()["items"]
print(json.dumps(items, ensure_ascii=False))
`;
  const result = spawnSync('python', ['-c', script], {
    cwd: path.join(__dirname, ".."),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const items = JSON.parse(result.stdout.trim().split('\n').at(-1));

  assert.equal(items.filter(item => item.title === 'same news').length, 1);
  assert.equal(items.some(item => item.title === 'other news'), true);
});
