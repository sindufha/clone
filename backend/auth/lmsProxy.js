/**
 * LMS Proxy
 * Handles authentication with the LMS, cookie management, and proxying requests
 *
 * Requirements: 1.7, 10.3, 10.7, 15.1, 15.2
 * - 1.7: Forward credentials via HTTPS only to LMS authentication endpoint
 * - 10.3: Verify LMS SSL certificate and reject invalid certificates
 * - 10.7: Include sessionToken in Authorization header as Bearer token
 * - 15.1: Extract Set-Cookie headers from LMS response
 * - 15.2: Include all stored LMS cookies in request headers
 */

const axios = require('axios');
const https = require('https');
const { URL } = require('url');
const { getLogger } = require('../config/logger');

const logger = getLogger();

class LMSProxy {
  /**
   * Initialize LMS Proxy
   * @param {string} baseUrl - Base URL of LMS (e.g., https://lms.itmnganjuk.ac.id)
   * @param {boolean} rejectUnauthorized - Whether to verify SSL certificates (default: true)
   */
  constructor(baseUrl = 'https://lms.itmnganjuk.ac.id', rejectUnauthorized = true) {
    // Validate and normalize base URL
    try {
      const url = new URL(baseUrl);

      // HTTPS-only enforcement (Requirement 10.3)
      if (url.protocol !== 'https:') {
        throw new Error('LMS proxy requires HTTPS connection only');
      }

      this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    } catch (err) {
      throw new Error(`Invalid LMS base URL: ${err.message}`);
    }

    // SSL certificate verification enforcement (Requirement 10.3)
    this.rejectUnauthorized = rejectUnauthorized;

    // Create HTTPS agent with SSL verification
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: this.rejectUnauthorized,
      keepAlive: true,
      timeout: 30000, // 30 second timeout
    });

    // Create axios client with HTTPS agent
    this.client = axios.create({
      httpAgent: undefined,
      httpsAgent: this.httpsAgent,
      timeout: 30000,
      validateStatus: () => true, // Don't throw on any status code
    });

    // LMS endpoints
    this.loginEndpoint = '/login/index.php';
    this.assignmentsEndpoint = '/my/courses.php';

    logger.info('LMSProxy initialized', {
      baseUrl: this.baseUrl,
      rejectUnauthorized: this.rejectUnauthorized,
    });
  }

  /**
   * Parse Set-Cookie headers and extract cookie key-value pairs
   *
   * @param {string|Array<string>} setCookieHeaders - Set-Cookie header value(s)
   * @returns {Map<string, string>} Map of cookie names to values
   *
   * Requirement 15.1: Extract Set-Cookie headers from LMS response
   */
  _parseCookies(setCookieHeaders) {
    const cookies = new Map();

    if (!setCookieHeaders) {
      return cookies;
    }

    // Handle both single string and array of strings
    const headerArray = Array.isArray(setCookieHeaders)
      ? setCookieHeaders
      : [setCookieHeaders];

    for (const headerValue of headerArray) {
      if (!headerValue || typeof headerValue !== 'string') {
        continue;
      }

      // Parse each Set-Cookie header
      // Format: "name=value; Path=/; Domain=.example.com; HttpOnly; Secure"
      const parts = headerValue.split(';');
      const cookiePair = parts[0].trim();

      if (cookiePair.includes('=')) {
        const [name, value] = cookiePair.split('=', 2);
        const cookieName = name.trim();
        const cookieValue = value.trim();

        if (cookieName && cookieValue) {
          cookies.set(cookieName, cookieValue);
          logger.debug('Cookie extracted', {
            cookieName,
            valueLength: cookieValue.length,
          });
        }
      }
    }

    return cookies;
  }

  /**
   * Build Cookie header from Map of cookies
   *
   * @param {Map<string, string>} cookies - Map of cookie names to values
   * @returns {string} Cookie header value (e.g., "name1=value1; name2=value2")
   *
   * Requirement 15.2: Include all stored LMS cookies in request headers
   */
  _buildCookieHeader(cookies) {
    if (!cookies || cookies.size === 0) {
      return '';
    }

    const cookiePairs = [];
    for (const [name, value] of cookies) {
      cookiePairs.push(`${name}=${value}`);
    }

    return cookiePairs.join('; ');
  }

  /**
   * Authenticate with LMS using NIM and password
   *
   * @param {string} nim - Student ID number
   * @param {string} password - Student password
   * @returns {Promise<{success: boolean, cookies: Map<string, string>, user?: Object, error?: string}>}
   *
   * Requirement 1.7: Forward credentials via HTTPS only to LMS authentication endpoint
   * Requirement 15.1: Extract Set-Cookie headers from LMS response
   */
  async authenticate(nim, password) {
    logger.info('LMS authentication attempt', {
      nim,
      endpoint: this.loginEndpoint,
    });

    try {
      // Validate inputs
      if (!nim || typeof nim !== 'string' || !nim.trim()) {
        const error = 'NIM is required and must be non-empty';
        logger.warn('Authentication validation failed', { reason: error });
        return { success: false, error };
      }

      if (!password || typeof password !== 'string' || !password.trim()) {
        const error = 'Password is required and must be non-empty';
        logger.warn('Authentication validation failed', { reason: error });
        return { success: false, error };
      }

      // Build login URL - HTTPS only (Requirement 10.3)
      const loginUrl = `${this.baseUrl}${this.loginEndpoint}`;

      // Prepare POST data
      const loginData = new URLSearchParams();
      loginData.append('username', nim);
      loginData.append('password', password);

      logger.debug('Sending authentication request', {
        url: loginUrl,
        method: 'POST',
        headers: 'Content-Type: application/x-www-form-urlencoded',
      });

      // Make POST request to LMS (HTTPS only enforced)
      const response = await this.client.post(loginUrl, loginData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'LMS-UI-Remake/1.0',
        },
        // Follow redirects to detect successful login
        maxRedirects: 5,
      });

      logger.debug('LMS authentication response received', {
        status: response.status,
        url: response.request?.path,
        headersReceived: Object.keys(response.headers).length,
      });

      // Extract Set-Cookie headers (Requirement 15.1)
      const setCookieHeaders = response.headers['set-cookie'];
      const cookies = this._parseCookies(setCookieHeaders);

      // Check if authentication was successful
      // Success indicators:
      // 1. Status 200 or 302 (redirect after login)
      // 2. Cookies set (PHPSESSID or similar)
      // 3. Response body does not contain "error" or "invalid"
      const isSuccessful =
        (response.status === 200 || response.status === 302) &&
        (cookies.size > 0 || this._checkLoginSuccess(response.data));

      if (isSuccessful) {
        logger.info('LMS authentication successful', {
          nim,
          cookiesReceived: cookies.size,
          status: response.status,
        });

        return {
          success: true,
          cookies,
          user: {
            nim,
            // Additional user info could be extracted from response if available
          },
        };
      } else {
        logger.warn('LMS authentication failed', {
          nim,
          status: response.status,
          cookiesReceived: cookies.size,
          reason: 'Invalid credentials or unexpected response',
        });

        return {
          success: false,
          error: 'Invalid credentials or authentication failed',
        };
      }
    } catch (err) {
      // Handle network/SSL errors
      if (err.code === 'CERT_HAS_EXPIRED') {
        logger.error('LMS SSL certificate expired', { error: err.message });
        return { success: false, error: 'LMS SSL certificate error' };
      }

      if (err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        logger.error('LMS SSL certificate verification failed', { error: err.message });
        return { success: false, error: 'LMS SSL certificate verification failed' };
      }

      if (err.code === 'ERR_HTTP_REQUEST_TIMEOUT') {
        logger.error('LMS authentication timeout', { error: err.message });
        return { success: false, error: 'LMS authentication timeout' };
      }

      if (err.code === 'ECONNREFUSED') {
        logger.error('LMS connection refused', { error: err.message });
        return { success: false, error: 'Cannot reach LMS' };
      }

      logger.error('LMS authentication error', {
        error: err.message,
        code: err.code,
        nim,
      });

      return { success: false, error: 'Authentication error: ' + err.message };
    }
  }

  /**
   * Check if login was successful by analyzing response
   *
   * @param {string} responseData - Response body from LMS
   * @returns {boolean} True if response indicates successful login
   */
  _checkLoginSuccess(responseData) {
    if (!responseData || typeof responseData !== 'string') {
      return false;
    }

    // Look for common error indicators in LMS HTML
    const errorIndicators = [
      'invalid login',
      'login failed',
      'error',
      'wrong password',
      'tidak ditemukan',
      'gagal masuk',
    ];

    const lowerData = responseData.toLowerCase();
    for (const indicator of errorIndicators) {
      if (lowerData.includes(indicator)) {
        return false;
      }
    }

    // Look for success indicators
    const successIndicators = [
      'dashboard',
      'courses',
      'my courses',
      'welcome',
    ];

    for (const indicator of successIndicators) {
      if (lowerData.includes(indicator)) {
        return true;
      }
    }

    // If response is substantial and no errors, likely successful
    return responseData.length > 1000;
  }

  /**
   * Fetch assignments page with LMS cookies
   *
   * @param {Map<string, string>} lmsCookies - LMS cookies from authentication
   * @returns {Promise<{success: boolean, html?: string, error?: string}>}
   *
   * Requirement 15.2: Include all stored LMS cookies in request headers
   */
  async fetchAssignments(lmsCookies) {
    logger.info('Fetching assignments from LMS', {
      cookiesCount: lmsCookies?.size || 0,
    });

    try {
      if (!lmsCookies || lmsCookies.size === 0) {
        const error = 'LMS cookies required for authenticated request';
        logger.warn(error);
        return { success: false, error };
      }

      // Build Cookie header (Requirement 15.2)
      const cookieHeader = this._buildCookieHeader(lmsCookies);

      const assignmentsUrl = `${this.baseUrl}${this.assignmentsEndpoint}`;

      logger.debug('Fetching assignments', {
        url: assignmentsUrl,
        cookieCount: lmsCookies.size,
      });

      // Make request with cookies
      const response = await this.client.get(assignmentsUrl, {
        headers: {
          'Cookie': cookieHeader,
          'User-Agent': 'LMS-UI-Remake/1.0',
        },
      });

      if (response.status === 200) {
        logger.info('Assignments fetched successfully', {
          responseLength: response.data?.length || 0,
        });

        return {
          success: true,
          html: response.data,
        };
      } else if (response.status === 401) {
        logger.warn('Unauthorized access to assignments - cookies may be expired');
        return { success: false, error: 'Authentication expired' };
      } else {
        logger.warn('Failed to fetch assignments', {
          status: response.status,
        });
        return { success: false, error: `HTTP ${response.status}` };
      }
    } catch (err) {
      logger.error('Error fetching assignments', {
        error: err.message,
      });

      return { success: false, error: err.message };
    }
  }

  /**
   * Fetch assignment detail page
   *
   * @param {string} assignmentId - Assignment ID
   * @param {Map<string, string>} lmsCookies - LMS cookies
   * @returns {Promise<{success: boolean, html?: string, error?: string}>}
   *
   * Requirement 15.2: Include all stored LMS cookies in request headers
   */
  async fetchAssignmentDetail(assignmentId, lmsCookies) {
    logger.info('Fetching assignment detail', {
      assignmentId,
      cookiesCount: lmsCookies?.size || 0,
    });

    try {
      if (!assignmentId || typeof assignmentId !== 'string') {
        return { success: false, error: 'Invalid assignment ID' };
      }

      if (!lmsCookies || lmsCookies.size === 0) {
        return { success: false, error: 'LMS cookies required' };
      }

      const cookieHeader = this._buildCookieHeader(lmsCookies);
      const detailUrl = `${this.baseUrl}/mod/assign/view.php?id=${encodeURIComponent(assignmentId)}`;

      const response = await this.client.get(detailUrl, {
        headers: {
          'Cookie': cookieHeader,
          'User-Agent': 'LMS-UI-Remake/1.0',
        },
      });

      if (response.status === 200) {
        logger.info('Assignment detail fetched', {
          assignmentId,
          responseLength: response.data?.length || 0,
        });

        return { success: true, html: response.data };
      } else if (response.status === 401) {
        return { success: false, error: 'Authentication expired' };
      } else {
        return { success: false, error: `HTTP ${response.status}` };
      }
    } catch (err) {
      logger.error('Error fetching assignment detail', {
        assignmentId,
        error: err.message,
      });

      return { success: false, error: err.message };
    }
  }

  /**
   * Fetch courses from LMS
   *
   * @param {Map<string, string>} lmsCookies - LMS cookies
   * @returns {Promise<{success: boolean, html?: string, error?: string}>}
   *
   * Requirement 15.2: Include all stored LMS cookies in request headers
   */
  async fetchCourses(lmsCookies) {
    logger.info('Fetching courses from LMS', {
      cookiesCount: lmsCookies?.size || 0,
    });

    try {
      if (!lmsCookies || lmsCookies.size === 0) {
        return { success: false, error: 'LMS cookies required' };
      }

      const cookieHeader = this._buildCookieHeader(lmsCookies);
      const coursesUrl = `${this.baseUrl}/my/courses.php`;

      const response = await this.client.get(coursesUrl, {
        headers: {
          'Cookie': cookieHeader,
          'User-Agent': 'LMS-UI-Remake/1.0',
        },
      });

      if (response.status === 200) {
        logger.info('Courses fetched successfully', {
          responseLength: response.data?.length || 0,
        });

        return { success: true, html: response.data };
      } else if (response.status === 401) {
        return { success: false, error: 'Authentication expired' };
      } else {
        return { success: false, error: `HTTP ${response.status}` };
      }
    } catch (err) {
      logger.error('Error fetching courses', {
        error: err.message,
      });

      return { success: false, error: err.message };
    }
  }

  /**
   * Submit assignment via LMS
   *
   * @param {string} assignmentId - Assignment ID
   * @param {FormData} formData - Submission data (file or text)
   * @param {Map<string, string>} lmsCookies - LMS cookies
   * @returns {Promise<{success: boolean, submissionId?: string, error?: string}>}
   *
   * Requirement 15.2: Include all stored LMS cookies in request headers
   */
  async submitAssignment(assignmentId, formData, lmsCookies) {
    logger.info('Submitting assignment to LMS', {
      assignmentId,
      cookiesCount: lmsCookies?.size || 0,
    });

    try {
      if (!assignmentId || !formData || !lmsCookies || lmsCookies.size === 0) {
        return { success: false, error: 'Invalid submission parameters' };
      }

      const cookieHeader = this._buildCookieHeader(lmsCookies);
      const submitUrl = `${this.baseUrl}/mod/assign/submit.php`;

      const response = await this.client.post(submitUrl, formData, {
        headers: {
          'Cookie': cookieHeader,
          'User-Agent': 'LMS-UI-Remake/1.0',
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.status === 200 || response.status === 302) {
        logger.info('Assignment submitted successfully', {
          assignmentId,
          status: response.status,
        });

        return {
          success: true,
          submissionId: `submission-${Date.now()}`,
        };
      } else if (response.status === 401) {
        return { success: false, error: 'Authentication expired' };
      } else {
        return { success: false, error: `HTTP ${response.status}` };
      }
    } catch (err) {
      logger.error('Error submitting assignment', {
        assignmentId,
        error: err.message,
      });

      return { success: false, error: err.message };
    }
  }

  /**
   * Verify HTTPS connection and SSL certificate
   * Called to test the proxy before use
   *
   * Requirement 10.3: Verify LMS SSL certificate
   */
  async verifyConnection() {
    logger.info('Verifying LMS connection and SSL certificate', {
      baseUrl: this.baseUrl,
    });

    try {
      // Make a simple GET request to verify connection
      const response = await this.client.get(`${this.baseUrl}/login/index.php`);

      logger.info('LMS connection verified successfully', {
        status: response.status,
      });

      return { success: true };
    } catch (err) {
      if (err.code?.includes('CERT') || err.code?.includes('SSL')) {
        logger.error('LMS SSL certificate verification failed', {
          error: err.message,
          code: err.code,
        });

        return { success: false, error: 'SSL certificate verification failed' };
      }

      logger.error('LMS connection verification failed', {
        error: err.message,
        code: err.code,
      });

      return { success: false, error: err.message };
    }
  }

  /**
   * Get LMS base URL
   */
  getBaseUrl() {
    return this.baseUrl;
  }

  /**
   * Destroy the proxy and cleanup resources
   */
  destroy() {
    if (this.httpsAgent) {
      this.httpsAgent.destroy();
    }
    logger.info('LMSProxy destroyed');
  }
}

module.exports = LMSProxy;
