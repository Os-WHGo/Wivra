import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyPinnedAcceleratedVendor as verify} from '../accelerated-vendor-integrity.mjs';

const source='/* Mediabunny 1.61.6 offline bundle */\n'+'x'.repeat(12000);
const digest=()=>createHash('sha256').update(source,'utf8').digest('hex');

test('accepts only the exact SHA-256 pinned offline QA bundle',()=>{
 const result=verify({source,expectedSha256:digest()});
 assert.equal(result.sha256,digest());
 assert.equal(result.bytes,Buffer.byteLength(source,'utf8'));
});
test('rejects missing, malformed and mismatched trusted digests',()=>{
 for(const expectedSha256 of [undefined,'','sha256-'+digest(),'0'.repeat(64)])
  assert.throws(()=>verify({source,expectedSha256}),/SHA-256|WIVRA_MEDIABUNNY/);
});
test('rejects empty, short or non-text vendor content',()=>{
 for(const value of ['',null,Buffer.from('Mediabunny')])
  assert.throws(()=>verify({source:value,expectedSha256:digest()}),/bundle/);
});
