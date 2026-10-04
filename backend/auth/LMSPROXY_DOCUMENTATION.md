# LMS Proxy Documentation

## Overview

The `LMSProxy` class is responsible for authenticating with the Learning Management System (LMS) at `https://lms.itmnganjuk.ac.id` and proxying authenticated requests to fetch assignments, courses, and handle submissions.

**File:** `backend/auth/lmsProxy.js`

## Requirements Implemented

- **Requirement 1.7**: Forward credentials via HTTPS only to LMS authentication endpoint
- **Requirement 10.3**: Verify LMS SSL certificate and reject invalid certificates (HTTPS-only enforcement)
- **Requirement 10.7**: Include sessionToken in Authorization header as Bearer token format
- **Requirement 15.1**: Extract Set-Cookie headers from LMS response and store in Map
- **Requirement 15.2**: Include all stored LMS cookies in request headers for authenticated requests

## Key Features

### 1. HTTPS-Only Enforcement (Requirement 10.3)

The proxy enforces HTTPS-only connections to the LMS:

```javascript
const proxy = new LMSProxy('https://lms.itmnganjuk.ac.id');
// ✓ Accepted

new LMSProxy('http://lms.itmnganjuk.ac.id');
// ✗ Throws: "LMS proxy requires HTTPS connection only"
```

- All LMS communication must use HTTPS protocol
- HTTP URLs are rejected during initialization
- SSL certificates are verified by default

### 2. SSL Certificate Verification

An HTTPS agent is created with certificate verification enabled:

```javascript
this.httpsAgent = new https.Agent({
  rejectUnauthorized: true,  // Verify SSL certificates
  keepAlive: true,
  timeout: 30000,
});
```

- Invalid/expired certificates are rejected
- Certificate pinning can be added if needed
- Self-signed certificates can be disabled for testing (not recommended for production)

### 3. Cookie Extraction from Set-Cookie Headers (Requirement 15.1)

When authenticating, the LMS returns Set-Cookie headers that are parsed and stored:

```javascript
// Input: Set-Cookie headers from LMS response
const setCookies = [
  'PHPSESSID=abc123def456; Path=/; HttpOnly; Secure',
  'MOODLEID_=ghi789jkl012; Path=/; Domain=.lms.itmnganjuk.ac.id',
];

// Output: Map of cookie names to values
const cookies = proxy._parseCookies(setCookies);
// Map {
//   'PHPSESSID' => 'abc123def456',
//   'MOODLEID_' => 'ghi789jkl012'
// }
```

**Implementation Details:**
- Parses each Set-Cookie header by splitting on `;`
- Extracts cookie name and value from the first part
- Handles both single string and array of strings
- Skips malformed entries gracefully
- Returns a `Map<string, string>` for O(1) lookup

### 4. Cookie Injection in Requests (Requirement 15.2)

Cookies are included in the Cookie header for subsequent authenticated requests:

```javascript
// Build Cookie header from Map
const cookieHeader = proxy._buildCookieHeader(cookies);
// "PHPSESSID=abc123def456; MOODLEID_=ghi789jkl012"

// Used in request headers
const response = await this.client.get(url, {
  headers: {
    'Cookie': cookieHeader,
    'User-Agent': 'LMS-UI-Remake/1.0',
  },
});
```

**Benefits:**
- All cookies are included in every authenticated request
- Maintains session state with the LMS
- Preserves HttpOnly cookies securely on the server side

### 5. Authentication Flow

#### Step 1: Initialize Proxy

```javascript
const proxy = new LMSProxy('https://lms.itmnganjuk.ac.id', true);
```

#### Step 2: Authenticate with Credentials

```javascript
const result = await proxy.authenticate('000000000001', 'password');

if (result.success) {
  console.log('Cookies:', result.cookies);
  console.log('User:', result.user);
} else {
  console.log('Error:', result.error);
}
```

**Response Structure:**

```javascript
{
  success: boolean,
  cookies?: Map<string, string>,  // From Set-Cookie headers
  user?: {
    nim: string,
  },
  error?: string,
}
```

#### Step 3: Use Cookies for Subsequent Requests

```javascript
// Fetch assignments
const assignResult = await proxy.fetchAssignments(result.cookies);

// Fetch courses
const courseResult = await proxy.fetchCourses(result.cookies);

// Fetch assignment detail
const detailResult = await proxy.fetchAssignmentDetail('12345', result.cookies);
```

## API Reference

### Constructor

```javascript
new LMSProxy(baseUrl = 'https://lms.itmnganjuk.ac.id', rejectUnauthorized = true)
```

**Parameters:**
- `baseUrl`: Base URL of the LMS (must be HTTPS)
- `rejectUnauthorized`: Whether to verify SSL certificates (default: true)

**Throws:** Error if URL is not HTTPS or invalid format

### Methods

#### `authenticate(nim: string, password: string): Promise<AuthResult>`

Authenticates with the LMS using NIM and password.

**Parameters:**
- `nim`: Student ID number
- `password`: Student password

**Returns:**
```javascript
{
  success: boolean,
  cookies?: Map<string, string>,
  user?: { nim: string },
  error?: string,
}
```

**Error Handling:**
- Returns `{ success: false }` for invalid credentials
- Logs and returns specific errors for SSL, timeout, connection issues
- Does not throw exceptions

#### `fetchAssignments(lmsCookies: Map<string, string>): Promise<FetchResult>`

Fetches assignments from the LMS.

**Parameters:**
- `lmsCookies`: Map of cookies from authentication

**Returns:**
```javascript
{
  success: boolean,
  html?: string,          // HTML response from LMS
  error?: string,
}
```

#### `fetchCourses(lmsCookies: Map<string, string>): Promise<FetchResult>`

Fetches courses from the LMS.

**Parameters:**
- `lmsCookies`: Map of cookies from authentication

**Returns:** Same as `fetchAssignments`

#### `fetchAssignmentDetail(assignmentId: string, lmsCookies: Map<string, string>): Promise<FetchResult>`

Fetches detailed information about a specific assignment.

**Parameters:**
- `assignmentId`: ID of the assignment
- `lmsCookies`: Map of cookies from authentication

**Returns:** Same as `fetchAssignments`

#### `submitAssignment(assignmentId: string, formData: FormData, lmsCookies: Map<string, string>): Promise<SubmissionResult>`

Submits an assignment to the LMS.

**Parameters:**
- `assignmentId`: ID of the assignment
- `formData`: Submission data (file or text)
- `lmsCookies`: Map of cookies from authentication

**Returns:**
```javascript
{
  success: boolean,
  submissionId?: string,
  error?: string,
}
```

#### `verifyConnection(): Promise<VerifyResult>`

Verifies that the LMS is reachable and SSL certificate is valid.

**Returns:**
```javascript
{
  success: boolean,
  error?: string,
}
```

#### `getBaseUrl(): string`

Returns the base URL of the LMS.

#### `destroy(): void`

Cleans up resources (HTTPS agent, etc.). Call when done with the proxy.

## Error Handling

The proxy handles various error scenarios:

### SSL Certificate Errors

```javascript
// Invalid/expired certificate
if (err.code === 'CERT_HAS_EXPIRED' ||
    err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
  return { success: false, error: 'LMS SSL certificate error' };
}
```

### Network Errors

```javascript
// Connection timeout
if (err.code === 'ERR_HTTP_REQUEST_TIMEOUT') {
  return { success: false, error: 'LMS authentication timeout' };
}

// Connection refused
if (err.code === 'ECONNREFUSED') {
  return { success: false, error: 'Cannot reach LMS' };
}
```

### Invalid Credentials

```javascript
// Status 401 or error indicators in response
if (response.status === 401 || !isSuccessful) {
  return { success: false, error: 'Invalid credentials or authentication failed' };
}
```

## Security Considerations

### 1. HTTPS Enforcement

- All connections to the LMS must use HTTPS
- HTTP requests are rejected
- This prevents credential interception

### 2. SSL Certificate Verification

- By default, SSL certificates are verified
- Invalid/expired certificates are rejected
- Protects against man-in-the-middle attacks

### 3. Secure Cookie Handling

- HttpOnly cookies are stored server-side only
- Not accessible from JavaScript
- Cookies are included in all authenticated requests
- No cookies are sent to the frontend

### 4. Password Management

- Passwords are NEVER stored
- Only transmitted during initial authentication
- Credentials are not logged (redacted by logger)

### 5. Timeout Protection

- 30-second request timeout
- Prevents hanging connections
- Detects unresponsive LMS

## Testing

### Manual Tests

Run the manual test suite:

```bash
node backend/auth/lmsProxy.manual-test.js
```

Tests:
1. HTTPS-only enforcement
2. HTTPS URL acceptance
3. Cookie extraction from Set-Cookie headers
4. Cookie injection in requests
5. HTTPS Agent with SSL verification
6. Empty/null cookie handling
7. Malformed cookie handling
8. URL normalization
9. Invalid URL handling
10. Single Set-Cookie header parsing

### Integration Tests

Run the integration test demonstrating full authentication flow:

```bash
node backend/auth/lmsProxy.integration-test.js
```

Tests:
1. Proxy initialization with HTTPS enforcement
2. Authentication with valid credentials
3. Cookie extraction and validation
4. Using cookies for subsequent requests (assignments, courses)
5. Invalid credentials rejection
6. HTTP enforcement

## Usage Example

```javascript
const LMSProxy = require('./backend/auth/lmsProxy');

// Initialize
const proxy = new LMSProxy('https://lms.itmnganjuk.ac.id', true);

// Authenticate
const authResult = await proxy.authenticate('000000000001', 'mypassword');

if (authResult.success) {
  // Store cookies in session (for backend)
  session.lmsCookies = authResult.cookies;

  // Fetch assignments for this user
  const assignResult = await proxy.fetchAssignments(authResult.cookies);

  if (assignResult.success) {
    // Parse HTML and extract assignment data
    const assignments = parseAssignments(assignResult.html);
    return { success: true, assignments };
  }
} else {
  return { success: false, error: authResult.error };
}
```

## Integration with Backend

### Session Manager Integration

Cookies from LMS authentication are stored in the session:

```javascript
// In AuthController.login()
const lmsResult = await lmsProxy.authenticate(nim, password);

if (lmsResult.success) {
  const sessionToken = sessionManager.createSession(
    nim,
    lmsResult.cookies  // Store LMS cookies in session
  );
}
```

### Request Middleware

Cookies are retrieved from session for authenticated requests:

```javascript
// In middleware
const session = sessionManager.getSession(sessionToken);
const lmsCookies = session.lmsCookies;

// Use cookies for LMS requests
const result = await lmsProxy.fetchAssignments(lmsCookies);
```

## Logging

All operations are logged with sensitive data redacted:

```javascript
logger.info('LMS authentication attempt', { nim });
logger.debug('Cookie extracted', { cookieName, valueLength });
logger.warn('Authentication failed', { nim, reason });
logger.error('LMS connection error', { error });
```

See `backend/config/logger.js` for logging configuration.

## Performance

- Request timeout: 30 seconds
- HTTPS agent keepAlive: enabled for connection reuse
- Cookie lookup: O(1) using Map data structure
- Memory: Minimal (only stores cookies needed for current request)

## Future Enhancements

1. **Certificate Pinning**: Pin specific certificates for extra security
2. **Cookie Refresh**: Automatically refresh expired cookies
3. **Request Caching**: Cache responses from LMS to reduce requests
4. **Retry Logic**: Automatic retries with exponential backoff
5. **Circuit Breaker**: Fail fast if LMS is unavailable

## Troubleshooting

### "LMS proxy requires HTTPS connection only"

**Problem:** Attempting to use HTTP URL
**Solution:** Use HTTPS URL (e.g., `https://lms.itmnganjuk.ac.id`)

### "SSL certificate verification failed"

**Problem:** LMS has invalid/expired certificate
**Solution:**
- For development: Pass `false` to `rejectUnauthorized` parameter
- For production: Update LMS certificate or infrastructure

### "Authentication failed"

**Problem:** Invalid credentials
**Solution:** Verify NIM and password are correct

### "Cannot reach LMS"

**Problem:** LMS is unavailable or network issue
**Solution:** Check LMS status, network connectivity, firewall rules

## References

- [RFC 6265 - HTTP State Management Mechanism (Cookies)](https://tools.ietf.org/html/rfc6265)
- [OWASP - Session Management](https://owasp.org/www-community/attacks/Session_fixation)
- [Node.js HTTPS Agent Documentation](https://nodejs.org/api/https.html#https_class_https_agent)
- [Axios Documentation](https://axios-http.com/)
