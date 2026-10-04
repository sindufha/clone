/**
 * Centralized Error Handler Middleware
 * Handles all errors and returns consistent error responses
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.8, 20.2
 */

const { getLogger } = require('../config/logger');
const logger = getLogger();

/**
 * Centralized error handling middleware
 * Catches all errors and returns appropriate HTTP responses
 *
 * @param {Error} err - The error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function errorHandler(err, req, res, next) {
  // Log the error with context
  const requestId = req.id || 'unknown';
  logger.error(`Error [${requestId}]: ${err.message}`, {
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  // Determine status code and error message based on error type
  let statusCode = err.statusCode || 500;
  let errorMessage = err.message || 'An unexpected error occurred';
  let userMessage = 'An unexpected error occurred';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    userMessage = 'Invalid request parameters';
  } else if (err.name === 'AuthenticationError') {
    statusCode = 401;
    userMessage = 'Authentication failed. Please log in again.';
  } else if (err.name === 'AuthorizationError') {
    statusCode = 403;
    userMessage = "You don't have permission to access this resource";
  } else if (err.statusCode === 503) {
    statusCode = 503;
    userMessage = 'Learning Management System is currently unavailable. Please try again in a few minutes.';
  } else if (statusCode === 500) {
    userMessage = 'An unexpected error occurred. Please contact support if the problem persists.';
  }

  // Build error response
  const errorResponse = {
    success: false,
    error: userMessage,
    requestId: requestId
  };

  // In development, include more details
  if (process.env.NODE_ENV === 'development') {
    errorResponse.details = errorMessage;
    errorResponse.stack = err.stack;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}

/**
 * Async error wrapper - wraps async route handlers to catch errors
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 *
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 Not Found handler
 * Returns 404 for unmatched routes
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function notFoundHandler(req, res) {
  const err = new Error(`Route not found: ${req.method} ${req.path}`);
  err.statusCode = 404;
  res.status(404).json({
    success: false,
    error: 'Resource not found',
    requestId: req.id || 'unknown'
  });
}

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler
};
