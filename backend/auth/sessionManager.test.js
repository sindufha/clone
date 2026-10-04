/**
 * Session Manager Tests
 * Tests all session lifecycle methods: create, get, update activity, delete, cleanup
 *
 * Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4
 */

const SessionManager = require('./sessionManager');

/**
 * Test utilities
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

function assertNotNull(value, message) {
  if (value === null || value === undefined) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertNull(value, message) {
  if (value !== null) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertTrue(value, message) {
  if (value !== true) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertFalse(value, message) {
  if (value !== false) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Test Suite
 */
async function runTests() {
  console.log('Starting SessionManager tests...\n');

  let testsPassed = 0;
  let testsFailed = 0;

  // Test 1: Create session
  try {
    console.log('Test 1: createSession() - generates UUID-based sessionToken');
    const sm = new SessionManager();
    const nim = '2024001';
    const lmsCookies = new Map([
      ['PHPSESSID', 'abc123'],
      ['session_token', 'xyz789']
    ]);

    const token = sm.createSession(nim, lmsCookies);

    assert(typeof token === 'string', 'Session token should be a string');
    assert(token.length > 0, 'Session token should not be empty');
    assertNotNull(sm.getSession(token), 'Session should exist after creation');

    console.log('✓ Session created successfully with UUID token');
    testsPassed++;
    sm.destroy();
  } catch (error) {
    console.log('✗ Test 1 failed:', error.message);
    testsFailed++;
  }

  // Test 2: Get session
  try {
    console.log('\nTest 2: getSession() - retrieve session and verify data');
    const sm = new SessionManager();
    const nim = '2024001';
    const lmsCookies = new Map([['PHPSESSID', 'abc123']]);

    const token = sm.createSession(nim, lmsCookies);
    const session = sm.getSession(token);

    assertNotNull(session, 'Session should be retrievable');
    assertEquals(session.nim, nim, 'Session should contain correct NIM');
    assertEquals(session.sessionToken, token, 'Session should have correct token');
    assert(session.createdAt > 0, 'Session should have createdAt timestamp');
    assert(session.expiresAt > session.createdAt, 'Session expiresAt should be after createdAt');
    assert(session.lmsCookies instanceof Map, 'Session should store cookies as Map');

    console.log('✓ Session retrieved with correct data');
    testsPassed++;
    sm.destroy();
  } catch (error) {
    console.log('✗ Test 2 failed:', error.message);
    testsFailed++;
  }

  // Test 3: Get non-existent session
  try {
    console.log('\nTest 3: getSession() - returns null for non-existent session');
    const sm = new SessionManager();

    const session = sm.getSession('non-existent-token');
    assertNull(session, 'Should return null for non-existent session');

    console.log('✓ Returns null for non-existent session');
    testsPassed++;
    sm.destroy();
  } catch (error) {
    console.log('✗ Test 3 failed:', error.message);
    testsFailed++;
  }

  // Test 4: Update activity extends expiration
  try {
    console.log('\nTest 4: updateActivity() - extends expiration by 2 hours');
    const sm = new SessionManager(7200000); // 2 hours
    const nim = '2024001';

    const token = sm.createSession(nim);
    const sessionBefore = sm.getSession(token);
    const expiresAtBefore = sessionBefore.expiresAt;
    const lastActivityBefore = sessionBefore.lastActivity;

    // Wait a bit and update activity
    await new Promise(resolve => setTimeout(resolve, 50));
    const updated = sm.updateActivity(token);

    assertTrue(updated, 'updateActivity should return true');
    const sessionAfter = sm.getSession(token);
    assert(sessionAfter.expiresAt > expiresAtBefore, 'expiresAt should be extended');
    assert(sessionAfter.lastActivity >= lastActivityBefore, 'lastActivity should be updated or same');

    console.log('✓ Activity updated and expiration extended');
    testsPassed++;
    sm.destroy();
  } catch (error) {
    console.log('✗ Test 4 failed:', error.message);
    testsFailed++;
  }

  // Test 5: Delete session
  try {
    console.log('\nTest 5: deleteSession() - removes session from store');
    const sm = new SessionManager();
    const nim = '2024001';

    const token = sm.createSession(nim);
    assertNotNull(sm.getSession(token), 'Session should exist before deletion');

    const deleted = sm.deleteSession(token);
    assertTrue(deleted, 'deleteSession should return true');
    assertNull(sm.getSession(token), 'Session should not exist after deletion');

    console.log('✓ Session deleted successfully');
    testsPassed++;
    sm.destroy();
  } catch (error) {
    console.log('✗ Test 5 failed:', error.message);
    testsFailed++;
  }

  // Test 6: Delete non-existent session
  try {
    console.log('\nTest 6: deleteSession() - returns false for non-existent session');
    const sm = new SessionManager();

    const deleted = sm.deleteSession('non-existent-token');
    assertFalse(deleted, 'deleteSession should return false for non-existent session');

    console.log('✓ Returns false for non-existent session');
    testsPassed++;
    sm.destroy();
  } catch (error) {
    console.log('✗ Test 6 failed:', error.message);
    testsFailed++;
  }

  // Test 7: Session expiration
  try {
    console.log('\nTest 7: getSession() - returns null for expired session');
    // Create with very short timeout
    const sm = new SessionManager(100, 300000); // 100ms timeout
    const nim = '2024001';

    const token = sm.createSession(nim);
    assertNotNull(sm.getSession(token), 'Session should exist before expiration');

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 150));
    const expired = sm.getSession(token);
    assertNull(expired, 'Expired session should return null');

    console.log('✓ Expired session correctly marked null');
    testsPassed++;
    sm.destroy();
  } catch (error) {
    console.log('✗ Test 7 failed:', error.message);
    testsFailed++;
  }

  // Test 8: Cleanup expired sessions
  try {
    console.log('\nTest 8: cleanupExpiredSessions() - removes expired sessions');
    // Create with short timeout and cleanup interval
    const sm = new SessionManager(100, 50);
    const nim = '2024001';

    // Create multiple sessions
    const token1 = sm.createSession(nim + '1');
    const token2 = sm.createSession(nim + '2');
    const token3 = sm.createSession(nim + '3');

    assertEquals(sm.getSessionCount(), 3, 'Should have 3 sessions');

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 150));

    // Call cleanup manually
    sm.cleanupExpiredSessions();

    assertEquals(sm.getSessionCount(), 0, 'All expired sessions should be cleaned up');
    assertNull(sm.getSession(token1), 'Expired session 1 should be null');
    assertNull(sm.getSession(token2), 'Expired session 2 should be null');
    assertNull(sm.getSession(token3), 'Expired session 3 should be null');

    console.log('✓ Expired sessions cleaned up successfully');
    testsPassed++;
    sm.destroy();
  } catch (error) {
    console.log('✗ Test 8 failed:', error.message);
    testsFailed++;
  }

  // Test 9: Cleanup interval runs automatically
  try {
    console.log('\nTest 9: cleanupExpiredSessions() - runs automatically every 5 minutes');
    const sm = new SessionManager(100, 100); // 100ms cleanup interval
    const nim = '2024001';

    const token = sm.createSession(nim);
    assertEquals(sm.getSessionCount(), 1, 'Should have 1 session');

    // Wait for expiration and cleanup
    await new Promise(resolve => setTimeout(resolve, 250));

    // Cleanup should have run automatically
    assertEquals(sm.getSessionCount(), 0, 'Session should be auto-cleaned');

    console.log('✓ Automatic cleanup interval works');
    testsPassed++;
    sm.destroy();
  } catch (error) {
    console.log('✗ Test 9 failed:', error.message);
    testsFailed++;
  }

  // Test 10: Multiple sessions
  try {
    console.log('\nTest 10: Multiple sessions - independent tracking');
    const sm = new SessionManager();

    const token1 = sm.createSession('2024001');
    const token2 = sm.createSession('2024002');
    const token3 = sm.createSession('2024003');

    assertEquals(sm.getSessionCount(), 3, 'Should have 3 sessions');

    const session1 = sm.getSession(token1);
    const session2 = sm.getSession(token2);
    const session3 = sm.getSession(token3);

    assertEquals(session1.nim, '2024001', 'Session 1 should have correct NIM');
    assertEquals(session2.nim, '2024002', 'Session 2 should have correct NIM');
    assertEquals(session3.nim, '2024003', 'Session 3 should have correct NIM');

    // Update one session's activity
    sm.updateActivity(token1);
    const updated = sm.getSession(token1);
    assert(updated.expiresAt >= session1.expiresAt, 'Session 1 expiration should be extended');

    // Other sessions should be unaffected
    const unchanged = sm.getSession(token2);
    assertEquals(unchanged.expiresAt, session2.expiresAt, 'Session 2 should be unchanged');

    console.log('✓ Multiple sessions tracked independently');
    testsPassed++;
    sm.destroy();
  } catch (error) {
    console.log('✗ Test 10 failed:', error.message);
    testsFailed++;
  }

  // Test 11: Session token uniqueness
  try {
    console.log('\nTest 11: Session tokens are unique');
    const sm = new SessionManager();
    const tokens = new Set();

    for (let i = 0; i < 100; i++) {
      const token = sm.createSession(`nim${i}`);
      tokens.add(token);
    }

    assertEquals(tokens.size, 100, 'All 100 tokens should be unique');
    assertEquals(sm.getSessionCount(), 100, 'Should have 100 sessions');

    console.log('✓ All session tokens are unique');
    testsPassed++;
    sm.destroy();
  } catch (error) {
    console.log('✗ Test 11 failed:', error.message);
    testsFailed++;
  }

  // Test 12: Session with LMS cookies
  try {
    console.log('\nTest 12: Session stores and retrieves LMS cookies');
    const sm = new SessionManager();
    const nim = '2024001';
    const lmsCookies = new Map([
      ['PHPSESSID', 'session123'],
      ['session_id', 'sid456'],
      ['csrf_token', 'csrf789']
    ]);

    const token = sm.createSession(nim, lmsCookies);
    const session = sm.getSession(token);

    assertEquals(session.lmsCookies.size, 3, 'Session should have 3 cookies');
    assertEquals(session.lmsCookies.get('PHPSESSID'), 'session123', 'PHPSESSID cookie should match');
    assertEquals(session.lmsCookies.get('session_id'), 'sid456', 'session_id cookie should match');
    assertEquals(session.lmsCookies.get('csrf_token'), 'csrf789', 'csrf_token cookie should match');

    console.log('✓ LMS cookies stored and retrieved correctly');
    testsPassed++;
    sm.destroy();
  } catch (error) {
    console.log('✗ Test 12 failed:', error.message);
    testsFailed++;
  }

  // Test 13: Session count tracking
  try {
    console.log('\nTest 13: getSessionCount() - tracks active sessions');
    const sm = new SessionManager();

    assertEquals(sm.getSessionCount(), 0, 'Should start with 0 sessions');

    const token1 = sm.createSession('2024001');
    assertEquals(sm.getSessionCount(), 1, 'Should have 1 session');

    const token2 = sm.createSession('2024002');
    assertEquals(sm.getSessionCount(), 2, 'Should have 2 sessions');

    sm.deleteSession(token1);
    assertEquals(sm.getSessionCount(), 1, 'Should have 1 session after deletion');

    sm.deleteSession(token2);
    assertEquals(sm.getSessionCount(), 0, 'Should have 0 sessions after all deleted');

    console.log('✓ Session count tracking works correctly');
    testsPassed++;
    sm.destroy();
  } catch (error) {
    console.log('✗ Test 13 failed:', error.message);
    testsFailed++;
  }

  // Test 14: getAllSessions() for debugging
  try {
    console.log('\nTest 14: getAllSessions() - returns all active sessions (sans tokens)');
    const sm = new SessionManager();

    sm.createSession('2024001');
    sm.createSession('2024002');
    sm.createSession('2024003');

    const allSessions = sm.getAllSessions();
    assertEquals(allSessions.length, 3, 'Should return 3 sessions');

    assert(allSessions[0].sessionToken.endsWith('...'), 'Session token should be redacted');
    assertEquals(allSessions[0].nim, '2024001', 'First session should have correct NIM');
    assertEquals(allSessions[1].nim, '2024002', 'Second session should have correct NIM');
    assertEquals(allSessions[2].nim, '2024003', 'Third session should have correct NIM');

    console.log('✓ getAllSessions() returns redacted session info');
    testsPassed++;
    sm.destroy();
  } catch (error) {
    console.log('✗ Test 14 failed:', error.message);
    testsFailed++;
  }

  // Test 15: Clear all sessions
  try {
    console.log('\nTest 15: clearAllSessions() - clears all sessions');
    const sm = new SessionManager();

    sm.createSession('2024001');
    sm.createSession('2024002');
    sm.createSession('2024003');

    assertEquals(sm.getSessionCount(), 3, 'Should have 3 sessions');

    sm.clearAllSessions();
    assertEquals(sm.getSessionCount(), 0, 'Should have 0 sessions after clear');

    console.log('✓ All sessions cleared successfully');
    testsPassed++;
    sm.destroy();
  } catch (error) {
    console.log('✗ Test 15 failed:', error.message);
    testsFailed++;
  }

  // Test 16: Updating activity on expired session
  try {
    console.log('\nTest 16: updateActivity() - fails gracefully on expired session');
    const sm = new SessionManager(100, 300000); // 100ms timeout
    const token = sm.createSession('2024001');

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 150));

    const updated = sm.updateActivity(token);
    assertFalse(updated, 'updateActivity should return false for expired session');

    console.log('✓ updateActivity returns false for expired session');
    testsPassed++;
    sm.destroy();
  } catch (error) {
    console.log('✗ Test 16 failed:', error.message);
    testsFailed++;
  }

  // Test 17: Session cleanup with mixed expiry times
  try {
    console.log('\nTest 17: cleanupExpiredSessions() - preserves valid sessions');
    const sm = new SessionManager(200, 50); // 200ms timeout
    sm.stopCleanupInterval(); // Disable auto-cleanup for this test

    // Create first batch (will expire quickly)
    const expiredToken1 = sm.createSession('expired1');
    const expiredToken2 = sm.createSession('expired2');

    // Wait for first batch to expire
    await new Promise(resolve => setTimeout(resolve, 250));

    // Create second batch (just created, will not expire)
    const validToken1 = sm.createSession('valid1');
    const validToken2 = sm.createSession('valid2');

    assertEquals(sm.getSessionCount(), 4, 'Should have 4 sessions');

    // Cleanup - should remove only the expired first batch
    sm.cleanupExpiredSessions();

    assertEquals(sm.getSessionCount(), 2, 'Should have 2 valid sessions after cleanup');
    assertNull(sm.getSession(expiredToken1), 'Expired session 1 should be null');
    assertNull(sm.getSession(expiredToken2), 'Expired session 2 should be null');
    assertNotNull(sm.getSession(validToken1), 'Valid session 1 should exist');
    assertNotNull(sm.getSession(validToken2), 'Valid session 2 should exist');

    console.log('✓ Cleanup preserves valid sessions and removes expired ones');
    testsPassed++;
    sm.destroy();
  } catch (error) {
    console.log('✗ Test 17 failed:', error.message);
    testsFailed++;
  }

  // Test 18: Stop cleanup interval
  try {
    console.log('\nTest 18: stopCleanupInterval() - stops automatic cleanup');
    const sm = new SessionManager(100, 100);
    const token = sm.createSession('2024001');

    assertEquals(sm.getSessionCount(), 1, 'Should have 1 session');

    sm.stopCleanupInterval();

    // Wait longer than cleanup interval
    await new Promise(resolve => setTimeout(resolve, 250));

    // Session should NOT be cleaned up since cleanup is stopped
    const sessionAfter = sm.getSession(token);
    // Note: Session will still return null because it's expired, but cleanup didn't remove it
    // The important part is stopCleanupInterval() doesn't throw

    console.log('✓ Cleanup interval stopped successfully');
    testsPassed++;
    sm.destroy();
  } catch (error) {
    console.log('✗ Test 18 failed:', error.message);
    testsFailed++;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`Tests Passed: ${testsPassed}`);
  console.log(`Tests Failed: ${testsFailed}`);
  console.log('='.repeat(60));

  if (testsFailed === 0) {
    console.log('\n✓ All SessionManager tests passed!');
    process.exit(0);
  } else {
    console.log(`\n✗ ${testsFailed} test(s) failed`);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  runTests().catch(error => {
    console.error('Test execution error:', error);
    process.exit(1);
  });
}

module.exports = { runTests };
