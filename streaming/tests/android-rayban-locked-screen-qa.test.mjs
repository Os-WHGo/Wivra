import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const path = fileURLToPath(new URL('../scripts/rayban-locked-screen-qa.sh',import.meta.url));
const script = readFileSync(path,'utf8');
test('optional Android screen-off QA never copies or deletes user videos',()=>{
  assert.match(script,/set -euo pipefail/);
  assert.match(script,/run-as "\$PACKAGE" ls files\/wivra_pending_videos/);
  assert.match(script,/WivraCaptureForegroundService/);
  assert.match(script,/after <= before/);
  assert.doesNotMatch(script,/\b(?:rm|pull|push|logcat|curl|wget|delete|force-stop|am kill)\b/);
  assert.doesNotMatch(script,/input keyevent/);
});
test('device QA shell syntax is valid', {skip:process.platform==='win32'},()=>{
  const p=spawnSync('bash',['-n',path],{encoding:'utf8'});
  assert.equal(p.status,0,p.stderr);
});
