import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ACCELERATED_EXPORT_IMPLEMENTED,selectExportEngine} from '../export-engine-policy.mjs';

const build = readFileSync(new URL('../build.mjs',import.meta.url),'utf8');
const renderer = readFileSync(new URL('../accelerated-cut-renderer.mjs',import.meta.url),'utf8');
const sink = readFileSync(new URL('../accelerated-native-sink.mjs',import.meta.url),'utf8');

test('offline editor build includes shared fast modules but does not enable unfinished exporter',()=>{
  assert.match(build, /'\.\/accelerated-cut-renderer\.mjs'/);
  assert.match(build, /'\.\/accelerated-native-sink\.mjs'/);
  assert.match(build, /'\.\/accelerated-memory-export\.mjs'/);
  assert.equal(ACCELERATED_EXPORT_IMPLEMENTED,false);
  assert.equal(selectExportEngine({requested:'auto',webCodecs:true,mediabunny:true,
    fullTimelineRenderer:true,nativeRandomAccess:true,verifiedOnDevice:true}).engine,'mediarecorder');
  assert.equal(selectExportEngine({requested:'webcodecs'}).engine,'mediarecorder');
  assert.match(renderer,/Mediabunny unavailable in this offline build/);
  assert.match(sink,/caps\?\.randomWrite !== true/);
  for (const file of [renderer,sink]) {
    assert.doesNotMatch(file,/https?:\/\/(?:cdn|unpkg|jsdelivr)/i);
    assert.doesNotMatch(file,/\bfetch\(\s*['"]https?:/);
    assert.doesNotMatch(file,/UserDefaults|Keychain|localStorage|navigator\.sendBeacon/);
  }
});
