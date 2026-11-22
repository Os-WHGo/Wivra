// Android (streaming/android/app/build.gradle) and iOS (streaming/ios/B0/project.yml)
// package app/dist/agentcut.html exactly as committed. CI rebuilds it first, but a
// local Gradle/Xcode build or `tools/wivra-accelerated-offline-check.cjs` does not.
// On 2026-11-22 the committed bundle was 29 source commits behind (W110 safety
// gates missing from any locally packaged app). This test rebuilds into a temp
// file and requires byte equality. Fix: run `node app/build.mjs` and commit. — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

test('committed app/dist/agentcut.html equals a fresh deterministic build', (t) => {
  if (process.env.WIVRA_MEDIABUNNY_BUNDLE) {
    t.skip('QA vendor injection intentionally changes the generated bundle');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'wivra-build-'));
  try {
    const out = join(dir, 'agentcut.html');
    const run = spawnSync(process.execPath, ['app/build.mjs'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, WIVRA_BUILD_OUT: out }
    });
    assert.equal(run.status, 0, run.stderr);
    const fresh = readFileSync(out);
    const committed = readFileSync(join(root, 'app', 'dist', 'agentcut.html'));
    assert.ok(fresh.equals(committed),
      'app/dist/agentcut.html is stale: run `node app/build.mjs` and commit the result ' +
      '(native packaging copies this file without rebuilding).');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('WIVRA_BUILD_OUT does not touch the committed bundle', () => {
  const before = readFileSync(join(root, 'app', 'dist', 'agentcut.html'));
  const dir = mkdtempSync(join(tmpdir(), 'wivra-build-'));
  try {
    const run = spawnSync(process.execPath, ['app/build.mjs'], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, WIVRA_BUILD_OUT: join(dir, 'nested', 'x.html') }
    });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(readFileSync(join(dir, 'nested', 'x.html')).length > 1000);
    assert.ok(readFileSync(join(root, 'app', 'dist', 'agentcut.html')).equals(before));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
