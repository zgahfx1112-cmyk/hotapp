const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

test('hotapp server imports without missing Python modules', () => {
  const result = spawnSync('python', ['-c', 'import runpy; runpy.run_path("hotapp/server.py", run_name="__test__")'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
