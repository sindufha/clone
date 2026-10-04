const fs = require('fs');
const path = require('path');
const { createWriteStream } = fs;

/**
 * Logger Module with Rotating File Support
 * Provides structured logging with timestamp, level, context, and sensitive data redaction
 *
 * Requirements: 20.1, 20.2, 20.6
 * - 20.1: Log requests with method, path, query params, response status, timestamp
 * - 20.2: Log errors with stack trace, component, and request ID
 * - 20.6: Redact passwords, sessionTokens, and sensitive cookies from logs
 */

class Logger {
  constructor(options = {}) {
    // Configuration
    this.logDir = options.logDir || path.join(__dirname, '../../logs');
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10 MB
    this.maxFiles = options.maxFiles || 5; // Keep last 5 log files
    this.level = options.level || 'info'; // debug, info, warn, error
    this.isProduction = options.isProduction || process.env.NODE_ENV === 'production';

    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // Initialize log streams
    this.logFile = path.join(this.logDir, 'app.log');
    this.errorLogFile = path.join(this.logDir, 'error.log');

    // Track current file sizes
    this.currentLogSize = this._getFileSize(this.logFile);
    this.currentErrorSize = this._getFileSize(this.errorLogFile);
  }

  /**
   * Get file size in bytes
   */
  _getFileSize(filePath) {
    try {
      return fs.statSync(filePath).size;
    } catch (err) {
      return 0;
    }
  }

  /**
   * Rotate log file if it exceeds max size
   */
  _rotateFile(filePath) {
    try {
      const stats = fs.statSync(filePath);

      if (stats.size > this.maxFileSize) {
        // Generate timestamp for rotated file
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const ext = path.extname(filePath);
        const basename = path.basename(filePath, ext);
        const rotatedPath = path.join(
          path.dirname(filePath),
          `${basename}.${timestamp}${ext}`
        );

        // Rename current file to backup
        fs.renameSync(filePath, rotatedPath);

        // Clean up old files (keep only maxFiles)
        this._cleanupOldFiles(path.dirname(filePath), basename, ext);

        return true;
      }
    } catch (err) {
      // Silently handle rotation errors to not break logging
    }
    return false;
  }

  /**
   * Clean up old rotated log files
   */
  _cleanupOldFiles(dir, basename, ext) {
    try {
      const files = fs.readdirSync(dir)
        .filter(f => f.startsWith(basename) && f.includes('.'))
        .sort()
        .reverse();

      // Keep only maxFiles, delete older ones
      files.slice(this.maxFiles).forEach(file => {
        try {
          fs.unlinkSync(path.join(dir, file));
        } catch (err) {
          // Ignore cleanup errors
        }
      });
    } catch (err) {
      // Ignore cleanup errors
    }
  }

  /**
   * Redact sensitive data from strings
   * Redacts: passwords, tokens, cookies, credit cards, etc.
   */
  _redactSensitive(text) {
    if (typeof text !== 'string') {
      return text;
    }

    // List of sensitive patterns to redact
    const patterns = [
      // Password fields
      /password["']?\s*[:=]\s*["']?[^"'\s,}]+["']?/gi,
      /pwd["']?\s*[:=]\s*["']?[^"'\s,}]+["']?/gi,

      // Token and session fields
      /sessionToken["']?\s*[:=]\s*["']?[^"'\s,}]+["']?/gi,
      /token["']?\s*[:=]\s*["']?[^"'\s,}]+["']?/gi,
      /authorization["']?\s*[:=]\s*Bearer\s+[^"'\s,}]+/gi,

      // Cookie fields
      /cookie["']?\s*[:=]\s*["']?[^"'\s,}]+["']?/gi,
      /PHPSESSID["']?\s*[:=]\s*[^"'\s,;}]+/gi,
      /Set-Cookie["']?\s*[:=]\s*[^"'\s,}]+/gi,

      // LMS specific
      /nim["']?\s*[:=]\s*["']?[0-9]+["']?/gi,

      // Bearer tokens in Authorization header
      /Bearer\s+[A-Za-z0-9\-._~+\/]+=*/gi,

      // Credit card patterns (optional, for extra security)
      /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g,
    ];

    let redacted = text;
    patterns.forEach(pattern => {
      redacted = redacted.replace(pattern, (match) => {
        const firstChar = match.charAt(0);
        const lastChars = match.length > 3 ? match.slice(-3) : '';
        return `${firstChar}***${lastChars ? '*' + lastChars : ''}`;
      });
    });

    return redacted;
  }

  /**
   * Redact sensitive data from objects
   */
  _redactObject(obj) {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj !== 'object') {
      if (typeof obj === 'string') {
        return this._redactSensitive(obj);
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this._redactObject(item));
    }

    const redacted = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      // Check if key is sensitive
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('pwd') ||
        lowerKey.includes('token') ||
        lowerKey.includes('cookie') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('authorization') ||
        lowerKey.includes('nim') ||
        lowerKey.includes('credential')
      ) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        redacted[key] = this._redactObject(value);
      } else if (typeof value === 'string') {
        redacted[key] = this._redactSensitive(value);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }

  /**
   * Format log entry with structured data
   */
  _formatLogEntry(level, message, context = {}) {
    const timestamp = new Date().toISOString();
    const pid = process.pid;
    const requestId = context.requestId || 'N/A';

    // Build log object
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      pid,
      requestId,
      message,
      ...context,
    };

    // Redact sensitive data
    const redactedEntry = this._redactObject(logEntry);

    // Format as JSON or pretty string
    if (this.isProduction) {
      return JSON.stringify(redactedEntry);
    } else {
      return JSON.stringify(redactedEntry, null, 2);
    }
  }

  /**
   * Write log to file
   */
  _writeLog(filePath, level, message, context = {}) {
    try {
      // Check and rotate if needed
      this._rotateFile(filePath);

      // Format the log entry
      const logEntry = this._formatLogEntry(level, message, context);

      // Append to file
      fs.appendFileSync(filePath, logEntry + '\n');

      // Also log to console in development
      if (!this.isProduction) {
        const color = this._getColorCode(level);
        const reset = '\x1b[0m';
        console.log(`${color}[${level.toUpperCase()}]${reset}`, message, context);
      }
    } catch (err) {
      // Fallback to console if file write fails
      console.error('Logger error:', err.message);
    }
  }

  /**
   * Get ANSI color code for log level
   */
  _getColorCode(level) {
    const colors = {
      debug: '\x1b[36m',    // Cyan
      info: '\x1b[32m',     // Green
      warn: '\x1b[33m',     // Yellow
      error: '\x1b[31m',    // Red
    };
    return colors[level] || '\x1b[0m';
  }

  /**
   * Check if log level should be logged
   */
  _shouldLog(level) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[this.level];
  }

  /**
   * Public logging methods
   */
  debug(message, context = {}) {
    if (this._shouldLog('debug')) {
      this._writeLog(this.logFile, 'debug', message, context);
    }
  }

  info(message, context = {}) {
    if (this._shouldLog('info')) {
      this._writeLog(this.logFile, 'info', message, context);
    }
  }

  warn(message, context = {}) {
    if (this._shouldLog('warn')) {
      this._writeLog(this.logFile, 'warn', message, context);
    }
  }

  error(message, context = {}) {
    if (this._shouldLog('error')) {
      this._writeLog(this.errorLogFile, 'error', message, context);
    }
  }

  /**
   * Log request (for middleware)
   * Requirements: 20.1
   */
  logRequest(req, res, duration) {
    const context = {
      requestId: req.id || req.headers['x-request-id'] || 'N/A',
      method: req.method,
      path: req.path,
      query: req.query && Object.keys(req.query).length > 0 ? req.query : undefined,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
    };

    const message = `${req.method} ${req.path} - ${res.statusCode}`;
    this.info(message, context);
  }

  /**
   * Log error with stack trace
   * Requirements: 20.2
   */
  logError(error, context = {}) {
    const errorContext = {
      requestId: context.requestId || 'N/A',
      component: context.component || 'Unknown',
      message: error.message,
      stack: error.stack,
      ...context,
    };

    this.error(error.message, errorContext);
  }

  /**
   * Log authentication failure
   * Requirements: 20.1, 20.2
   */
  logAuthFailure(nim, ip, reason) {
    const context = {
      component: 'Authentication',
      nim,
      ip,
      reason,
    };

    this.warn('Authentication failed', context);
  }

  /**
   * Log sensitive operation
   * Requirements: 20.4
   */
  logSensitiveOperation(operation, context = {}) {
    const operationContext = {
      component: 'Audit',
      operation,
      timestamp: new Date().toISOString(),
      ...context,
    };

    this.info(`Sensitive operation: ${operation}`, operationContext);
  }

  /**
   * Get log file path
   */
  getLogPath() {
    return this.logFile;
  }

  /**
   * Get error log file path
   */
  getErrorLogPath() {
    return this.errorLogFile;
  }

  /**
   * Read recent logs
   */
  readRecentLogs(lines = 50) {
    try {
      const content = fs.readFileSync(this.logFile, 'utf-8');
      const logLines = content.split('\n').filter(line => line.trim());
      return logLines.slice(-lines);
    } catch (err) {
      return [];
    }
  }

  /**
   * Clear logs
   */
  clearLogs() {
    try {
      fs.writeFileSync(this.logFile, '');
      fs.writeFileSync(this.errorLogFile, '');
    } catch (err) {
      console.error('Failed to clear logs:', err.message);
    }
  }
}

// Create singleton instance
let instance = null;

/**
 * Initialize logger (call once at startup)
 */
function initLogger(options = {}) {
  if (!instance) {
    instance = new Logger(options);
  }
  return instance;
}

/**
 * Get logger instance
 */
function getLogger() {
  if (!instance) {
    instance = new Logger();
  }
  return instance;
}

module.exports = {
  Logger,
  initLogger,
  getLogger,
};
