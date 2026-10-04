/**
 * Authentication Routes
 * POST /api/auth/login
 * POST /api/auth/logout
 * GET  /api/auth/validate
 * POST /api/auth/refresh
 *
 * Requirements: 1.1, 1.3, 3.1, 3.2, 3.3, 10.2, 10.5, 10.10
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { asyncHandler } = require('../middleware/errorHandler');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * Rate limiter for login endpoint
 * Max 5 attempts per minute per IP (Requirement 10.10)
 */
const loginRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many login attempts. Please wait 1 minute before trying again.',
  },
  handler: (req, res, next, options) => {
    const logger = require('../config/logger').getLogger();
    logger.warn('Rate limit exceeded on login', { ip: req.ip });
    res.status(429).json(options.message);
  },
});

/**
 * Mount routes — needs access to sessionManager and authController
 * Call this function with the app's instances.
 *
 * @param {SessionManager} sessionManager
 * @param {AuthController} authController
 */
function createAuthRouter(sessionManager, authController) {
  const auth = authMiddleware(sessionManager);

  /**
   * POST /api/auth/login
   * Authenticate with NIM + password, return sessionToken
   * Requirements: 1.1, 1.2, 1.3, 1.5
   */
  router.post('/login', loginRateLimiter, asyncHandler(async (req, res) => {
    await authController.login(req, res);
  }));

  /**
   * POST /api/auth/logout
   * Invalidate current session
   * Requirements: 19.1, 19.2, 19.3
   */
  router.post('/logout', auth, asyncHandler(async (req, res) => {
    await authController.logout(req, res);
  }));

  /**
   * GET /api/auth/validate
   * Check if current session is valid
   * Requirements: 3.1, 3.2, 3.3
   */
  router.get('/validate', auth, asyncHandler(async (req, res) => {
    await authController.validateSession(req, res);
  }));

  /**
   * POST /api/auth/refresh
   * Generate new session token from valid session
   * Requirements: 3.4, 3.5
   */
  router.post('/refresh', auth, asyncHandler(async (req, res) => {
    await authController.refreshSession(req, res);
  }));

  return router;
}

module.exports = createAuthRouter;
