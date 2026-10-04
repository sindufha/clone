/**
 * Session Manager
 * Manages user sessions with expiration, activity tracking, and cleanup
 *
 * Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4
 */

const { v4: uuidv4 } = require('uuid');
const { getLogger } = require('../config/logger');
const logger = getLogger();

class SessionManager {
  /**
   * Initialize SessionManager
   * @param {number} sessionTimeout - Session timeout in milliseconds (default: 2 hours)
   * @param {number} cleanupInterval - Cleanup interval in milliseconds (default: 5 minutes)
   */
  constructor(sessionTimeout = 7200000, cleanupInterval = 300000) {
    this.sessionStore = new Map();
    this.sessionTimeout = sessionTimeout;
    this.cleanupInterval = cleanupInterval;
    this.cleanupTimer = null;

    // Start cleanup interval
    this.startCleanupInterval();

    logger.info('SessionManager initialized', {
      timeout: sessionTimeout,
      cleanupInterval: cleanupInterval
    });
  }

  /**
   * Create a new session
   *
   * @param {string} nim - Student ID
   * @param {Map<string, string>} lmsCookies - Cookies from LMS authentication
   * @returns {string} Generated session token (UUID)
   */
  createSession(nim, lmsCookies = new Map()) {
    const sessionToken = uuidv4();
    const now = Date.now();

    const sessionData = {
      sessionToken,
      nim,
      lmsCookies: lmsCookies instanceof Map ? lmsCookies : new Map(Object.entries(lmsCookies)),
      createdAt: now,
      expiresAt: now + this.sessionTimeout,
      lastActivity: now
    };

    this.sessionStore.set(sessionToken, sessionData);

    logger.info('Session created', {
      sessionToken: sessionToken.substring(0, 8) + '...',
      nim,
      expiresAt: new Date(sessionData.expiresAt).toISOString()
    });

    return sessionToken;
  }

  /**
   * Get session by token
   * Returns null if session not found or expired
   *
   * @param {string} sessionToken - Session token to retrieve
   * @returns {Object|null} Session data or null if not found/expired
   */
  getSession(sessionToken) {
    if (!sessionToken || !this.sessionStore.has(sessionToken)) {
      return null;
    }

    const session = this.sessionStore.get(sessionToken);
    const now = Date.now();

    // Check if session is expired
    if (session.expiresAt < now) {
      logger.debug('Session expired', {
        sessionToken: sessionToken.substring(0, 8) + '...',
        expiresAt: new Date(session.expiresAt).toISOString()
      });
      this.sessionStore.delete(sessionToken);
      return null;
    }

    return session;
  }

  /**
   * Update session activity timestamp and extend expiration
   *
   * @param {string} sessionToken - Session token to update
   * @returns {boolean} True if updated, false if not found
   */
  updateActivity(sessionToken) {
    const session = this.getSession(sessionToken);

    if (!session) {
      return false;
    }

    const now = Date.now();
    session.lastActivity = now;
    session.expiresAt = now + this.sessionTimeout;

    logger.debug('Session activity updated', {
      sessionToken: sessionToken.substring(0, 8) + '...',
      newExpiresAt: new Date(session.expiresAt).toISOString()
    });

    return true;
  }

  /**
   * Delete a session
   *
   * @param {string} sessionToken - Session token to delete
   * @returns {boolean} True if deleted, false if not found
   */
  deleteSession(sessionToken) {
    if (!this.sessionStore.has(sessionToken)) {
      return false;
    }

    const session = this.sessionStore.get(sessionToken);
    this.sessionStore.delete(sessionToken);

    logger.info('Session deleted', {
      sessionToken: sessionToken.substring(0, 8) + '...',
      nim: session.nim
    });

    return true;
  }

  /**
   * Clean up expired sessions
   * Runs periodically to remove sessions that have timed out
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    let deletedCount = 0;

    for (const [token, session] of this.sessionStore.entries()) {
      if (session.expiresAt < now) {
        this.sessionStore.delete(token);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      logger.debug('Cleanup: expired sessions removed', {
        count: deletedCount,
        remainingSessions: this.sessionStore.size
      });
    }
  }

  /**
   * Start periodic cleanup interval
   * Runs cleanupExpiredSessions every cleanupInterval milliseconds
   */
  startCleanupInterval() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.cleanupInterval);

    logger.debug('Cleanup interval started', {
      interval: this.cleanupInterval
    });
  }

  /**
   * Stop the cleanup interval
   */
  stopCleanupInterval() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.debug('Cleanup interval stopped');
    }
  }

  /**
   * Get total active sessions
   *
   * @returns {number} Number of active sessions
   */
  getSessionCount() {
    return this.sessionStore.size;
  }

  /**
   * Get all active sessions (for debugging)
   * Returns session info without sensitive data
   *
   * @returns {Array} Array of session information
   */
  getAllSessions() {
    const sessions = [];
    for (const [token, session] of this.sessionStore.entries()) {
      sessions.push({
        sessionToken: token.substring(0, 8) + '...',
        nim: session.nim,
        createdAt: new Date(session.createdAt).toISOString(),
        expiresAt: new Date(session.expiresAt).toISOString(),
        lastActivity: new Date(session.lastActivity).toISOString()
      });
    }
    return sessions;
  }

  /**
   * Clear all sessions (for testing/restart)
   */
  clearAllSessions() {
    const count = this.sessionStore.size;
    this.sessionStore.clear();
    logger.warn('All sessions cleared', { count });
  }

  /**
   * Destroy the session manager
   */
  destroy() {
    this.stopCleanupInterval();
    this.clearAllSessions();
    logger.info('SessionManager destroyed');
  }
}

module.exports = SessionManager;
