/**
 * Authentication Controller
 * Handles login, logout, session validation, and refresh
 *
 * Requirements: 1.1, 1.2, 1.3, 1.5, 2.1, 3.1, 3.2, 3.4, 3.5
 */

const path = require('path');
const { getLogger } = require('../config/logger');
const { normalizeAssignments, normalizeCourses } = require('../utils/parser');

const logger = getLogger();

// Load scraped data for dev/fallback mode
let _cachedAssignments = null;
let _cachedCourses = null;

function loadScrapedData() {
  if (!_cachedAssignments) {
    try {
      const assignmentsRaw = require(path.join(__dirname, '../../assignments-data.json'));
      _cachedAssignments = normalizeAssignments(assignmentsRaw);
      logger.info(`Loaded ${_cachedAssignments.length} assignments from scraped data`);
    } catch (err) {
      logger.warn('Could not load scraped assignments data', { error: err.message });
      _cachedAssignments = [];
    }
  }
  if (!_cachedCourses) {
    try {
      const coursesRaw = require(path.join(__dirname, '../../courses-data.json'));
      _cachedCourses = normalizeCourses(coursesRaw);
      logger.info(`Loaded ${_cachedCourses.length} courses from scraped data`);
    } catch (err) {
      logger.warn('Could not load scraped courses data', { error: err.message });
      _cachedCourses = [];
    }
  }
}

class AuthController {
  /**
   * @param {SessionManager} sessionManager
   * @param {LMSProxy} lmsProxy
   */
  constructor(sessionManager, lmsProxy) {
    this.sessionManager = sessionManager;
    this.lmsProxy = lmsProxy;

    // Pre-load scraped data
    loadScrapedData();
  }

  /**
   * Handle login request
   * POST /api/auth/login
   * Requirements: 1.1, 1.2, 1.3, 1.5, 10.4
   */
  async login(req, res) {
    const { nim, password } = req.body;
    const ip = req.ip;
    const requestId = req.id;

    // Input validation
    if (!nim || typeof nim !== 'string' || !nim.trim()) {
      logger.warn('Login attempt with missing NIM', { ip, requestId });
      return res.status(400).json({
        success: false,
        error: 'NIM is required',
      });
    }

    if (!password || typeof password !== 'string' || !password.trim()) {
      logger.warn('Login attempt with missing password', { ip, requestId });
      return res.status(400).json({
        success: false,
        error: 'Password is required',
      });
    }

    logger.info('Login attempt', { nim: nim.trim(), ip, requestId });

    try {
      // Attempt LMS authentication
      const authResult = await this.lmsProxy.authenticate(nim.trim(), password);

      if (!authResult.success) {
        // Log failure for security monitoring (Requirement 20.3)
        logger.warn('Login failed - invalid credentials', {
          nim: nim.trim(),
          ip,
          requestId,
          reason: authResult.error,
        });

        return res.status(401).json({
          success: false,
          error: 'Invalid credentials',
        });
      }

      // Create session with LMS cookies (Requirement 1.2, 15.1)
      const sessionToken = this.sessionManager.createSession(
        nim.trim(),
        authResult.cookies
      );

      // Extract user info
      const user = {
        nim: nim.trim(),
        name: authResult.user?.name || nim.trim(),
        email: authResult.user?.email || `${nim.trim()}@student.ac.id`,
      };

      logger.info('Login successful', {
        nim: nim.trim(),
        ip,
        requestId,
        sessionToken: sessionToken.substring(0, 8) + '...',
      });

      // Return token in body only, NOT in cookies (Requirement 10.7)
      return res.status(200).json({
        success: true,
        sessionToken,
        user,
      });
    } catch (err) {
      logger.error('Login error', {
        nim: nim.trim(),
        ip,
        requestId,
        error: err.message,
      });

      return res.status(503).json({
        success: false,
        error: 'Learning Management System is currently unavailable. Please try again in a few minutes.',
      });
    }
  }

  /**
   * Handle logout request
   * POST /api/auth/logout
   * Requirements: 19.1, 19.2, 19.3
   */
  async logout(req, res) {
    const sessionToken = req.sessionToken;
    const nim = req.session?.nim;
    const ip = req.ip;

    logger.info('Logout request', {
      nim,
      ip,
      sessionToken: sessionToken?.substring(0, 8) + '...',
    });

    // Delete session from store (Requirement 19.2)
    const deleted = this.sessionManager.deleteSession(sessionToken);

    if (!deleted) {
      logger.warn('Logout: session not found', { sessionToken: sessionToken?.substring(0, 8) });
    }

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  }

  /**
   * Validate existing session
   * GET /api/auth/validate
   * Requirements: 3.1, 3.2, 3.3
   */
  async validateSession(req, res) {
    // Session already verified by authMiddleware; req.session is populated
    const session = req.session;
    const sessionToken = req.sessionToken;

    const now = Date.now();
    const expiresIn = Math.max(0, Math.floor((session.expiresAt - now) / 1000));

    logger.debug('Session validated', {
      nim: session.nim,
      expiresIn,
    });

    return res.status(200).json({
      valid: true,
      user: {
        nim: session.nim,
        name: session.nim,
      },
      expiresIn,
    });
  }

  /**
   * Refresh session — generate new token, invalidate old
   * POST /api/auth/refresh
   * Requirements: 3.4, 3.5
   */
  async refreshSession(req, res) {
    const oldToken = req.sessionToken;
    const session = req.session;

    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Session not found',
      });
    }

    // Create new session with same LMS cookies
    const newToken = this.sessionManager.createSession(
      session.nim,
      session.lmsCookies
    );

    // Delete old session
    this.sessionManager.deleteSession(oldToken);

    logger.info('Session refreshed', {
      nim: session.nim,
      newToken: newToken.substring(0, 8) + '...',
    });

    return res.status(200).json({
      success: true,
      sessionToken: newToken,
    });
  }

  /**
   * Get scraped assignments (dev/fallback mode)
   */
  getScrapedAssignments() {
    return _cachedAssignments || [];
  }

  /**
   * Get scraped courses (dev/fallback mode)
   */
  getScrapedCourses() {
    return _cachedCourses || [];
  }
}

module.exports = AuthController;
