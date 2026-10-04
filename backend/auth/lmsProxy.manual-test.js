/**
 * Manual Test for LMSProxy
 * Run with: node backend/auth/lmsProxy.manual-test.js
 *
 * This tests:
 * - HTTPS-only enforcement (Requirement 10.3)
 * - Cookie extraction from Set-Cookie headers (Requirement 15.1)
 * - Cookie injection in requests (Requirement 15.2)
 * - SSL certificate verification
 */

const LMSProxy = require('./lmsProxy');

console.log('\n=== LMSProxy Manual Tests ===\n');

// Test 1: HTTPS-only enforcement
console.log('Test 1: HTTPS-only enforcement (Requirement 10.3)');
try {
  new LMSProxy('http://lms.itmnganjuk.ac.id');
  console.log('❌ FAILED: Should have rejected HTTP URL');
} catch (err) {
  console.log('✓ PASSED: HTTP URL correctly rejected');
  console.log(`  Error: ${err.message}\n`);
}

// Test 2: HTTPS URL accepted
console.log('Test 2: HTTPS URL accepted');
try {
  const proxy = new LMSProxy('https://lms.itmnganjuk.ac.id');
  console.log('✓ PASSED: HTTPS URL accepted');
  console.log(`  Base URL: ${proxy.getBaseUrl()}\n`);
  proxy.destroy();
} catch (err) {
  console.log(`❌ FAILED: ${err.message}\n`);
}

// Test 3: Cookie extraction from Set-Cookie headers (Requirement 15.1)
console.log('Test 3: Cookie extraction from Set-Cookie headers (Requirement 15.1)');
const proxy = new LMSProxy('https://lms.itmnganjuk.ac.id');

const testSetCookies = [
  'PHPSESSID=abc123def456; Path=/; HttpOnly; Secure',
  'MOODLEID_=ghi789jkl012; Path=/; Domain=.lms.itmnganjuk.ac.id',
  'sessionToken=mno345pqr678; Path=/; Max-Age=7200',
];

const extractedCookies = proxy._parseCookies(testSetCookies);
console.log(`  Extracted ${extractedCookies.size} cookies from Set-Cookie headers`);

let testPassed = true;
for (const [name, value] of extractedCookies) {
  console.log(`  - ${name} = ${value}`);
  if (!name || !value) {
    testPassed = false;
  }
}

if (testPassed && extractedCookies.size === 3) {
  console.log('✓ PASSED: All cookies extracted correctly\n');
} else {
  console.log('❌ FAILED: Cookie extraction incomplete\n');
}

// Test 4: Cookie injection in requests (Requirement 15.2)
console.log('Test 4: Cookie injection in requests (Requirement 15.2)');

const cookieMap = new Map([
  ['PHPSESSID', 'abc123def456'],
  ['MOODLEID_', 'ghi789jkl012'],
  ['sessionToken', 'mno345pqr678'],
]);

const cookieHeader = proxy._buildCookieHeader(cookieMap);
console.log(`  Generated Cookie header:\n  ${cookieHeader}`);

if (cookieHeader.includes('PHPSESSID=abc123def456') &&
    cookieHeader.includes('MOODLEID_=ghi789jkl012') &&
    cookieHeader.includes('sessionToken=mno345pqr678') &&
    cookieHeader.includes('; ')) {
  console.log('✓ PASSED: Cookie header built correctly\n');
} else {
  console.log('❌ FAILED: Cookie header incorrect\n');
}

// Test 5: HTTPS Agent with SSL verification (Requirement 10.3)
console.log('Test 5: HTTPS Agent with SSL verification (Requirement 10.3)');
if (proxy.httpsAgent && proxy.httpsAgent.options.rejectUnauthorized === true) {
  console.log('✓ PASSED: HTTPS agent configured with SSL verification enabled');
  console.log(`  Agent options: ${JSON.stringify(proxy.httpsAgent.options, null, 2)}\n`);
} else {
  console.log('❌ FAILED: HTTPS agent not properly configured\n');
}

// Test 6: Empty/null cookie handling
console.log('Test 6: Empty/null cookie handling');
const emptyCookies = proxy._parseCookies(null);
const emptyHeader = proxy._buildCookieHeader(new Map());

if (emptyCookies.size === 0 && emptyHeader === '') {
  console.log('✓ PASSED: Empty/null cookies handled gracefully\n');
} else {
  console.log('❌ FAILED: Empty/null cookie handling incorrect\n');
}

// Test 7: Malformed cookie handling
console.log('Test 7: Malformed cookie handling');
const malformedCookies = proxy._parseCookies([
  'PHPSESSID=valid123',
  'invalid_no_equals',
  'MOODLEID_=def456',
  'another_invalid',
]);

if (malformedCookies.size === 2 &&
    malformedCookies.get('PHPSESSID') === 'valid123' &&
    malformedCookies.get('MOODLEID_') === 'def456') {
  console.log('✓ PASSED: Malformed cookies skipped, valid ones extracted');
  console.log(`  Extracted: ${malformedCookies.size} valid cookies from 4 entries\n`);
} else {
  console.log('❌ FAILED: Malformed cookie handling incorrect\n');
}

// Test 8: URL normalization
console.log('Test 8: URL normalization (trailing slash removal)');
const proxy2 = new LMSProxy('https://lms.itmnganjuk.ac.id/');
if (proxy2.getBaseUrl() === 'https://lms.itmnganjuk.ac.id') {
  console.log('✓ PASSED: Trailing slash removed correctly');
  console.log(`  Normalized: ${proxy2.getBaseUrl()}\n`);
  proxy2.destroy();
} else {
  console.log('❌ FAILED: URL normalization incorrect\n');
}

// Test 9: Invalid URL handling
console.log('Test 9: Invalid URL handling');
try {
  new LMSProxy('not-a-valid-url');
  console.log('❌ FAILED: Should have rejected invalid URL\n');
} catch (err) {
  console.log('✓ PASSED: Invalid URL correctly rejected');
  console.log(`  Error: ${err.message}\n`);
}

// Test 10: Single Set-Cookie header parsing
console.log('Test 10: Single Set-Cookie header parsing (string format)');
const singleCookie = proxy._parseCookies('PHPSESSID=single123; Path=/; HttpOnly');
if (singleCookie.size === 1 && singleCookie.get('PHPSESSID') === 'single123') {
  console.log('✓ PASSED: Single Set-Cookie header parsed correctly\n');
} else {
  console.log('❌ FAILED: Single Set-Cookie header parsing failed\n');
}

// Cleanup
proxy.destroy();

console.log('=== Manual Tests Complete ===\n');
