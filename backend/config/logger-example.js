/**
 * Logger Integration Example
 * Shows how to use the logger module with Express backend
 *
 * This file demonstrates the setup and usage patterns for the logging utilities.
 */

// Example 1: Initialize logger on server startup
// ================================================

const express = require('express');
const { initLogger, getLogger } = require('./logger');
const requestLoggerMiddleware = require('../middleware/requestLogger');

// Initialize logger when server starts
function initializeServer() {
  // Initialize logger with configuration
  initLogger({
    logDir: process.env.LOG_DIR || './logs',
    maxFileSize: 10 * 1024 * 1024,  // 10 MB
    maxFiles: 5,
    level: process.env.LOG_LEVEL || 'info',
    isProduction: process.env.NODE_ENV === 'production',
  });

  const logger = getLogger();
  logger.info('Server starting up', {
    environment: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    version: '1.0.0',
  });
}

// Example 2: Express middleware setup
// ====================================

function setupExpressLogging(app) {
  const logger = getLogger();

  // Add request/response logging middleware
  app.use(requestLoggerMiddleware());

  // Log all routes
  app.get('/api/example', (req, res) => {
    res.json({ message: 'Example endpoint' });
  });

  // Error handling middleware with logging
  app.use((err, req, res, next) => {
    logger.logError(err, {
      component: 'ErrorHandler',
      requestId: req.id,
      method: req.method,
      path: req.path,
    });

    res.status(err.status || 500).json({
      error: 'An unexpected error occurred',
    });
  });
}

// Example 3: Authentication logging
// ==================================

function handleLogin(req, res) {
  const logger = getLogger();
  const { nim, password } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress;

  try {
    // Attempt authentication
    const isValid = validateCredentials(nim, password);

    if (!isValid) {
      // Log authentication failure (NIM will be redacted)
      logger.logAuthFailure(nim, clientIp, 'Invalid credentials');

      return res.status(401).json({
        error: 'Invalid credentials',
      });
    }

    // Log successful login (sensitive operation)
    logger.logSensitiveOperation('user_login', {
      userId: nim,
      method: 'credentials',
      ip: clientIp,
      timestamp: new Date().toISOString(),
    });

    // Create session and return token
    const sessionToken = createSession(nim);

    res.json({
      success: true,
      sessionToken,
    });

  } catch (error) {
    // Log error
    logger.logError(error, {
      component: 'AuthController',
      requestId: req.id,
      action: 'login',
    });

    res.status(500).json({
      error: 'Server error during authentication',
    });
  }
}

// Example 4: Assignment submission logging
// =========================================

function handleAssignmentSubmission(req, res) {
  const logger = getLogger();
  const { assignmentId } = req.params;
  const userId = req.user.id;

  try {
    logger.debug('Starting assignment submission', {
      requestId: req.id,
      assignmentId,
      userId,
      fileSize: req.body.file?.size,
    });

    // Process submission
    const result = processSubmission(assignmentId, req.body);

    // Log successful submission (audit)
    logger.logSensitiveOperation('assignment_submission', {
      userId,
      assignmentId,
      submissionId: result.submissionId,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      submissionId: result.submissionId,
    });

  } catch (error) {
    logger.logError(error, {
      component: 'AssignmentController',
      requestId: req.id,
      userId,
      assignmentId,
      action: 'submit',
    });

    res.status(500).json({
      error: 'Failed to submit assignment',
    });
  }
}

// Example 5: External API call logging
// =====================================

async function fetchFromLMS(endpoint, cookies, requestId) {
  const logger = getLogger();
  const startTime = Date.now();

  try {
    logger.debug('Fetching from LMS', {
      requestId,
      endpoint,
      component: 'LMSProxy',
    });

    // Make API call
    const response = await makeLMSRequest(endpoint, cookies);

    const duration = Date.now() - startTime;

    logger.info('LMS request successful', {
      requestId,
      endpoint,
      statusCode: response.status,
      duration: `${duration}ms`,
      component: 'LMSProxy',
    });

    return response.data;

  } catch (error) {
    const duration = Date.now() - startTime;

    logger.logError(error, {
      requestId,
      component: 'LMSProxy',
      endpoint,
      action: 'fetch',
      duration: `${duration}ms`,
    });

    throw error;
  }
}

// Example 6: Session management logging
// ======================================

function createSession(nim) {
  const logger = getLogger();
  const sessionToken = generateToken();

  logger.debug('Session created', {
    userId: nim,
    sessionToken, // Will be redacted
    duration: '2 hours',
    timestamp: new Date().toISOString(),
  });

  return sessionToken;
}

function invalidateSession(sessionToken, reason) {
  const logger = getLogger();

  logger.info('Session invalidated', {
    sessionToken, // Will be redacted
    reason,
    timestamp: new Date().toISOString(),
  });
}

// Example 7: Database operation logging
// ======================================

async function getUserAssignments(userId, requestId) {
  const logger = getLogger();
  const startTime = Date.now();

  try {
    logger.debug('Querying user assignments', {
      requestId,
      userId,
      component: 'DatabaseModule',
    });

    // Query database
    const assignments = await queryDatabase(
      'SELECT * FROM assignments WHERE user_id = ?',
      [userId]
    );

    const duration = Date.now() - startTime;

    logger.debug('Database query completed', {
      requestId,
      userId,
      resultCount: assignments.length,
      duration: `${duration}ms`,
      component: 'DatabaseModule',
    });

    return assignments;

  } catch (error) {
    const duration = Date.now() - startTime;

    logger.logError(error, {
      requestId,
      component: 'DatabaseModule',
      userId,
      action: 'getUserAssignments',
      duration: `${duration}ms`,
    });

    throw error;
  }
}

// Example 8: Middleware with logging
// ===================================

function authMiddleware(req, res, next) {
  const logger = getLogger();
  const sessionToken = req.headers.authorization?.split(' ')[1];

  if (!sessionToken) {
    logger.warn('Unauthorized access attempt', {
      requestId: req.id,
      path: req.path,
      method: req.method,
      ip: req.ip,
    });

    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  // Validate session
  const session = validateSession(sessionToken);

  if (!session) {
    logger.warn('Invalid session token', {
      requestId: req.id,
      sessionToken, // Will be redacted
      ip: req.ip,
    });

    return res.status(401).json({
      error: 'Session expired',
    });
  }

  req.user = session.user;
  next();
}

// Example 9: Graceful shutdown with logging
// ==========================================

function setupGracefulShutdown(server) {
  const logger = getLogger();

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');

    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

    // Force close after 30 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  });
}

// Example 10: Monitoring and health checks
// =========================================

function setupHealthCheck(app) {
  const logger = getLogger();

  app.get('/health', (req, res) => {
    logger.debug('Health check');

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  // Log metrics periodically
  setInterval(() => {
    logger.info('System metrics', {
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      component: 'SystemMonitor',
    });
  }, 300000); // Every 5 minutes
}

// Stub functions for example (replace with real implementations)
function validateCredentials(nim, password) { return true; }
function createSession(nim) { return 'token-' + nim; }
function generateToken() { return require('crypto').randomUUID(); }
async function makeLMSRequest(endpoint, cookies) { return { status: 200, data: {} }; }
function queryDatabase(sql, params) { return Promise.resolve([]); }
function validateSession(token) { return { user: { id: 'user-123' } }; }
function processSubmission(assignmentId, data) { return { submissionId: 'sub-123' }; }

// Export for use in actual server
module.exports = {
  initializeServer,
  setupExpressLogging,
  handleLogin,
  handleAssignmentSubmission,
  fetchFromLMS,
  createSession,
  invalidateSession,
  getUserAssignments,
  authMiddleware,
  setupGracefulShutdown,
  setupHealthCheck,
};
