/**
 * Authentication Middleware
 * Verifies session tokens and enforces authentication on protected routes
 *
 * Requirements: 3.1, 10.9, 20.1, 20.2
 */

const { getLogger } = require('../config/logger');
const logger = getLogger();

/**
 * Middleware to verify session token from Authorization header
 * Expects Bearer token format: Authorization: Bearer {sessionToken}
 *
 * If valid, adds session data to req.session
 * If invalid or missing, returns 401 Unauthorized
 *
 * @param {Object} sessionManager - SessionManager instance
 * @returns {Function} Express middleware function
 */
function authMiddleware(sessionManager) {
  return (req, res, next) => {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Missing or invalid Authorization header', {
        path: req.path,
        ip: req.ip,
        requestId: req.id
      });
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Missing or invalid authorization header'
      });
    }

    // Extract session token (remove 'Bearer ' prefix)
    const sessionToken = authHeader.substring(7);

    // Verify session token
    const session = sessionManager.getSession(sessionToken);

    if (!session) {
      logger.warn('Invalid or expired session token', {
        path: req.path,
        ip: req.ip,
        requestId: req.id
      });
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid or expired session',
        expired: true
      });
    }

    // Attach session to request object
    req.session = session;
    req.sessionToken = sessionToken;

    // Update session activity timestamp
    sessionManager.updateActivity(sessionToken);

    logger.debug('Session validated', {
      nim: session.nim,
      sessionToken: sessionToken.substring(0, 8) + '...',
      requestId: req.id
    });

    next();
  };
}

/**
 * Optional authentication middleware
 * Attempts to verify session but doesn't fail if missing
 * Useful for routes that work both authenticated and unauthenticated
 *
 * @param {Object} sessionManager - SessionManager instance
 * @returns {Function} Express middleware function
 */
function optionalAuthMiddleware(sessionManager) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const sessionToken = authHeader.substring(7);
      const session = sessionManager.getSession(sessionToken);

      if (session) {
        req.session = session;
        req.sessionToken = sessionToken;
        sessionManager.updateActivity(sessionToken);
      }
    }

    next();
  };
}

module.exports = {
  authMiddleware,
  optionalAuthMiddleware
};
