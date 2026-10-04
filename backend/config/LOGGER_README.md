# Logger Module Documentation

## Overview

The Logger module provides structured logging with rotating file support and automatic sensitive data redaction. It is designed to meet security and auditability requirements (Requirements 20.1, 20.2, 20.6).

## Features

### 1. Structured Logging
- **Timestamp**: ISO 8601 format (e.g., "2026-09-18T06:38:45.832Z")
- **Level**: Log level (DEBUG, INFO, WARN, ERROR)
- **Process ID**: Current process ID for distributed tracing
- **Request ID**: Unique identifier for request tracking
- **Context**: Additional contextual data

Example log entry:
```json
{
  "timestamp": "2026-09-18T06:38:45.832Z",
  "level": "INFO",
  "pid": 5408,
  "requestId": "abc123def456",
  "message": "User logged in successfully",
  "userId": "user-123",
  "method": "credentials",
  "duration": "145ms",
  "ip": "192.168.1.1"
}
```

### 2. Rotating File Support
- Automatic log rotation when file exceeds `maxFileSize` (default: 10 MB)
- Rotated files are named with timestamp: `app.2026-09-18T06-38-45.log`
- Automatic cleanup of old files (keeps only `maxFiles`, default: 5)
- Separate error log file (`error.log`)

Configuration:
```javascript
const { initLogger } = require('./config/logger');

initLogger({
  logDir: './logs',           // Log directory
  maxFileSize: 10 * 1024 * 1024,  // 10 MB
  maxFiles: 5,                // Keep 5 rotated files
  level: 'info',              // Log level: debug, info, warn, error
  isProduction: false,        // Production mode (less verbose)
});
```

### 3. Sensitive Data Redaction
**Requirement 20.6**: Automatically redacts sensitive data from logs.

Redacted fields:
- **Passwords**: `password`, `pwd`
- **Tokens**: `token`, `sessionToken`, `authToken`, `authorization` (Bearer)
- **Cookies**: `cookie`, `Set-Cookie`, `PHPSESSID`
- **Credentials**: `nim`, `credential`
- **API Keys**: `apiKey`, `secret`

Example - Before redaction (in memory):
```javascript
logger.info('Login attempt', {
  nim: '000000000001',
  password: 'mySecretPassword',
  sessionToken: 'abc123def456ghi789',
  cookie: 'PHPSESSID=xyz789'
});
```

Example - After redaction (in log file):
```json
{
  "message": "Login attempt",
  "nim": "[REDACTED]",
  "password": "[REDACTED]",
  "sessionToken": "[REDACTED]",
  "cookie": "[REDACTED]"
}
```

## Usage

### Basic Logging

```javascript
const { getLogger } = require('./config/logger');

const logger = getLogger();

// Info level
logger.info('User logged in', { userId: 'user-123' });

// Debug level (only in development)
logger.debug('Debug information', { data: 'value' });

// Warning level
logger.warn('Something unexpected', { issue: 'description' });

// Error level (written to error.log)
logger.error('An error occurred', { code: 'ERR_001' });
```

### Request Logging

```javascript
const duration = Date.now() - startTime;
logger.logRequest(req, res, duration);
```

Logs:
```json
{
  "timestamp": "2026-09-18T06:38:45.832Z",
  "level": "INFO",
  "message": "POST /api/auth/login - 200",
  "method": "POST",
  "path": "/api/auth/login",
  "query": { "redirect": "dashboard" },
  "statusCode": 200,
  "duration": "245ms",
  "ip": "192.168.1.1"
}
```

### Error Logging

```javascript
try {
  // Database operation
} catch (error) {
  logger.logError(error, {
    component: 'DatabaseModule',
    requestId: 'req-abc-123',
  });
}
```

Logs to `error.log`:
```json
{
  "timestamp": "2026-09-18T06:38:45.832Z",
  "level": "ERROR",
  "message": "Database connection failed",
  "component": "DatabaseModule",
  "requestId": "req-abc-123",
  "stack": "Error: Database connection failed\n    at dbConnect (db.js:45:10)..."
}
```

### Authentication Failure Logging

```javascript
logger.logAuthFailure(nim, ip, reason);
```

Logs:
```json
{
  "timestamp": "2026-09-18T06:38:45.832Z",
  "level": "WARN",
  "message": "Authentication failed",
  "nim": "[REDACTED]",
  "ip": "192.168.1.100",
  "reason": "Invalid credentials"
}
```

### Audit Logging for Sensitive Operations

```javascript
logger.logSensitiveOperation('user_login', {
  userId: 'user-123',
  method: 'credentials',
});

logger.logSensitiveOperation('assignment_submission', {
  userId: 'user-123',
  assignmentId: 'assign-456',
  submissionId: 'sub-789',
});
```

Logs:
```json
{
  "timestamp": "2026-09-18T06:38:45.832Z",
  "level": "INFO",
  "message": "Sensitive operation: user_login",
  "component": "Audit",
  "operation": "user_login",
  "userId": "user-123",
  "method": "credentials"
}
```

## Express Integration

### Middleware Setup

```javascript
const express = require('express');
const { initLogger } = require('./config/logger');
const requestLoggerMiddleware = require('./middleware/requestLogger');

const app = express();

// Initialize logger
initLogger({
  level: process.env.LOG_LEVEL || 'info',
  isProduction: process.env.NODE_ENV === 'production',
});

// Add request logging middleware
app.use(requestLoggerMiddleware());

// Your routes and other middleware here
```

## Log Levels

| Level | Use Case | Output |
|-------|----------|--------|
| **DEBUG** | Detailed diagnostic information | app.log only |
| **INFO** | General informational messages, request logs | app.log |
| **WARN** | Unexpected situations, recoverable errors | app.log |
| **ERROR** | Serious errors that require attention | error.log |

Configure log level:
```javascript
// Only log WARN and ERROR, skip DEBUG and INFO
initLogger({ level: 'warn' });
```

## Log Files

Logs are stored in the configured `logDir` (default: `./logs`):

```
logs/
├── app.log              # General application logs
├── error.log            # Error logs
├── app.2026-09-18T06-38-45.log   # Rotated log file
└── error.2026-09-18T06-38-45.log # Rotated error file
```

### File Rotation

When `app.log` exceeds `maxFileSize`:
1. `app.log` is renamed to `app.2026-09-18T06-38-45.log`
2. New `app.log` is created
3. Old rotated files are cleaned up (keeps only `maxFiles`)

## Production vs Development

### Development Mode (`isProduction: false`)
- Pretty-printed JSON with indentation
- Console output with color codes
- More verbose logging

### Production Mode (`isProduction: true`)
- Compact JSON (one line per log entry)
- No console output
- Only file logging
- All sensitive data redacted

## Security Considerations

1. **No Password Storage**: Passwords are never stored; they're redacted from logs
2. **No Token Leaks**: Session tokens and auth tokens are redacted
3. **No Cookie Exposure**: All cookies are redacted with `[REDACTED]`
4. **Request Tracking**: Request IDs enable end-to-end request tracing
5. **Audit Trail**: Sensitive operations are logged for audit purposes
6. **Stack Traces**: Error stacks are logged for debugging without exposing sensitive data

## Examples

### Example 1: Complete Authentication Flow

```javascript
const { getLogger } = require('./config/logger');
const logger = getLogger();

// User attempts login
logger.logAuthFailure('000000000001', '192.168.1.100', 'Invalid credentials');

// Successful login
logger.logSensitiveOperation('user_login', {
  userId: 'user-123',
  method: 'credentials',
  ip: '192.168.1.100',
});

// Session created
logger.info('Session created', {
  sessionId: 'sess-123',
  duration: '2 hours',
});

// User makes request
logger.logRequest(
  { method: 'GET', path: '/api/assignments', query: {} },
  { statusCode: 200 },
  145
);

// User logs out
logger.logSensitiveOperation('user_logout', {
  userId: 'user-123',
  sessionDuration: '3600s',
});
```

### Example 2: Error with Context

```javascript
try {
  await fetchAssignmentsFromLMS(cookies);
} catch (error) {
  logger.logError(error, {
    component: 'LMSProxy',
    requestId: req.id,
    userId: req.user.id,
    action: 'fetchAssignments',
  });

  res.status(503).json({
    error: 'Learning Management System is unavailable',
  });
}
```

### Example 3: Request Logging Middleware

```javascript
const requestLoggerMiddleware = require('./middleware/requestLogger');

app.use(requestLoggerMiddleware());

// All requests are automatically logged with:
// - Method, path, query parameters
// - Response status code
// - Request duration
// - Client IP
```

## Reading Logs

```javascript
const { getLogger } = require('./config/logger');
const logger = getLogger();

// Read last 50 log entries
const recentLogs = logger.readRecentLogs(50);
recentLogs.forEach(log => console.log(log));

// Clear all logs
logger.clearLogs();

// Get log file paths
console.log('App log:', logger.getLogPath());
console.log('Error log:', logger.getErrorLogPath());
```

## Monitoring and Debugging

### Monitor Login Attempts
```bash
grep "Authentication failed" logs/app.log | jq .
```

### Monitor Errors
```bash
tail -f logs/error.log | jq .
```

### Count Requests by Endpoint
```bash
grep "\"level\":\"INFO\"" logs/app.log | jq .path | sort | uniq -c
```

### Find Requests by Request ID
```bash
grep "abc123def456" logs/app.log | jq .
```

## Troubleshooting

### Logs Not Appearing
1. Check log directory exists: `logs/` or custom `logDir`
2. Verify log level: `logger.level` >= message level
3. Check file permissions: logs directory must be writable

### Large Log Files
1. Adjust `maxFileSize` to rotate more frequently
2. Increase `maxFiles` to keep more rotated files
3. Archive old logs regularly in production

### Performance Impact
1. Use `level: 'warn'` in production to reduce logging overhead
2. File I/O is blocking; consider buffered writes for high-traffic systems
3. Async logging can be added for non-blocking operations

## Requirements Coverage

This logger module fulfills the following requirements:

- **20.1**: Request logging with method, path, query params, response status, timestamp
- **20.2**: Error logging with stack trace, component, request ID
- **20.6**: Automatic redaction of passwords, tokens, cookies, NIM
