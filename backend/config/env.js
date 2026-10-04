/**
 * Environment Configuration
 * Loads and validates environment variables from .env file
 * Requirements: 10.1, 10.2, 20.1
 */

require('dotenv').config();

/**
 * Load environment variables with defaults
 */
const config = {
  // Express Server Configuration
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // LMS Configuration
  lmsBaseUrl: process.env.LMS_BASE_URL || 'https://lms.itmnganjuk.ac.id',
  lmsLoginEndpoint: process.env.LMS_LOGIN_ENDPOINT || '/login/index.php',

  // Session Configuration
  sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '7200000', 10), // 2 hours
  sessionCleanupInterval: parseInt(process.env.SESSION_CLEANUP_INTERVAL || '300000', 10), // 5 minutes

  // Logging Configuration
  logLevel: process.env.LOG_LEVEL || 'info',
  logFile: process.env.LOG_FILE || 'logs/app.log',

  // Security Configuration
  httpsOnly: process.env.HTTPS_ONLY !== 'false', // Default true
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10), // 1 minute
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '5', 10),
};

/**
 * Validate required environment variables
 * @throws {Error} If required variables are missing
 */
function validateConfig() {
  const errors = [];

  // Validate PORT is a valid number
  if (isNaN(config.port) || config.port < 1 || config.port > 65535) {
    errors.push('PORT must be a valid port number (1-65535)');
  }

  // Validate NODE_ENV
  if (!['development', 'production', 'test'].includes(config.nodeEnv)) {
    errors.push('NODE_ENV must be "development", "production", or "test"');
  }

  // Validate LMS_BASE_URL is a valid URL
  try {
    new URL(config.lmsBaseUrl);
  } catch (e) {
    errors.push('LMS_BASE_URL must be a valid URL starting with https://');
  }

  // Ensure LMS_BASE_URL uses HTTPS
  if (!config.lmsBaseUrl.startsWith('https://')) {
    errors.push('LMS_BASE_URL must use HTTPS protocol');
  }

  // Validate session timeout is positive
  if (config.sessionTimeout <= 0) {
    errors.push('SESSION_TIMEOUT must be a positive number (milliseconds)');
  }

  // Validate cleanup interval is positive
  if (config.sessionCleanupInterval <= 0) {
    errors.push('SESSION_CLEANUP_INTERVAL must be a positive number (milliseconds)');
  }

  // Throw error if validation failed
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Get configuration
 * Validates config on first call
 * @returns {Object} Configuration object
 */
function getConfig() {
  validateConfig();
  return config;
}

/**
 * Check if application is in production mode
 * @returns {boolean}
 */
function isProduction() {
  return config.nodeEnv === 'production';
}

/**
 * Check if application is in development mode
 * @returns {boolean}
 */
function isDevelopment() {
  return config.nodeEnv === 'development';
}

module.exports = {
  getConfig,
  isProduction,
  isDevelopment,
  config,
};
