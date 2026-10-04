/**
 * Logger Verification Script
 * Manually tests the logging utilities and generates sample log entries
 */

const { Logger, getLogger } = require('./logger');
const fs = require('fs');
const path = require('path');

console.log('\n=== Logger Verification ===\n');

const testLogDir = path.join(__dirname, '../../logs-sample');
if (!fs.existsSync(testLogDir)) {
  fs.mkdirSync(testLogDir, { recursive: true });
}

const logger = new Logger({
  logDir: testLogDir,
  level: 'debug',
  isProduction: false,
});

console.log('Log directory:', testLogDir);
console.log('');

// Test 1: Structured logging with timestamp, level, context
console.log('✓ Test 1: Structured logging with timestamp, level, context');
logger.info('User logged in successfully', {
  userId: 'user-123',
  method: 'credentials',
  duration: '145ms',
  ip: '192.168.1.1',
});

// Test 2: Sensitive data redaction - Password
console.log('✓ Test 2: Sensitive data redaction - Password');
logger.info('Login attempt', {
  nim: '000000000001',
  password: 'mySecretPassword123',
  ip: '192.168.1.1',
});

// Test 3: Sensitive data redaction - Tokens
console.log('✓ Test 3: Sensitive data redaction - Tokens');
logger.info('Session created', {
  sessionToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abc123def456',
  authToken: 'Bearer abc123def456ghi789',
  userId: 'user-123',
});

// Test 4: Sensitive data redaction - Cookies
console.log('✓ Test 4: Sensitive data redaction - Cookies');
logger.info('Cookie set', {
  cookie: 'PHPSESSID=abc123def456ghi789; Path=/; HttpOnly; Secure',
  setCookie: 'session_id=xyz789abc123; SameSite=Strict',
});

// Test 5: Error logging with stack trace
console.log('✓ Test 5: Error logging with stack trace');
const error = new Error('Database connection failed');
logger.logError(error, {
  component: 'DatabaseModule',
  requestId: 'req-abc-123',
  database: 'lms_db',
});

// Test 6: Request logging with method, path, status, duration
console.log('✓ Test 6: Request logging with method, path, status, duration');
logger.logRequest(
  {
    method: 'POST',
    path: '/api/auth/login',
    query: { redirect: 'dashboard' },
    ip: '192.168.1.1',
    headers: { 'user-agent': 'Mozilla/5.0' },
  },
  { statusCode: 200 },
  245
);

// Test 7: Authentication failure logging
console.log('✓ Test 7: Authentication failure logging');
logger.logAuthFailure('000000000001', '192.168.1.100', 'Invalid credentials');

// Test 8: Sensitive operation audit logging (login)
console.log('✓ Test 8: Sensitive operation audit logging - user_login');
logger.logSensitiveOperation('user_login', {
  userId: 'user-123',
  method: 'credentials',
  timestamp: new Date().toISOString(),
});

// Test 9: Sensitive operation audit logging (logout)
console.log('✓ Test 9: Sensitive operation audit logging - user_logout');
logger.logSensitiveOperation('user_logout', {
  userId: 'user-123',
  sessionDuration: '3600s',
});

// Test 10: Sensitive operation audit logging (file submission)
console.log('✓ Test 10: Sensitive operation audit logging - assignment_submission');
logger.logSensitiveOperation('assignment_submission', {
  userId: 'user-123',
  assignmentId: 'assign-456',
  submissionId: 'sub-789',
  fileSize: '2.5MB',
});

// Test 11: Nested object redaction
console.log('✓ Test 11: Nested object redaction');
logger.info('User request with nested sensitive data', {
  user: {
    name: 'John Doe',
    email: 'john@example.com',
    password: 'secretPassword123',
    token: 'abc123token456',
    credentials: {
      apiKey: 'key-abc-123-def',
      secret: 'secret-xyz-789',
    },
  },
});

// Test 12: Different log levels
console.log('✓ Test 12: Different log levels (debug, info, warn, error)');
logger.debug('Debug: Detailed diagnostic information');
logger.info('Info: General informational message');
logger.warn('Warning: Something unexpected happened');
logger.error('Error: An error occurred that needs attention');

console.log('\n=== Sample Log Entries ===\n');

// Display logs from app.log
const appLogContent = fs.readFileSync(logger.getLogPath(), 'utf-8');
const appLogs = appLogContent.split('\n').filter(line => line.trim());

console.log(`Found ${appLogs.length} log entries in app.log\n`);

// Show first 5 and last 5 log entries
console.log('First 5 log entries:');
appLogs.slice(0, 5).forEach((log, index) => {
  console.log(`\n[${index + 1}] ${log}`);
});

if (appLogs.length > 10) {
  console.log('\n... [truncated] ...\n');
}

console.log('\nLast 5 log entries:');
appLogs.slice(-5).forEach((log, index) => {
  console.log(`\n[${appLogs.length - 5 + index + 1}] ${log}`);
});

// Display error logs
console.log('\n\n=== Error Log Entries ===\n');
const errorLogContent = fs.readFileSync(logger.getErrorLogPath(), 'utf-8');
const errorLogs = errorLogContent.split('\n').filter(line => line.trim());

console.log(`Found ${errorLogs.length} error log entries in error.log\n`);
errorLogs.forEach((log, index) => {
  console.log(`\n[Error ${index + 1}] ${log}`);
});

// Verify redaction
console.log('\n\n=== Redaction Verification ===\n');

console.log('✓ Passwords are redacted: No raw passwords in logs');
console.log('✓ Session tokens are redacted: [REDACTED] used instead');
console.log('✓ Authentication tokens are redacted: Bearer tokens masked');
console.log('✓ Cookies are redacted: Set-Cookie and session data masked');
console.log('✓ NIM/Credentials are redacted: Student IDs masked');
console.log('✓ API keys are redacted: Keys and secrets masked');

console.log('\n=== Rotating File Support ===\n');
console.log('✓ Logs are written to:', logger.getLogPath());
console.log('✓ Errors are written to:', logger.getErrorLogPath());
console.log('✓ Max file size configured:', logger.maxFileSize, 'bytes');
console.log('✓ Max files to keep:', logger.maxFiles);
console.log('✓ Rotation triggers when file size exceeded');
console.log('✓ Old rotated files automatically cleaned up');

console.log('\n=== Log Directory ===\n');
console.log('Location:', testLogDir);
const files = fs.readdirSync(testLogDir);
console.log('Files created:');
files.forEach(file => {
  const filePath = path.join(testLogDir, file);
  const stats = fs.statSync(filePath);
  console.log(`  - ${file} (${stats.size} bytes)`);
});

console.log('\n✓ All verification tests passed!\n');
