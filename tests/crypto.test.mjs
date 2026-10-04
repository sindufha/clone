import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { config } from '../server/config.ts';
import { encrypt, decrypt, equalSecret, workerSignature } from '../server/crypto.ts';
config.encryptionKey = randomBytes(32).toString('base64');
test('credentials use authenticated encryption bound to the owner; tampering and another key fail', () => {
  const secret = { password: 'test-only-secret' }; const cipher = encrypt(secret, 'owner');
  assert.deepEqual(decrypt(cipher, 'owner'), secret); assert.equal(cipher.includes(secret.password), false);
  assert.notEqual(encrypt(secret, 'owner'), cipher);
  assert.throws(() => decrypt(cipher, 'another-owner'));
  const pieces = cipher.split('.');
  const tampered = Buffer.from(pieces[3], 'base64url'); tampered[0] ^= 1;
  pieces[3] = tampered.toString('base64url'); assert.throws(() => decrypt(pieces.join('.'), 'owner'));
  const original = config.encryptionKey; config.encryptionKey = randomBytes(32).toString('base64');
  assert.throws(() => decrypt(cipher, 'owner')); config.encryptionKey = original;
});
test('worker signatures reject altered requests and comparison handles mismatched lengths', () => {
  assert.equal(equalSecret(workerSignature('one'), workerSignature('two')), false);
  assert.equal(equalSecret(workerSignature('one'), workerSignature('one')), true);
  assert.equal(equalSecret('abc', 'a'), false);
});
