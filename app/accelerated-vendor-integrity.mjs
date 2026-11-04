import {createHash} from 'node:crypto';

const SHA256_HEX=/^[a-f0-9]{64}$/i;

/**
 * Verify the exact offline Mediabunny bundle before embedding it in the
 * optional QA editor. The digest must come from a trusted release variable,
 * not be calculated and accepted from the same untrusted artifact.
 */
export function verifyPinnedAcceleratedVendor({source,expectedSha256}={}) {
  if(typeof source!=='string'||source.length<10000)
    throw new Error('Acelerador: bundle local Mediabunny vacío o inválido.');
  if(typeof expectedSha256!=='string'||!SHA256_HEX.test(expectedSha256))
    throw new Error('Acelerador: falta WIVRA_MEDIABUNNY_SHA256 válido; no se incorpora el bundle.');
  const actual=createHash('sha256').update(source,'utf8').digest('hex');
  if(actual!==expectedSha256.toLowerCase())
    throw new Error('Acelerador: SHA-256 del bundle Mediabunny no coincide con el pin confiable.');
  return {sha256:actual,bytes:Buffer.byteLength(source,'utf8')};
}
