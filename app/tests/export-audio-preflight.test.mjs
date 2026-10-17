import test from 'node:test';
import assert from 'node:assert/strict';
import { preflightExportMedia } from '../export.mjs';

test('missing active audio file must stop export', () => {
  const project = { clips: [], audioClips: [{ asset_id: 'voice', muted: false, gain: 1 }] };
  assert.throws(() => preflightExportMedia(project, {}), /audio original/);
});
