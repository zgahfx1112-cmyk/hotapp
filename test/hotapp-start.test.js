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

test('PLATFORMS excludes bilibili sources', () => {
  const platforms = readPythonPlatformList();

  assert.equal(platforms.includes('bilibili'), false);
  assert.equal(platforms.includes('bilibili_pop'), false);
});
