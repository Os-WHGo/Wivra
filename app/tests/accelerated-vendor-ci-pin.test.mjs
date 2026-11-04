import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../../.github/workflows/wivra-browser-media-matrix.yml',import.meta.url),'utf8');

test('browser CI authenticates the pinned Mediabunny archive before deriving bundle SHA-256',()=>{
  assert.match(workflow,/mediabunny-1\.61\.6\.tgz/);
  assert.match(workflow,/expected_sha512='VHEZ53\/7jGl4dQ\+uOdndsZufFYwEUFWv9UXgvrGun3OapyzoqI9iaPOD7z3xxY\/nAttLZBNwswgJzMtGJAquOQ==/);
  assert.match(workflow,/openssl dgst -sha512 -binary/);
  assert.match(workflow,/actual_sha512.*expected_sha512/s);
  assert.match(workflow,/npm install[^\n]*|playwright@1\.56\.1 "\$archive"/s);
  assert.match(workflow,/sha256sum "\$bundle"/);
  assert.match(workflow,/WIVRA_MEDIABUNNY_SHA256=\$bundle_sha256/);
});
