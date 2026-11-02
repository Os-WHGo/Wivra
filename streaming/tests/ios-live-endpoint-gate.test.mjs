import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const gate = readFileSync(new URL('../ios/B0/Sources/WivraIOSLiveEndpoint.swift', import.meta.url), 'utf8');
const smoke = readFileSync(new URL('./WivraIOSLiveEndpointSmoke.swift', import.meta.url), 'utf8');
test('iOS LIVE endpoint requires a single explicit RTMP(S) URL with app and key, rejects URI secrets', () => {
  for (const clause of ['scheme == "rtmp" || scheme == "rtmps"', 'parts.user == nil, parts.password == nil',
   'parts.query == nil, parts.fragment == nil', 'path.count >= 3', 'CharacterSet.controlCharacters',
   'parts.percentEncodedPath = "/" + app']) assert.ok(gate.includes(clause), clause);
  assert.doesNotMatch(gate, /UserDefaults|print\(|NSLog|URLSession|Keychain|setValue/);
  for (const sample of ['rtmps://example.test/live/secret','rtmp://example.test:1935/app/name/key',
    'https://example.test/live/key', 'rtmps://username:password@example.test/live/key']) {
    assert.ok(smoke.includes(sample));
  }
});
