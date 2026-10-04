/**
 * Tests for LMSProxy
 *
 * Tests cover:
 * - Authentication flow with sample credentials
 * - Cookie extraction from Set-Cookie headers
 * - HTTPS-only enforcement
 * - SSL certificate verification
 * - Cookie injection in subsequent requests
 *
 * Requirements: 1.7, 10.3, 10.7, 15.1, 15.2
 */

const LMSProxy = require('./lmsProxy');
const axios = require('axios');
const https = require('https');

// Mock axios for testing
jest.mock('axios');

describe('LMSProxy', () => {
  let lmsProxy;
  const mockBaseUrl = 'https://lms.itmnganjuk.ac.id';

  beforeEach(() => {
    jest.clearAllMocks();
    // Create LMSProxy instance
    lmsProxy = new LMSProxy(mockBaseUrl, true);
  });

  afterEach(() => {
    if (lmsProxy) {
      lmsProxy.destroy();
    }
  });

  describe('Constructor', () => {
    it('should initialize with HTTPS URL', () => {
      const proxy = new LMSProxy('https://lms.itmnganjuk.ac.id');
      expect(proxy.getBaseUrl()).toBe('https://lms.itmnganjuk.ac.id');
    });

    it('should enforce HTTPS-only requirement (Requirement 10.3)', () => {
      expect(() => {
        new LMSProxy('http://lms.itmnganjuk.ac.id');
      }).toThrow('LMS proxy requires HTTPS connection only');
    });

    it('should remove trailing slash from baseUrl', () => {
      const proxy = new LMSProxy('https://lms.itmnganjuk.ac.id/');
      expect(proxy.getBaseUrl()).toBe('https://lms.itmnganjuk.ac.id');
    });

    it('should create HTTPS agent with SSL verification', () => {
      const proxy = new LMSProxy('https://lms.itmnganjuk.ac.id', true);
      expect(proxy.httpsAgent).toBeDefined();
      expect(proxy.httpsAgent.options.rejectUnauthorized).toBe(true);
    });

    it('should throw error for invalid URL format', () => {
      expect(() => {
        new LMSProxy('not-a-valid-url');
      }).toThrow('Invalid LMS base URL');
    });
  });

  describe('_parseCookies', () => {
    it('should parse single Set-Cookie header (Requirement 15.1)', () => {
      const setCookie = 'PHPSESSID=abc123def456; Path=/; HttpOnly; Secure';
      const cookies = lmsProxy._parseCookies(setCookie);

      expect(cookies.size).toBe(1);
      expect(cookies.get('PHPSESSID')).toBe('abc123def456');
    });

    it('should parse multiple Set-Cookie headers as array (Requirement 15.1)', () => {
      const setCookies = [
        'PHPSESSID=abc123; Path=/; HttpOnly',
        'MOODLEID_=def456; Path=/; Secure',
        'sessionToken=ghi789; Path=/',
      ];

      const cookies = lmsProxy._parseCookies(setCookies);

      expect(cookies.size).toBe(3);
      expect(cookies.get('PHPSESSID')).toBe('abc123');
      expect(cookies.get('MOODLEID_')).toBe('def456');
      expect(cookies.get('sessionToken')).toBe('ghi789');
    });

    it('should handle empty or null Set-Cookie header', () => {
      const cookies1 = lmsProxy._parseCookies(null);
      const cookies2 = lmsProxy._parseCookies(undefined);
      const cookies3 = lmsProxy._parseCookies('');

      expect(cookies1.size).toBe(0);
      expect(cookies2.size).toBe(0);
      expect(cookies3.size).toBe(0);
    });

    it('should parse cookies with various attribute formats', () => {
      const setCookie = 'PHPSESSID=xyz789; Domain=.lms.itmnganjuk.ac.id; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax';
      const cookies = lmsProxy._parseCookies(setCookie);

      expect(cookies.get('PHPSESSID')).toBe('xyz789');
    });

    it('should skip malformed cookie entries', () => {
      const setCookies = [
        'PHPSESSID=valid123',
        'invalid_no_equals',
        'MOODLEID_=def456',
      ];

      const cookies = lmsProxy._parseCookies(setCookies);

      expect(cookies.size).toBe(2);
      expect(cookies.get('PHPSESSID')).toBe('valid123');
      expect(cookies.get('MOODLEID_')).toBe('def456');
    });
  });

  describe('_buildCookieHeader', () => {
    it('should build Cookie header from Map (Requirement 15.2)', () => {
      const cookies = new Map([
        ['PHPSESSID', 'abc123'],
        ['MOODLEID_', 'def456'],
      ]);

      const header = lmsProxy._buildCookieHeader(cookies);

      expect(header).toContain('PHPSESSID=abc123');
      expect(header).toContain('MOODLEID_=def456');
      expect(header).toContain('; ');
    });

    it('should return empty string for empty Map', () => {
      const cookies = new Map();
      const header = lmsProxy._buildCookieHeader(cookies);

      expect(header).toBe('');
    });

    it('should return empty string for null or undefined', () => {
      const header1 = lmsProxy._buildCookieHeader(null);
      const header2 = lmsProxy._buildCookieHeader(undefined);

      expect(header1).toBe('');
      expect(header2).toBe('');
    });

    it('should maintain cookie order', () => {
      const cookies = new Map([
        ['cookie1', 'value1'],
        ['cookie2', 'value2'],
        ['cookie3', 'value3'],
      ]);

      const header = lmsProxy._buildCookieHeader(cookies);

      expect(header).toBe('cookie1=value1; cookie2=value2; cookie3=value3');
    });
  });

  describe('authenticate', () => {
    it('should successfully authenticate with valid credentials (Requirement 1.7)', async () => {
      const mockResponse = {
        status: 200,
        headers: {
          'set-cookie': ['PHPSESSID=abc123def456; Path=/; HttpOnly; Secure'],
        },
        data: '<html><body>Dashboard</body></html>',
        request: { path: '/login/index.php' },
      };

      axios.create.mockReturnValue({
        post: jest.fn().mockResolvedValue(mockResponse),
      });

      lmsProxy = new LMSProxy(mockBaseUrl, true);

      const result = await lmsProxy.authenticate('000000000001', 'testpassword');

      expect(result.success).toBe(true);
      expect(result.cookies.size).toBe(1);
      expect(result.cookies.get('PHPSESSID')).toBe('abc123def456');
      expect(result.user.nim).toBe('000000000001');
    });

    it('should reject HTTP URL in authenticate (enforces HTTPS - Requirement 10.3)', () => {
      expect(() => {
        new LMSProxy('http://lms.itmnganjuk.ac.id');
      }).toThrow('HTTPS connection only');
    });

    it('should validate NIM is non-empty', async () => {
      const result = await lmsProxy.authenticate('', 'password');

      expect(result.success).toBe(false);
      expect(result.error).toContain('NIM is required');
    });

    it('should validate password is non-empty', async () => {
      const result = await lmsProxy.authenticate('000000000001', '');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Password is required');
    });

    it('should return error on invalid credentials', async () => {
      const mockResponse = {
        status: 401,
        headers: { 'set-cookie': [] },
        data: '<html><body>Invalid login</body></html>',
        request: { path: '/login/index.php' },
      };

      axios.create.mockReturnValue({
        post: jest.fn().mockResolvedValue(mockResponse),
      });

      lmsProxy = new LMSProxy(mockBaseUrl, true);

      const result = await lmsProxy.authenticate('000000000001', 'wrongpassword');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid credentials');
    });

    it('should handle SSL certificate errors (Requirement 10.3)', async () => {
      const mockError = new Error('Certificate verification failed');
      mockError.code = 'UNABLE_TO_VERIFY_LEAF_SIGNATURE';

      axios.create.mockReturnValue({
        post: jest.fn().mockRejectedValue(mockError),
      });

      lmsProxy = new LMSProxy(mockBaseUrl, true);

      const result = await lmsProxy.authenticate('000000000001', 'password');

      expect(result.success).toBe(false);
      expect(result.error).toContain('SSL certificate verification failed');
    });

    it('should handle connection timeout errors', async () => {
      const mockError = new Error('Request timeout');
      mockError.code = 'ERR_HTTP_REQUEST_TIMEOUT';

      axios.create.mockReturnValue({
        post: jest.fn().mockRejectedValue(mockError),
      });

      lmsProxy = new LMSProxy(mockBaseUrl, true);

      const result = await lmsProxy.authenticate('000000000001', 'password');

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should handle connection refused errors', async () => {
      const mockError = new Error('Connection refused');
      mockError.code = 'ECONNREFUSED';

      axios.create.mockReturnValue({
        post: jest.fn().mockRejectedValue(mockError),
      });

      lmsProxy = new LMSProxy(mockBaseUrl, true);

      const result = await lmsProxy.authenticate('000000000001', 'password');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot reach LMS');
    });

    it('should extract multiple cookies from Set-Cookie headers', async () => {
      const mockResponse = {
        status: 200,
        headers: {
          'set-cookie': [
            'PHPSESSID=abc123; Path=/; HttpOnly',
            'MOODLEID_=def456; Path=/; Secure',
          ],
        },
        data: '<html><body>Dashboard</body></html>',
        request: { path: '/login/index.php' },
      };

      axios.create.mockReturnValue({
        post: jest.fn().mockResolvedValue(mockResponse),
      });

      lmsProxy = new LMSProxy(mockBaseUrl, true);

      const result = await lmsProxy.authenticate('000000000001', 'password');

      expect(result.success).toBe(true);
      expect(result.cookies.size).toBe(2);
      expect(result.cookies.get('PHPSESSID')).toBe('abc123');
      expect(result.cookies.get('MOODLEID_')).toBe('def456');
    });
  });

  describe('fetchAssignments', () => {
    it('should fetch assignments with LMS cookies (Requirement 15.2)', async () => {
      const cookies = new Map([
        ['PHPSESSID', 'abc123'],
      ]);

      const mockResponse = {
        status: 200,
        data: '<html><body>Assignment list</body></html>',
      };

      axios.create.mockReturnValue({
        get: jest.fn().mockResolvedValue(mockResponse),
      });

      lmsProxy = new LMSProxy(mockBaseUrl, true);

      const result = await lmsProxy.fetchAssignments(cookies);

      expect(result.success).toBe(true);
      expect(result.html).toContain('Assignment list');
    });

    it('should reject request without cookies', async () => {
      const result = await lmsProxy.fetchAssignments(null);

      expect(result.success).toBe(false);
      expect(result.error).toContain('cookies required');
    });

    it('should handle 401 Unauthorized response', async () => {
      const cookies = new Map([
        ['PHPSESSID', 'expired123'],
      ]);

      const mockResponse = {
        status: 401,
        data: 'Unauthorized',
      };

      axios.create.mockReturnValue({
        get: jest.fn().mockResolvedValue(mockResponse),
      });

      lmsProxy = new LMSProxy(mockBaseUrl, true);

      const result = await lmsProxy.fetchAssignments(cookies);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication expired');
    });
  });

  describe('fetchCourses', () => {
    it('should fetch courses with LMS cookies (Requirement 15.2)', async () => {
      const cookies = new Map([
        ['PHPSESSID', 'abc123'],
      ]);

      const mockResponse = {
        status: 200,
        data: '<html><body>Course list</body></html>',
      };

      axios.create.mockReturnValue({
        get: jest.fn().mockResolvedValue(mockResponse),
      });

      lmsProxy = new LMSProxy(mockBaseUrl, true);

      const result = await lmsProxy.fetchCourses(cookies);

      expect(result.success).toBe(true);
      expect(result.html).toContain('Course list');
    });

    it('should reject request without cookies', async () => {
      const result = await lmsProxy.fetchCourses(new Map());

      expect(result.success).toBe(false);
      expect(result.error).toContain('cookies required');
    });
  });

  describe('fetchAssignmentDetail', () => {
    it('should fetch assignment detail with cookies', async () => {
      const cookies = new Map([
        ['PHPSESSID', 'abc123'],
      ]);

      const mockResponse = {
        status: 200,
        data: '<html><body>Assignment details</body></html>',
      };

      axios.create.mockReturnValue({
        get: jest.fn().mockResolvedValue(mockResponse),
      });

      lmsProxy = new LMSProxy(mockBaseUrl, true);

      const result = await lmsProxy.fetchAssignmentDetail('12345', cookies);

      expect(result.success).toBe(true);
      expect(result.html).toContain('Assignment details');
    });

    it('should validate assignment ID is provided', async () => {
      const cookies = new Map([
        ['PHPSESSID', 'abc123'],
      ]);

      const result = await lmsProxy.fetchAssignmentDetail(null, cookies);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid assignment ID');
    });
  });

  describe('SSL Certificate Verification', () => {
    it('should create HTTPS agent with certificate verification enabled', () => {
      const proxy = new LMSProxy(mockBaseUrl, true);

      expect(proxy.httpsAgent.options.rejectUnauthorized).toBe(true);
    });

    it('should allow disabling certificate verification for testing', () => {
      const proxy = new LMSProxy(mockBaseUrl, false);

      expect(proxy.httpsAgent.options.rejectUnauthorized).toBe(false);
    });

    it('should verify connection to LMS', async () => {
      const mockResponse = {
        status: 200,
        data: '<html><body>Login page</body></html>',
      };

      axios.create.mockReturnValue({
        get: jest.fn().mockResolvedValue(mockResponse),
      });

      lmsProxy = new LMSProxy(mockBaseUrl, true);

      const result = await lmsProxy.verifyConnection();

      expect(result.success).toBe(true);
    });

    it('should handle SSL verification failures (Requirement 10.3)', async () => {
      const mockError = new Error('SSL certificate verification failed');
      mockError.code = 'CERT_HAS_EXPIRED';

      axios.create.mockReturnValue({
        get: jest.fn().mockRejectedValue(mockError),
      });

      lmsProxy = new LMSProxy(mockBaseUrl, true);

      const result = await lmsProxy.verifyConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('SSL certificate');
    });
  });

  describe('Cookie Injection in Requests', () => {
    it('should include all cookies in Cookie header for requests (Requirement 15.2)', async () => {
      const cookies = new Map([
        ['PHPSESSID', 'session123'],
        ['MOODLEID_', 'moodle456'],
      ]);

      const cookieHeader = lmsProxy._buildCookieHeader(cookies);

      expect(cookieHeader).toBe('PHPSESSID=session123; MOODLEID_=moodle456');
    });

    it('should preserve cookie order in request headers', async () => {
      const cookies = new Map([
        ['cookie1', 'value1'],
        ['cookie2', 'value2'],
        ['cookie3', 'value3'],
      ]);

      const cookieHeader = lmsProxy._buildCookieHeader(cookies);
      const parts = cookieHeader.split('; ');

      expect(parts).toEqual([
        'cookie1=value1',
        'cookie2=value2',
        'cookie3=value3',
      ]);
    });
  });

  describe('HTTPS Enforcement', () => {
    it('should enforce HTTPS for LMS base URL (Requirement 10.3)', () => {
      expect(() => {
        new LMSProxy('http://lms.itmnganjuk.ac.id', true);
      }).toThrow();
    });

    it('should accept HTTPS URLs', () => {
      expect(() => {
        new LMSProxy('https://lms.itmnganjuk.ac.id', true);
      }).not.toThrow();
    });
  });

  describe('Authentication Flow Integration', () => {
    it('should complete full authentication flow with cookie extraction', async () => {
      const mockAuthResponse = {
        status: 200,
        headers: {
          'set-cookie': [
            'PHPSESSID=auth123; Path=/; HttpOnly',
            'MOODLEID_=moodle456; Path=/',
          ],
        },
        data: '<html><body>Dashboard Welcome</body></html>',
        request: { path: '/login/index.php' },
      };

      const mockAssignmentsResponse = {
        status: 200,
        data: '<html><body>Your assignments</body></html>',
      };

      const mockClient = {
        post: jest.fn().mockResolvedValue(mockAuthResponse),
        get: jest.fn().mockResolvedValue(mockAssignmentsResponse),
      };

      axios.create.mockReturnValue(mockClient);

      lmsProxy = new LMSProxy(mockBaseUrl, true);

      // Step 1: Authenticate
      const authResult = await lmsProxy.authenticate('000000000001', 'password');

      expect(authResult.success).toBe(true);
      expect(authResult.cookies.size).toBe(2);

      // Step 2: Fetch assignments with extracted cookies
      const assignResult = await lmsProxy.fetchAssignments(authResult.cookies);

      expect(assignResult.success).toBe(true);
      expect(mockClient.get).toHaveBeenCalled();

      // Verify cookies were included in the get request
      const getCallArgs = mockClient.get.mock.calls[0];
      expect(getCallArgs[1].headers.Cookie).toContain('PHPSESSID=auth123');
      expect(getCallArgs[1].headers.Cookie).toContain('MOODLEID_=moodle456');
    });
  });

  describe('submitAssignment', () => {
    it('should submit assignment with cookies', async () => {
      const cookies = new Map([
        ['PHPSESSID', 'abc123'],
      ]);

      const formData = { assignmentId: '123', submissionText: 'My submission' };

      const mockResponse = {
        status: 200,
        data: 'Submission successful',
      };

      axios.create.mockReturnValue({
        post: jest.fn().mockResolvedValue(mockResponse),
      });

      lmsProxy = new LMSProxy(mockBaseUrl, true);

      const result = await lmsProxy.submitAssignment('123', formData, cookies);

      expect(result.success).toBe(true);
      expect(result.submissionId).toBeDefined();
    });

    it('should validate submission parameters', async () => {
      const result = await lmsProxy.submitAssignment(null, null, null);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid submission parameters');
    });
  });
});
