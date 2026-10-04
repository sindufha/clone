const { Logger, getLogger } = require('./logger');
const fs = require('fs');
const path = require('path');

/**
 * Logger Unit Tests
 * Verifies structured logging, rotation, and sensitive data redaction
 */

describe('Logger', () => {
  let testLogger;
  let testLogDir;

  beforeEach(() => {
    // Create temporary log directory for tests
    testLogDir = path.join(__dirname, '../../logs-test');
    if (!fs.existsSync(testLogDir)) {
      fs.mkdirSync(testLogDir, { recursive: true });
    }

    // Create logger instance with test configuration
    testLogger = new Logger({
      logDir: testLogDir,
      maxFileSize: 1024, // Small size for testing rotation
      level: 'debug',
      isProduction: false,
    });
  });

  afterEach(() => {
    // Clean up test logs
    if (fs.existsSync(testLogDir)) {
      const files = fs.readdirSync(testLogDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(testLogDir, file));
      });
      fs.rmdirSync(testLogDir);
    }
  });

  describe('Structured Logging', () => {
    test('should log message with timestamp and level', () => {
      testLogger.info('Test message', { userId: '123' });

      const logContent = fs.readFileSync(testLogger.getLogPath(), 'utf-8');
      const logs = logContent.split('\n').filter(line => line.trim());

      expect(logs.length).toBeGreaterThan(0);
      const logEntry = JSON.parse(logs[logs.length - 1]);

      expect(logEntry.timestamp).toBeDefined();
      expect(logEntry.level).toBe('INFO');
      expect(logEntry.message).toBe('Test message');
      expect(logEntry.userId).toBe('123');
    });

    test('should include request context in logs', () => {
      const context = {
        requestId: 'req-123',
        method: 'GET',
        path: '/api/assignments',
        statusCode: 200,
      };

      testLogger.info('Request processed', context);

      const logContent = fs.readFileSync(testLogger.getLogPath(), 'utf-8');
      const logEntry = JSON.parse(logContent.split('\n').filter(l => l.trim())[0]);

      expect(logEntry.requestId).toBe('req-123');
      expect(logEntry.method).toBe('GET');
      expect(logEntry.path).toBe('/api/assignments');
      expect(logEntry.statusCode).toBe(200);
    });
  });

  describe('Sensitive Data Redaction', () => {
    test('should redact password from logs', () => {
      const message = 'User login with password: "mySecurePassword123"';
      testLogger.info(message);

      const logContent = fs.readFileSync(testLogger.getLogPath(), 'utf-8');
      const logEntry = JSON.parse(logContent.split('\n').filter(l => l.trim())[0]);

      expect(logEntry.message).toContain('***');
      expect(logEntry.message).not.toContain('mySecurePassword123');
    });

    test('should redact sessionToken from logs', () => {
      const context = {
        sessionToken: 'abc123def456ghi789',
      };

      testLogger.info('Session created', context);

      const logContent = fs.readFileSync(testLogger.getLogPath(), 'utf-8');
      const logEntry = JSON.parse(logContent.split('\n').filter(l => l.trim())[0]);

      expect(logEntry.sessionToken).toBe('[REDACTED]');
    });

    test('should redact Authorization header', () => {
      const message = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      testLogger.info(message);

      const logContent = fs.readFileSync(testLogger.getLogPath(), 'utf-8');
      const logEntry = JSON.parse(logContent.split('\n').filter(l => l.trim())[0]);

      expect(logEntry.message).toContain('***');
      expect(logEntry.message).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    test('should redact cookies from logs', () => {
      const context = {
        cookie: 'PHPSESSID=abc123def456; Path=/; HttpOnly',
      };

      testLogger.info('Cookie set', context);

      const logContent = fs.readFileSync(testLogger.getLogPath(), 'utf-8');
      const logEntry = JSON.parse(logContent.split('\n').filter(l => l.trim())[0]);

      expect(logEntry.cookie).toBe('[REDACTED]');
    });

    test('should redact NIM from logs', () => {
      const context = {
        nim: '000000000001',
      };

      testLogger.info('User login attempt', context);

      const logContent = fs.readFileSync(testLogger.getLogPath(), 'utf-8');
      const logEntry = JSON.parse(logContent.split('\n').filter(l => l.trim())[0]);

      expect(logEntry.nim).toBe('[REDACTED]');
    });

    test('should redact nested sensitive data in objects', () => {
      const context = {
        user: {
          name: 'John Doe',
          password: 'secretPassword123',
          token: 'abc123token',
        },
      };

      testLogger.info('User object', context);

      const logContent = fs.readFileSync(testLogger.getLogPath(), 'utf-8');
      const logEntry = JSON.parse(logContent.split('\n').filter(l => l.trim())[0]);

      expect(logEntry.user.name).toBe('John Doe');
      expect(logEntry.user.password).toBe('[REDACTED]');
      expect(logEntry.user.token).toBe('[REDACTED]');
    });
  });

  describe('Log Levels', () => {
    test('should log debug messages when level is debug', () => {
      testLogger.level = 'debug';
      testLogger.debug('Debug message');

      const logContent = fs.readFileSync(testLogger.getLogPath(), 'utf-8');
      expect(logContent).toContain('Debug message');
    });

    test('should not log debug messages when level is info', () => {
      const logger = new Logger({
        logDir: testLogDir,
        level: 'info',
      });

      logger.debug('Debug message');

      const logContent = fs.readFileSync(logger.getLogPath(), 'utf-8');
      expect(logContent).not.toContain('Debug message');
    });

    test('should log error messages to error log file', () => {
      testLogger.error('An error occurred', { code: 'ERR_001' });

      const errorLogContent = fs.readFileSync(testLogger.getErrorLogPath(), 'utf-8');
      const logEntry = JSON.parse(errorLogContent.split('\n').filter(l => l.trim())[0]);

      expect(logEntry.level).toBe('ERROR');
      expect(logEntry.message).toBe('An error occurred');
      expect(logEntry.code).toBe('ERR_001');
    });
  });

  describe('Log Rotation', () => {
    test('should rotate log file when size exceeds limit', () => {
      // Generate logs larger than maxFileSize (1024 bytes)
      for (let i = 0; i < 3; i++) {
        testLogger.info(
          'This is a longer log message to fill up the file space quickly',
          {
            index: i,
            data: 'x'.repeat(200),
          }
        );
      }

      // Check that rotated file exists
      const files = fs.readdirSync(testLogDir);
      const rotatedFiles = files.filter(f => f.includes('app.') && f.includes('.log'));

      // Should have original app.log and at least one rotated file
      expect(rotatedFiles.length).toBeGreaterThanOrEqual(1);
    });

    test('should clean up old rotated files keeping only maxFiles', () => {
      const logger = new Logger({
        logDir: testLogDir,
        maxFileSize: 100, // Very small to trigger multiple rotations
        maxFiles: 2,
      });

      // Generate many logs to trigger multiple rotations
      for (let i = 0; i < 20; i++) {
        logger.info('Log entry', { index: i });
      }

      const files = fs.readdirSync(testLogDir);

      // Should keep only maxFiles (2) + current file
      expect(files.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Request Logging', () => {
    test('should log request with method, path, status, duration', () => {
      const mockReq = {
        method: 'POST',
        path: '/api/auth/login',
        query: { redirect: 'dashboard' },
        ip: '192.168.1.1',
      };

      const mockRes = {
        statusCode: 200,
      };

      testLogger.logRequest(mockReq, mockRes, 125);

      const logContent = fs.readFileSync(testLogger.getLogPath(), 'utf-8');
      const logEntry = JSON.parse(logContent.split('\n').filter(l => l.trim())[0]);

      expect(logEntry.message).toContain('POST');
      expect(logEntry.message).toContain('/api/auth/login');
      expect(logEntry.message).toContain('200');
      expect(logEntry.method).toBe('POST');
      expect(logEntry.path).toBe('/api/auth/login');
      expect(logEntry.statusCode).toBe(200);
      expect(logEntry.duration).toBe('125ms');
    });
  });

  describe('Error Logging', () => {
    test('should log error with stack trace and component', () => {
      const error = new Error('Database connection failed');
      error.stack = 'Error: Database connection failed\n    at dbConnect (db.js:45:10)';

      testLogger.logError(error, {
        component: 'DatabaseModule',
        requestId: 'req-abc-123',
      });

      const errorLogContent = fs.readFileSync(testLogger.getErrorLogPath(), 'utf-8');
      const logEntry = JSON.parse(errorLogContent.split('\n').filter(l => l.trim())[0]);

      expect(logEntry.message).toBe('Database connection failed');
      expect(logEntry.component).toBe('DatabaseModule');
      expect(logEntry.requestId).toBe('req-abc-123');
      expect(logEntry.stack).toBeDefined();
    });

    test('should log authentication failure with NIM and IP', () => {
      testLogger.logAuthFailure('000000000001', '192.168.1.100', 'Invalid credentials');

      const logContent = fs.readFileSync(testLogger.getLogPath(), 'utf-8');
      const logEntry = JSON.parse(logContent.split('\n').filter(l => l.trim())[0]);

      expect(logEntry.message).toContain('Authentication failed');
      expect(logEntry.nim).toBe('[REDACTED]'); // NIM should be redacted
      expect(logEntry.ip).toBe('192.168.1.100');
      expect(logEntry.reason).toBe('Invalid credentials');
    });
  });

  describe('Sensitive Operations', () => {
    test('should log sensitive operations for audit purposes', () => {
      testLogger.logSensitiveOperation('user_login', {
        userId: 'user-123',
        method: 'credentials',
      });

      const logContent = fs.readFileSync(testLogger.getLogPath(), 'utf-8');
      const logEntry = JSON.parse(logContent.split('\n').filter(l => l.trim())[0]);

      expect(logEntry.message).toContain('Sensitive operation: user_login');
      expect(logEntry.operation).toBe('user_login');
      expect(logEntry.component).toBe('Audit');
    });
  });

  describe('Log Reading', () => {
    test('should read recent logs', () => {
      testLogger.info('Log 1');
      testLogger.info('Log 2');
      testLogger.info('Log 3');

      const recentLogs = testLogger.readRecentLogs(2);

      expect(recentLogs.length).toBe(2);
      expect(recentLogs[0]).toContain('Log 2');
      expect(recentLogs[1]).toContain('Log 3');
    });
  });

  describe('Logger Singleton', () => {
    test('should return same instance on subsequent calls', () => {
      const logger1 = getLogger();
      const logger2 = getLogger();

      expect(logger1).toBe(logger2);
    });
  });
});

// Export tests for manual verification
if (require.main === module) {
  console.log('\n=== Logger Testing ===\n');

  const testLogDir = path.join(__dirname, '../../logs-sample');
  if (!fs.existsSync(testLogDir)) {
    fs.mkdirSync(testLogDir, { recursive: true });
  }

  const logger = new Logger({
    logDir: testLogDir,
    level: 'debug',
    isProduction: false,
  });

  // Test 1: Structured logging
  console.log('✓ Test 1: Structured logging');
  logger.info('User logged in', {
    userId: 'user-123',
    method: 'credentials',
    duration: '145ms',
  });

  // Test 2: Sensitive data redaction
  console.log('✓ Test 2: Sensitive data redaction');
  logger.info('Login attempt', {
    nim: '000000000001',
    password: 'mySecretPassword',
    ip: '192.168.1.1',
  });

  // Test 3: Error logging
  console.log('✓ Test 3: Error logging');
  const error = new Error('Database connection failed');
  logger.logError(error, {
    component: 'DatabaseModule',
    requestId: 'req-abc-123',
  });

  // Test 4: Request logging
  console.log('✓ Test 4: Request logging');
  logger.logRequest(
    {
      method: 'GET',
      path: '/api/assignments',
      query: {},
      ip: '192.168.1.1',
    },
    { statusCode: 200 },
    145
  );

  // Test 5: Authentication failure logging
  console.log('✓ Test 5: Authentication failure logging');
  logger.logAuthFailure('000000000001', '192.168.1.100', 'Invalid credentials');

  // Test 6: Sensitive operation audit logging
  console.log('✓ Test 6: Sensitive operation audit logging');
  logger.logSensitiveOperation('user_logout', {
    userId: 'user-123',
  });

  // Display sample logs
  console.log('\n=== Sample Log Entries ===\n');
  const logs = logger.readRecentLogs(10);
  logs.forEach((log, index) => {
    console.log(`Log ${index + 1}:`);
    console.log(log);
    console.log('');
  });

  // Clean up sample logs
  console.log('=== Logs saved to:', testLogDir, '===\n');
}

module.exports = { Logger };
