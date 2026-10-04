const { getLogger } = require('../config/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Request/Response Logging Middleware
 * Logs all incoming requests with method, path, query params, response status
 * Requirements: 20.1, 20.2
 */

function requestLoggerMiddleware() {
  const logger = getLogger();

  return (req, res, next) => {
    // Generate or use existing request ID
    req.id = req.headers['x-request-id'] || uuidv4();

    // Record request start time
    const startTime = Date.now();

    // Store original response.end function
    const originalEnd = res.end;

    // Override response.end to capture when response is sent
    res.end = function(...args) {
      // Calculate request duration
      const duration = Date.now() - startTime;

      // Log the request with response details
      logger.logRequest(req, res, duration);

      // Call original end function
      originalEnd.apply(res, args);
    };

    next();
  };
}

module.exports = requestLoggerMiddleware;
